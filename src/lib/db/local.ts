import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { localDataFile } from "@/lib/env";
import type { Iso } from "@/lib/date";
import type {
  Achievement,
  DailyLog,
  FoodEntry,
  GoalSnapshot,
  Profile,
  ReportPeriod,
  StoredReport,
  WeightLog,
} from "@/lib/schemas";
import type {
  DailyLogPatch,
  DataStore,
  NewFoodEntry,
  NewGoalSnapshot,
  ProfileSeed,
} from "@/lib/db/store";
import { rankFrequentFoods } from "@/lib/db/store";
import type { ErrorReport } from "@/lib/db/store";

type Shape = {
  version: 1;
  profiles: Profile[];
  goals: GoalSnapshot[];
  foodEntries: FoodEntry[];
  dailyLogs: DailyLog[];
  weightLogs: WeightLog[];
  achievements: (Achievement & { userId: string })[];
  reports: StoredReport[];
  /** Optional so files written before AI budgeting still load. */
  aiUsage?: AiUsageRow[];
};

type AiUsageRow = {
  userId: string;
  usageDate: string;
  kind: string;
  count: number;
};

const EMPTY: Shape = {
  version: 1,
  profiles: [],
  goals: [],
  foodEntries: [],
  dailyLogs: [],
  weightLogs: [],
  achievements: [],
  reports: [],
};

// Solo mode is a local convenience, so the location is a runtime setting. The
// bundler cannot trace it statically and would otherwise pull in the whole
// working directory, hence the opt-out.
const filePath = path.isAbsolute(localDataFile)
  ? localDataFile
  : path.join(/* turbopackIgnore: true */ process.cwd(), localDataFile);

/**
 * Serialises every read-modify-write so two concurrent server actions cannot
 * clobber each other's slice of the file.
 */
let queue: Promise<unknown> = Promise.resolve();
let cache: Shape | null = null;
/** mtime the cache was built from; -1 means "no file existed". */
let cacheStamp = 0;

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function currentStamp(): Promise<number> {
  try {
    return (await fs.stat(filePath)).mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * Cached in memory, but revalidated against the file's mtime on every read.
 * Without that check a hand-edited (or deleted) file would be silently ignored
 * for the lifetime of the process.
 */
async function read(): Promise<Shape> {
  const stamp = await currentStamp();
  if (cache && stamp === cacheStamp) return cache;

  if (stamp === -1) {
    cache = structuredClone(EMPTY);
  } else {
    try {
      const parsed = JSON.parse(
        await fs.readFile(filePath, "utf8"),
      ) as Partial<Shape>;
      cache = { ...EMPTY, ...parsed, version: 1 };
    } catch {
      cache = structuredClone(EMPTY);
    }
  }
  cacheStamp = stamp;
  return cache;
}

async function write(next: Shape): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, filePath);
  cache = next;
  cacheStamp = await currentStamp();
}

function mutate<T>(fn: (db: Shape) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const db = await read();
    const result = await fn(db);
    await write(db);
    return result;
  });
}

function query<T>(fn: (db: Shape) => T): Promise<T> {
  return withLock(async () => fn(await read()));
}

const inRange = (d: Iso, start: Iso, end: Iso) => d >= start && d <= end;

export function createLocalStore(): DataStore {
  return {
    kind: "local",

    async getProfile(userId) {
      return query((db) => db.profiles.find((p) => p.id === userId) ?? null);
    },

    async saveProfile(profile: ProfileSeed) {
      return mutate((db) => {
        const existing = db.profiles.find((p) => p.id === profile.id);
        if (existing) {
          Object.assign(existing, profile);
          return existing;
        }
        const created: Profile = {
          ...profile,
          createdAt: new Date().toISOString(),
        };
        db.profiles.push(created);
        return created;
      });
    },

    async patchProfile(userId, patch) {
      return mutate((db) => {
        const existing = db.profiles.find((p) => p.id === userId);
        if (!existing) throw new Error("Profile not found");
        Object.assign(existing, patch);
        return existing;
      });
    },

    async listGoalSnapshots(userId) {
      return query((db) =>
        db.goals
          .filter((g) => g.userId === userId)
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
      );
    },

    async insertGoalSnapshot(snapshot: NewGoalSnapshot) {
      return mutate((db) => {
        // One snapshot per effective day — re-tuning today overwrites today.
        const idx = db.goals.findIndex(
          (g) =>
            g.userId === snapshot.userId &&
            g.effectiveFrom === snapshot.effectiveFrom,
        );
        const row: GoalSnapshot = {
          ...snapshot,
          id: idx >= 0 ? db.goals[idx].id : randomUUID(),
          createdAt: new Date().toISOString(),
        };
        if (idx >= 0) db.goals[idx] = row;
        else db.goals.push(row);
        return row;
      });
    },

    async listFoodEntries(userId, startIso, endIso) {
      return query((db) =>
        db.foodEntries
          .filter(
            (e) => e.userId === userId && inRange(e.logDate, startIso, endIso),
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    },

    async bumpAiUsage(userId: string, dateIso: string, kind: string) {
      return mutate((db) => {
        const rows: AiUsageRow[] = (db.aiUsage ??= []);
        const row = rows.find(
          (r) => r.userId === userId && r.usageDate === dateIso && r.kind === kind,
        );
        if (row) {
          row.count += 1;
          return row.count;
        }
        rows.push({ userId, usageDate: dateIso, kind, count: 1 });
        return 1;
      });
    },

    async recordError(userId: string, report: ErrorReport) {
      // Solo mode has no dashboard to read these in, so the console is the
      // honest destination rather than growing the JSON file forever.
      console.warn(
        `[macronaut] ${report.source} error for ${userId}: ${report.kind} — ${report.message}`,
      );
    },

    async getFoodEntry(userId: string, id: string) {
      return query(
        (db) =>
          db.foodEntries.find((e) => e.userId === userId && e.id === id) ??
          null,
      );
    },

    async listFrequentFoods(userId: string, limit: number) {
      return query((db) =>
        rankFrequentFoods(
          db.foodEntries
            .filter((e) => e.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 300),
          limit,
        ),
      );
    },

    async insertFoodEntries(entries: NewFoodEntry[]) {
      return mutate((db) => {
        const now = Date.now();
        const created = entries.map((e, i) => ({
          ...e,
          id: randomUUID(),
          createdAt: new Date(now + i).toISOString(),
        }));
        db.foodEntries.push(...created);
        return created;
      });
    },

    async updateFoodEntry(userId, id, patch) {
      return mutate((db) => {
        const row = db.foodEntries.find(
          (e) => e.id === id && e.userId === userId,
        );
        if (!row) return null;
        Object.assign(row, patch);
        return row;
      });
    },

    async deleteFoodEntry(userId, id) {
      await mutate((db) => {
        db.foodEntries = db.foodEntries.filter(
          (e) => !(e.id === id && e.userId === userId),
        );
      });
    },

    async getDailyLog(userId, dateIso) {
      return query(
        (db) =>
          db.dailyLogs.find(
            (d) => d.userId === userId && d.logDate === dateIso,
          ) ?? null,
      );
    },

    async listDailyLogs(userId, startIso, endIso) {
      return query((db) =>
        db.dailyLogs
          .filter(
            (d) => d.userId === userId && inRange(d.logDate, startIso, endIso),
          )
          .sort((a, b) => a.logDate.localeCompare(b.logDate)),
      );
    },

    async upsertDailyLog(userId, dateIso, patch: DailyLogPatch) {
      return mutate((db) => {
        const existing = db.dailyLogs.find(
          (d) => d.userId === userId && d.logDate === dateIso,
        );
        if (existing) {
          Object.assign(existing, patch);
          return existing;
        }
        const row: DailyLog = {
          id: randomUUID(),
          userId,
          logDate: dateIso,
          ...patch,
        };
        db.dailyLogs.push(row);
        return row;
      });
    },

    async listWeightLogs(userId) {
      return query((db) =>
        db.weightLogs
          .filter((w) => w.userId === userId)
          .sort((a, b) => a.loggedOn.localeCompare(b.loggedOn)),
      );
    },

    async upsertWeightLog(userId, dateIso, weightKg, note) {
      return mutate((db) => {
        const existing = db.weightLogs.find(
          (w) => w.userId === userId && w.loggedOn === dateIso,
        );
        if (existing) {
          existing.weightKg = weightKg;
          existing.note = note;
          existing.coach = null;
          return existing;
        }
        const row: WeightLog = {
          id: randomUUID(),
          userId,
          loggedOn: dateIso,
          weightKg,
          note,
          coach: null,
          createdAt: new Date().toISOString(),
        };
        db.weightLogs.push(row);
        return row;
      });
    },

    async setWeightCoach(userId, id, coach) {
      await mutate((db) => {
        const row = db.weightLogs.find(
          (w) => w.id === id && w.userId === userId,
        );
        if (row) row.coach = coach;
      });
    },

    async deleteWeightLog(userId, id) {
      await mutate((db) => {
        db.weightLogs = db.weightLogs.filter(
          (w) => !(w.id === id && w.userId === userId),
        );
      });
    },

    async listAchievements(userId) {
      return query((db) =>
        db.achievements
          .filter((a) => a.userId === userId)
          .map(({ key, unlockedOn }) => ({ key, unlockedOn })),
      );
    },

    async unlockAchievements(userId, keys, onIso) {
      return mutate((db) => {
        const fresh: Achievement[] = [];
        for (const key of keys) {
          const already = db.achievements.some(
            (a) => a.userId === userId && a.key === key,
          );
          if (already) continue;
          db.achievements.push({ userId, key, unlockedOn: onIso });
          fresh.push({ key, unlockedOn: onIso });
        }
        return fresh;
      });
    },

    async getReport(userId, period: ReportPeriod, signature) {
      return query(
        (db) =>
          db.reports.find(
            (r) =>
              r.userId === userId &&
              r.period === period &&
              r.signature === signature,
          ) ?? null,
      );
    },

    async saveReport(input) {
      return mutate((db) => {
        db.reports = db.reports.filter(
          (r) => !(r.userId === input.userId && r.period === input.period),
        );
        const row: StoredReport = {
          ...input,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        };
        db.reports.push(row);
        return row;
      });
    },

    async wipeUser(userId) {
      await mutate((db) => {
        db.profiles = db.profiles.filter((p) => p.id !== userId);
        db.goals = db.goals.filter((g) => g.userId !== userId);
        db.foodEntries = db.foodEntries.filter((e) => e.userId !== userId);
        db.dailyLogs = db.dailyLogs.filter((d) => d.userId !== userId);
        db.weightLogs = db.weightLogs.filter((w) => w.userId !== userId);
        db.achievements = db.achievements.filter((a) => a.userId !== userId);
        db.reports = db.reports.filter((r) => r.userId !== userId);
      });
    },
  };
}
