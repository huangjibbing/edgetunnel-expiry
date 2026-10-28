# EdgeTunnel Expiry (experimental)

An **experimental**, independently expiring VLESS subscription extension for [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel). The upstream core remains in [`_worker.js`](./_worker.js); the new wrapper is [`entry.js`](./entry.js).

> **Not production verified.** A test deployment encountered Cloudflare Worker error **1101**. Do not treat this repository as a confirmed working proxy service. Review Cloudflare's acceptable-use policies before operating it.

## Functionality

- Retains upstream EdgeTunnel core and routes, including its existing proxy transports and dashboard.
- Adds `/expiry/admin/create`, `/expiry/admin/status`, `/expiry/admin/renew`, `/expiry/admin/revoke`.
- Issues expiring VLESS-over-WebSocket-TLS subscription links in Mihomo YAML and v2rayNG base64 formats.
- Blocks subscription refresh and **new** WebSocket handshakes after expiry or revocation.

### Important limitations

- Only newly generated **VLESS** links are governed by the expiry extension. The existing upstream Trojan, Shadowsocks and global subscription functionality is retained but **not** independently expiry-managed.
- Established connections do not terminate immediately at expiry. Cloudflare KV is eventually consistent, so revocation may be delayed.
- No fully verified end-to-end connectivity test has passed.

## Deployment

1. Create a Cloudflare KV namespace and replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` in [`wrangler.expiry.toml`](./wrangler.expiry.toml).
2. `npx wrangler login`
3. `npx wrangler secret put ADMIN --config wrangler.expiry.toml`
4. `npx wrangler secret put EXPIRY_ADMIN_TOKEN --config wrangler.expiry.toml`
5. `npx wrangler deploy --config wrangler.expiry.toml`

Read [EXPIRY-README.md](./EXPIRY-README.md) for API examples and test instructions.

## Attribution and license

Based on **cmliu/edgetunnel** upstream commit `a8ab11125ece` (2026-10-09), which is a derivative of earlier EdgeTunnel projects. Copyright belongs to the respective upstream authors. This derivative preserves the upstream [GPL-2.0 license](./LICENSE) and source attribution.
