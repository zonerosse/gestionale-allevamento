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
  // dati del test mating: quelli letti nella coppia, se no quelli della cucciolata (anche pianificata) con l'analisi SBT
  const r = m.sbtRead || {}, l = Object.values(D.litters || {}).find(x => x && x.sire === s && x.dam === d && x.sbtA && x.sbtA.c8), a = (l && l.sbtA) || {};
  const pick = (x, y) => (x != null && x !== "" ? x : y != null && y !== "" ? y : null);
  return json({ sire: dg(s), dam: dg(d), coi: pick(m.coiSbt, a.c8) || "", tmUrl: m.tmUrl || "", read: { coi3: pick(r.coi3, a.c3), coi5: pick(r.coi5, a.c5), uniq: pick(r.uniq, a.uniq), loss: pick(r.loss, a.loss), blood: r.blood || [], top: (r.top && r.top.length ? r.top : a.top) || [], date: r.date || a.date || "" } }, 200, { "x-robots-tag": "noindex", "cache-control": "no-store" });
}
