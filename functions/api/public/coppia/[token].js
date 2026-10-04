import { json, loadData } from "../../../_lib.js";
// Dati della pagina condivisa di una coppia (link segreto da Accoppiamenti, D.matings["sire|dam"].share). Solo: nomi, genitori,
// test, titoli, ID SBT, COI SBT e test mating letto. Mai note, proprietari, prezzi. (Richiesta di Paolo, 04/10/2026)
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env), D = cur && cur.data;
  const hit = D && Object.entries(D.matings || {}).find(([, m]) => m && m.share && m.share === params.token);
  if (!hit) return json({ error: "Link non valido" }, 404, { "x-robots-tag": "noindex" });
  const [k, m] = hit, [s, d] = k.split("|"), dg = id => {
    const x = (D.dogs || {})[id] || {}, n = i => ((D.dogs || {})[i] || {}).name || "";
    return { name: x.name || "", parents: [n(x.sire), n(x.dam)].filter(Boolean).join(" × "), tests: x.tests || "", tests_en: x.tests_en || "", titles: x.titles || "", titles_en: x.titles_en || "", sbt: x.sbt || "" };
  };
  const r = m.sbtRead || {};
  return json({ sire: dg(s), dam: dg(d), coi: m.coiSbt || "", tmUrl: m.tmUrl || "", read: { coi3: r.coi3, coi5: r.coi5, uniq: r.uniq, loss: r.loss, blood: r.blood || [], date: r.date || "" } }, 200, { "x-robots-tag": "noindex", "cache-control": "no-store" });
}
