import { isAdmin, deny } from "../_lib.js";
import { gbpGet, gbpSet } from "../_gbp.js";
/* Ricerche su Google per nazione (27/10/2026, scelta 1A di Paolo: «cerca dove viene cercato un gestionale sul web»).
   Solo l'amministratore: apri /api/mercato nel browser. Una richiesta a DataForSEO (google_ads/search_volume/live) per nazione,
   circa 0,08 $ l'una (17 nazioni ≈ 1,40 $); risultati salvati nella tabella gbp per il giorno ("mkt:vol:AAAA-MM-GG"): ricaricare
   la pagina lo stesso giorno non paga di nuovo. DataForSEO accetta al massimo 12 richieste al minuto: dopo 10 si aspetta un minuto.
   La pagina si riempie riga per riga mentre arrivano i numeri. */
const K = {
  it: ["gestionale allevamento cani", "software allevamento cani", "programma allevamento cani", "gestionale allevatori", "app allevamento cani", "software allevatori cani", "programma pedigree cani", "gestione cucciolate"],
  fr: ["logiciel élevage chien", "logiciel elevage canin", "logiciel gestion élevage canin", "application éleveur chien", "logiciel éleveur", "logiciel pedigree chien", "application élevage canin"],
  de: ["zuchtsoftware hunde", "hundezucht software", "züchter software", "zuchtprogramm hunde", "hundezucht app", "zuchtverwaltung", "software für hundezüchter"],
  es: ["software criadero perros", "programa criadero perros", "software para criadores de perros", "app criadero perros", "programa para criadores de perros", "gestion criadero perros"],
  en: ["dog breeding software", "kennel management software", "dog breeder software", "breeding management software", "dog breeder app", "litter management software", "dog breeding app", "pedigree software"],
  pt: ["software canil", "programa para canil", "sistema para canil", "aplicativo canil", "software criador de cães"],
  pl: ["program hodowla psów", "program dla hodowców psów", "aplikacja dla hodowców psów", "oprogramowanie hodowla psów"],
  nl: ["fokkerij software", "kennel software", "hondenfokker software", "software hondenfokker"],
  sv: ["kennelprogram", "uppfödarprogram", "program för hunduppfödare"],
  cs: ["program pro chovatele psů", "software chovatelská stanice", "chovatelský program psi"]
};
// [codice, nazione, luogo di Google Ads, lingua]
const M = [["IT", "Italia", 2380, "it"], ["FR", "Francia", 2250, "fr"], ["DE", "Germania", 2276, "de"], ["AT", "Austria", 2040, "de"],
  ["CH", "Svizzera (tedesco)", 2756, "de"], ["ES", "Spagna", 2724, "es"], ["GB", "Regno Unito", 2826, "en"], ["IE", "Irlanda", 2372, "en"],
  ["US", "Stati Uniti", 2840, "en"], ["CA", "Canada (inglese)", 2124, "en"], ["AU", "Australia", 2036, "en"], ["BR", "Brasile", 2076, "pt"],
  ["PL", "Polonia", 2616, "pl"], ["NL", "Paesi Bassi", 2528, "nl"], ["SE", "Svezia", 2752, "sv"], ["CZ", "Repubblica Ceca", 2203, "cs"],
  ["PT", "Portogallo", 2620, "pt"]];
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function vol(env, [, , loc, lang]) {
  const r = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", { method: "POST",
    headers: { Authorization: "Basic " + btoa(env.DATAFORSEO_LOGIN + ":" + env.DATAFORSEO_PASSWORD), "content-type": "application/json" },
    body: JSON.stringify([{ keywords: K[lang], location_code: loc, language_code: lang }]) });
  const j = await r.json().catch(() => ({})), t = (j.tasks || [])[0] || {};
  if (r.status === 402 || t.status_code === 40200) throw new Error("DataForSEO è senza credito: ricarica in app.dataforseo.com.");
  if (!r.ok || t.status_code !== 20000) throw new Error("DataForSEO: " + (t.status_message || j.status_message || "errore " + r.status));
  const V = {};
  for (const x of t.result || []) V[x.keyword] = x.search_volume == null ? null : +x.search_volume;
  return V;
}
const tot = V => Object.values(V || {}).reduce((a, b) => a + (b || 0), 0);
const num = n => n == null ? "<span class=m>meno di 10</span>" : Number(n).toLocaleString("it-IT");
const HEAD = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Ricerche per nazione</title>
<style>body{margin:0;background:#eef0f3;font:15px/1.45 system-ui,sans-serif;color:#1d2433}main{max-width:820px;margin:0 auto;padding:20px 16px 60px}h1{font:400 28px Georgia,serif;margin:0 0 4px}
.s{color:#667085;margin:0 0 16px}details{background:#fff;border:1px solid #e3e6ec;border-radius:12px;margin-bottom:8px}summary{cursor:pointer;padding:11px 14px;display:flex;gap:10px;font-weight:600}summary b{margin-left:auto}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 14px;border-top:1px solid #e3e6ec}td:last-child{text-align:right}.m{color:#98a2b3}.w{color:#9A6A12}.e{color:#B42318}
.top{background:#fff;border:1.5px solid #2F6B3F;border-radius:12px;padding:12px 14px;margin-top:16px}.top ol{margin:6px 0 0;padding-left:22px}</style></head><body><main>
<h1>Dove si cerca un gestionale per allevamenti</h1><p class="s">Ricerche su Google al mese (media degli ultimi 12 mesi, Google Ads tramite DataForSEO). Tocca una nazione per vedere le parole.</p>\n`;
export async function onRequestGet({ request, env, waitUntil }) {
  if (!(await isAdmin(request, env))) return deny();
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return new Response("Mancano DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD in Cloudflare.", { status: 500 });
  const CK = "mkt:vol:" + new Date().toISOString().slice(0, 10);
  let cache = {};
  try { cache = JSON.parse(await gbpGet(env, CK) || "{}") || {}; } catch (e) {}
  const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder(), put = s => w.write(enc.encode(s));
  const job = (async () => {
    try {
      put(HEAD);
      const rows = [];
      let n = 0, t0 = Date.now();
      for (const c of M) {
        let V = cache[c[0]];
        if (!V) {
          if (n && n % 10 === 0) { const wait = Math.max(0, 61000 - (Date.now() - t0)); put(`<p class="w">Aspetto ${Math.ceil(wait / 1000)} secondi: DataForSEO accetta 12 richieste al minuto…</p>\n`); await sleep(wait); t0 = Date.now(); }
          try { V = await vol(env, c); cache[c[0]] = V; await gbpSet(env, CK, JSON.stringify(cache)); } catch (e) { V = { _err: String(e.message || e) }; }
          n++;
        }
        rows.push([c, V]);
        if (V._err) { put(`<details><summary>${esc(c[1])} <b class="e">${esc(V._err)}</b></summary></details>\n`); continue; }
        const L = Object.entries(V).sort((a, b) => (b[1] || 0) - (a[1] || 0));
        put(`<details><summary>${esc(c[1])} <b>${num(tot(V))}</b></summary><table>${L.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${num(v)}</td></tr>`).join("")}</table></details>\n`);
      }
      const ok = rows.filter(([, V]) => !V._err).sort((a, b) => tot(b[1]) - tot(a[1]));
      put(`<div class="top"><b>Classifica</b><ol>${ok.map(([c, V]) => `<li>${esc(c[1])}: ${num(tot(V))} ricerche al mese</li>`).join("")}</ol></div>\n</main></body></html>`);
    } catch (e) { put(`<p class="e">Errore: ${esc(e.message || e)}</p>`); }
    finally { try { await w.close(); } catch (e) {} }
  })();
  if (waitUntil) waitUntil(job);
  return new Response(readable, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
