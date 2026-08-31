/**
 * End-to-end regression suite.
 *
 * Every check here exists because the thing it checks broke at least once. The
 * common thread in those bugs was that they were invisible to a typecheck and
 * to a glance at the page: a control that looked right but computed
 * `cursor: default`, a nav label rendered white on white, a button that wrapped
 * onto its own row only at phone width. So this suite reads computed styles and
 * geometry rather than taking a screenshot and hoping.
 *
 * Builds its own production build in solo mode, so no account and no Supabase
 * are needed. The build is its own because Supabase keys have to be absent
 * when it is made, not merely when it is started.
 *
 * Runs in two engines. Most of it drives the Chrome already on the machine;
 * the layout and overflow checks are then repeated in WebKit, because the
 * bugs that actually reached a user were the ones Chrome could not show —
 * a repeat strip that would not scroll because the element blocking it only
 * renders on iOS, and a dialog that ran off the side of the screen. Both were
 * reported by the person using the app rather than caught here.
 *
 * WebKit needs installing once:  npx playwright install webkit
 *
 *   npm run test:e2e
 */
import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { chromium, webkit } from "playwright-core";

const PORT = Number(process.env.E2E_PORT ?? 3399);
const SITE = `http://localhost:${PORT}`;
const DATA_FILE = ".data/e2e.json";
const DIST_DIR = ".next-e2e";

/**
 * Solo mode: no account, no Supabase, JSON file storage.
 *
 * These have to be absent at *build* time, not just at run time. Next
 * inlines NEXT_PUBLIC_* into the server bundle as literals, so a build made
 * with .env.local present carries the real Supabase URL inside it and puts
 * up a sign-in wall no matter what the environment says when it starts. That
 * is why this builds rather than reusing .next, and why it builds somewhere
 * else — the developer's own build stays where they left it.
 */
const SOLO_ENV = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  MACRONAUT_DATA_FILE: DATA_FILE,
  MACRONAUT_DIST_DIR: DIST_DIR,
  /*
   * No model, on purpose.
   *
   * The suite inherits the developer's environment, so every run was spending
   * real Gemini calls out of a free tier that allows twenty a day per model —
   * a test suite quietly competing with the person using the app. Nothing here
   * asserts anything a model produces that the built-in estimator does not,
   * and an estimator is deterministic, which a model is not.
   */
  GEMINI_API_KEY: "",
  GOOGLE_GENERATIVE_AI_API_KEY: "",
};

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/**
 * Refuse to run against something we did not start.
 *
 * A leftover server on this port silently serves an old build, and the suite
 * happily tests it — which looks exactly like a fresh regression and cost a
 * long detour to diagnose once already.
 */
async function assertPortFree() {
  try {
    await fetch(`${SITE}/onboarding`, { signal: AbortSignal.timeout(1500) });
  } catch {
    return; // nothing there, which is what we want
  }
  throw new Error(
    `Something is already listening on port ${PORT}. That is probably a ` +
      `leaked server from an earlier run; stop it (or set E2E_PORT) before ` +
      `running, otherwise this suite tests a stale build.`,
  );
}

/**
 * `child.kill()` only kills the shell on Windows, leaving `next` running.
 *
 * Synchronous on purpose: an async spawn here loses the race against the
 * process exiting, which is how a server survived a failing run and then
 * poisoned the next one.
 */
function killTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

/**
 * Build the app the suite is going to test.
 *
 * Incremental after the first run, because .next-e2e is kept.
 */
async function build() {
  console.log(`Building (${DIST_DIR})...`);
  const started = Date.now();
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "build"],
    {
      env: SOLO_ENV,
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    console.log(result.stdout ?? "");
    console.log(result.stderr ?? "");
    throw new Error("build failed");
  }
  console.log(`  done in ${Math.round((Date.now() - started) / 1000)}s`);
}

async function startServer() {
  await assertPortFree();
  await rm(DATA_FILE, { force: true });
  await build();
  const server = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "-p", String(PORT)],
    {
      env: SOLO_ENV,
      stdio: "ignore",
      shell: process.platform === "win32",
    },
  );

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${SITE}/onboarding`);
      if (res.ok) return server;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}

/**
 * The calorie total currently on screen.
 *
 * Read from the page rather than the database on purpose: what matters is
 * that the number a person is looking at changed, not that a row moved.
 */
async function total(page) {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, "")) : 0;
  });
}

/**
 * Anything sticking out past the right edge of the screen.
 *
 * Engine-agnostic on purpose: this is run against Chrome and against WebKit,
 * and the whole point of the second pass is that the two do not always agree.
 */
async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const vw = root.clientWidth;
    // Something an ancestor clips away is not a visible bug.
    const clipped = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (/hidden|clip|auto|scroll/.test(getComputedStyle(n).overflowX)) {
          return true;
        }
      }
      return false;
    };
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const past = Math.round(r.right - vw);
      if (past > 1 && !clipped(el) && (!worst || past > worst.past)) {
        worst = {
          past,
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 40),
        };
      }
    }
    return { over: root.scrollWidth - vw, worst };
  });
}

/**
 * Walk the onboarding wizard so the rest of the suite has a real profile.
 *
 * Waits on state rather than the clock. Fixed sleeps made this flaky the moment
 * page load got slower, and a flaky setup step fails every assertion after it,
 * which looks alarmingly like a real regression.
 */
async function onboard(page) {
  await page.goto(`${SITE}/onboarding`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("your name").fill("Tester").catch(() => {});

  const go = page.getByRole("button", { name: /Let.s go/ });
  const heading = () =>
    page.evaluate(() => document.querySelector("h2,h1")?.textContent ?? "");

  for (let i = 0; i < 10; i++) {
    if (await go.isVisible().catch(() => false)) break;
    const next = page.getByRole("button", { name: /^Next/ });
    await next.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    if (!(await next.isVisible().catch(() => false))) break;

    // Confirm the click actually advanced the wizard. Clicking a button that
    // React has not hydrated yet does nothing and looks identical to a click
    // that worked, which is how this silently stalled on step one.
    const before = await heading();
    await next.click();
    await page
      .waitForFunction(
        (prev) => (document.querySelector("h2,h1")?.textContent ?? "") !== prev,
        before,
        { timeout: 4000 },
      )
      .catch(async () => {
        await page.waitForTimeout(600);
        await next.click().catch(() => {});
        await page.waitForTimeout(600);
      });
  }

  try {
    await go.waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    // A failed setup step fails everything after it, so say why rather than
    // leaving a wall of unrelated red.
    console.log("\n  onboarding stalled at:", page.url());
    const text = await page.evaluate(() => document.body.innerText);
    console.log("  page said:", text.replace(/\s+/g, " ").slice(0, 300));
    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => b.getBoundingClientRect().height > 0)
        .map((b) => (b.innerText || "").replace(/\s+/g, " ").trim()),
    );
    console.log("  buttons:", JSON.stringify(buttons));
    throw error;
  }
  await go.click();
  await page.waitForURL(/\/today/, { timeout: 45000 });

  // The post-onboarding celebration covers the page; wait it out, then dismiss.
  await page
    .waitForFunction(() => /Tell me what you ate/i.test(document.body.innerText), null, {
      timeout: 30000,
    })
    .catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(800);
}

const phone = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};
const desktop = { viewport: { width: 1280, height: 900 } };

const server = await startServer();
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  /* ---------------------------------------------------------------- */
  section("Onboarding and shell");
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await onboard(page);
  check("onboarding lands on Today", /\/today/.test(page.url()), page.url());
  check("no uncaught page errors", pageErrors.length === 0, pageErrors.join("; "));

  /* ---------------------------------------------------------------- */
  section("Nav dock (regressed once: white label on white pill)");
  const nav = await page.evaluate(() => {
    const dock = [...document.querySelectorAll('nav[aria-label="Main"]')].find(
      (n) => n.getBoundingClientRect().height > 0,
    );
    const link = dock?.querySelector('a[aria-current="page"]');
    if (!link) return null;
    const pill = link.querySelector("span.absolute");
    const label = [...link.querySelectorAll("span")].find(
      (s) => !s.classList.contains("absolute") && s.textContent.trim().length > 2,
    );
    const pr = pill?.getBoundingClientRect();
    const lr = label?.getBoundingClientRect();
    return {
      hasPill: !!pill,
      zIndex: pill ? getComputedStyle(pill).zIndex : null,
      pillBg: pill ? getComputedStyle(pill).backgroundColor : null,
      covers:
        pr && lr
          ? pr.left <= lr.left && pr.right >= lr.right && pr.top <= lr.top
          : false,
    };
  });
  check("active tab has a pill", !!nav?.hasPill);
  check(
    "pill is not pushed behind the dock background",
    nav?.zIndex !== "-10",
    `z-index: ${nav?.zIndex}`,
  );
  check("pill is painted, not transparent", !!nav && nav.pillBg !== "rgba(0, 0, 0, 0)", nav?.pillBg ?? "");
  check("pill sits behind the label", nav?.covers === true);

  /* ---------------------------------------------------------------- */
  section("Tapping the tab you are already on");
  /*
   * Today is four and a half screens tall, so the way back to the composer
   * is the tab you are standing on. Both halves matter and the second is the
   * one that breaks quietly: the active tab must scroll rather than
   * navigate, and every other tab must still navigate rather than scroll.
   */
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(400);
  const scrolledTo = await page.evaluate(() => Math.round(window.scrollY));
  check("the page can be scrolled down at all", scrolledTo > 500, `${scrolledTo}px`);

  await page.evaluate(() => {
    const active = [...document.querySelectorAll('a[aria-current="page"]')];
    active[active.length - 1]?.click();
  });
  await page.waitForTimeout(1200);
  const afterActiveTap = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    path: location.pathname,
  }));
  check(
    "tapping the active tab returns to the top",
    afterActiveTap.y === 0,
    `${afterActiveTap.y}px`,
  );
  check(
    "and stays on the same screen",
    /\/today/.test(afterActiveTap.path),
    afterActiveTap.path,
  );

  // The half that would break silently: preventDefault on the wrong link.
  await page.evaluate(() => {
    const other = [...document.querySelectorAll("nav a")].filter(
      (a) => a.getAttribute("aria-current") !== "page",
    );
    other[other.length - 1]?.click();
  });
  await page.waitForTimeout(2500);
  const moved = await page.evaluate(() => location.pathname);
  check("other tabs still navigate", !/\/today$/.test(moved), moved);
  await page.goto(`${SITE}/today`, { waitUntil: "networkidle" });

  /* ---------------------------------------------------------------- */
  section("Composer layout on a phone (regressed once: button wrapped)");
  const mobileLayout = await page.evaluate(() => {
    const look = [...document.querySelectorAll("button")].find((b) =>
      /Let Momo look/.test(b.textContent),
    );
    const photo = [...document.querySelectorAll("button")].find((b) =>
      /photo/i.test(b.getAttribute("aria-label") ?? ""),
    );
    const hint = [...document.querySelectorAll("p")].find((p) =>
      /Plain English/.test(p.textContent),
    );
    if (!look || !photo) return null;
    const l = look.getBoundingClientRect();
    const p = photo.getBoundingClientRect();
    return {
      sameRow: Math.abs(l.top - p.top) < 8,
      fitsViewport: l.right <= window.innerWidth && p.left >= 0,
      hintLines: hint ? Math.round(hint.getBoundingClientRect().height / 20) : 0,
    };
  });
  check("neither overflows the screen", mobileLayout?.fitsViewport === true);

  /*
   * Geometry alone missed a real break: three labelled buttons shared a row,
   * the primary was squeezed to 72px, and because buttons never wrap their
   * text the label spilled out of its own pill. Nothing overflowed the
   * viewport, so every existing check passed while the UI was visibly broken.
   * A control narrower than its own content is the thing to assert.
   */
  const squashed = await page.evaluate(() =>
    [...document.querySelectorAll("button, a")]
      // Visually-hidden controls (the skip link) are deliberately clipped to a
      // pixel, so "content wider than box" is their normal state, not a fault.
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      })
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => ({
        label: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 24),
        box: Math.round(el.clientWidth),
        content: Math.round(el.scrollWidth),
      })),
  );
  check(
    "no control is narrower than its own label",
    squashed.length === 0,
    JSON.stringify(squashed),
  );
  check(
    "hint text is not squeezed into a column",
    (mobileLayout?.hintLines ?? 9) <= 2,
    `${mobileLayout?.hintLines} lines`,
  );

  /* ---------------------------------------------------------------- */
  section("Logging a meal");
  await page.locator("textarea").first().fill("two boiled eggs and toast");
  await page.getByRole("button", { name: /Let Momo look/ }).click();
  await page
    .waitForFunction(() => /FOUND IT/i.test(document.body.innerText), null, {
      timeout: 60000,
    })
    .catch(() => {});

  // Checked before the reload, because the card only exists until then.
  check(
    "the reveal card offers an undo",
    await page
      .getByRole("button", { name: /^Undo/ })
      .first()
      .isVisible()
      .catch(() => false),
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const afterLog = await page.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, "")) : 0;
  });
  check("calories appear on the dashboard", afterLog > 0, `${afterLog} kcal`);

  /* ---------------------------------------------------------------- */
  section("The week as one budget");
  /*
   * A day's target can only say "you went over"; the week is what people
   * actually even out across. These assert the arithmetic on the rendered
   * card, not just that some text exists -- the first version of the bar row
   * silently collapsed to zero-height because a percentage height was
   * resolving against a flex parent with no definite height, and the card
   * still "rendered".
   */
  const weekCard = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("p")].find((n) =>
      /^This week/.test((n.textContent || "").trim()),
    );
    if (!heading) return null;
    let card = heading;
    while (card && !/sticker/.test(card.className || "")) card = card.parentElement;
    if (!card) return null;
    const text = card.innerText.replace(/\s+/g, " ");
    const totals = text.match(/([\d,]+) of ([\d,]+) kcal/);
    const bars = [...card.querySelectorAll("div[title]")].map((b) => {
      const t = b.getAttribute("title") || "";
      const m = t.match(/([\d,]+) of ([\d,]+) kcal/);
      return {
        height: Math.round(b.getBoundingClientRect().height),
        calories: m ? Number(m[1].replace(/,/g, "")) : null,
        target: m ? Number(m[2].replace(/,/g, "")) : null,
      };
    });
    return {
      text,
      eaten: totals ? Number(totals[1].replace(/,/g, "")) : null,
      weekTarget: totals ? Number(totals[2].replace(/,/g, "")) : null,
      bars,
      logged: bars.filter((b) => b.calories !== null),
    };
  });

  check("the weekly budget card is on Today", Boolean(weekCard));
  if (weekCard) {
    check(
      "the week totals seven days of target, not one",
      weekCard.weekTarget > weekCard.eaten * 1.5 && weekCard.weekTarget > 5000,
      `${weekCard.eaten} of ${weekCard.weekTarget}`,
    );
    check(
      "today's calories count toward the week",
      weekCard.eaten > 0,
      `${weekCard.eaten} kcal`,
    );
    check(
      "it says what the remaining days can average",
      /kcal a day|over/.test(weekCard.text),
      weekCard.text.slice(0, 90),
    );
    check("there is one bar per weekday", weekCard.bars.length === 7, `${weekCard.bars.length}`);
    check("every bar is drawn", weekCard.bars.every((b) => b.height > 0));

    /*
     * Height must track calories, which is the invariant the first version
     * broke: a percentage height against a flex parent with no definite
     * height computed to zero, so the row rendered as labels under nothing
     * while every "is the card there" check stayed green. Asserting a
     * minimum height would not do -- a genuinely light day is a short bar --
     * so this checks the bar against the numbers in its own tooltip.
     */
    const BAR_AREA = 64;
    const bad = weekCard.logged
      .map((b) => {
        const expected = Math.max(6, Math.round((b.calories / b.target) * BAR_AREA));
        return Math.abs(b.height - expected) <= 2
          ? null
          : `${b.calories}/${b.target} drew ${b.height}px, expected ~${expected}`;
      })
      .filter(Boolean);
    check("a logged day was found to measure", weekCard.logged.length > 0);
    check("bar height tracks the calories in it", bad.length === 0, bad.join("; "));
  }

  /* ---------------------------------------------------------------- */
  section("Repeat a meal");
  const chips = page.locator("[data-no-swipe] button");
  check("a repeat chip appears after logging", (await chips.count()) > 0);
  await chips.first().click();
  await page.waitForTimeout(3000);
  const afterRepeat = await page.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, "")) : 0;
  });
  check(
    "repeating adds calories again",
    afterRepeat > afterLog,
    `${afterLog} -> ${afterRepeat}`,
  );

  /* ---------------------------------------------------------------- */
  section("Checking before eating (must not log)");
  // The whole promise of this screen is that asking costs nothing. If a
  // check ever writes an entry it is worse than not having the feature: you
  // would be logging meals you decided against.
  const beforeCheck = await total(page);
  await page.getByRole("button", { name: /Check first/ }).click();

  const checkBox = page.locator(
    'textarea[aria-label="What are you thinking of eating?"]',
  );
  const checkOpened = await checkBox
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("the check sheet opens", checkOpened);

  if (checkOpened) {
    await checkBox.fill("a chocolate bar");
    await page.getByRole("button", { name: /^Check it/ }).click();
    await page
      .waitForFunction(
        () => /Room for this|Fits, just about|Tips you over|Puts you over|big one|Already past/i.test(document.body.innerText),
        null,
        { timeout: 60000 },
      )
      .catch(() => {});

    const verdictShown = await page.evaluate(() =>
      /Room for this|Fits, just about|Tips you over|Puts you over|big one|Already past/i.test(
        document.body.innerText,
      ),
    );
    check("it answers with a verdict", verdictShown);
    check(
      "it says what the food actually costs",
      await page.evaluate(() => /\d+\s*kcal/i.test(document.body.innerText)),
    );

    // Give a write every chance to have happened before claiming it did not.
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check(
      "checking logs nothing",
      (await total(page)) === beforeCheck,
      `${beforeCheck} -> ${await total(page)}`,
    );

    // And saying yes afterwards must still work, without a second model call.
    await page.getByRole("button", { name: /Check first/ }).click();
    await checkBox.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await checkBox.fill("a chocolate bar");
    await page.getByRole("button", { name: /^Check it/ }).click();
    const ateIt = page.getByRole("button", { name: /I ate it/ });
    const offered = await ateIt
      .waitFor({ state: "visible", timeout: 60000 })
      .then(() => true)
      .catch(() => false);

    if (offered) {
      await ateIt.click();
      await page
        .waitForFunction(
          (was) => {
            const m = document.body.innerText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
            return m ? Number(m[1].replace(/,/g, "")) > was : false;
          },
          beforeCheck,
          { timeout: 20000 },
        )
        .catch(() => {});
      check(
        "saying yes afterwards does log it",
        (await total(page)) > beforeCheck,
        `${beforeCheck} -> ${await total(page)}`,
      );
    } else {
      check("saying yes afterwards does log it", false, "no log button");
    }
  }

  /*
   * Leave the page settled before moving on.
   *
   * This section logs something, and logging offers an undo toast. Both outlive
   * the assertions: the next section read its baseline total mid-refresh and
   * was one meal behind, which made its own undo look like it had added
   * calories rather than removed them. A reload costs a second and removes a
   * whole class of confusing cross-section failure.
   */
  await page.keyboard.press("Escape").catch(() => {});
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  /* ---------------------------------------------------------------- */
  section("Undo (a one-tap log needs a one-tap way back)");
  // Driven through a repeat rather than a fresh description: it exercises
  // the same undo action and costs no model call, and the free tier has
  // few enough of those that a test suite should not spend them twice.
  const beforeUndo = await total(page);
  await chips.first().click();

  const undoButton = page
    .locator("[data-sonner-toast] button")
    .filter({ hasText: /^Undo$/ })
    .first();
  const offered = await undoButton
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check("logging offers to undo itself", offered);

  // Wait for the number on screen to actually move before undoing it.
  // Reading it the instant the toast appears catches the page mid-refresh, and
  // then "undo restored the total" passes because nothing ever changed —
  // a green tick for a test that checked nothing.
  await page
    .waitForFunction(
      (was) => {
        const m = document.body.innerText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, "")) > was : false;
      },
      beforeUndo,
      { timeout: 6000 },
    )
    .catch(() => {});

  const withExtra = await total(page);
  const landed = withExtra > beforeUndo;
  check(
    "the repeat landed before undoing it",
    landed,
    `${beforeUndo} -> ${withExtra}`,
  );

  if (offered && landed) {
    await undoButton.click();
    await page
      .waitForFunction(() => /Took back/i.test(document.body.innerText), null, {
        timeout: 15000,
      })
      .catch(() => {});
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const undone = await total(page);
    check(
      "undo puts the calories back where they were",
      undone === beforeUndo,
      `${withExtra} -> ${undone}, expected ${beforeUndo}`,
    );
  }

  /* ---------------------------------------------------------------- */
  section("Offline outbox (regressed once: every meal logged twice)");
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  await page.locator("textarea").first().fill("a plain bagel");
  await page.getByRole("button", { name: /Let Momo look/ }).click();
  await page.waitForTimeout(1800);
  check(
    "offline log is queued, not lost",
    (await page.getByText(/waiting to send/).count()) > 0,
  );

  await ctx.setOffline(false);
  // Fire several online events at once: the duplicate bug needed exactly this.
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) window.dispatchEvent(new Event("online"));
  });
  /*
   * Wait on the outbox itself, not on the banner text.
   *
   * Waiting for the banner to disappear made this intermittently fail: the
   * queue would be empty while the banner had not yet re-rendered, and the
   * check ran in the gap. The queue is the thing under test and the only
   * source of truth, so poll that.
   */
  const queueCount = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("macronaut-outbox", 1);
          req.onsuccess = () => {
            const db = req.result;
            const c = db
              .transaction("pending", "readonly")
              .objectStore("pending")
              .count();
            c.onsuccess = () => resolve(c.result);
          };
          req.onerror = () => resolve(-1);
        }),
    );

  let queueLeft = await queueCount();
  for (let i = 0; i < 120 && queueLeft > 0; i++) {
    await page.waitForTimeout(1000);
    queueLeft = await queueCount();
  }
  // Let the resulting write settle before the file is read below.
  await page.waitForTimeout(1500);
  check("outbox drains on reconnect", queueLeft === 0, `${queueLeft} left`);

  // Counted in the store, not the DOM: a logged food legitimately appears
  // twice on screen, once in the timeline and once as a repeat chip, so the
  // page is the wrong place to look for duplicates.
  const stored = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const bagels = stored.foodEntries.filter((e) =>
    /bagel/i.test(`${e.name} ${e.rawInput}`),
  ).length;
  check(
    "the queued meal is written once, not duplicated",
    bagels === 1,
    `${bagels} bagel rows stored`,
  );

  await ctx.close();

  /* ---------------------------------------------------------------- */
  section("Scrolling must not press things (it logged food once)");
  /*
   * Only reachable with an iPhone user agent, because the haptic overlay — a
   * real WebKit switch laid over the control — exists only there. A native
   * switch toggles on a *drag* as well as a tap, so a vertical scroll starting
   * on a repeat chip silently logged that food again. A plain button would
   * never have done it, which is exactly why this needs guarding by hand.
   */
  const iosCtx = await browser.newContext({
    ...phone,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
  });
  const iosPage = await iosCtx.newPage();
  const iosCdp = await iosCtx.newCDPSession(iosPage);
  await iosPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await iosPage.waitForTimeout(2000);

  check(
    "the haptic overlay is present on iOS",
    (await iosPage.locator("input[switch]").count()) > 0,
  );

  /*
   * ...but never inside the strip that scrolls sideways.
   *
   * The overlay is a native switch, and a switch is a control you drag
   * horizontally. Laid over the "Log again" row it claimed every sideways pan,
   * so on an iPhone the row simply would not move — reported twice, and not
   * reproducible in Chrome because Chrome never renders the overlay at all.
   * There is no element left in there that can consume the gesture.
   */
  check(
    "nothing in the Log again strip can eat a sideways drag",
    (await iosPage.locator("[data-no-swipe] input").count()) === 0,
    `${await iosPage.locator("[data-no-swipe] input").count()} overlay(s) found`,
  );

  const strip = await iosPage.evaluate(() => {
    const el = document.querySelector("[data-no-swipe]");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      chips: el.querySelectorAll("button").length,
      overflows: el.scrollWidth > el.clientWidth + 4,
      overflowX: cs.overflowX,
      touchAction: cs.touchAction,
    };
  });
  check(
    "the strip is set up to scroll sideways",
    Boolean(strip) &&
      strip.overflowX === "auto" &&
      /auto|pan-x|manipulation/.test(strip.touchAction),
    strip
      ? `overflow-x:${strip.overflowX}, touch-action:${strip.touchAction}`
      : "no strip",
  );
  // Only meaningful once there is more than a screenful; the suite does not
  // always log enough distinct foods to fill one.
  if (strip && strip.chips >= 4) {
    check(
      "and there is more of it than fits",
      strip.overflows,
      `${strip.chips} chips but no overflow`,
    );
  }

  const chip = iosPage.locator("[data-no-swipe] button").first();
  if (await chip.count()) {
    const cbox = await chip.boundingBox();
    const cx = cbox.x + cbox.width / 2;
    const cy = cbox.y + cbox.height / 2;
    const totalNow = () =>
      iosPage.evaluate(() => {
        const m = document.body.innerText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, "")) : -1;
      });

    const before = await totalNow();
    await iosCdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cx, y: cy }],
    });
    for (let i = 1; i <= 8; i++) {
      await iosCdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx, y: cy - i * 18 }],
      });
      await iosPage.waitForTimeout(14);
    }
    await iosCdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await iosPage.waitForTimeout(3500);

    check(
      "scrolling over a repeat chip does not log the food",
      (await totalNow()) === before,
      `${before} -> ${await totalNow()}`,
    );

    // And the control must still actually work. Re-measure first: the scroll
    // above genuinely moved the page, so the old coordinates point elsewhere.
    // Centre it in the viewport rather than merely "in view": the dock is
    // fixed to the bottom, so scrollIntoViewIfNeeded can leave the chip
    // underneath it and the tap lands on the navigation instead.
    await chip.evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await iosPage.waitForTimeout(500);
    const again = await chip.boundingBox();
    await iosPage.touchscreen.tap(
      again.x + again.width / 2,
      again.y + again.height / 2,
    );
    await iosPage.waitForTimeout(3500);
    check(
      "a clean tap on the chip still logs it",
      (await totalNow()) > before,
      `${before} -> ${await totalNow()}`,
    );
  } else {
    check("a repeat chip exists to test against", false, "none found");
  }

  /* ---------------------------------------------------------------- */
  section("Weigh-in nudge buttons (the haptic overlay can eat taps)");
  // Still on the iOS context on purpose. The haptic tick comes from a real
  // switch laid over the control, which is exactly the thing that once
  // swallowed a gesture — so these buttons have to be proved from the side
  // where that overlay exists, not from a desktop click.
  await iosPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  const openWeighIn = iosPage
    .getByRole("button", { name: /weigh in|Update/i })
    .first();
  await openWeighIn.scrollIntoViewIfNeeded().catch(() => {});
  await openWeighIn.click().catch(() => {});

  const weight = iosPage.locator("#weight");
  const opened = await weight
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("the weigh-in dialog opens", opened);

  if (opened) {
    const value = () => weight.inputValue().then(Number);
    const start = await value();

    const plus = iosPage.getByRole("button", { name: /Increase by/ });
    const minus = iosPage.getByRole("button", { name: /Decrease by/ });

    const box = await plus.boundingBox();
    await iosPage.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await iosPage.waitForTimeout(250);
    const up = await value();
    check(
      "tapping + moves the number up",
      up > start,
      `${start} -> ${up}`,
    );

    const mbox = await minus.boundingBox();
    await iosPage.touchscreen.tap(mbox.x + mbox.width / 2, mbox.y + mbox.height / 2);
    await iosPage.waitForTimeout(250);
    const back = await value();
    check(
      "tapping - brings it back",
      Math.abs(back - start) < 0.001,
      `${up} -> ${back}, expected ${start}`,
    );

    // The field changed from a number input to a text one, so the thing the
    // form actually reads has to still be named and filled.
    check(
      "the nudged value is what the form would submit",
      (await weight.getAttribute("name")) === "weight" &&
        (await weight.inputValue()).trim() !== "",
      `name=${await weight.getAttribute("name")} value=${await weight.inputValue()}`,
    );

    // Nothing is saved: a weigh-in costs an AI call, and free-tier quota is
    // scarce enough that the suite should not spend it to prove arithmetic.
    await iosPage.keyboard.press("Escape").catch(() => {});
  }
  await iosCtx.close();

  /* ---------------------------------------------------------------- */
  section("Offline cold start (used to be a dead end)");
  // A fresh context on purpose. "Cold start" means a browser that has the app
  // cached and no connection, not one still carrying state from the tests
  // above — which is what made this fail when it shared a context.
  const coldCtx = await browser.newContext(phone);
  const coldPage = await coldCtx.newPage();
  await coldPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  // The first navigation is never service-worker controlled: the worker is
  // still installing during it, so nothing is intercepted or cached. A real
  // person gets their snapshot on the second visit too.
  await coldPage.evaluate(() => navigator.serviceWorker.ready);
  await coldPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await coldPage.waitForTimeout(2000);

  const snapshot = await coldPage.evaluate(async () => {
    const key = (await caches.keys()).find((k) => k.endsWith("-pages"));
    if (!key) return [];
    return (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname);
  });
  check("Today is kept as a snapshot", snapshot.includes("/today"), JSON.stringify(snapshot));

  await coldCtx.setOffline(true);
  await coldPage.waitForTimeout(300);
  await coldPage.goto(`${SITE}/today`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await coldPage.waitForTimeout(4000);

  const coldBody = await coldPage.evaluate(() => document.body.innerText);
  check("launching with no signal still opens the app", /Tell me what you ate/i.test(coldBody));
  check("does not fall through to the offline dead end", !/No signal/i.test(coldBody));
  check("says the numbers are a snapshot, not live", /showing your last snapshot/i.test(coldBody));
  check("you can still type a meal offline", (await coldPage.locator("textarea").count()) > 0);
  await coldCtx.close();

  /* ---------------------------------------------------------------- */
  section("Interactive affordances (regressed once: nothing felt clickable)");
  const dctx = await browser.newContext(desktop);
  const dpage = await dctx.newPage();
  await dpage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await dpage.waitForTimeout(2000);

  const cursors = await dpage.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => !b.disabled && b.getBoundingClientRect().height > 0)
      .map((b) => getComputedStyle(b).cursor),
  );
  check(
    "every enabled button shows a pointer cursor",
    cursors.length > 0 && cursors.every((c) => c === "pointer"),
    `${cursors.filter((c) => c !== "pointer").length} of ${cursors.length} wrong`,
  );

  async function reactsToHover(locator) {
    const el = locator.first();
    if (!(await el.count())) return false;
    const read = () =>
      el.evaluate((e) => {
        const s = getComputedStyle(e);
        return [s.translate, s.transform, s.boxShadow, s.backgroundColor, s.color, s.filter].join("|");
      });
    await dpage.mouse.move(0, 0);
    await dpage.waitForTimeout(220);
    const rest = await read();
    await el.hover();
    await dpage.waitForTimeout(320);
    return rest !== (await read());
  }

  check("primary button reacts to hover", await reactsToHover(dpage.getByRole("button", { name: /Let Momo look/ })));
  check("repeat chip reacts to hover", await reactsToHover(dpage.locator("[data-no-swipe] button")));
  check("weigh-in bar reacts to hover", await reactsToHover(dpage.getByRole("button", { name: /weigh in|Update|kg/i })));

  const focusRing = await dpage.evaluate(async () => {
    const field = document.querySelector(".field");
    const area = document.querySelector("textarea");
    if (!field || !area) return null;
    const before = getComputedStyle(field).borderColor;
    area.focus();
    await new Promise((r) => setTimeout(r, 300));
    return { before, after: getComputedStyle(field).borderColor };
  });
  check(
    "the text field shows a focus state",
    !!focusRing && focusRing.before !== focusRing.after,
    JSON.stringify(focusRing),
  );

  /* ---------------------------------------------------------------- */
  section("Hover colour does not overshoot (regressed once: buttons blinked)");
  const easing = await dpage.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.getBoundingClientRect().height > 0,
    );
    if (!btn) return null;
    const s = getComputedStyle(btn);
    const props = s.transitionProperty.split(",").map((p) => p.trim());
    const timings = s.transitionTimingFunction.split(/,(?![^(]*\))/).map((t) => t.trim());
    const idx = props.indexOf("background-color");
    return { prop: props, colourTiming: idx >= 0 ? timings[idx] : null };
  });
  // A cubic-bezier whose control points exceed 1 overshoots. That is the point
  // for a transform, and a visible flash for a colour.
  const overshoots = (timing) => {
    const m = timing?.match(/cubic-bezier\(([^)]+)\)/);
    if (!m) return false;
    const [, y1, , y2] = m[1].split(",").map((n) => Number(n.trim()));
    return y1 > 1 || y2 > 1;
  };
  check(
    "background-color is not animated with an overshooting curve",
    !!easing && !overshoots(easing.colourTiming),
    `colour timing: ${easing?.colourTiming}`,
  );

  /* ---------------------------------------------------------------- */
  section("Desktop composer layout");
  const deskLayout = await dpage.evaluate(() => {
    const look = [...document.querySelectorAll("button")].find((b) =>
      /Let Momo look/.test(b.textContent),
    );
    const hint = [...document.querySelectorAll("p")].find((p) =>
      /Plain English/.test(p.textContent),
    );
    if (!look || !hint) return null;
    return {
      buttonWidth: look.getBoundingClientRect().width,
      hintWidth: hint.getBoundingClientRect().width,
    };
  });
  check(
    "submit button is auto-width, not stretched across the card",
    (deskLayout?.buttonWidth ?? 999) < 400,
    `${Math.round(deskLayout?.buttonWidth ?? 0)}px`,
  );
  check(
    "hint has room to sit on one line",
    (deskLayout?.hintWidth ?? 0) > 250,
    `${Math.round(deskLayout?.hintWidth ?? 0)}px`,
  );

  /* ---------------------------------------------------------------- */
  section("Security headers");
  // A CSP is only worth having if the app still runs under it, and the way it
  // fails is quiet: one blocked inline script and a feature stops working with
  // nothing on screen to say why. So this asserts the policy is strict *and*
  // that walking the app produces no violations.
  const secCtx = await browser.newContext(phone);
  const secPage = await secCtx.newPage();
  const cspViolations = [];
  secPage.on("console", (m) => {
    if (/violates the following Content Security Policy/i.test(m.text())) {
      cspViolations.push(m.text().slice(0, 140));
    }
  });

  const headRes = await secPage.goto(`${SITE}/today`, {
    waitUntil: "domcontentloaded",
  });
  const sent = headRes?.headers() ?? {};
  const csp = sent["content-security-policy"] ?? "";

  check("a Content-Security-Policy is sent", csp.length > 0);
  check(
    "it carries a per-request nonce",
    /'nonce-[a-f0-9]{16,}'/.test(csp),
    csp.slice(0, 80),
  );
  check(
    "script-src does not allow inline script",
    csp.includes("script-src") && !/script-src[^;]*'unsafe-inline'/.test(csp),
    csp.match(/script-src[^;]*/)?.[0] ?? "no script-src",
  );
  check(
    "the page cannot be framed",
    /frame-ancestors 'none'/.test(csp) && sent["x-frame-options"] === "DENY",
  );
  check("content types are not sniffed", sent["x-content-type-options"] === "nosniff");
  check(
    "referrers do not leak the path off-site",
    (sent["referrer-policy"] ?? "").length > 0,
    sent["referrer-policy"] ?? "missing",
  );

  // Two nonces from two requests must differ, or it is not a nonce.
  const second = await secPage.goto(`${SITE}/progress`, {
    waitUntil: "domcontentloaded",
  });
  const csp2 = second?.headers()["content-security-policy"] ?? "";
  check(
    "the nonce is fresh on every request",
    csp2.length > 0 &&
      csp.match(/'nonce-([a-f0-9]+)'/)?.[1] !==
        csp2.match(/'nonce-([a-f0-9]+)'/)?.[1],
  );

  for (const path of ["/today", "/journal", "/insights", "/profile", "/history"]) {
    await secPage.goto(`${SITE}${path}`, { waitUntil: "networkidle" });
    await secPage.waitForTimeout(700);
  }
  check(
    "the app runs clean under its own policy",
    cspViolations.length === 0,
    cspViolations.slice(0, 2).join(" | "),
  );
  await secCtx.close();

  /* ---------------------------------------------------------------- */
  section("Nothing runs off the side of a phone");
  /*
   * The same bug turned up twice, from the same cause: grid and flex items
   * default to min-width:auto, so a child that cannot wrap refuses to shrink
   * and drags its container past the edge of the screen.
   *
   * It hit the check-first dialog — one long ice cream name made the card
   * 452px wide inside a 358px dialog, taking the heading, the description and
   * the buttons off the side with it — and the Journal column, where the
   * search input's intrinsic width did exactly the same thing.
   *
   * The long name is injected rather than logged, so this does not depend on
   * what a model happens to return on the day it runs.
   */
  const wideCtx = await browser.newContext(phone);
  const widePage = await wideCtx.newPage();
  const LONG_NAME = "Ben & Jerrys Brownie Batter Core Ice Cream Chocolate Fudge";

  /*
   * Only content, never chrome.
   *
   * A first version of this walked every text node and duly reported the
   * navigation dock and a "Weigh in" button as overflowing — both of which
   * carry fixed labels that will never be sixty characters long. Stretching
   * those tests nothing except the test's own imagination. What genuinely
   * varies is what the model names a food, and that lives in the page body,
   * outside the controls.
   */
  /*
   * Renamed through the app's own edit form, not injected into the DOM.
   *
   * A first version walked the page and lengthened every word-like run,
   * which duly flagged the navigation dock, a "Weigh in" button and the
   * "since Aug 28" note beside a heading — all fixed strings that will never
   * be sixty characters long. Narrowing the injector until it stopped
   * complaining would have been fitting the test to the code.
   *
   * What actually varies is the name of a food, which a model writes and a
   * person can edit to anything up to a hundred and twenty characters. So
   * the test does that, and then looks at every screen the name appears on.
   */
  await widePage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await widePage.waitForTimeout(1200);

  const pencil = widePage.locator("button").filter({ has: widePage.locator("svg.lucide-pencil") }).first();
  const canEdit = await pencil
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("an entry can be opened for editing", canEdit);

  if (canEdit) {
    await pencil.click();
    const nameField = widePage.locator("#name");
    await nameField.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await nameField.fill(LONG_NAME);
    await widePage.getByRole("button", { name: /save|update|done/i }).first().click();
    await widePage.waitForTimeout(2500);
  }
  const measureOverflow = () => horizontalOverflow(widePage);

  for (const [path, name] of [
    ["/today", "Today"],
    ["/history", "Journal"],
    ["/progress", "Journey"],
    ["/insights", "Insights"],
    ["/profile", "You"],
  ]) {
    await widePage.goto(`${SITE}${path}`, { waitUntil: "networkidle" });
    await widePage.waitForTimeout(1200);
    const r = await measureOverflow();
    check(
      `${name} survives a very long food name`,
      r.over <= 1 && !r.worst,
      r.worst
        ? `${r.worst.tag}.${r.worst.cls} sticks out ${r.worst.past}px`
        : `page scrolls ${r.over}px`,
    );
  }

  // And the dialog the bug was reported in, with a result on screen.
  await widePage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await widePage.waitForTimeout(900);
  await widePage.getByRole("button", { name: /Check first/ }).click();
  await widePage
    .locator('textarea[aria-label="What are you thinking of eating?"]')
    .fill("ice cream");
  await widePage.getByRole("button", { name: /^Check it/ }).click();
  // Wait for the dialog's own result list. Waiting on the word "kcal" matched
  // the page *behind* the dialog, so this raced and sometimes renamed nothing.
  await widePage
    .locator('[role="dialog"] li')
    .first()
    .waitFor({ state: "visible", timeout: 60000 })
    .catch(() => {});

  /*
   * The item name in this list comes straight from the model, and the offline
   * estimator only ever says something short like "Ice Cream" — which is why
   * an earlier version of this check passed happily with the bug still in
   * place. Verified by putting the bug back: without the fix on DialogContent
   * this now fails and the short name did not.
   */
  const renamedInDialog = await widePage.evaluate((name) => {
    const row = document.querySelector('[role="dialog"] li');
    if (!row) return false;
    const label = [...row.querySelectorAll("span")].find(
      (s) => (s.textContent || "").trim().length > 3,
    );
    if (!label?.firstChild) return false;
    label.firstChild.nodeValue = name;
    return true;
  }, LONG_NAME);
  check("the dialog is showing a result to test", renamedInDialog);
  await widePage.waitForTimeout(400);

  /*
   * Measured against the dialog's own edge, not the viewport.
   *
   * The page-level signal cannot see this one at all: the dialog is
   * position:fixed so it never widens documentElement.scrollWidth, and body
   * carries overflow-x:hidden so nothing inside it counts as unclipped
   * either. Both earlier versions of this check were green with the bug
   * present. Comparing children against the card that is supposed to contain
   * them is the thing that actually goes red.
   */
  const dialogOverflow = await widePage.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return { over: 0, worst: { past: 0, tag: "no dialog", cls: "" } };
    const edge = dlg.getBoundingClientRect().right;
    // A child that an ancestor clips is not a visible bug — the quantity
    // inside a truncating name overhangs on paper and is invisible in fact.
    // Only walk as far as the dialog: body has overflow-x:hidden, and letting
    // that count would excuse everything.
    const clippedInside = (el) => {
      for (let n = el.parentElement; n && n !== dlg; n = n.parentElement) {
        if (/hidden|clip|auto|scroll/.test(getComputedStyle(n).overflowX)) {
          return true;
        }
      }
      return false;
    };
    let worst = null;
    for (const el of dlg.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (clippedInside(el)) continue;
      const past = Math.round(r.right - edge);
      if (past > 1 && (!worst || past > worst.past)) {
        worst = {
          past,
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 40),
        };
      }
    }
    return { over: 0, worst };
  });
  check(
    "the check-first dialog survives one too",
    dialogOverflow.over <= 1 && !dialogOverflow.worst,
    dialogOverflow.worst
      ? `${dialogOverflow.worst.tag}.${dialogOverflow.worst.cls} sticks out ${dialogOverflow.worst.past}px`
      : `page scrolls ${dialogOverflow.over}px`,
  );
  await wideCtx.close();

  /* ---------------------------------------------------------------- */
  section("The jar is still alive");
  /*
   * The liquid drifts and bubbles rise. Both had silently stopped — Motion
   * animations with `repeat: Infinity` that ran once and parked on their
   * final frame — and nothing noticed for weeks, because a still picture of
   * a jar looks exactly like a jar.
   *
   * Sampling the transform twice is the only way to tell the difference.
   */
  const jarCtx = await browser.newContext(phone);
  const jarPage = await jarCtx.newPage();
  await jarPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await jarPage.waitForTimeout(1500);

  const readJar = () =>
    jarPage.evaluate(() =>
      [...document.querySelectorAll(".jar-wave")].map(
        (g) => getComputedStyle(g).transform,
      ),
    );
  const firstJar = await readJar();
  await jarPage.waitForTimeout(700);
  const secondJar = await readJar();

  check("the jar has waves to animate", firstJar.length >= 2, `${firstJar.length} found`);
  check(
    "the liquid is actually moving",
    firstJar.length > 0 && JSON.stringify(firstJar) !== JSON.stringify(secondJar),
    `${firstJar[0]} then ${secondJar[0]}`,
  );
  check(
    "it is a CSS animation, so it cannot stop when a library changes",
    await jarPage.evaluate(() => {
      const g = document.querySelector(".jar-wave");
      return Boolean(
        g && g.getAnimations().some((a) => a.playState === "running"),
      );
    }),
  );
  await jarCtx.close();

  /* ---------------------------------------------------------------- */
  section("Meters fill without waiting for JavaScript");
  /*
   * The bars used to be animated from an effect, which meant they could not
   * start until React had hydrated twelve hundred nodes. On a throttled
   * phone they measured still empty at nine hundred milliseconds, sitting
   * next to their own numbers, which the server had already rendered.
   *
   * Now the whole thing is declarative, so it runs on the first painted
   * frame. These check the mechanism rather than the look, because the look
   * is identical either way and only the mechanism can regress.
   */
  const rawHtml = await (await fetch(`${SITE}/today`)).text();
  check(
    "the fill level is in the server HTML",
    /--fill:\s*[0-9.]+/.test(rawHtml) && rawHtml.includes("meter-fill"),
  );

  // Its own context: the contexts opened earlier have been closed by now.
  const meterCtx = await browser.newContext(phone);
  const meterPage = await meterCtx.newPage();
  await meterPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await meterPage.waitForTimeout(1800);

  const meter = await meterPage.evaluate(() => {
    const el = document.querySelector(".meter-fill");
    if (!el) return null;
    const cs = getComputedStyle(el);
    const track = el.parentElement;
    return {
      animationName: cs.animationName,
      transform: cs.transform,
      // The element itself stays full width; only the transform is scaled.
      fullWidth: Math.abs(el.offsetWidth - track.clientWidth) <= 1,
      inlineWidth: el.style.width,
    };
  });
  await meterCtx.close();
  check("there is a meter to look at", Boolean(meter));
  if (meter) {
    check(
      "it is driven by a CSS animation, not a script",
      meter.animationName === "meter-fill",
      meter.animationName,
    );
    check(
      "it scales rather than resizing",
      meter.fullWidth && !meter.inlineWidth && meter.transform.startsWith("matrix"),
      `width ${meter.inlineWidth || "(none)"} transform ${meter.transform.slice(0, 24)}`,
    );
  }

  /* ---------------------------------------------------------------- */
  section("Dark mode (it was one flat value before)");
  // The dark theme's problem was never the hue. Card against page measured
  // 1.09 and the sticker lip 1.03, so the cut-out edge the whole design
  // rests on did not exist. These assert the elevation stack directly, in
  // CIE L*, because a WCAG ratio says nothing useful about whether two dark
  // surfaces look like different surfaces.
  const darkCtx = await browser.newContext({ ...phone, colorScheme: "dark" });
  const darkPage = await darkCtx.newPage();
  await darkPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });
  await darkPage.waitForTimeout(1200);

  const surfaces = await darkPage.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const parse = (h) => {
      const v = h.trim().replace("#", "");
      return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
    };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const Lstar = (rgb) => {
      const Y = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    };
    const of = (n) => Lstar(parse(cs.getPropertyValue(n)));
    return {
      isDark: document.documentElement.classList.contains("dark"),
      background: of("--background"),
      lip: of("--lip"),
      card: of("--card"),
      inset: of("--inset"),
      track: of("--track"),
    };
  });

  check("the dark theme is actually applied", surfaces.isDark);
  check(
    "a card is a distinct surface from the page",
    surfaces.card - surfaces.background >= 8,
    `${(surfaces.card - surfaces.background).toFixed(1)} L* apart`,
  );
  check(
    "the sticker edge is visible against the page",
    Math.abs(surfaces.lip - surfaces.background) >= 4,
    `${Math.abs(surfaces.lip - surfaces.background).toFixed(1)} L* apart`,
  );
  check(
    "the sticker edge is darker than the face it sits under",
    surfaces.card - surfaces.lip >= 4,
    `${(surfaces.card - surfaces.lip).toFixed(1)} L* apart`,
  );
  check(
    "a nested panel reads as nested",
    Math.abs(surfaces.inset - surfaces.card) >= 4,
    `${Math.abs(surfaces.inset - surfaces.card).toFixed(1)} L* apart`,
  );
  // An empty meter should recede into the card, the way it does in daylight.
  check(
    "an empty meter is a groove, not a raised slab",
    surfaces.track < surfaces.card,
    `track ${surfaces.track.toFixed(1)} vs card ${surfaces.card.toFixed(1)}`,
  );

  // The active nav label was white on every pill: 1.54 on the amber one.
  const navContrast = await darkPage.evaluate(() => {
    const parse = (c) => (c.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
    // Last one: the desktop rail is in the DOM at zero height on a phone, and
    // the dock is the one a person can actually see.
    const link = [...document.querySelectorAll('a[aria-current="page"]')].pop();
    if (!link) return null;
    const pill = link.querySelector("[style*='background']");
    const label = [...link.querySelectorAll("span")].find(
      (n) => (n.textContent || "").trim().length > 1,
    );
    if (!pill || !label) return null;
    const a = lum(parse(getComputedStyle(label).color));
    const b = lum(parse(getComputedStyle(pill).backgroundColor));
    const [hi, lo] = [a, b].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  });
  check(
    "the active tab label is readable on its pill",
    (navContrast ?? 0) >= 4.5,
    navContrast ? navContrast.toFixed(2) : "pill not found",
  );

  /*
   * Every filled control, not just the one that was reported.
   *
   * The nav pill above was fixed on its own, and the same mistake was still
   * live in fifteen other places: a control filled with a candy colour and
   * labelled in white. Those colours are tuned to be readable AS TEXT on a
   * card, so after dark they are light -- white on the violet fill measured
   * 2.31:1, and it failed in daylight too at 4.20. Checking one pill by hand
   * is what let that spread, so this walks the page instead.
   *
   * Only controls with an opaque background of their own are judged; a
   * transparent or gradient one has no single colour to measure against.
   */
  const scanContrast = () =>
    darkPage.evaluate(() => {
      const parse = (c) => (c.match(/[0-9.]+/g) || []).map(Number);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const lum = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
      const out = [];
      for (const el of document.querySelectorAll("button, a, [role='button']")) {
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 16) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        const bg = parse(cs.backgroundColor);
        // Opaque fills only: alpha < 1 means the card behind is showing through.
        if (bg.length < 3 || (bg.length === 4 && bg[3] < 0.99)) continue;
        if (cs.backgroundImage && cs.backgroundImage !== "none") continue;
        const text = (el.innerText || "").trim();
        if (!text) continue;
        const fg = parse(cs.color);
        if (fg.length === 4 && fg[3] < 0.5) continue;
        const a = lum(fg), b = lum(bg);
        const [hi, lo] = [a, b].sort((x, y) => y - x);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < 4.5) out.push(`${text.replace(/\s+/g, " ").slice(0, 18)} ${ratio.toFixed(2)}`);
      }
      return out;
    });

  /*
   * Across the app, not one page.
   *
   * Written first as a single scan of /today, which passed -- and still
   * passed with the bug deliberately put back, because the control that
   * started all this lives on /insights. A green check that cannot see the
   * thing it is checking is worse than no check, so it walks the routes.
   */
  const lowContrast = [];
  for (const route of ["/today", "/insights", "/history", "/progress", "/profile"]) {
    await darkPage.goto(`${SITE}${route}`, { waitUntil: "networkidle" });
    await darkPage.waitForTimeout(400);
    for (const hit of await scanContrast()) lowContrast.push(`${route} ${hit}`);
  }
  await darkPage.goto(`${SITE}/today`, { waitUntil: "networkidle" });

  check(
    "no filled control is labelled in a colour you cannot read",
    lowContrast.length === 0,
    lowContrast.join(" | "),
  );

  /*
   * The wallpaper must stay wallpaper.
   *
   * Four blurred blobs drift behind the page, and they were hard-coded pale
   * lavenders shared with the light theme. Over a near-black page each one
   * composited forty-seven L* above it — four white searchlights, which is
   * what the dark theme actually looked like from across a room.
   */
  const wash = await darkPage.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const parse = (h) => {
      const v = h.trim().replace("#", "");
      return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
    };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const Lstar = (rgb) => {
      const Y = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    };
    const page = parse(cs.getPropertyValue("--background"));
    const alpha = Number(cs.getPropertyValue("--blob-opacity")) || 0;
    let worst = 0;
    for (const n of ["--blob-1", "--blob-2", "--blob-3", "--blob-4"]) {
      const blob = parse(cs.getPropertyValue(n));
      const mixed = blob.map((c, i) => alpha * c + (1 - alpha) * page[i]);
      worst = Math.max(worst, Lstar(mixed) - Lstar(page));
    }
    return { worst, alpha };
  });
  check(
    "the background blobs tint the page rather than light it up",
    wash.worst <= 6,
    `brightest blob lifts the page by ${wash.worst.toFixed(1)} L*`,
  );

  await darkCtx.close();

  /* ---------------------------------------------------------------- */
  section("Service worker and offline page");
  const sw = await dpage.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const keys = await caches.keys();
    return { active: reg?.active?.state ?? "none", caches: keys };
  });
  check("service worker activates", sw.active === "activated", sw.active);
  check(
    "cache is namespaced per deployment",
    sw.caches.some((k) => k.startsWith("macronaut-")),
    sw.caches.join(", "),
  );

  const offlineHtml = await (await fetch(`${SITE}/offline.html`)).text();
  check(
    "offline page uses the current violet theme",
    /#7b61ff|#9b85ff/i.test(offlineHtml) && !/12162a|c6f24e/i.test(offlineHtml),
  );

  await dctx.close();

  /* ---------------------------------------------------------------- */
  section("The same geometry in WebKit (the engine an iPhone runs)");
  /*
   * Everything above this line runs in Chrome, and that is where the blind
   * spot has been. Three bugs shipped that Chrome could not show me: the
   * repeat strip that would not scroll, because the element blocking it only
   * renders on iOS; a dialog that ran off the side of the screen; and four
   * white glows over the dark theme. All three were found by the person using
   * the app, not by this suite.
   *
   * WebKit is not Safari on an iPhone — no iOS quirks, no real touch, and the
   * layout engine is a desktop build. It is the closest thing that runs here,
   * and it renders text, flexbox and grid the way Safari does, which is where
   * the overflow bugs actually came from.
   *
   * A missing WebKit is a failure rather than a skip. A guard that quietly
   * does nothing is worse than no guard, because it reads as a green tick.
   */
  let webkitBrowser = null;
  try {
    webkitBrowser = await webkit.launch();
    check("WebKit is installed to test against", true);
  } catch (error) {
    check(
      "WebKit is installed to test against",
      false,
      `${String(error.message).split("\n")[0]} — run: npx playwright install webkit`,
    );
  }

  if (webkitBrowser) {
    const wkCtx = await webkitBrowser.newContext({
      viewport: phone.viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
    });
    const wk = await wkCtx.newPage();

    // The long food name is already in the data — the Chrome pass renamed an
    // entry through the edit form and that write persisted.
    for (const [path, name] of [
      ["/today", "Today"],
      ["/history", "Journal"],
      ["/progress", "Journey"],
      ["/insights", "Insights"],
      ["/profile", "You"],
    ]) {
      await wk.goto(`${SITE}${path}`, { waitUntil: "networkidle" });
      await wk.waitForTimeout(1200);
      const r = await horizontalOverflow(wk);
      check(
        `${name} fits the screen in WebKit`,
        r.over <= 1 && !r.worst,
        r.worst
          ? `${r.worst.tag}.${r.worst.cls} sticks out ${r.worst.past}px`
          : `page scrolls ${r.over}px`,
      );
    }

    // The strip that would not scroll on a real iPhone. Under this user agent
    // the app renders the iOS haptic overlay, so this is the arrangement that
    // was actually broken.
    await wk.goto(`${SITE}/today`, { waitUntil: "networkidle" });
    await wk.waitForTimeout(1200);
    const wkStrip = await wk.evaluate(() => {
      const el = document.querySelector("[data-no-swipe]");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        overlays: el.querySelectorAll("input").length,
        overflowX: cs.overflowX,
        touchAction: cs.touchAction,
        scrollable: el.scrollWidth > el.clientWidth + 4,
      };
    });
    check("the repeat strip exists in WebKit", Boolean(wkStrip));
    if (wkStrip) {
      check(
        "nothing in it can swallow a sideways drag, in WebKit too",
        wkStrip.overlays === 0 && wkStrip.overflowX === "auto",
        `${wkStrip.overlays} overlay(s), overflow-x:${wkStrip.overflowX}`,
      );
    }

    /*
     * And the dialog the overflow was reported in.
     *
     * Forced clicks here, deliberately. A dialog centred with translate(-50%)
     * lands on fractional pixels, and WebKit reports it as never "stable", so
     * Playwright's actionability check waits until it times out. Whether the
     * button is clickable is Chrome's job above; this pass is about geometry,
     * and it only needs the dialog open with something in it.
     */
    await wk.getByRole("button", { name: /Check first/ }).click({ force: true });
    await wk
      .locator('textarea[aria-label="What are you thinking of eating?"]')
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});
    await wk
      .locator('textarea[aria-label="What are you thinking of eating?"]')
      .fill("ice cream");
    await wk.getByRole("button", { name: /^Check it/ }).click({ force: true });
    const wkResult = await wk
      .locator('[role="dialog"] li')
      .first()
      .waitFor({ state: "visible", timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    check("the check dialog produced a result in WebKit", wkResult);

    if (wkResult) {
      /*
       * Found through the textarea, not by querying [role="dialog"] and
       * hoping. There is more than one dialog in the tree and the first match
       * was the wrong one, which is how this check sat green while the bug it
       * exists for was present.
       */
      const wkRenamed = await wk.evaluate((name) => {
        const field = document.querySelector(
          'textarea[aria-label="What are you thinking of eating?"]',
        );
        const dlg = field?.closest('[role="dialog"]');
        const row = dlg?.querySelector("li");
        const label = [...(row?.querySelectorAll("span") ?? [])].find(
          (s) => (s.textContent || "").trim().length > 3,
        );
        if (!label?.firstChild) return false;
        label.firstChild.nodeValue = name;
        return (dlg?.textContent || "").includes("Brownie Batter Core");
      }, LONG_NAME);
      // Without this the measurement below is of a dialog with a short name in
      // it, which passes for the wrong reason.
      check("the long name really is in the WebKit dialog", wkRenamed);
      await wk.waitForTimeout(400);

      const wkDialog = await wk.evaluate(() => {
        const field = document.querySelector(
          'textarea[aria-label="What are you thinking of eating?"]',
        );
        const dlg = field?.closest('[role="dialog"]');
        if (!dlg) return null;
        const edge = dlg.getBoundingClientRect().right;
        const clippedInside = (el) => {
          for (let n = el.parentElement; n && n !== dlg; n = n.parentElement) {
            if (/hidden|clip|auto|scroll/.test(getComputedStyle(n).overflowX)) {
              return true;
            }
          }
          return false;
        };
        let worst = null;
        for (const el of dlg.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || clippedInside(el)) continue;
          const past = Math.round(r.right - edge);
          if (past > 1 && (!worst || past > worst.past)) {
            worst = { past, tag: el.tagName.toLowerCase() };
          }
        }
        return worst;
      });
      check(
        "the check dialog holds a long name in WebKit",
        !wkDialog,
        wkDialog ? `${wkDialog.tag} sticks out ${wkDialog.past}px` : "",
      );
    }

    /* ---------------------------------------------------------------- */
    section("Reading a real barcode without BarcodeDetector");
    /*
     * The iPhone case, checked against an actual barcode.
     *
     * Safari has no BarcodeDetector, so the app used to hand every iPhone a
     * numeric keypad and an apology. It now falls back to ZXing, and this
     * runs the same pipeline that module uses — centre band, RGBA converted
     * to one grey byte per pixel, HybridBinarizer, 1D reader — over EAN-13
     * bar patterns generated from the spec.
     *
     * It earns its place: written the obvious way, the pipeline fed
     * ImageData.data straight to RGBLuminanceSource, which reads a
     * Uint8ClampedArray as luminances already. Every colour channel became
     * its own pixel. Nothing threw, nothing was logged, and no barcode was
     * ever read. Only decoding a known code caught it.
     *
     * It exercises the decode path rather than the component: a live camera
     * needs a fake capture device, which is not set up here.
     */
    const wkBarcode = await webkitBrowser.newContext();
    const bcPage = await wkBarcode.newPage();
    await bcPage.goto("about:blank");
    let zxingLoaded = true;
    try {
      await bcPage.addScriptTag({
        path: "node_modules/@zxing/library/umd/index.min.js",
      });
    } catch {
      zxingLoaded = false;
    }
    check("the ZXing fallback loads in WebKit", zxingLoaded);

    if (zxingLoaded) {
      check(
        "WebKit really has no native detector (the reason for all this)",
        !(await bcPage.evaluate(() => "BarcodeDetector" in window)),
      );

      const decoded = await bcPage.evaluate(() => {
        const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
        const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
        const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
        const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
        const modules = (code) => {
          const d = [...code].map(Number);
          const par = PARITY[d[0]];
          let bits = "101";
          for (let i = 1; i <= 6; i++) bits += (par[i - 1] === "L" ? L : G)[d[i]];
          bits += "01010";
          for (let i = 7; i <= 12; i++) bits += R[d[i]];
          return bits + "101";
        };
        const draw = (code) => {
          const bits = modules(code);
          const M = 3, QUIET = 12, H = 240;
          const cv = document.createElement("canvas");
          cv.width = (bits.length + QUIET * 2) * M;
          cv.height = H;
          const g = cv.getContext("2d");
          g.fillStyle = "#fff";
          g.fillRect(0, 0, cv.width, cv.height);
          g.fillStyle = "#000";
          for (let i = 0; i < bits.length; i++) {
            if (bits[i] === "1") g.fillRect((QUIET + i) * M, 0, M, H);
          }
          return cv;
        };
        // The app's pipeline, step for step.
        const decode = (source) => {
          const Z = window.ZXing;
          const w = source.width, h = source.height;
          const band = Math.max(64, Math.round(h * 0.5));
          const top = Math.round((h - band) / 2);
          const c = document.createElement("canvas");
          c.width = w;
          c.height = band;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(source, 0, top, w, band, 0, 0, w, band);
          const { data } = ctx.getImageData(0, 0, c.width, c.height);
          const lum = new Uint8ClampedArray(data.length / 4);
          for (let i = 0, p = 0; p < lum.length; i += 4, p++) {
            lum[p] = (data[i] + 2 * data[i + 1] + data[i + 2]) / 4;
          }
          const hints = new Map();
          hints.set(Z.DecodeHintType.TRY_HARDER, true);
          const reader = new Z.MultiFormatOneDReader(hints);
          try {
            return reader
              .decode(
                new Z.BinaryBitmap(
                  new Z.HybridBinarizer(
                    new Z.RGBLuminanceSource(lum, c.width, c.height),
                  ),
                ),
              )
              .getText()
              .trim();
          } catch {
            return null;
          } finally {
            reader.reset();
          }
        };
        const blank = document.createElement("canvas");
        blank.width = 400;
        blank.height = 240;
        const bg = blank.getContext("2d");
        bg.fillStyle = "#888";
        bg.fillRect(0, 0, 400, 240);
        return {
          cola: decode(draw("5449000214911")),
          other: decode(draw("4006381333931")),
          blank: decode(blank),
        };
      });

      check(
        "an EAN-13 decodes to its exact digits",
        decoded.cola === "5449000214911",
        `got ${decoded.cola}`,
      );
      check(
        "and so does a second one",
        decoded.other === "4006381333931",
        `got ${decoded.other}`,
      );
      // Guards the other direction: a decoder that invents codes is worse
      // than one that finds none, because it logs the wrong food.
      check(
        "a frame with no barcode reads as nothing",
        decoded.blank === null,
        `got ${decoded.blank}`,
      );
    }

    await wkBarcode.close();
    await wkCtx.close();
    await webkitBrowser.close();
  }
} finally {
  await browser.close();
  killTree(server);
  await rm(DATA_FILE, { force: true });
}

console.log(
  `\n${failures.length ? "✗" : "✓"} ${passed} passed, ${failures.length} failed`,
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
