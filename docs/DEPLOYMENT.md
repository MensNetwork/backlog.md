# Backlog Web UI — Deployment Reference

## Overview

The backlog web UI runs as a compiled single-file binary. There are two instances:

| Instance | Host | URL | Binary location |
|---|---|---|---|
| psydell (dev) | local | `localhost:3333` | runs from source via `bun src/cli.ts` |
| mn-cfo (prod) | Hetzner CAX21 ARM64 | `tasks.mensnetwork.global` | `/usr/local/bin/backlog` |

Production is managed by a systemd user service (`backlog-browser.service`) and fronted by Caddy with Google OAuth via `oauth2-proxy`.

---

## Architecture

```
Browser → Caddy (tasks.mensnetwork.global)
              → oauth2-proxy :4180  (Google auth, @mensnetwork.global only)
              → backlog binary :3001
                    → c-suite-v3/backlog/ (markdown files)
```

---

## Development (psydell)

Start the dev server from source:

```bash
BACKLOG_CWD=/home/paul/mens-network/c-suite-v3 bun src/cli.ts browser --port 3333 --no-open
```

Bun bundles the web assets at startup — restart the server to pick up source changes.

---

## Production Deploy (mn-cfo)

mn-cfo is ARM64 (aarch64). psydell is x86-64. Cross-compile is required — you cannot scp a psydell binary directly.

### 1. Build ARM64 binary

From the backlog-web-ui repo on psydell:

```bash
bun run build:css && \
VER=$(bun -e 'console.log(require("./package.json").version)') && \
bun build --production --compile --minify \
  --define __EMBEDDED_VERSION__="\"$VER\"" \
  --target=bun-linux-arm64 \
  --outfile=dist/backlog-arm64 \
  src/cli.ts
```

### 2. Copy and restart

```bash
scp dist/backlog-arm64 mn-cfo:/tmp/backlog-new
ssh mn-cfo 'sudo mv /tmp/backlog-new /usr/local/bin/backlog && \
  sudo chmod 755 /usr/local/bin/backlog && \
  systemctl --user restart backlog-browser'
```

### 3. Verify

```bash
ssh mn-cfo 'systemctl --user status backlog-browser --no-pager | head -5'
```

Then confirm `https://tasks.mensnetwork.global` loads correctly.

---

## Systemd Service (mn-cfo)

File: `~/.config/systemd/user/backlog-browser.service`

```ini
[Unit]
Description=Backlog.md kanban browser
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/paul/mens-network/c-suite-v3
ExecStart=/usr/local/bin/backlog browser --port 3001 --no-open
Restart=no
RestartSec=5

[Install]
WantedBy=default.target
```

To edit and reload:

```bash
ssh mn-cfo 'systemctl --user daemon-reload && systemctl --user restart backlog-browser'
```

---

## Google OAuth (mn-cfo)

Auth is handled by `oauth2-proxy` as a systemd system service. Only `@mensnetwork.global` Google accounts are permitted.

- Config: `/etc/oauth2-proxy/oauth2-proxy.cfg`
- Secrets: Doppler `mens-network / dashboard_tasks` config
- Service token: `/etc/doppler/tasks.env`
- Logs: `journalctl -u oauth2-proxy -n 50`

Redirect URI registered on the OAuth client: `https://tasks.mensnetwork.global/oauth2/callback`

---

## Data Location

Both instances read from the same source of truth:

```
/home/paul/mens-network/c-suite-v3/backlog/
```

On mn-cfo this is the local checkout of the c-suite-v3 repo. On psydell it is set via `BACKLOG_CWD`.

---

## Keeping Instances in Sync

1. Commit and push changes to `main` on GitHub
2. Build ARM64 binary (step above)
3. Deploy to mn-cfo
4. Restart psydell dev server if running

Both instances run identical code when deployed from the same commit.
