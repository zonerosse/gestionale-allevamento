import { json, role, deny, can, farmNow } from "../_lib.js";
import { gbpGet, gbpSet, gbpToken } from "../_gbp.js";
/* Statistiche di delpiccolodiavolo.it (ottobre 2026, scelta di Paolo: solo questo sito). Solo Paolo.
   GET ?days=1|7|28|90&it=1|0 → { ok, gsc | gscErr, cf | cfErr, gbpk | gbpkErr }
   - days=1: ultime 24 ore con i dati "freschi" di Google (provvisori) e grafico ora per ora; it=1 (predefinito): solo Italia.
   - wa: tocchi sul tasto WhatsApp del sito (conteggio esatto, persone vere).
   - gbpk: ricerche che mostrano il profilo Google, ultimi 3 mesi, mese per mese (serve l'approvazione delle API del profilo).
   - Search Console (parole chiave vere, dati fino a 2-3 giorni fa): stesso collegamento Google del profilo, permesso
     webmasters.readonly. Proprietà trovata da sola (preferita "sc-domain:delpiccolodiavolo.it"), salvata in gbp "gsc".
   - Cloudflare Web Analytics (visite quasi in tempo reale): segreti CF_API_TOKEN (permesso "Account Analytics: Read") e
     CF_ACCOUNT_ID; CF_SITE_TAG facoltativo (se manca si filtra per host).
   Nessuno script sul sito: zero impatto sulle prestazioni. */
let HOST = "";   // sito dell'allevamento, da ⚙️ Account (letto a ogni richiesta)
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
  const G = (b) => gsc(env, token, site, b, it);
  if (days === 1) return fresh24(G, site, it);
  // periodo chiuso a 2 giorni fa (dati definitivi), confronto con il periodo uguale prima
  const end = back(2), start = back(days - 1, end), pend = back(1, start), pstart = back(days - 1, pend);
  const P = { startDate: day(start), endDate: day(end) }, Q = { startDate: day(pstart), endDate: day(pend) };
  const [tot, ptot, q, pq, pages, dd] = await Promise.all([G({ ...P }), G({ ...Q }),
    G({ ...P, dimensions: ["query"], rowLimit: 250 }), G({ ...Q, dimensions: ["query"], rowLimit: 500 }), G({ ...P, dimensions: ["page"], rowLimit: 10 }),
    G({ ...P, dimensions: ["date"], rowLimit: 100 })]);
  const t = tot[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 }, pt = ptot[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return out(site, false, it, P, t, pt, dd.map(r => ({ d: r.keys[0], c: r.clicks, i: r.impressions })), q, pq, pages);
}
/* 24 ore come in Search Console (correzione 08/10/2026): Google conta i giorni nell'ora del Pacifico e i dati arrivano con
   qualche ora di ritardo, quindi "ieri e oggi" restava quasi vuoto. Ora si prendono i dati ora per ora (hourly_all) degli
   ultimi 4 giorni e si sommano le ULTIME 24 ORE DISPONIBILI (come la scheda "24 ore" di Search Console), confronto con le 24
   ore prima. Parole chiave e pagine: i giorni che coprono quelle 24 ore (Google non le dà ora per ora). */
async function fresh24(G, site, it) {
  const now = new Date(), rows = (await G({ startDate: day(back(4, now)), endDate: day(now), dimensions: ["hour"], dataState: "hourly_all", rowLimit: 200 }))
    .map(r => ({ k: r.keys[0], ts: Date.parse(r.keys[0]), c: r.clicks, i: r.impressions, p: r.position })).filter(r => !isNaN(r.ts)).sort((a, b) => a.ts - b.ts);
  const last = rows.length ? rows[rows.length - 1].ts : now.getTime(), H = 3600e3;
  const win = rows.filter(r => r.ts > last - 24 * H), prv = rows.filter(r => r.ts > last - 48 * H && r.ts <= last - 24 * H);
  const sum = L => { const c = L.reduce((s, r) => s + r.c, 0), i = L.reduce((s, r) => s + r.i, 0), w = L.reduce((s, r) => s + r.p * r.i, 0);
    return { clicks: c, impressions: i, ctr: i ? c / i : 0, position: i ? w / i : 0 }; };
  const d0 = win.length ? win[0].k.slice(0, 10) : day(back(1, now)), d1 = win.length ? win[win.length - 1].k.slice(0, 10) : day(now);
  const P = { startDate: d0, endDate: d1, dataState: "all" }, span = Math.round((Date.parse(d1) - Date.parse(d0)) / 864e5) + 1;
  const Q = { startDate: day(back(span, new Date(d0 + "T12:00:00Z"))), endDate: day(back(1, new Date(d0 + "T12:00:00Z"))), dataState: "all" };
  const [q, pq, pages] = await Promise.all([G({ ...P, dimensions: ["query"], rowLimit: 250 }), G({ ...Q, dimensions: ["query"], rowLimit: 500 }),
    G({ ...P, dimensions: ["page"], rowLimit: 10 })]);
  const o = out(site, true, it, P, sum(win), sum(prv), win.map(r => ({ d: r.k, c: r.c, i: r.i })), q, pq, pages);
  o.upto = rows.length ? new Date(last + H).toISOString() : null;   // dati fino a (fine dell'ultima ora disponibile)
  return o;
}
function out(site, fresh, it, P, t, pt, daily, q, pq, pages) {
  const prev = Object.fromEntries(pq.map(r => [r.keys[0], r.position]));
  return { site, fresh, it, from: P.startDate, to: P.endDate, tot: t, prev: pt, daily,
    queries: q.map(r => ({ q: r.keys[0], c: r.clicks, i: r.impressions, p: r.position, dp: prev[r.keys[0]] != null ? r.position - prev[r.keys[0]] : null })),
    pages: pages.map(r => ({ u: r.keys[0].replace(/^https?:\/\/[^/]+/, ""), c: r.clicks, i: r.impressions, p: r.position })) };
}
async function waStats(env, days) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS wa (id INTEGER PRIMARY KEY, ts INTEGER, day TEXT, path TEXT, lang TEXT)").run();
  const now = Date.now(), from = now - days * 864e5, pfrom = now - 2 * days * 864e5;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []);
  const [[tot], [prev], [td], daily, paths, langs] = await Promise.all([
    q("SELECT COUNT(*) n FROM wa WHERE ts >= ?", from), q("SELECT COUNT(*) n FROM wa WHERE ts >= ? AND ts < ?", pfrom, from),
    q("SELECT COUNT(*) n FROM wa WHERE day = ?", today),
    q("SELECT day, COUNT(*) n FROM wa WHERE ts >= ? GROUP BY day ORDER BY day", from),
    q("SELECT path, COUNT(*) n FROM wa WHERE ts >= ? GROUP BY path ORDER BY n DESC LIMIT 8", from),
    q("SELECT lang, COUNT(*) n FROM wa WHERE ts >= ? GROUP BY lang ORDER BY n DESC", from)]);
  return { tot: tot.n, prev: prev.n, today: td.n, days, daily, paths, langs };
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
  if (!(await can(request, env, ["statistiche", "oggi"], 1))) return deny();
  HOST = (await farmNow(env)).site || "";
  if (!HOST) return json({ ok: false, error: "Scrivi prima il sito dell'allevamento in ⚙️ Account → Allevamento." });
  const sp = new URL(request.url).searchParams, days = [1, 7, 28, 90].includes(+sp.get("days")) ? +sp.get("days") : 28, it = sp.get("it") !== "0";
  const out = { ok: true, days, it };
  await Promise.all([
    waStats(env, days).then(x => out.wa = x, e => { out.waErr = String(e.message || e); }),
    gbpKeywords(env).then(x => out.gbpk = x, e => { out.gbpkErr = String(e.message || e); }),
    searchConsole(env, days, it).then(x => out.gsc = x, e => { out.gscErr = String(e.message || e); out.gscConnect = !!e.connect; }),
    /* visite di Cloudflare tolte dalla pagina (scelta di Paolo, ottobre 2026): la funzione resta qui, non viene chiamata */]);
  return json(out);
}
