# Contributing to desk

desk is a small personal project shared in public for people who want
to fork or learn from it. PRs are welcome but the bar is high enough
that drive-by changes are unlikely to land — see the rules below.

## Before you open a PR

1. **Read `.context/START-HERE.md`.** It tells you what desk is, what
   the hard rules are, and how the architecture decisions got made.
2. **Read `.context/INVARIANTS.md`.** I-1 (single-account install),
   I-3 (secrets discipline), and I-5 (experiments produce evidence)
   are non-negotiable.
3. **Read `experiments/README.md`.** The decisions log (`DECISIONS.md`)
   points to the experiment that justified each architectural choice.
   If your PR contradicts a graduated decision, you need a new
   experiment, not a PR.

## Rules of the road

- **Rule 1: No production code without a graduated experiment.** Every
  architectural change goes through `experiments/exp-NN-question/` with
  a measurable `RESULT.md`. Tiny patches (typos, render bugs, manifest
  fixes) where the existing graduated decision still holds are exempt.
- **Rule 2: Read upstream docs first when touching primitives.** When
  changing how desk uses a Cloudflare service, pull
  `developers.cloudflare.com/<product>/llms.txt` first. LLMs hallucinate
  about new products often enough that fresh docs are a hard
  prerequisite.
- **Rule 3: Single-account install.** desk's persistent infrastructure
  always runs on the operator's own Cloudflare account. Don't add
  features that mix accounts.

## Things that will get a PR closed

- Code that adds a vendor lock-in (e.g. assumes a specific MCP client,
  a specific terminal, a specific OS) without an opt-out.
- Architectural claims ("X is faster than Y") without a measurement
  alongside the PR.
- New apps without a manifest that conforms to `experiments/exp-10-...`'s
  schema.
- Anything that violates an invariant in `.context/INVARIANTS.md` —
  that file is the boundary.

## Things that will get a PR a fast review

- A new app (markdown manifest with frontmatter + JS body) that does
  one thing well, fits the 135×240 screen, and respects the manifest
  budget (cpu_ms_per_input ≤ 50).
- A new experiment that asks a sharp question and produces a `RESULT.md`
  with measurable evidence — even if the answer turns out to be "no,
  this approach didn't work."
- Documentation improvements, especially the public install path
  (which is currently the weakest part of the repo).
- Bug fixes accompanied by a reproducer.

## Discussion before code

For larger changes, please open an issue describing the problem and
the proposed direction *before* writing the PR. desk is opinionated;
finding out late that a direction conflicts with an invariant is no
fun for anyone.

## License

By contributing, you agree your contributions are licensed under the
same MIT license as the rest of the repo (`LICENSE`).
