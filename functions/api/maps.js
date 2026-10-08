import { json, role, deny, capsCfg, can, farmNow } from "../_lib.js";
import { gbpGet, gbpSet } from "../_gbp.js";
/* Posizioni della scheda dell'allevamento su Google Maps, città per città (ottobre 2026). Solo Paolo.
   DataForSEO "serp/google/maps/live/advanced" (segreti DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD, lo stesso abbonamento
   di Sottosopra). Parole e città in gbp "maps:cfg"; ultimi 12 controlli in gbp "maps:runs".
   GET → { ok, cfg:{kw:[], cities:[{n,lat,lng}]}, runs:[{at, res:{"parola|città": posizione o null}}] }
   POST { task:"run" } → nuovo controllo (si fa da solo ogni due settimane quando Paolo apre la pagina, o col tasto)
   POST { task:"cfg", kw:[...], cities:["Nome", ...] } → salva; le città nuove si trovano su OpenStreetMap.
   Tetto di spesa (scelta di Paolo): al massimo MAPS_CAP ricerche al mese (predefinito 100, circa 20 centesimi);
   contatore in gbp "maps:used:AAAA-MM". Oltre il tetto il controllo non parte e lo dice. */
// Luoghi (scelta di Paolo, ottobre 2026): Italia e regione con il nome ufficiale del fornitore (come in Sottosopra),
// i capoluoghi con le coordinate del centro città (zoom 12), che per Maps sono le più affidabili.
const LOC = { "italia": "Italy", "emilia-romagna": "Emilia-Romagna,Italy", "veneto": "Veneto,Italy", "lombardia": "Lombardy,Italy",
  "toscana": "Tuscany,Italy", "marche": "Marche,Italy", "piemonte": "Piedmont,Italy", "lazio": "Lazio,Italy" };
const DEF = { kw: ["allevamento staffordshire bull terrier", "cuccioli staffordshire bull terrier", "allevamento staffy"],
  cities: [{ n: "Italia", loc: "Italy" }, { n: "Emilia-Romagna", loc: "Emilia-Romagna,Italy" },
    { n: "Bologna", lat: 44.4949, lng: 11.3426 }, { n: "Ferrara", lat: 44.8381, lng: 11.6198 }, { n: "Forlì", lat: 44.2226, lng: 12.0408 },
    { n: "Modena", lat: 44.6471, lng: 10.9252 }, { n: "Parma", lat: 44.8015, lng: 10.3279 }, { n: "Piacenza", lat: 45.0526, lng: 9.693 },
    { n: "Ravenna", lat: 44.4184, lng: 12.2035 }, { n: "Reggio Emilia", lat: 44.6983, lng: 10.6312 }, { n: "Rimini", lat: 44.0678, lng: 12.5695 },
    { n: "Padova", lat: 45.4064, lng: 11.8768 }, { n: "Rovigo", lat: 45.0698, lng: 11.7902 }] };
// la scheda dell'allevamento si riconosce dal nome e dal sito scritti in ⚙️ Account
let MINE = null;
async function mineRe(env) { if (MINE) return MINE; const F = await farmNow(env), q = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const parts = [F.name, F.site, (F.site || "").split(".")[0]].filter(x => x && x.length > 3).map(q); MINE = parts.length ? new RegExp(parts.join("|"), "i") : /$^/; return MINE; }
async function cfg(env) {
  const s = await gbpGet(env, "maps:cfg"); if (!s) return DEF;
  const c = JSON.parse(s);
  // la prima impostazione (Ostellato, Ferrara, Bologna, Padova, Milano) passa da sola ai luoghi nuovi
  if (c.cities.map(x => x.n).join("|") === "Ostellato|Ferrara|Bologna|Padova|Milano") return { kw: c.kw, cities: DEF.cities };
  return c;
}
const month = () => new Date().toISOString().slice(0, 7);
const cap = async env => (await capsCfg(env)).maps;   // si cambia in ⚙️ Account (0 = fermo)
const UKEY = () => "maps:used2:" + month();   // "used2": il primo contatore contava anche i tentativi falliti
async function used(env) { return parseInt(await gbpGet(env, UKEY()) || "0", 10) || 0; }
async function runs(env) { const s = await gbpGet(env, "maps:runs"); return s ? JSON.parse(s) : []; }
async function geocode(env, name) {
  const UA_MAIL = (await farmNow(env)).email || "";
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=" + encodeURIComponent(name),
    { headers: { "User-Agent": "gestionale-allevamento/1.0" + (UA_MAIL ? " (" + UA_MAIL + ")" : "") } });
  const j = await r.json().catch(() => []);
  if (!j[0]) throw new Error("Non trovo la città «" + name + "».");
  return { n: name, lat: +(+j[0].lat).toFixed(4), lng: +(+j[0].lon).toFixed(4) };
}
async function check(env, kw, c) {
  const r = await fetch("https://api.dataforseo.com/v3/serp/google/maps/live/advanced", { method: "POST",
    headers: { Authorization: "Basic " + btoa(env.DATAFORSEO_LOGIN + ":" + env.DATAFORSEO_PASSWORD), "content-type": "application/json" },
    body: JSON.stringify([{ keyword: kw, ...(c.loc ? { location_name: c.loc } : { location_coordinate: `${c.lat},${c.lng},12z` }), language_code: "it", depth: 20 }]) });
  const j = await r.json().catch(() => ({}));
  const task = (j.tasks || [])[0] || {};
  if (!r.ok || (task.status_code && task.status_code >= 40000)) throw new Error("DataForSEO: " + (task.status_message || j.status_message || r.status));
  const items = (((task.result || [])[0] || {}).items || []);
  const M = await mineRe(env), me = items.find(x => M.test(x.title || "") || M.test(x.domain || "") || M.test(x.url || ""));
  return me ? (me.rank_group || me.rank_absolute || null) : null;
}
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, "statistiche", 1))) return deny();
  return json({ ok: true, ready: !!(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD), cfg: await cfg(env), runs: await runs(env), used: await used(env), cap: await cap(env) });
}
export async function onRequestPost({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  try {
    const p = await request.json();
    if (p.task === "cfg") {
      const old = await cfg(env), kw = [...new Set((p.kw || []).map(s => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 10), cities = [];
      for (const n of (p.cities || []).map(s => String(s).trim()).filter(Boolean).slice(0, 15)) {
        const k = n.toLowerCase(), known = old.cities.find(c => c.n.toLowerCase() === k) || DEF.cities.find(c => c.n.toLowerCase() === k);
        cities.push(known || (LOC[k] ? { n, loc: LOC[k] } : await geocode(env, n)));
      }
      if (!kw.length || !cities.length) return json({ ok: false, error: "Serve almeno una parola e una città." });
      await gbpSet(env, "maps:cfg", JSON.stringify({ kw, cities })); return json({ ok: true, cfg: { kw, cities } });
    }
    if (p.task === "run") {
      if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return json({ ok: false, error: "Mancano DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD in Cloudflare." });
      const C = await cfg(env), res = {}, jobs = [];
      for (const k of C.kw) for (const c of C.cities) jobs.push([k, c]);
      const u = await used(env), lim = await cap(env);
      if (u + jobs.length > lim) return json({ ok: false, capped: true, used: u, cap: lim,
        error: `Tetto del mese raggiunto: ${u} ricerche fatte su ${lim}. Il controllo riparte il mese prossimo (o con meno parole e città).` });
      // si contano solo le ricerche andate a buon fine (quelle fallite DataForSEO non le fa pagare)
      let ok = 0, err = "";
      for (let i = 0; i < jobs.length; i += 5) await Promise.all(jobs.slice(i, i + 5).map(async ([k, c]) => {
        try { res[k + "|" + c.n] = await check(env, k, c); ok++; } catch (e) { err = err || String(e.message || e); }
      }));
      if (ok) await gbpSet(env, UKEY(), String(u + ok));
      if (!ok) return json({ ok: false, used: u, cap: lim, error: /fund|balance|credit|money|payment|402/i.test(err)
        ? "DataForSEO è senza credito: ricarica il conto e riprova." : "Nessuna ricerca riuscita. " + err });
      const R = [{ at: new Date().toISOString(), res, partial: ok < jobs.length }].concat(await runs(env)).slice(0, 12);
      await gbpSet(env, "maps:runs", JSON.stringify(R)); return json({ ok: true, runs: R, used: u + ok, cap: lim, warn: ok < jobs.length ? err : "" });
    }
    return json({ ok: false, error: "Richiesta sconosciuta." }, 400);
  } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
}
