// EdgeTunnel core remains upstream; this entry adds independently expiring VLESS subscriptions.
import upstream from './_worker.js';

const prefix = 'exp-user:';
const fail = (message, status = 400) => new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ok = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const active = r => r && !r.revoked && r.expiresAt > Date.now();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const keyPattern = /^[0-9a-f]{64}$/;
const encode = s => btoa(unescape(encodeURIComponent(s)));

async function getUser(env, id) {
  if (!uuidPattern.test(id)) return null;
  return env.KV.get(prefix + id, 'json');
}

async function saveUser(env, user) {
  await env.KV.put(prefix + user.id, JSON.stringify(user));
  await env.KV.put('exp-token:' + user.token, user.id);
}

function links(user, url) {
  const origin = url.origin;
  return {
    mihomo: `${origin}/expiry/sub/${user.token}?format=mihomo`,
    v2rayng: `${origin}/expiry/sub/${user.token}?format=v2rayng`
  };
}

function config(user, url, format) {
  const hostname = url.hostname;
  const path = `/expiry/connect/${user.id}`;
  const name = (user.name || 'EdgeTunnel').replace(/[\r\n"\\,#]/g, ' ').slice(0, 40);
  if (format === 'mihomo' || format === 'clash') {
    const yaml = `proxies:\n  - name: "${name}"\n    type: vless\n    server: ${hostname}\n    port: 443\n    uuid: ${user.id}\n    network: ws\n    tls: true\n    udp: false\n    servername: ${hostname}\n    ws-opts:\n      path: ${path}\n      headers:\n        Host: ${hostname}\nproxy-groups:\n  - name: "PROXY"\n    type: select\n    proxies:\n      - "${name}"\nrules:\n  - MATCH,PROXY\n`;
    return new Response(yaml, { headers: { 'content-type': 'application/x-yaml; charset=utf-8', 'cache-control': 'no-store', 'subscription-userinfo': `upload=0; download=0; total=0; expire=${Math.floor(user.expiresAt / 1000)}` } });
  }
  if (format === 'v2rayng' || format === 'v2ray') {
    const uri = `vless://${user.id}@${hostname}:443?encryption=none&security=tls&sni=${encodeURIComponent(hostname)}&type=ws&host=${encodeURIComponent(hostname)}&path=${encodeURIComponent(path)}#${encodeURIComponent(name)}`;
    return new Response(encode(uri), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return fail('format must be mihomo or v2rayng');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/expiry/')) return upstream.fetch(request, env, ctx);
    if (!env.KV || typeof env.KV.get !== 'function') return fail('Bind KV namespace as KV', 503);

    if (url.pathname.startsWith('/expiry/connect/')) {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail('WebSocket required', 426);
      const id = url.pathname.slice('/expiry/connect/'.length).split('/')[0].toLowerCase();
      const user = await getUser(env, id);
      if (!active(user)) return fail('Expired or revoked', 403);
      // Crucial: use per-user UUID for the ORIGINAL EdgeTunnel protocol implementation.
      // All upstream proxy transport and fallback mechanisms stay in place.
      const scopedEnv = Object.assign({}, env, { UUID: user.id, uuid: user.id });
      return upstream.fetch(request, scopedEnv, ctx);
    }

    if (url.pathname.startsWith('/expiry/sub/')) {
      const token = url.pathname.slice('/expiry/sub/'.length);
      if (!keyPattern.test(token)) return fail('Not found', 404);
      const id = await env.KV.get('exp-token:' + token);
      const user = id ? await getUser(env, id) : null;
      if (!active(user) || user.token !== token) return fail('Expired or revoked', 410);
      return config(user, url, url.searchParams.get('format') || 'mihomo');
    }

    if (!url.pathname.startsWith('/expiry/admin/')) return fail('Not found', 404);
    // Configure a distinct strong secret; the legacy upstream ADMIN password is not sufficient.
    if (!env.EXPIRY_ADMIN_TOKEN || request.headers.get('authorization') !== `Bearer ${env.EXPIRY_ADMIN_TOKEN}`) return fail('Unauthorized', 401);
    if (request.method !== 'POST') return fail('POST required', 405);
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }
    const action = url.pathname.slice('/expiry/admin/'.length);

    if (action === 'create') {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 3650) return fail('days must be integer 1..3650');
      const id = crypto.randomUUID();
      const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
      const user = { id, token, name: String(body.name || 'EdgeTunnel').slice(0, 40), expiresAt: Date.now() + days * 86400000, revoked: false };
      await saveUser(env, user);
      return ok({ id, expiresAt: new Date(user.expiresAt).toISOString(), ...links(user, url) }, 201);
    }

    if (!uuidPattern.test(String(body.id || ''))) return fail('Valid user id required');
    const user = await getUser(env, body.id);
    if (!user) return fail('Not found', 404);
    if (action === 'revoke') user.revoked = true;
    else if (action === 'renew') {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 3650) return fail('days must be integer 1..3650');
      user.expiresAt = Math.max(Date.now(), user.expiresAt) + days * 86400000;
      user.revoked = false;
    } else if (action !== 'status') return fail('Unknown action', 404);
    if (action !== 'status') await saveUser(env, user);
    return ok({ id: user.id, name: user.name, revoked: user.revoked, expiresAt: new Date(user.expiresAt).toISOString(), active: active(user), ...links(user, url) });
  }
};
