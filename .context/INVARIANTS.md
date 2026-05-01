# desk — Hard Invariants

These are non-negotiable rules the project's agents and maintainer follow.
Anyone (or any agent) about to violate one of these should stop and ask.

## I-1. desk runs on its operator's own account

desk deploys to a Cloudflare account that the desk operator owns. All
secrets, tokens, repos, MCP server endpoints, AI calls, and Artifacts
repos belong to that one account. desk never uses someone else's account
for its persistent infrastructure.

In practice this means:

- Each desk install has exactly one Cloudflare account ID it deploys to.
- Tokens minted against another account never get plugged into desk.
- desk artifacts (the Worker, the Artifacts repos, MCP endpoints) live
  in the operator's namespace, not anyone else's.

This protects desk from accidentally leaking work data into a personal
demo or vice versa, and keeps multi-tenant scenarios honest: each desk
operator sees their own boundary clearly.

## I-2. Hardware code lives in `device/`

All firmware, MicroPython modules, and hardware-side scratch live under
`device/`. The repo doesn't grow alternate hardware homes elsewhere.

## I-3. Secrets live outside the repo

Tokens and passwords go in files under `~/.config/desk/<name>` with mode
`600`, exported as environment variables. Never committed. Never pasted
into chat. Never echoed to stdout in scripts.

## I-4. Read docs before touching primitives

When working with a Cloudflare primitive (Workers, Durable Objects,
Worker Loader, Artifacts, AI, etc.), pull the relevant
`developers.cloudflare.com/<product>/llms.txt` FIRST and read it. The
LLMs are confidently wrong about new products often enough that fresh
docs are non-negotiable.

For convenience while developing, snapshots may be cached locally at
`.context/cf-docs-snapshot/` — that path is gitignored (the docs are
upstream's content to publish, not desk's).

## I-5. Experiments produce evidence

No production code lands without a graduated experiment under
`experiments/`. No experiment graduates without a measured `RESULT.md`
that shows the question was answered with evidence, not opinion.
