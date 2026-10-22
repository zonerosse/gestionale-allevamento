import { json, loadData, farmOf, adFind, adWho } from "../../../_lib.js";
// Pagina «pubblicità» di una cucciolata (22/10/2026, Paolo: «con un link mandare la scheda cucciolata con solo i dati essenziali,
// foto, pedigree, foto dei genitori e nonni, titoli, test»). Link segreto in D.litters[id].ad.tok, acceso/spento da Paolo.
// Solo: stato e date, genitori e nonni (nome, sesso, nascita, mantello, LOI, titoli, test, se c'è la foto), bisnonni (solo nomi),
// link SBT della cucciolata, contatti dell'allevamento. Mai COI, note, prezzi, proprietari, cuccioli singoli.
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env), D = cur && cur.data, hit = adFind(D, params.token);
  if (!hit) return json({ error: "Link non valido" }, 404, { "x-robots-tag": "noindex" });
  const [, l] = hit, dogs = D.dogs || {};
  const dg = id => {
    const x = dogs[id]; if (!x) return null;
    return { name: x.name || "", sex: x.sex || "", birth: x.birth || "", color: x.color || "", color_en: x.color_en || "", loi: x.loi || "",
      titles: x.titles || "", titles_en: x.titles_en || "", titles_de: x.titles_de || "", tests: x.tests || "", tests_en: x.tests_en || "", tests_de: x.tests_de || "",
      photo: /\/files\//.test(x.photo || "") };
  };
  const nm = id => (dogs[id] && dogs[id].name) || "";
  const W = k => adWho(D, l, k);
  const great = ["ss", "sd", "ds", "dd"].map(k => { const x = dogs[W(k)] || {}; return [nm(x.sire), nm(x.dam)]; });
  // nascita prevista: monta dopo l'ultimo calore della madre, se la cucciolata non è ancora nata (entro 75 giorni dalla monta)
  let due = "";
  if (l.state !== "nata" && l.dam && dogs[l.dam]) {
    const R = (dogs[l.dam].repro || []).filter(r => r && r.date).sort((a, b) => a.date.localeCompare(b.date));
    const heats = R.filter(r => r.t === "heat"), last = heats[heats.length - 1];
    const m = R.find(r => r.t === "mating" && (!last || r.date >= last.date));
    if (m) { const t = new Date(m.date + "T12:00:00"), age = (Date.now() - t) / 864e5; if (age <= 75) { t.setDate(t.getDate() + 63); due = t.toISOString().slice(0, 10); } }
  }
  const F = farmOf(D);
  return json({
    farm: { name: F.name, cityProv: F.cityProv, phoneIntl: F.phoneIntl, phone: (F.prefix + F.phone).replace(/\D/g, ""), site: F.site, breed: F.breed || "Staffordshire Bull Terrier" },
    state: l.state === "nata" ? "born" : due ? "due" : "plan", date: l.state === "nata" ? (l.date || "") : "", due,
    sbtUrl: /^https:\/\/(www\.)?sbtpedigree\.com\//.test(l.sbtUrl || "") ? l.sbtUrl : "",
    sire: dg(l.sire), dam: dg(l.dam), gp: { ss: dg(W("ss")), sd: dg(W("sd")), ds: dg(W("ds")), dd: dg(W("dd")) }, great
  }, 200, { "x-robots-tag": "noindex", "cache-control": "no-store" });
}
