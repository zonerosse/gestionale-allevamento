import { json, loadData, firmaFind, ensureFirme } from "../../../_lib.js";

// Pagina della firma a distanza (20/10/2026): cosa firmare (GET) e invio del PDF firmato (POST). Vale solo il link segreto.
const SPOTS = [{ p: 0, l: .636, t: .641, w: .20, h: .03 }, { p: 0, l: .516, t: .803, w: .36, h: .03 }];
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env), F = cur && firmaFind(cur.data, params.tok);
  if (!F) return json({ error: "Link non valido" }, 404);
  await ensureFirme(env);
  const r = await env.DB.prepare("SELECT signed_at FROM firme WHERE tok = ?").bind(params.tok).first();
  return json({ dog: F.d.nick || F.d.name, pedName: F.d.name, holder: F.holder, title: F.doc.title || "Attestato di iscrizione all'anagrafe",
    date: F.doc.date || "", spots: Array.isArray(F.A.sigSpots) ? F.A.sigSpots : SPOTS, ready: !!F.key, signed: r ? r.signed_at : null });
}
export async function onRequestPost({ request, env, params }) {
  const cur = await loadData(env), F = cur && firmaFind(cur.data, params.tok);
  if (!F) return json({ error: "Link non valido" }, 404);
  await ensureFirme(env);
  if (await env.DB.prepare("SELECT tok FROM firme WHERE tok = ?").bind(params.tok).first()) return json({ error: "Documento già firmato" }, 409);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Dati non validi" }, 400); }
  const sig = b && b.sig, pdf = b && b.pdf;
  if (typeof sig !== "string" || !sig.startsWith("data:image/png;base64,") || sig.length > 400000) return json({ error: "Firma mancante" }, 400);
  if (typeof pdf !== "string" || pdf.length > 20 * 1024 * 1024) return json({ error: "PDF mancante o troppo grande" }, 400);
  let bytes; try { bytes = Uint8Array.from(atob(pdf), c => c.charCodeAt(0)); } catch (e) { return json({ error: "PDF non valido" }, 400); }
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50) return json({ error: "PDF non valido" }, 400);
  const key = "f" + crypto.randomUUID().replace(/-/g, "").slice(0, 20) + ".pdf", at = new Date().toISOString();
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { dog: F.id, firma: "1" } });
  const dig = await crypto.subtle.digest("SHA-256", bytes), hash = [...new Uint8Array(dig)].map(x => x.toString(16).padStart(2, "0")).join("");
  const rec = { key, name: F.holder, sig, at, hash, ip: request.headers.get("CF-Connecting-IP") || "", ua: String(request.headers.get("user-agent") || "").slice(0, 300) };
  await env.DB.prepare("INSERT INTO firme (tok, dog, json, signed_at) VALUES (?, ?, ?, ?)").bind(params.tok, F.id, JSON.stringify(rec), at).run();
  return json({ ok: true, at, url: "/api/public/firma/" + params.tok + "/signed" });
}
