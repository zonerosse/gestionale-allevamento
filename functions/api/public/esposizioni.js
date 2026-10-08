import { json, loadData, farmOf } from "../../_lib.js";

// Risultati in esposizione segnati "Sul sito" nel gestionale, per le pagine di delpiccolodiavolo.it (Palmarès, Femmine, Maschi).
// Pubblico e in sola lettura: niente giudizi scritti, niente foto, niente dati dei proprietari.
// il sito che può leggere questi dati: quello scritto in ⚙️ Account (con e senza www)
const sitiOf = data => { const s = farmOf(data).site; return s ? ["https://" + s, "https://www." + s.replace(/^www\./, "")] : []; };
export async function onRequestGet({ env, request }) {
  const cur = await loadData(env), items = [];
  for (const [k, d] of Object.entries((cur && cur.data && cur.data.dogs) || {}))
    for (const s of d.shows || []) if (s.web)
      items.push({ id: s.id, dog: k, dogName: d.name, sex: d.sex || "", date: s.date || "", type: s.type || "", name: s.name || "",
        judge: s.judge || "", cls: s.cls || "", qual: s.qual || "", rank: s.rank || "", titles: s.titles || [] });
  items.sort((a, b) => b.date.localeCompare(a.date));
  const o = request.headers.get("origin") || "";
  return json({ items }, 200, { "access-control-allow-origin": sitiOf(cur && cur.data).includes(o) ? o : (sitiOf(cur && cur.data)[0] || "null"), "vary": "Origin", "cache-control": "public, max-age=60" });
}
