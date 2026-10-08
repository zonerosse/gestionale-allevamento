import { json, loadData, siteLitters, farmOf } from "../../_lib.js";

// Cucciolate segnate "Sul sito" nel gestionale, per la pagina Cuccioli di delpiccolodiavolo.it (IT/EN/DE). Solo lettura.
// il sito che può leggere questi dati: quello scritto in ⚙️ Account (con e senza www)
const sitiOf = data => { const s = farmOf(data).site; return s ? ["https://" + s, "https://www." + s.replace(/^www\./, "")] : []; };
export async function onRequestGet({ env, request }) {
  const cur = await loadData(env);
  const o = request.headers.get("origin") || "";
  return json({ items: siteLitters(cur && cur.data) }, 200, { "access-control-allow-origin": sitiOf(cur && cur.data).includes(o) ? o : (sitiOf(cur && cur.data)[0] || "null"), "vary": "Origin", "cache-control": "public, max-age=60" });
}
