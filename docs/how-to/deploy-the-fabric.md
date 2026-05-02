# How to deploy the fabric Worker

This solves the problem of getting desk-fabric running on
**your** Cloudflare account, with **your** secrets.

## Prerequisites

- A Cloudflare account ([sign up free](https://dash.cloudflare.com/sign-up))
- [Bun](https://bun.sh) installed locally (`curl -fsSL https://bun.sh/install | bash`)
- This repo cloned: `git clone https://github.com/acoyfellow/desk && cd desk`

## 1. Mint a deploy token

[Cloudflare dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**.

Use the **Edit Cloudflare Workers** template, or build a custom
token with these permissions:

- `Account` → `Workers Scripts:Edit`
- `Account` → `Workers AI:Edit` *(optional, only if you'll use AI later)*
- `Account` → `Account:Read`

Save the token to `~/.config/desk/cf-deploy-token`:

```bash
mkdir -p ~/.config/desk
chmod 700 ~/.config/desk
printf '%s' "<your token>" > ~/.config/desk/cf-deploy-token
chmod 600 ~/.config/desk/cf-deploy-token
```

## 2. Create an Artifacts repo for your apps

Mint a second token with **Artifacts:Edit** scope:

```bash
printf '%s' "<artifacts-edit token>" > ~/.config/desk/cf-artifacts-edit-token
chmod 600 ~/.config/desk/cf-artifacts-edit-token
```

Create the repo:

```bash
ACCOUNT_ID="<your account id>"  # https://dash.cloudflare.com → right sidebar
ART_TOKEN="$(cat ~/.config/desk/cf-artifacts-edit-token | tr -d '[:space:]')"

curl -X POST \
  -H "Authorization: Bearer $ART_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/artifacts/namespaces/desk/repos" \
  -d '{"name":"apps"}'
```

The response includes an `art_v1_…` repo-scoped token. Save it:

```bash
printf '%s' "art_v1_…" > ~/.config/desk/apps-repo-token
chmod 600 ~/.config/desk/apps-repo-token
```

You can revoke `cf-artifacts-edit-token` afterwards; the repo
token continues working.

## 3. Mint a desk device token

Pick any opaque random string (32+ chars). This is the bearer
the M5 firmware, the browser viewer, and every MCP client will
use to authenticate.

```bash
openssl rand -hex 32 > ~/.config/desk/device-token
chmod 600 ~/.config/desk/device-token
```

## 4. Export the env vars

Add to your `~/.zshrc` (or shell rc equivalent):

```bash
export CLOUDFLARE_PERSONAL_ACCOUNT_ID="<your account id>"
export DESK_DEVICE_TOKEN="$(cat ~/.config/desk/device-token | tr -d '[:space:]')"
export DESK_APPS_REPO_TOKEN="$(cat ~/.config/desk/apps-repo-token | tr -d '[:space:]')"
export DESK_APPS_REPO_REMOTE="https://${CLOUDFLARE_PERSONAL_ACCOUNT_ID}.artifacts.cloudflare.net/git/desk/apps.git"
```

Reload: `source ~/.zshrc`.

## 5. Install dependencies

```bash
cd experiments/exp-13-artifacts-app-source
bun install
```

## 6. Set Worker secrets

The fabric reads three secrets from Cloudflare's secrets store
in production. Set them via wrangler:

```bash
export CLOUDFLARE_API_TOKEN="$(cat ~/.config/desk/cf-deploy-token | tr -d '[:space:]')"
export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_PERSONAL_ACCOUNT_ID"

echo -n "$DESK_DEVICE_TOKEN" | bunx wrangler secret put DESK_DEVICE_TOKEN
echo -n "$DESK_APPS_REPO_REMOTE" | bunx wrangler secret put DESK_APPS_REPO_REMOTE
echo -n "$DESK_APPS_REPO_TOKEN" | bunx wrangler secret put DESK_APPS_REPO_TOKEN
```

## 7. Deploy

```bash
bunx wrangler deploy
```

Wrangler prints the deployed URL on success, e.g.:

```
https://desk-fabric-exp13.<your-subdomain>.workers.dev
```

Save that URL — you'll need it for the M5 and the viewer.

```bash
echo "export DESK_MCP_URL=https://desk-fabric-exp13.<your-subdomain>.workers.dev/mcp" >> ~/.zshrc
source ~/.zshrc
```

## 8. Verify

```bash
# Liveness
curl https://<your-fabric>.workers.dev/healthz   # → "ok"

# Auth gate
curl -H "Authorization: Bearer $DESK_DEVICE_TOKEN" \
  https://<your-fabric>.workers.dev/list

# Should return an empty (or near-empty) /list since you haven't
# pushed any apps yet:
# {"apps":[{"id":"inbox",...}],"pending_elicit":null,...}

# Browser viewer:
open "https://<your-fabric>.workers.dev/viewer#url=https://<your-fabric>.workers.dev&token=$DESK_DEVICE_TOKEN"
```

You should see the desk dock in your browser with just `inbox` visible.

## Troubleshooting

### `unauthorized` on every request

The bearer in `Authorization: Bearer` doesn't match the
secret you `wrangler secret put`. Sanity-check by re-running
step 6 and step 8 in the same shell.

### Wrangler deploys to the wrong account

If you have multiple Cloudflare accounts, wrangler may pick
up `CLOUDFLARE_ACCOUNT_ID` from your shell ambient env. Be
explicit on every deploy:

```bash
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_PERSONAL_ACCOUNT_ID" \
CLOUDFLARE_API_TOKEN="$(cat ~/.config/desk/cf-deploy-token | tr -d '[:space:]')" \
bunx wrangler deploy
```

### Worker startup error mentioning `LOADER`

Worker Loader is a paid Cloudflare feature. Check that your
account has Worker Loader enabled (it's standard on the Workers
Paid plan).

### `/list` works but `/run?app=counter&action=init` fails

You haven't pushed apps to the repo yet. Continue to
[How to write an app](write-an-app.md).

## Re-deploys

After code changes, re-run `bunx wrangler deploy` from the
same dir. Secrets persist; only the worker code is replaced.

## Tear down

To remove the deployment entirely:

```bash
bunx wrangler delete
```

This destroys all DO state too (the singleton AppRunner +
McpAgent). Apps in the Artifacts repo persist independently.

## See also

- [How to flash the M5](flash-the-m5.md) — give the fabric something to drive
- [How to write an app](write-an-app.md) — give the fabric something to load
- [HTTP endpoints reference](../reference/http-endpoints.md)
- [Environment variables reference](../reference/env-vars.md)
