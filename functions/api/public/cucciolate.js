import { json, loadData, siteLitters } from "../../_lib.js";

// Cucciolate segnate "Sul sito" nel gestionale, per la pagina Cuccioli di delpiccolodiavolo.it (IT/EN/DE). Solo lettura.
const SITI = ["https://delpiccolodiavolo.it", "https://www.delpiccolodiavolo.it"];
export async function onRequestGet({ env, request }) {
  const cur = await loadData(env);
  const o = request.headers.get("origin") || "";
  return json({ items: siteLitters(cur && cur.data) }, 200, { "access-control-allow-origin": SITI.includes(o) ? o : SITI[0], "vary": "Origin", "cache-control": "public, max-age=60" });
}
