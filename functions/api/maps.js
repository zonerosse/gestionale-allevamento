import { json, role, deny } from "../_lib.js";
import { gbpGet, gbpSet } from "../_gbp.js";
/* Posizioni della scheda dell'allevamento su Google Maps, città per città (ottobre 2026). Solo Paolo.
   DataForSEO "serp/google/maps/live/advanced" (segreti DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD, lo stesso abbonamento
   di Sottosopra). Parole e città in gbp "maps:cfg"; ultimi 12 controlli in gbp "maps:runs".
   GET → { ok, cfg:{kw:[], cities:[{n,lat,lng}]}, runs:[{at, res:{"parola|città": posizione o null}}] }
   POST { task:"run" } → nuovo controllo (si fa da solo una volta a settimana quando Paolo apre la pagina, o col tasto)
   POST { task:"cfg", kw:[...], cities:["Nome", ...] } → salva; le città nuove si trovano su OpenStreetMap.
   Tetto di spesa (scelta di Paolo): al massimo MAPS_CAP ricerche al mese (predefinito 100, circa 20 centesimi);
   contatore in gbp "maps:used:AAAA-MM". Oltre il tetto il controllo non parte e lo dice. */
const DEF = { kw: ["allevamento staffordshire bull terrier", "cuccioli staffordshire bull terrier", "allevamento staffy"],
  cities: [{ n: "Ostellato", lat: 44.7446, lng: 11.9411 }, { n: "Ferrara", lat: 44.8381, lng: 11.6198 }, { n: "Bologna", lat: 44.4949, lng: 11.3426 },
    { n: "Padova", lat: 45.4064, lng: 11.8768 }, { n: "Milano", lat: 45.4642, lng: 9.19 }] };
const MINE = /piccolo\s*diavolo|delpiccolodiavolo/i;
async function cfg(env) { const s = await gbpGet(env, "maps:cfg"); return s ? JSON.parse(s) : DEF; }
const month = () => new Date().toISOString().slice(0, 7);
const cap = env => Math.max(1, parseInt(env.MAPS_CAP || "100", 10) || 100);
async function used(env) { return parseInt(await gbpGet(env, "maps:used:" + month()) || "0", 10) || 0; }
async function runs(env) { const s = await gbpGet(env, "maps:runs"); return s ? JSON.parse(s) : []; }
async function geocode(name) {
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=" + encodeURIComponent(name),
    { headers: { "User-Agent": "gestionale-delpiccolodiavolo/1.0 (zonerosse@gmail.com)" } });
  const j = await r.json().catch(() => []);
  if (!j[0]) throw new Error("Non trovo la città «" + name + "».");
  return { n: name, lat: +(+j[0].lat).toFixed(4), lng: +(+j[0].lon).toFixed(4) };
}
async function check(env, kw, c) {
  const r = await fetch("https://api.dataforseo.com/v3/serp/google/maps/live/advanced", { method: "POST",
    headers: { Authorization: "Basic " + btoa(env.DATAFORSEO_LOGIN + ":" + env.DATAFORSEO_PASSWORD), "content-type": "application/json" },
    body: JSON.stringify([{ keyword: kw, location_coordinate: `${c.lat},${c.lng},13z`, language_code: "it", depth: 20 }]) });
  const j = await r.json().catch(() => ({}));
  const task = (j.tasks || [])[0] || {};
  if (!r.ok || (task.status_code && task.status_code >= 40000)) throw new Error("DataForSEO: " + (task.status_message || j.status_message || r.status));
  const items = (((task.result || [])[0] || {}).items || []);
  const me = items.find(x => MINE.test(x.title || "") || MINE.test(x.domain || "") || MINE.test(x.url || ""));
  return me ? (me.rank_group || me.rank_absolute || null) : null;
}
export async function onRequestGet({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  return json({ ok: true, ready: !!(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD), cfg: await cfg(env), runs: await runs(env), used: await used(env), cap: cap(env) });
}
export async function onRequestPost({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  try {
    const p = await request.json();
    if (p.task === "cfg") {
      const old = await cfg(env), kw = [...new Set((p.kw || []).map(s => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 10), cities = [];
      for (const n of (p.cities || []).map(s => String(s).trim()).filter(Boolean).slice(0, 10)) cities.push(old.cities.find(c => c.n.toLowerCase() === n.toLowerCase()) || await geocode(n));
      if (!kw.length || !cities.length) return json({ ok: false, error: "Serve almeno una parola e una città." });
      await gbpSet(env, "maps:cfg", JSON.stringify({ kw, cities })); return json({ ok: true, cfg: { kw, cities } });
    }
    if (p.task === "run") {
      if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return json({ ok: false, error: "Mancano DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD in Cloudflare." });
      const C = await cfg(env), res = {}, jobs = [];
      for (const k of C.kw) for (const c of C.cities) jobs.push([k, c]);
      const u = await used(env), lim = cap(env);
      if (u + jobs.length > lim) return json({ ok: false, capped: true, used: u, cap: lim,
        error: `Tetto del mese raggiunto: ${u} ricerche fatte su ${lim}. Il controllo riparte il mese prossimo (o con meno parole e città).` });
      await gbpSet(env, "maps:used:" + month(), String(u + jobs.length));
      for (let i = 0; i < jobs.length; i += 5) await Promise.all(jobs.slice(i, i + 5).map(async ([k, c]) => { res[k + "|" + c.n] = await check(env, k, c); }));
      const R = [{ at: new Date().toISOString(), res }].concat(await runs(env)).slice(0, 12);
      await gbpSet(env, "maps:runs", JSON.stringify(R)); return json({ ok: true, runs: R, used: u + jobs.length, cap: lim });
    }
    return json({ ok: false, error: "Richiesta sconosciuta." }, 400);
  } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
}
