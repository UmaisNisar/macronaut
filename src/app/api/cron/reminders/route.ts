import { NextResponse } from "next/server";
import webpush from "web-push";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseStore } from "@/lib/db/supabase";
import { vapid } from "@/lib/env";
import { isLocalMonday, localDate, localHour } from "@/lib/reminders";
import { buildPeriodReport } from "@/server/core";

/**
 * The evening nudge.
 *
 * Runs hourly. For each person with reminders on, it works out what hour it is
 * where they are, and sends only if that matches their chosen hour and they
 * have logged nothing today. Hourly-and-filter rather than one job per user is
 * the only sane shape when everyone is in a different time zone.
 *
 * Deliberately quiet: one notification, only on a day you have not logged, and
 * nothing personal in the payload — push messages land on lock screens, so it
 * never carries a weight or a calorie count.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Vercel signs cron invocations; without this the endpoint is a free way to
  // make someone's phone buzz.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  if (!vapid.publicKey || !vapid.privateKey) {
    return NextResponse.json({ error: "Push is not configured." }, { status: 503 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "No admin client." }, { status: 503 });
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const store = createSupabaseStore(admin);
  const candidates = await store.listReminderCandidates();
  const now = new Date();

  let sent = 0;
  let skipped = 0;
  let dropped = 0;
  let reports = 0;

  for (const person of candidates) {
    if (localHour(person.timeZone, now) !== person.reminderHour) {
      skipped++;
      continue;
    }

    // Monday, in their week: have the weekly report already written by the
    // time they look. Idempotent — an unchanged period is fetched from cache
    // rather than regenerated, so re-running this costs nothing.
    if (isLocalMonday(person.timeZone, now)) {
      try {
        const profile = await store.getProfile(person.userId);
        const day = localDate(person.timeZone, now);
        if (profile && day) {
          const built = await buildPeriodReport({
            store,
            profile,
            today: day,
            period: "7d",
          });
          if (built.ok && !built.cached) reports++;
        }
      } catch (error) {
        // A failed report must not stop the nudge going out.
        console.warn("[macronaut] weekly report failed:", error);
      }
    }

    const today = localDate(person.timeZone, now);
    if (!today) {
      skipped++;
      continue;
    }
    const day = await store.getDailyLog(person.userId, today);
    if ((day?.entryCount ?? 0) > 0) {
      skipped++;
      continue;
    }

    const name = person.displayName?.split(" ")[0];
    const payload = JSON.stringify({
      title: name ? `Psst — ${name}` : "Psst",
      body: "Nothing logged today yet. What did you eat?",
      tag: "macronaut-reminder",
      url: "/today",
    });

    for (const sub of person.subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 3600 },
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away — uninstalled,
        // permission revoked, cleared data. Keeping it would retry forever.
        if (status === 404 || status === 410) {
          await store.deletePushSubscription(sub.endpoint);
          dropped++;
        } else {
          console.warn("[macronaut] push failed:", status, error);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, dropped, reports });
}
