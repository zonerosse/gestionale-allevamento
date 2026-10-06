import { json, role, deny } from "../_lib.js";
import { gbpGet, gbpSet, gbpToken } from "../_gbp.js";
/* Statistiche di delpiccolodiavolo.it (ottobre 2026, scelta di Paolo: solo questo sito). Solo Paolo.
   GET ?days=1|7|28|90&it=1|0 → { ok, gsc | gscErr, cf | cfErr, gbpk | gbpkErr }
   - days=1: ultime 24 ore con i dati "freschi" di Google (provvisori) e grafico ora per ora; it=1 (predefinito): solo Italia.
   - gbpk: ricerche che mostrano il profilo Google, ultimi 3 mesi, mese per mese (serve l'approvazione delle API del profilo).
   - Search Console (parole chiave vere, dati fino a 2-3 giorni fa): stesso collegamento Google del profilo, permesso
     webmasters.readonly. Proprietà trovata da sola (preferita "sc-domain:delpiccolodiavolo.it"), salvata in gbp "gsc".
   - Cloudflare Web Analytics (visite quasi in tempo reale): segreti CF_API_TOKEN (permesso "Account Analytics: Read") e
     CF_ACCOUNT_ID; CF_SITE_TAG facoltativo (se manca si filtra per host).
   Nessuno script sul sito: zero impatto sulle prestazioni. */
const HOST = "delpiccolodiavolo.it";
const day = (d) => d.toISOString().slice(0, 10);
const back = (n, from = new Date()) => { const d = new Date(from); d.setUTCDate(d.getUTCDate() - n); return d; };
async function gsc(env, token, site, body, it) {
  if (it) body = { ...body, dimensionFilterGroups: [{ filters: [{ dimension: "country", operator: "equals", expression: "ita" }] }] };
  const r = await fetch("https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(site) + "/searchAnalytics/query", {
    method: "POST", headers: { Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || "errore " + r.status;
    if (r.status === 403 && /insufficient|scope/i.test(m)) throw Object.assign(new Error("Il collegamento a Google non ha ancora il permesso per Search Console: ricollega."), { connect: true });
    if (r.status === 403 && /has not been used|disabled/i.test(m)) throw new Error("Nel progetto Google Cloud va attivata la «Google Search Console API».");
    throw new Error("Search Console: " + m);
  }
  return j.rows || [];
}
async function siteProp(env, token) {
  let s = await gbpGet(env, "gsc"); if (s) return s;
  const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: "Bearer " + token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || "errore " + r.status;
    if (/has not been used|disabled/i.test(m)) throw new Error("Nel progetto Google Cloud va attivata la «Google Search Console API».");
    if (r.status === 403) throw Object.assign(new Error("Il collegamento a Google non ha ancora il permesso per Search Console: ricollega."), { connect: true });
    throw new Error("Search Console: " + m);
  }
  const L = (j.siteEntry || []).map(x => x.siteUrl).filter(u => u.includes(HOST));
  s = L.find(u => u.startsWith("sc-domain:")) || L.find(u => u.startsWith("https://" + HOST)) || L[0];
  if (!s) throw new Error("Con questo account Google non vedo la proprietà di " + HOST + " in Search Console.");
  await gbpSet(env, "gsc", s); return s;
}
async function searchConsole(env, days, it) {
  const token = await gbpToken(env), site = await siteProp(env, token);
  const fresh = days === 1, ds = fresh ? { dataState: "all" } : {};
  // 24 ore: ieri+oggi con i dati freschi, confronto con i due giorni prima; altrimenti periodo chiuso a 2 giorni fa
  const end = fresh ? new Date() : back(2), start = back(fresh ? 1 : days - 1, end), pend = back(1, start), pstart = back(fresh ? 1 : days - 1, pend);
  const P = { startDate: day(start), endDate: day(end), ...ds }, Q = { startDate: day(pstart), endDate: day(pend), ...ds };
  const G = (b) => gsc(env, token, site, b, it);
  const [tot, ptot, q, pq, pages] = await Promise.all([G({ ...P }), G({ ...Q }),
    G({ ...P, dimensions: ["query"], rowLimit: 250 }), G({ ...Q, dimensions: ["query"], rowLimit: 500 }), G({ ...P, dimensions: ["page"], rowLimit: 10 })]);
  let daily = [];
  if (fresh) {
    const lim = Date.now() - 24 * 3600e3;
    try { daily = (await G({ ...P, dimensions: ["hour"], dataState: "hourly_all", rowLimit: 100 }))
      .filter(r => Date.parse(r.keys[0]) >= lim).map(r => ({ d: r.keys[0], c: r.clicks, i: r.impressions })); } catch (e) {}
  } else daily = (await G({ ...P, dimensions: ["date"], rowLimit: 100 })).map(r => ({ d: r.keys[0], c: r.clicks, i: r.impressions }));
  const prev = Object.fromEntries(pq.map(r => [r.keys[0], r.position]));
  const t = tot[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 }, pt = ptot[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return { site, fresh, it, from: P.startDate, to: P.endDate, tot: t, prev: pt, daily,
    queries: q.map(r => ({ q: r.keys[0], c: r.clicks, i: r.impressions, p: r.position, dp: prev[r.keys[0]] != null ? r.position - prev[r.keys[0]] : null })),
    pages: pages.map(r => ({ u: r.keys[0].replace(/^https?:\/\/[^/]+/, ""), c: r.clicks, i: r.impressions, p: r.position })) };
}
// Ricerche che mostrano il profilo Google (Business Profile Performance API), mese per mese
async function gbpKeywords(env) {
  const loc = await gbpGet(env, "loc"); if (!loc) throw new Error("In attesa dell'approvazione di Google per il profilo.");
  const token = await gbpToken(env), id = loc.split("/").slice(-2).join("/"), months = [], out = {};
  for (let k = 3; k >= 1; k--) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); months.push([d.getUTCFullYear(), d.getUTCMonth() + 1]); }
  for (const [y, m] of months) {
    const qs = `monthlyRange.startMonth.year=${y}&monthlyRange.startMonth.month=${m}&monthlyRange.endMonth.year=${y}&monthlyRange.endMonth.month=${m}&pageSize=100`;
    const r = await fetch(`https://businessprofileperformance.googleapis.com/v1/${id}/searchkeywords/impressions/monthly?${qs}`, { headers: { Authorization: "Bearer " + token } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? "In attesa dell'approvazione di Google per il profilo." : "Profilo Google: " + ((j.error && j.error.message) || r.status));
    for (const x of j.searchKeywordsCounts || []) { const v = x.insightsValue || {}; (out[x.searchKeyword] = out[x.searchKeyword] || {})[y + "-" + String(m).padStart(2, "0")] = v.value != null ? +v.value : (v.threshold != null ? "<" + v.threshold : 0); }
  }
  const M = months.map(([y, m]) => y + "-" + String(m).padStart(2, "0")), num = v => typeof v === "number" ? v : 0;
  return { months: M, rows: Object.entries(out).map(([k, v]) => ({ k, v: M.map(x => v[x] ?? 0) })).sort((a, b) => num(b.v[2]) - num(a.v[2]) || num(b.v[1]) - num(a.v[1])).slice(0, 30) };
}
async function cloudflare(env, days) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) throw new Error("Mancano CF_API_TOKEN e CF_ACCOUNT_ID in Cloudflare (Variabili e segreti).");
  const now = new Date(), today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  const f = env.CF_SITE_TAG ? `{ siteTag: ${JSON.stringify(env.CF_SITE_TAG)} }` : `{ requestHost: ${JSON.stringify(HOST)} }`;
  // filtri scritti direttamente nella query (niente variabili tipizzate: meno nomi di tipo da indovinare)
  const win = (a, b) => `{ AND: [{ datetime_geq: ${JSON.stringify(a.toISOString())}, datetime_leq: ${JSON.stringify(b.toISOString())} }, ${f}] }`;
  const W = { per: win(back(days, now), now), prev: win(back(2 * days, now), back(days, now)), hour: win(new Date(now - 3600e3), now), today: win(today, now) };
  const G = (name, w, dim, lim) => `${name}: rumPageloadEventsAdaptiveGroups(limit: ${lim}, filter: ${W[w]}${dim ? ", orderBy: [sum_visits_DESC]" : ""}) { count sum { visits }${dim ? " dimensions { " + dim + " }" : ""} }`;
  const query = `query($a: String!) { viewer { accounts(filter: { accountTag: $a }) {
      ${G("per", "per", "", 1)} ${G("prev", "prev", "", 1)} ${G("hour", "hour", "", 1)} ${G("today", "today", "", 1)}
      ${G("refs", "per", "refererHost", 8)} ${G("countries", "per", "countryName", 6)} ${G("devices", "per", "deviceType", 5)} ${G("paths", "per", "requestPath", 8)} } } }`;
  const vars = { a: env.CF_ACCOUNT_ID };
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST",
    headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "content-type": "application/json" }, body: JSON.stringify({ query, variables: vars }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.errors && j.errors.length)) throw new Error("Cloudflare: " + ((j.errors && j.errors[0] && j.errors[0].message) || "errore " + r.status));
  const A = (((j.data || {}).viewer || {}).accounts || [])[0] || {};
  const one = x => ((x || [])[0] || { count: 0, sum: { visits: 0 } });
  const list = (x, k) => (x || []).map(g => ({ k: (g.dimensions || {})[k] || "", v: g.sum.visits, n: g.count }));
  return { per: one(A.per), prev: one(A.prev), hour: one(A.hour), today: one(A.today),
    refs: list(A.refs, "refererHost"), countries: list(A.countries, "countryName"), devices: list(A.devices, "deviceType"), paths: list(A.paths, "requestPath") };
}
export async function onRequestGet({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  const sp = new URL(request.url).searchParams, days = [1, 7, 28, 90].includes(+sp.get("days")) ? +sp.get("days") : 28, it = sp.get("it") !== "0";
  const out = { ok: true, days, it };
  await Promise.all([
    gbpKeywords(env).then(x => out.gbpk = x, e => { out.gbpkErr = String(e.message || e); }),
    searchConsole(env, days, it).then(x => out.gsc = x, e => { out.gscErr = String(e.message || e); out.gscConnect = !!e.connect; }),
    cloudflare(env, days).then(x => out.cf = x, e => { out.cfErr = String(e.message || e); })]);
  return json(out);
}
