import { loadData, firmaFind, ensureFirme } from "../../../../_lib.js";

// Il PDF firmato, per chi ha appena firmato (Scarica). Solo con il link segreto della firma.
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env), F = cur && firmaFind(cur.data, params.tok);
  if (!F) return new Response("Link non valido", { status: 404 });
  await ensureFirme(env);
  const r = await env.DB.prepare("SELECT json FROM firme WHERE tok = ?").bind(params.tok).first();
  let key = ""; try { key = JSON.parse(r.json).key; } catch (e) {}
  const obj = key && await env.FILES.get(key);
  if (!obj) return new Response("Non ancora firmato", { status: 404 });
  const name = ((F.d.nick || F.d.name || "cane") + "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") + "-attestato-firmato.pdf";
  return new Response(obj.body, { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="' + name + '"', "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
