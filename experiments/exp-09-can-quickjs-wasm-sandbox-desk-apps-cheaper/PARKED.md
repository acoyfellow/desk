# PARKED — Worker Loader won

This experiment was a hedge against exp-08 (Worker Loader). The
hypothesis: if Worker Loader required per-app deploys or wasn't
production-ready, QuickJS-WASM-in-a-host-Worker would be a cheaper
alternative.

exp-08 graduated cleanly with 13ms cold starts and Worker Loader's
`env.LOADER.get(id, callback)` pattern matching the "no per-app
deploy" requirement. The QuickJS hedge became unnecessary.

Reasons to revisit this question in the future:

1. **Cost.** If desk grows to thousands of apps and Worker Loader's
   per-isolate pricing becomes prohibitive, a single QuickJS host
   isolating many "prototype" apps in one Worker process could be
   meaningfully cheaper.
2. **On-device prototyping.** If the prompt→app loop needs to spin
   up apps in tens of ms (not hundreds), a warm QuickJS context
   with hot-swap may beat Worker Loader's cold-start tail.

For v0 / public release, the question stays parked.
