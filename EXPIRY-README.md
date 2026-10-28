# EdgeTunnel Subscription Expiry Extension

This is a source-preserving extension of [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel) (retrieved on 2026-10-28). It retains the original `_worker.js` and delegates existing non-expiry routes to it. Its newly-issued user subscriptions are **VLESS + WebSocket + TLS** and target the existing EdgeTunnel WebSocket transport with a per-user UUID. Existing global subscriptions, Trojan, Shadowsocks, outbound ProxyIP, SOCKS5/HTTP, fallback, and dashboard stay available through original routes, but they are **not managed by the expiry subsystem**.

## Setup

1. Install Node.js and Wrangler (`npm install -g wrangler` or `npx wrangler`).
2. Log in with `npx wrangler login`.
3. Create a KV namespace: `npx wrangler kv namespace create KV` (new CLI may use `npx wrangler kv namespace create KV`). Copy its ID into `wrangler.expiry.toml`.
4. Add the original `ADMIN` secret: `npx wrangler secret put ADMIN --config wrangler.expiry.toml`.
5. Add an **independent strong** `EXPIRY_ADMIN_TOKEN` secret: `npx wrangler secret put EXPIRY_ADMIN_TOKEN --config wrangler.expiry.toml`.
6. Deploy: `npx wrangler deploy --config wrangler.expiry.toml`.
7. Bind a custom domain if you own one. For Workers.dev-only deployment, compatibility with client TLS/SNI depends on accessibility of the assigned hostname.

## Create a subscription

`POST https://YOUR_WORKER/expiry/admin/create` with `Authorization: Bearer YOUR_EXPIRY_ADMIN_TOKEN` and JSON body:

```json
{"name":"user-001","days":30}
```

The JSON response returns `id`, `expiresAt`, and two links: `mihomo` (YAML) and `v2rayng` (base64 VLESS URI). Import the corresponding link in your proxy client.

## Renew, revoke, inspect

Use the same authorization header and JSON body:

- `POST /expiry/admin/renew` with `{"id":"UUID","days":30}` adds days from the later of current expiry and current time, and un-revokes.
- `POST /expiry/admin/revoke` with `{"id":"UUID"}` prevents **new** sessions and subscription refreshes.
- `POST /expiry/admin/status` with `{"id":"UUID"}` reads user status.

## Security and limitations

- The expiry check happens at **subscription download AND every new WebSocket handshake**. It is not merely hiding the subscription URL.
- Existing established WebSocket sessions are **not forcibly terminated** at the expiry instant; they continue until disconnected. KV is eventually consistent, so revocation may propagate with delay.
- The global original EdgeTunnel `ADMIN`, `UUID`, and legacy subscriptions are separate, and are not subject to expiration. Avoid distributing global credentials to expiring users.
- Newly-issued expiring subscriptions are VLESS-only; existing upstream Trojan/SS compatibility remains, but independent per-user expiration for those protocols is not implemented.
- ProxyIP / SOCKS5 / HTTP routing and third-party conversion features come from upstream; check compatibility with client path rewriting and current platform policies.
- Subscription secrets and UUIDs are credentials: do not expose them in public issue logs or screenshots. Use strong secrets. Evaluate Cloudflare's current Terms and acceptable-use rules before deployment.
- No custom preferred IP is required. Connect with your own Worker domain, and do not assume third-party `proxyip` endpoints are trusted.

## Test checklist

1. Create a 1-day user, import both subscription types.
2. Confirm authorized VLESS WS session works while active.
3. Revoke the user, confirm subscription returns HTTP 410 and **new** WS handshake returns HTTP 403.
4. Renew the user, confirm subscriptions and new WS handshakes work again.
5. Verify the unchanged original `/admin` and original global subscriptions separately.

This extension is a **first deployable candidate**, not a production-verified fork. Integration testing against Cloudflare and Mihomo/v2rayNG remains necessary. It intentionally does not claim perfect feature parity for expiring users.
