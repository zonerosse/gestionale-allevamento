import { json, capsCfg } from "../../_lib.js";
import { gbpGet, gbpSet } from "../../_gbp.js";
/* Tetto di spesa DataForSEO per Sottosopra (puntowebferrara.com), ottobre 2026, scelta di Paolo.
   La funzione /api/posizioni di Sottosopra chiede qui il permesso PRIMA di spendere: al massimo SOTTOSOPRA_CAP analisi
   al mese (predefinito 30, ≤ 0,04 $ l'una ≈ 1,20 $/mese). Contatore in gbp "budget:sottosopra:AAAA-MM".
   Chiave condivisa: la stessa WA_KEY (qui) = GESTIONALE_KEY (nel progetto di puntowebferrara). */
export async function onRequestPost({ request, env }) {
  if (!env.WA_KEY || request.headers.get("x-budget-key") !== env.WA_KEY) return json({ ok: false, error: "chiave" }, 403);
  const cap = (await capsCfg(env)).sott, k = "budget:sottosopra:" + new Date().toISOString().slice(0, 7);
  const used = parseInt(await gbpGet(env, k) || "0", 10) || 0;
  if (used >= cap) return json({ ok: false, used, cap });
  await gbpSet(env, k, String(used + 1));
  return json({ ok: true, used: used + 1, cap });
}
