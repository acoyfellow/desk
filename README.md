# desk

> A personal app store for tiny edge devices. `git push` installs.

<p align="center">
  <img src="./docs/screenshots/desk-on-m5.jpg" alt="desk running on an M5StickC Plus 1.1" width="320">
</p>

Apps live as Markdown files in a Cloudflare Artifacts git repo
you own. They run in Worker Loader isolates with state in DO
Facets. A small device — an M5StickC, a browser tab, anything
that can poll HTTPS and paint pixels — renders them.

```bash
git commit -m "+ counter app"
git push
```

That's the install. Within seconds, the new app shows up in
the device's dock. `git revert` is rollback. `git log` is the
audit trail.

Apps can do anything a small isolate can do — read button
input, render frames, persist per-app SQLite state, play
sound, expose [MCP](https://modelcontextprotocol.io) tools so
agents can drive them. The reference apps shipped with the
fabric include a counter, a virtual pet, a chiptune jukebox,
and an inbox surface that lets any MCP-capable agent ask the
operator questions out-of-band.

You own the edge. The edge owns nothing about you.

## Get started

Read the [docs](./docs/index.md). Specifically:

- **First time?** [Build your first desk](./docs/tutorials/01-build-your-first-desk.md) (60–90 min)
- **Already have a CF account?** [Deploy the fabric](./docs/how-to/deploy-the-fabric.md)
- **Curious about the architecture?** [Architecture explanation](./docs/explanation/architecture.md)

## Architecture

```mermaid
flowchart TB
  agent["agent (any MCP client)"]
  device["M5StickC Plus 1.1<br/>or browser tab"]

  subgraph fabric["desk fabric Worker"]
    direction LR
    mcp["DeskMcp DO"]
    runner["AppRunner DO<br/>(singleton)"]
    loader["Worker Loader<br/>(per-app isolate)"]
    facets[("DO Facets<br/>per-app SQLite")]
    src["ArtifactsAppSource<br/>(isomorphic-git)"]

    mcp <--> runner
    runner --> loader
    loader --> facets
    runner --> src
  end

  repo[("desk/apps<br/>Artifacts repo")]

  agent -- POST /mcp --> fabric
  device -- HTTPS poll<br/>/list + /run --> fabric
  src --> repo
```

## License

MIT. See [LICENSE](./LICENSE).
