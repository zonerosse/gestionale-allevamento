import { json, loadData, ownerSubset, ensureContracts } from "../../../_lib.js";

// Il proprietario firma il contratto dalla sua pagina privata (vale il link segreto).
// Si firma una volta sola: la firma va nella tabella contracts, non tocca i dati del gestionale.
export async function onRequestPost({ request, env, params }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  if (!sub) return json({ error: "Link non valido" }, 404);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Dati non validi" }, 400); }
  const id = b && b.dog;
  if (!sub.dogs.includes(id)) return json({ error: "Cane non valido" }, 400);
  const D = cur.data, d = D.dogs[id], c = d.contract;
  if (!c || !c.visible || !c.meSig) return json({ error: "Contratto non disponibile" }, 400);
  const okSig = s => typeof s === "string" && s.startsWith("data:image/png;base64,") && s.length < 400000;
  if (!okSig(b.sig1) || !okSig(b.sig2)) return json({ error: "Firma mancante" }, 400);
  const s = (v, n = 200) => String(v ?? "").slice(0, n).trim();
  const B = b.buyer || {};
  const buyer = { name: s(B.name), cf: s(B.cf, 40).toUpperCase(), doc: s(B.doc, 80), via: s(B.via), cap: s(B.cap), tel: s(B.tel, 60), mail: s(B.mail, 120) };
  if (!buyer.name || !buyer.cf || !buyer.doc || !buyer.via || !buyer.cap) return json({ error: "Dati incompleti" }, 400);
  const c36 = [0, 1, 2].includes(b.c36) ? b.c36 : null;
  if (c36 === null) return json({ error: "Scelta 3.6 mancante" }, 400);
  // Le condizioni le ricostruisce il server dai dati di Paolo: il browser non può cambiarle.
  const pn = k => { const x = D.dogs[k]; return x ? x.name + (x.chip ? " · " + x.chip : "") : ""; };
  const snap = { ver: s(b.ver, 20), sex: d.sex, bi: (D.owners[d.owner] || {}).lang === "en",
    dog: { name: d.name || "", chip: d.chip || "", birth: d.birth || "", color: d.color || "" },
    sire: pn(d.sire), dam: pn(d.dam), price: c.price || "" };
  await ensureContracts(env);
  const ex = await env.DB.prepare("SELECT dog FROM contracts WHERE dog = ?").bind(id).first();
  if (ex) return json({ error: "Contratto già firmato" }, 409);
  const at = new Date().toISOString();
  const core = { snap, buyer, c36, at, meSig: c.meSig, sig1: b.sig1, sig2: b.sig2 };
  const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(core)));
  const hash = [...new Uint8Array(dig)].map(x => x.toString(16).padStart(2, "0")).join("");
  const rec = { ...core, hash, ip: request.headers.get("CF-Connecting-IP") || "", ua: s(request.headers.get("user-agent"), 300) };
  await env.DB.prepare("INSERT INTO contracts (dog, owner, json, signed_at) VALUES (?, ?, ?, ?)").bind(id, sub.oid, JSON.stringify(rec), at).run();
  return json({ ok: true, at, hash });
}
