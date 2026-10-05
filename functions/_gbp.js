// Profilo Google dell'attività (ottobre 2026): chiavi e collegamento, usati da api/google.js e api/reviews.js.
// Segreti Cloudflare: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Il "refresh token" e la scheda dell'attività
// (accounts/…/locations/…) si salvano nella tabella D1 `gbp` dopo il collegamento: mai nel repository.
export async function gbpTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS gbp (k TEXT PRIMARY KEY, v TEXT)").run();
}
export async function gbpGet(env, k) {
  await gbpTable(env);
  const r = await env.DB.prepare("SELECT v FROM gbp WHERE k=?").bind(k).first();
  return r ? r.v : null;
}
export async function gbpSet(env, k, v) {
  await gbpTable(env);
  await env.DB.prepare("INSERT INTO gbp (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
}
// Token di accesso a Google dal refresh token salvato
export async function gbpToken(env) {
  const rt = await gbpGet(env, "refresh");
  if (!rt) throw Object.assign(new Error("Il gestionale non è ancora collegato al profilo Google."), { connect: true });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: rt, grant_type: "refresh_token" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error("Google non riconosce più il collegamento: ricollega il profilo."), { connect: true });
  return j.access_token;
}
// Chiamata alle API di Google con messaggi in italiano
export async function gget(url, token, method = "GET", body) {
  const r = await fetch(url, { method, headers: { Authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
  if (!r.ok) {
    const m = (j.error && j.error.message) || t.slice(0, 200);
    if (r.status === 403 || r.status === 429) throw new Error("Google non dà ancora l'accesso alle API del profilo (" + r.status + "). Se hai appena mandato la richiesta, serve la loro approvazione. Dettaglio: " + m);
    throw new Error("Google " + r.status + ": " + m);
  }
  return j;
}
