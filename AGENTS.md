<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Commit identity

Author commits with an email address verified on the **UmaisNisar** GitHub
account. This repo's local git config already has one set, so nothing needs
passing on the command line.

GitHub credits a commit by its **author email**, not by who pushed it, and
Vercel reads that author to decide whether to build. A commit authored with an
address that belongs to a different GitHub account is credited to that account,
and Vercel refuses it with `TEAM_ACCESS_REQUIRED` — which for a while looked
exactly like a broken webhook rather than the wrong address on the commit.

Before assuming a push deployed, check the author actually resolved:

    gh api repos/UmaisNisar/macronaut/commits/<sha> --jq .author.login

It should print `UmaisNisar`.
