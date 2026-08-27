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
 * Runs against a production build in solo mode, so no account and no Supabase
 * are needed. Uses the Chrome already installed on the machine rather than
 * downloading a browser.
 *
 *   npm run test:e2e
 */
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { chromium } from "playwright-core";

const PORT = Number(process.env.E2E_PORT ?? 3399);
const SITE = `http://localhost:${PORT}`;
const DATA_FILE = ".data/e2e.json";

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

async function startServer() {
  await rm(DATA_FILE, { force: true });
  const server = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "-p", String(PORT)],
    {
      env: {
        ...process.env,
        // Blank Supabase => solo mode => no sign-in wall.
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        MACRONAUT_DATA_FILE: DATA_FILE,
      },
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

/** Walk the onboarding wizard so the rest of the suite has a real profile. */
async function onboard(page) {
  await page.goto(`${SITE}/onboarding`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("your name").fill("Tester").catch(() => {});
  for (let i = 0; i < 6; i++) {
    const next = page.getByRole("button", { name: /^Next/ });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(300);
    } else break;
  }
  const go = page.getByRole("button", { name: /Let.s go/ });
  if (await go.isVisible().catch(() => false)) await go.click();
  await page.waitForURL(/\/today/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);
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
  check("photo and submit share one row", mobileLayout?.sameRow === true);
  check("neither overflows the screen", mobileLayout?.fitsViewport === true);
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
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const afterLog = await page.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, "")) : 0;
  });
  check("calories appear on the dashboard", afterLog > 0, `${afterLog} kcal`);

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
  await page
    .waitForFunction(() => !/waiting to send/.test(document.body.innerText), null, {
      timeout: 90000,
    })
    .catch(() => {});
  await page.waitForTimeout(2500);

  const queueLeft = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("macronaut-outbox", 1);
        req.onsuccess = () => {
          const db = req.result;
          const c = db.transaction("pending", "readonly").objectStore("pending").count();
          c.onsuccess = () => resolve(c.result);
        };
        req.onerror = () => resolve(-1);
      }),
  );
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
} finally {
  await browser.close();
  server.kill();
  await rm(DATA_FILE, { force: true });
}

console.log(
  `\n${failures.length ? "✗" : "✓"} ${passed} passed, ${failures.length} failed`,
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
