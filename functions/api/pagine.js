import { json, deny, can, capsCfg, loadData, farmOf } from "../_lib.js";
import { gbpGet, gbpSet, gbpToken } from "../_gbp.js";
import { gsc, siteProp } from "./sitestats.js";
import { ask } from "./ai.js";
/* Google → Pagine del sito: numeri di Search Console per pagina e «Suggerisci titolo e descrizione» (25/10/2026, anteprima 39
   approvata da Paolo). Periodo: 28 giorni chiusi a 2 giorni fa (dati definitivi), confronto con i 28 prima; it=1 = solo Italia.
   GET ?all=1&it=1          → { ok, pages:{ "/percorso/": {c,i,p} } }               clic e posizione di tutte le pagine (elenco)
   GET ?url=<indirizzo>&it=1 → { ok, t:{c,i,ctr,p}, pt, q:[{q,c,i,p}], used, cap, ready }  una pagina
   POST { url, kw, title, desc, h1, ap } → { ok, vol:[{q,v,c,i,p}], options:[{title,desc,why}], used, cap }
        ricerche della pagina (Search Console) → volumi al mese in Italia (DataForSEO google_ads/search_volume, circa 0,09 $)
        → Claude (Sonnet) propone 2 versioni con il motivo. Niente si salva: Paolo sceglie «Usa questa» e pubblica come sempre.
   Tetto: `sug` in ⚙️ Account → Tetti di spesa (predefinito 30 al mese), contatore gbp "sug:used:AAAA-MM" (solo chiamate riuscite). */
const day = d => d.toISOString().slice(0, 10);
const back = (n, from = new Date()) => { const d = new Date(from); d.setUTCDate(d.getUTCDate() - n); return d; };
const month = () => new Date().toISOString().slice(0, 7);
const UKEY = () => "sug:used:" + month();
const used = async env => parseInt(await gbpGet(env, UKEY()) || "0", 10) || 0;
const path = u => { try { return new URL(u).pathname; } catch (e) { return String(u || ""); } };
function periods() {
  const end = back(2), start = back(27, end), pend = back(1, start), pstart = back(27, pend);
  return [{ startDate: day(start), endDate: day(end) }, { startDate: day(pstart), endDate: day(pend) }];
}
async function G(env, it) { const token = await gbpToken(env), site = await siteProp(env, token); return b => gsc(env, token, site, b, it); }
// filtro sulla pagina: Search Console vuole l'indirizzo intero; con la proprietà di dominio basta "contains" sul percorso finale
const onPage = (b, url) => ({ ...b, dimensionFilterGroups: [{ filters: [
  ...((b.dimensionFilterGroups && b.dimensionFilterGroups[0] && b.dimensionFilterGroups[0].filters) || []),
  { dimension: "page", operator: "equals", expression: url }] }] });
async function pageData(env, url, it) {
  const g = await G(env, false), [P, Q] = periods(), F = it ? [{ dimension: "country", operator: "equals", expression: "ita" }] : [];
  const B = b => onPage({ ...b, dimensionFilterGroups: [{ filters: F }] }, url);
  const [t, pt, q] = await Promise.all([g(B(P)), g(B(Q)), g(B({ ...P, dimensions: ["query"], rowLimit: 50 }))]);
  const z = { clicks: 0, impressions: 0, ctr: 0, position: 0 }, s = x => ({ c: x.clicks, i: x.impressions, ctr: x.ctr, p: x.position });
  return { t: s(t[0] || z), pt: s(pt[0] || z), q: q.map(r => ({ q: r.keys[0], c: r.clicks, i: r.impressions, p: r.position })) };
}
// parole accettate da Google Ads: massimo 80 caratteri e 10 parole, niente simboli
const kwOk = k => { k = String(k || "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim(); return k && k.length <= 80 && k.split(" ").length <= 10 ? k : ""; };
async function volumes(env, K) {
  const r = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", { method: "POST",
    headers: { Authorization: "Basic " + btoa(env.DATAFORSEO_LOGIN + ":" + env.DATAFORSEO_PASSWORD), "content-type": "application/json" },
    body: JSON.stringify([{ keywords: K, location_code: 2380, language_code: "it" }]) });
  const j = await r.json().catch(() => ({})), t = (j.tasks || [])[0] || {};
  if (r.status === 402 || t.status_code === 40200 || /payment required/i.test(t.status_message || j.status_message || "")) throw new Error("DataForSEO è senza credito: ricarica in app.dataforseo.com.");
  if (!r.ok || t.status_code !== 20000) throw new Error("DataForSEO: " + (t.status_message || j.status_message || "errore " + r.status));
  const V = {}; for (const x of t.result || []) V[String(x.keyword).toLowerCase()] = x.search_volume == null ? null : +x.search_volume;
  return V;
}
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, ["recensioni"], 1))) return deny();
  const sp = new URL(request.url).searchParams, it = sp.get("it") !== "0";
  try {
    if (sp.get("all")) {
      const g = await G(env, it), [P] = periods(), rows = await g({ ...P, dimensions: ["page"], rowLimit: 1000 }), pages = {};
      for (const r of rows) { const k = path(r.keys[0]), o = pages[k] || (pages[k] = { c: 0, i: 0, pw: 0 }); o.c += r.clicks; o.i += r.impressions; o.pw += r.position * r.impressions; }
      for (const k in pages) { const o = pages[k]; o.p = o.i ? o.pw / o.i : 0; delete o.pw; }
      return json({ ok: true, pages });
    }
    const url = sp.get("url"); if (!/^https:\/\//.test(url || "")) return json({ ok: false, error: "Indirizzo della pagina mancante." }, 400);
    const C = await capsCfg(env);
    return json({ ok: true, ...(await pageData(env, url, it)), used: await used(env), cap: C.sug, ready: !!(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD && env.ANTHROPIC_API_KEY) });
  } catch (e) { return json({ ok: false, error: String(e.message || e), connect: !!e.connect }); }
}
export async function onRequestPost({ request, env }) {
  if (!(await can(request, env, ["recensioni"], 2))) return deny();
  const p = await request.json().catch(() => ({}));
  if (!/^https:\/\//.test(p.url || "")) return json({ ok: false, error: "Indirizzo della pagina mancante." }, 400);
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return json({ ok: false, error: "Mancano DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD in Cloudflare." });
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "Manca la chiave ANTHROPIC_API_KEY in Cloudflare." });
  const cap = (await capsCfg(env)).sug, n = await used(env);
  if (n >= cap) return json({ ok: false, error: `Tetto del mese raggiunto (${n} su ${cap}). Si cambia in Account → Tetti di spesa.` });
  try {
    const d = await pageData(env, p.url, true);
    const top = d.q.slice().sort((a, b) => b.i - a.i).slice(0, 20);
    const K = [...new Set([kwOk(p.kw), ...top.map(x => kwOk(x.q))].filter(Boolean))];
    if (!K.length) return json({ ok: false, error: "Questa pagina non ha ancora ricerche in Search Console e manca la parola chiave: non c'è niente da misurare." });
    // volumi della stessa pagina e delle stesse parole già presi oggi: si riusano (un nuovo tentativo non paga di nuovo)
    const CK = "sug:vol:" + p.url, today = day(new Date()); let V = null, paid = false;
    try { const c = JSON.parse(await gbpGet(env, CK) || "null"); if (c && c.d === today && c.k === K.join("|")) V = c.v; } catch (e) {}
    if (!V) { V = await volumes(env, K); paid = true; await gbpSet(env, CK, JSON.stringify({ d: today, k: K.join("|"), v: V })); }
    if (paid) await gbpSet(env, UKEY(), String(n + 1));   // DataForSEO è stato pagato: si conta anche se poi Claude non risponde
    const byQ = Object.fromEntries(d.q.map(x => [kwOk(x.q), x]));
    const vol = K.map(k => ({ q: k, v: V[k] ?? null, ...(byQ[k] ? { c: byQ[k].c, i: byQ[k].i, p: byQ[k].p } : {}) }))
      .sort((a, b) => (b.v || 0) - (a.v || 0) || (b.i || 0) - (a.i || 0));
    const F = farmOf(((await loadData(env).catch(() => null)) || {}).data);
    const cut = (s, m) => String(s || "").slice(0, m);
    const o = await ask(env, `Sei un esperto SEO italiano. Proponi 2 versioni DIVERSE di titolo per Google e descrizione (meta description) per una pagina del sito di un allevamento di ${F.breed} (allevamento ${F.name}, ${F.city}, provincia di ${F.provName}).
Regole: italiano semplice e naturale; titolo da 30 a 60 caratteri, descrizione da 140 a 165 caratteri (conta bene, spazi compresi); la parola chiave della pagina deve stare sia nel titolo sia nella descrizione; scegli le parole guardando le ricerche al mese e la posizione della pagina (una ricerca con molte ricerche al mese dove la pagina è già tra i primi 10 vale di più); niente punti esclamativi, niente linguaggio da vendita, niente prezzi, niente liste d'attesa o urgenza, niente promesse; non dire niente che la pagina non dice già (usa titolo attuale, titolo grande e apertura).
Per ogni versione "why": una o due frasi semplici per chi non è esperto, con i numeri usati.
Formato: {"options":[{"title":"…","desc":"…","why":"…"}]}`,
      JSON.stringify({ indirizzo: p.url, parola_chiave: cut(p.kw, 100), titolo_attuale: cut(p.title, 200), descrizione_attuale: cut(p.desc, 400), titolo_grande: cut(p.h1, 200), apertura: cut(p.ap, 1200),
        numeri_28_giorni_italia: { clic: d.t.c, impressioni: d.t.i, posizione_media: +d.t.p.toFixed(1) },
        ricerche: vol.map(x => ({ ricerca: x.q, ricerche_al_mese_italia: x.v, clic: x.c, impressioni: x.i, posizione: x.p != null ? +x.p.toFixed(1) : null })) }), 6000);
    const options = (o.options || []).filter(x => x && x.title && x.desc).slice(0, 2).map(x => ({ title: String(x.title).trim(), desc: String(x.desc).trim(), why: String(x.why || "").trim() }));
    if (!options.length) throw new Error("Claude non ha scritto le proposte. Riprova tra un attimo.");
    return json({ ok: true, vol, options, used: n + (paid ? 1 : 0), cap });
  } catch (e) { return json({ ok: false, error: String(e.message || e), connect: !!e.connect, used: await used(env), cap }); }
}
