# Macronaut

**Mission control for your body.** Type what you ate in plain English; an LLM turns it
into calories and macros, and the app keeps the long record — meals, weight, goals,
trends — so you can answer the only question that matters:

> Am I actually improving?

Not a MyFitnessPal clone. A bright, candy-coloured little world with a mascot called
**Momo** living in it, in light and dark — hand-drawn SVG everywhere, and an AI coach that is honest without
ever being a scold.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. **It works with zero configuration** — and this checkout
already has Gemini and Supabase wired up in `.env.local`.

With no environment variables set, Macronaut runs in **solo mode**:

| Missing            | What happens instead                                                  |
| ------------------ | --------------------------------------------------------------------- |
| Supabase keys      | One local pilot, no sign-in, data in `.data/macronaut.json`            |
| `GEMINI_API_KEY`   | Built-in food table estimator + deterministic template coaching        |

Everything is usable in that state. Add keys to upgrade in place — no code changes.

Want data to look at? **Profile → Data → Load demo history** fabricates 45 realistic
days (development only).

---

## Turning on the real thing

Copy `.env.example` to `.env.local` and fill in what you want.

### Gemini (the interesting half)

Get a free key at <https://aistudio.google.com/apikey>.

```bash
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash   # optional
```

The key is only ever read server-side. The browser never sees it.

### Supabase (auth + Postgres)

Already provisioned for this checkout — project **Macronaut** in `ca-central-1`, with the
URL and anon key in `.env.local`. To recreate it from scratch elsewhere:

```bash
npx supabase login
npx supabase projects create Macronaut --org-id <org> --db-password <pw> --region ca-central-1
npx supabase link --project-ref <ref>
npx supabase db push          # applies supabase/migrations/
```

Then put the URL and anon key in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

The migration in [`supabase/migrations/`](supabase/migrations) creates every table plus
row-level security policies scoping all rows to `auth.uid()`. It is idempotent, so you can
also paste it straight into the SQL editor.

Email confirmation is **on** (Supabase's default), so the first sign-up needs a click in
your inbox. To skip that: Authentication → Sign In / Providers → turn off *Confirm email*.

**Personal install?** Once your own account exists, turn off Authentication → *Allow new
users to sign up*. Nobody else can then create an account against your project.

### Google sign-in

**Configured and working** on both `localhost:3000` and the deployed site. A "Continue
with Google" button sits on the landing page, and
[`/auth/callback`](src/app/auth/callback/route.ts) exchanges the one-time code for a
session server-side (that exchange is what writes the auth cookies).

To reproduce the setup elsewhere:

**1. Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID* →
Web application. Add exactly this authorised redirect URI:

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

That URI is Supabase's, not the app's — Google returns to Supabase, which then forwards to
`/auth/callback` on whichever origin started the flow.

**2. Supabase** → Authentication → *Sign In / Providers* → Google → enable and paste the
client ID and secret. Then under *URL Configuration* add:

```
https://macronaut-lemon.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

Or let [`supabase/config.toml`](supabase/config.toml) do it — it declares all of the above:

```bash
GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_SECRET=... npx supabase config push
```

> **`config push` is declarative and applies immediately** — it pushes the whole file, and
> anything you leave out silently reverts to the *CLI's* default, which is not always the
> hosted default. It caught us once: omitting the MFA and OTP settings turned off TOTP
> enrolment and shortened email OTPs from 8 digits to 6. Both are now stated explicitly in
> the file for exactly that reason. Run it once and read the diff; a second run should
> report "up to date" for every service.

### Deploying

Already deployed: **https://macronaut-lemon.vercel.app**

```bash
npx vercel --prod
```

`GEMINI_API_KEY`, `GEMINI_MODEL`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for production, preview and development.

---

## What is in it

| Route       | What it does                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `/welcome`  | Landing page; sign-in when Supabase is configured                                   |
| `/onboarding` | Five-step setup that computes and previews your plan live                         |
| `/today`    | Fuel Core instrument, natural-language composer, AI debrief, meal timeline          |
| `/history`  | Colour-coded calendar; any past day reopened in full, with the targets of that day  |
| `/progress` | Weight journey, trend chart, and the period-vs-period comparison system             |
| `/insights` | AI period reviews (7 / 14 / 30 days), streaks, achievements                         |
| `/profile`  | Goals, recalculated plan preview, goal history, system status, danger zone          |

---

## Installing it on your phone

Macronaut is a PWA: installable, standalone (no browser chrome), with its own icon,
launcher shortcuts for *Log food* and *Progress*, and a proper offline screen.

Open **https://macronaut-lemon.vercel.app** on the phone and install from there.

**It must be served over HTTPS.** Browsers only allow installation and service workers on
`https://` or `localhost`, so reaching your laptop's dev server over the LAN
(`http://192.168.x.x:3000`) will *not* offer an install prompt.

- **iOS** — open the site in Safari → Share → *Add to Home Screen*. Leave **Open as
  Web App** on; off makes it a plain bookmark. An installed web app gets its own cookie
  jar, so you sign in once inside it even if Safari already has you logged in.
- **Android** — Chrome shows an install prompt, or use ⋮ → *Install app*.

**Swipe between tabs.** On touch devices the pages are a swipeable deck in dock order
(Today → Journal → Journey → Insights → You), handled by
[`SwipeNav`](src/components/shell/swipe-nav.tsx). Motion's `dragDirectionLock` commits to
one axis at the start of a gesture so a vertical scroll never becomes a page change, and
`touch-action: pan-y` keeps scrolling native. A pill peeks in from the edge naming the
page you are about to land on, because an invisible gesture may as well not exist. Regions
that scroll sideways themselves opt out with `data-no-swipe`. The whole thing is disabled
on fine pointers, so a mouse drag never navigates.

What the service worker does and does not do, deliberately:

| | |
| --- | --- |
| Cached | `/_next/static/*`, icons, fonts — content-hashed, so always safe |
| Never cached | HTML, RSC payloads, anything personal, any non-GET request |
| Offline | A clear "no signal" screen. Logging needs the server |

Every page is dynamic and account-scoped, so caching them would risk showing stale or
wrong-account data. Fast launches come from the static cache; correctness comes from
always fetching the real page.

---

## The look

The design brief was "cute, cartoony, playful, alive" — a little world you want to open
rather than a dashboard you have to read. Violet leads; nothing is coloured decoratively.

**Momo** is the whole product's personality: a soft violet dumpling blob with a sprout,
drawn in SVG in [`components/mascot/momo.tsx`](src/components/mascot/momo.tsx). Poke it and
it squishes and grins; leave it alone and it blinks, glances about and does something
small and unprompted every ten seconds or so. It has eight moods
(`idle`, `curious`, `thinking`, `excited`, `celebrating`, `caring`, `proud`, `sleepy`) and
each one drives the eyes, the mouth, the body motion and the props floating around it.
It blinks on an irregular rhythm and glances about, because a fixed interval reads as
mechanical. The rest of the app just says how Momo feels; Momo does the acting.

**One surface.** Everything is a `.sticker` — white, very round, with a coloured "lip"
underneath so it reads as a physical cut-out rather than a flat card. Tints
(`tint-pink`, `tint-mint`, `tint-grape`…) set the lip and a faint wash together.

**One colour per job.** Violet is you and every primary action, peach is energy, mint is
protein, sky is carbs, sun is fat, leaf is fiber.

**Two themes.** Light is a lavender day; dark is a deep violet night, not grey. Every
colour is a token, so the whole app flips on one class — including the SVG instruments.
The switch is in the desktop rail, the Today header on mobile, and Profile. It follows
your system setting until you pick one.

**One motion vocabulary.** [`lib/motion.ts`](src/lib/motion.ts) holds every variant the
app uses — `pop`, `fadeUp`, `slideIn`, `squish`, `liftTilt`, `celebrate`, `stagger`. Two
easing curves do almost all the work: `squish` for anything physical, `glide` for anything
calm. Sticking to two is what keeps it feeling like one object.

Set pieces worth finding:

| Where | What happens |
| --- | --- |
| Today | An energy **jar** with two sloshing wave surfaces and rising bubbles — not a ring |
| Logging food | Momo thinks, food drifts past, then results **pop in one by one** and the totals count up before Momo reacts |
| Progress | The journey is a **road**, with Momo standing exactly where you are on it |
| Insights | The recap plays as **timed slides** — days logged, protein, then a drumroll before the weight |
| Anywhere | `useCelebration()` fires confetti, a badge and a delighted Momo |

Motion is transform/opacity only, and `prefers-reduced-motion` collapses every loop to a
resting pose rather than removing the animated keys — dropping a key mid-flight makes
Motion animate an SVG attribute to `undefined`.

---

## Architecture

```
src/
  app/
    (app)/            today · history · progress · insights · profile  (auth-gated shell)
    welcome/          landing + auth
    onboarding/       first-run setup
    api/dev/seed/     demo-data generator (blocked in production)
  components/
    mascot/           Momo, and the speech bubble it talks through
    viz/              energy jar · macro meters · journey road · charts · radar
    celebrate/        the confetti + badge system, provided at the root
    today/ history/ weight/ insights/ profile/ onboarding/ shell/
    ui/               shadcn (Base UI) primitives, restyled chunky
  lib/
    schemas.ts        every Zod schema, including the AI output contracts
    nutrition.ts      Mifflin-St Jeor, TDEE, targets, day scoring, journey maths
    insights.ts       period aggregates, comparisons, streaks, weight trends
    achievements.ts   the badge catalogue and its rules
    ai/               gemini client · prompts · food analysis · coaching · offline estimator
    db/               store interface + supabase driver + local JSON driver
  server/
    core.ts           day recomputation, goal snapshots, achievement refresh
    actions.ts        every server action
  proxy.ts            Supabase session refresh (Next 16 renamed middleware to proxy)
```

**One storage interface, two drivers.** `DataStore` in `lib/db/store.ts` is the only
thing the app talks to. `supabase.ts` implements it over Postgres; `local.ts` implements
it over a JSON file with an in-process write lock and mtime revalidation. Nothing above
that layer knows which one is running.

**Targets are versioned, not overwritten.** Every goal change writes a `goal_snapshots`
row effective from that day. History is scored against the plan that was actually in
force at the time, so changing your target today never rewrites what last month meant.

**Days are rollups.** `food_entries` is the source of truth; `daily_logs` holds the
recomputed totals, score, status and coach note. Anything that mutates food calls
`recomputeDay`, so the two can never drift.

### The AI layer

Four separate jobs, four prompts, four Zod contracts — in `lib/ai/`:

| Function            | Job                                                    |
| ------------------- | ------------------------------------------------------ |
| `analyseFood`       | free text → itemised foods, portions, macros, assumptions |
| `writeDailyNote`    | today's numbers + recent days → a debrief               |
| `writeWeightNote`   | a new reading against 7/14/28-day trends → context      |
| `writePeriodReport` | a period vs the one before → review, wins, next mission |

Every call goes out with a Gemini `responseSchema` **and** comes back through a Zod
`safeParse`. `generateJson` never throws: on any failure — no key, rate limit, malformed
JSON, schema mismatch — the caller silently falls back to the deterministic path. Food
analysis also reconciles calories against `4/4/9` macro maths and rewrites any item that
is more than ~30% out.

Context sent to the model is deliberately small: aggregates and a day-by-day skeleton,
never the full history. Reports are cached against a signature of the numbers they were
written from, so revisiting a page costs nothing.

`lib/ai/prompts.ts` holds a single shared `VOICE` block that every coaching prompt
inherits — that is what keeps the app from contradicting its own tone.

### Scoring

Out of 100, deliberately forgiving (`lib/nutrition.ts`):

- **45** energy accuracy — full marks anywhere in 85–105% of target, gentle slopes out,
  and a floor well above zero. A heavy day dents a score; it never flattens it.
- **30** protein against target
- **15** logging (something at all → 9, three or more items → 15)
- **10** fiber against target

A day is *Great* at 82+, *Solid* at 64+, otherwise *Above target* or *Under-fuelled*
depending on which side of the line it fell. Nothing in the app says you failed.

---

## Notes

- **Light and dark**, class-based via `next-themes`, defaulting to your system setting.
  Anything drawn in SVG uses tokens too, so no instrument is stranded in the wrong theme.
- **No chart library.** Every visualisation is hand-built SVG so the energy jar, the
  journey road and the radar can be exactly what the data needs.
- **Timezones.** The browser writes its IANA zone to a cookie; the server derives "today"
  from that, never from its own clock.
- **Determinism in SVG.** Trig results differ in the last float digit between Node and
  Chrome, which is enough to cause a hydration mismatch, so `lib/geometry.ts` quantises
  every coordinate it emits.
- **Estimates, not medical advice.** Calorie and macro figures are approximations. They
  are useful for spotting trends over weeks, not for clinical decisions.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm run start   # serve the build
npm run lint    # eslint
```
