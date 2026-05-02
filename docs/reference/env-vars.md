# Environment variables

Every secret desk reads from a file at `~/.config/desk/<name>`
(mode `600`) and exports as an env var via the shell rc. Files
are gitignored. Tokens never appear in source.

## Operator-side (your machine)

| Env var | File | What |
|---|---|---|
| `DESK_DEVICE_TOKEN` | `~/.config/desk/device-token` | Shared bearer for the M5 firmware, the browser viewer, and every MCP client. Treat as high-trust. |
| `CLOUDFLARE_DEPLOY_TOKEN` | `~/.config/desk/cf-deploy-token` | CF API token with `Workers:Edit` scope. Used by `wrangler deploy`. |
| `CLOUDFLARE_PERSONAL_ACCOUNT_ID` | (your shell rc) | Your Cloudflare account ID. Required by `wrangler deploy`. |
| `CLOUDFLARE_ARTIFACTS_EDIT_TOKEN` | `~/.config/desk/cf-artifacts-edit-token` | CF API token with `Artifacts:Edit` scope. Only needed when creating new Artifacts repos. Revoke when not in use. |
| `DESK_APPS_REPO_TOKEN` | `~/.config/desk/apps-repo-token` | `art_v1_*` token scoped to the `desk/apps` Artifacts repo. Used by `git push` to install apps. |
| `DESK_APPS_REPO_REMOTE` | (computed) | Full HTTPS URL for the Artifacts repo. Built from the account ID + namespace + repo. |
| `DESK_MCP_URL` | n/a | Full URL to the fabric `/mcp` endpoint. Used by demo scripts and the local stdio proxy. |

Recommended `~/.zshrc` (or equivalent) snippet:

```bash
export CLOUDFLARE_PERSONAL_ACCOUNT_ID="<your account id>"
export CLOUDFLARE_PERSONAL_API_TOKEN="$(cat ~/.config/desk/cf-deploy-token 2>/dev/null | tr -d '[:space:]')"
export DESK_DEVICE_TOKEN="$(cat ~/.config/desk/device-token 2>/dev/null | tr -d '[:space:]')"
export DESK_APPS_REPO_TOKEN="$(cat ~/.config/desk/apps-repo-token 2>/dev/null | tr -d '[:space:]')"
export DESK_APPS_REPO_REMOTE="https://${CLOUDFLARE_PERSONAL_ACCOUNT_ID}.artifacts.cloudflare.net/git/desk/apps.git"
export DESK_MCP_URL="https://<your-fabric>.workers.dev/mcp"
```

## Worker-side (set via `wrangler secret put`)

The fabric Worker reads these from the Cloudflare secrets store,
not from `.dev.vars` in production.

| Worker env var | Source | What |
|---|---|---|
| `DESK_DEVICE_TOKEN` | `wrangler secret put DESK_DEVICE_TOKEN` | The bearer the fabric expects on every authenticated request. Must match the operator's `~/.config/desk/device-token`. |
| `DESK_APPS_REPO_REMOTE` | `wrangler secret put DESK_APPS_REPO_REMOTE` | URL the `ArtifactsAppSource` clones from. |
| `DESK_APPS_REPO_TOKEN` | `wrangler secret put DESK_APPS_REPO_TOKEN` | The repo-scoped `art_v1_*` token used to authenticate Artifacts git operations. |

Local development (`bunx wrangler dev`) reads from
`.dev.vars` instead; that file is gitignored and contains the
same variables in plaintext.

## Device-side (M5 `secrets.py`)

The M5 reads its config from a file at `:secrets.py` on flash:

```python
WIFI_SSID = "your-ssid"
WIFI_PASS = "your-pass"

# Optional fallback networks
WIFI_SSID_2 = "..."
WIFI_PASS_2 = "..."
# up to WIFI_SSID_5 / WIFI_PASS_5

FABRIC_BASE = "https://<your-fabric>.workers.dev"
DEVICE_TOKEN = "<DESK_DEVICE_TOKEN>"
```

This is the only place the bearer token lives on the device.
Don't commit `secrets.py`.

A reference template lives at `~/.config/desk/wifi`; copy values
into `secrets.py` when flashing.

## Worker Loader pricing note

Worker Loader is a paid Cloudflare feature in production. Local
dev is free. At small operator scale (<10K requests/day) cost is
typically under a dollar per month, but check
[Cloudflare's pricing page](https://developers.cloudflare.com/workers/platform/pricing/)
before deploying if cost matters.

## See also

- [How to deploy the fabric](../how-to/deploy-the-fabric.md)
- [How to flash the M5](../how-to/flash-the-m5.md)
- [HTTP endpoints](http-endpoints.md)
