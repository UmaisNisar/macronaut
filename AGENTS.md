<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Commit as UmaisNisar

Author commits with `umais.nisar02@gmail.com` (already set in this repo's
local git config, so nothing needs passing on the command line).

GitHub attributes a commit by its **author email**, not by who pushed it, and
`umais.nisar01@gmail.com` — the obvious-looking personal address — belongs to
a different GitHub account, `urock12`. Every commit made with it is credited
to that account even though the push comes from `UmaisNisar`.

That is not cosmetic. Vercel reads the commit author, fails to match it to a
team member, and refuses the build with `TEAM_ACCESS_REQUIRED` — which looked
for a while like a broken webhook. The first 47 commits here are all
attributed to the wrong account for this reason.
