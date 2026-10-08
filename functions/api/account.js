import { json, isAdmin, deny, accessEmail, accessCfg, accessReset, capsCfg } from "../_lib.js";
import { gbpGet, gbpSet } from "../_gbp.js";
/* ⚙️ Account (08/10/2026, solo Paolo): stato dei collegamenti, tetti di spesa del mese e chi entra.
   Le chiavi non escono MAI: si dice solo se ci sono (true/false) e, dove si può, se funzionano. */
const month = () => new Date().toISOString().slice(0, 7);
const list = s => String(s || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  const has = k => !!(env[k] && String(env[k]).trim());
  const out = { ok: true, me: await accessEmail(request, env).catch(() => null),
    keys: { anthropic: has("ANTHROPIC_API_KEY"), github: has("GITHUB_TOKEN"), google: has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET"),
      dfs: has("DATAFORSEO_LOGIN") && has("DATAFORSEO_PASSWORD"), wa: has("WA_KEY") },
    conti: list(env.CONTI), viewers: list(env.VIEWERS) };
  // chi entra: l'elenco salvato qui (se c'è) comanda; se no si mostra quello delle variabili di Cloudflare
  const A = await accessCfg(env, true);
  if (A.people && Object.keys(A.people).length) { out.people = A.people; out.listed = true; }
  else { const P = {}; if (out.me) P[out.me] = "admin"; out.conti.forEach(e => P[e] = "conti"); out.viewers.forEach(e => P[e] = "viewer"); out.people = P; out.listed = false; }
  const g = async k => { try { return await gbpGet(env, k); } catch (e) { return null; } };
  out.google = { linked: !!(await g("refresh")), gsc: await g("gsc"), profile: !!(await g("loc")) };
  const C = await capsCfg(env);
  out.caps = { maps: { used: parseInt(await g("maps:used2:" + month()) || "0", 10) || 0, cap: C.maps },
    sott: { used: parseInt(await g("budget:sottosopra:" + month()) || "0", 10) || 0, cap: C.sott } };
  try { const r = await env.DB.prepare("SELECT MAX(ts) AS t, COUNT(*) AS n FROM wa").first(); out.wa = { last: r && r.t || null, n: r && r.n || 0 }; } catch (e) { out.wa = { last: null, n: 0 }; }
  // credito DataForSEO (lettura gratuita); se non risponde in 6 secondi si dice "non so"
  if (out.keys.dfs) {
    try {
      const r = await fetch("https://api.dataforseo.com/v3/appendix/user_data", { headers: { Authorization: "Basic " + btoa(env.DATAFORSEO_LOGIN + ":" + env.DATAFORSEO_PASSWORD) }, signal: AbortSignal.timeout(6000) });
      const j = await r.json(), m = j && j.tasks && j.tasks[0] && j.tasks[0].result && j.tasks[0].result[0] && j.tasks[0].result[0].money;
      out.dfs = m ? { balance: +m.balance } : { err: (j && j.status_message) || "risposta senza saldo" };
    } catch (e) { out.dfs = { err: "non risponde" }; }
  }
  return json(out);
}

// POST { caps:{maps,sott} } oppure { people:{ email: "admin"|"conti"|"viewer" } } — solo admin.
// Chi salva resta sempre "admin" (così non si chiude fuori da solo).
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  const b = await request.json().catch(() => ({})), me = await accessEmail(request, env).catch(() => null);
  if (b.caps) {
    const n = v => { const x = parseInt(v, 10); return isNaN(x) ? null : Math.max(0, Math.min(100000, x)); };
    const c = { maps: n(b.caps.maps), sott: n(b.caps.sott) };
    if (c.maps === null || c.sott === null) return json({ ok: false, error: "Scrivi due numeri (0 = fermo)." });
    await gbpSet(env, "cfg:caps", JSON.stringify(c)); return json({ ok: true, caps: c });
  }
  if (b.people) {
    const P = {};
    for (const [e, r] of Object.entries(b.people)) {
      const em = String(e).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return json({ ok: false, error: "Email non valida: " + e });
      if (!["admin", "conti", "viewer"].includes(r)) return json({ ok: false, error: "Permesso non valido per " + e });
      P[em] = r;
    }
    if (me) P[me] = "admin";
    await gbpSet(env, "cfg:access", JSON.stringify({ people: P, at: new Date().toISOString(), by: me || "" }));
    accessReset(); return json({ ok: true, people: P });
  }
  return json({ ok: false, error: "Niente da salvare." });
}
