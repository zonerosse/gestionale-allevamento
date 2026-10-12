import { json, deny, can } from "../_lib.js";
/* Foto dei post pubblicati su Google (12/10/2026): sul telefono (app) le miniature prese direttamente da googleusercontent
   restavano grigie. Il gestionale le scarica lui e le consegna dalla sua stessa origine. Solo indirizzi delle immagini di Google
   (googleusercontent.com, ggpht.com), solo per chi vede la sezione Google. GET ?u=<indirizzo della foto> */
const OK = /(^|\.)(googleusercontent\.com|ggpht\.com)$/i;
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, "recensioni", 1))) return deny();
  let u;
  try { u = new URL(new URL(request.url).searchParams.get("u") || ""); } catch (e) { return json({ ok: false, error: "Indirizzo non valido." }, 400); }
  if (u.protocol !== "https:" || !OK.test(u.hostname)) return json({ ok: false, error: "Indirizzo non ammesso." }, 400);
  const r = await fetch(u.toString(), { headers: { "user-agent": "Mozilla/5.0 (gestionale-delpiccolodiavolo)" } });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !/^image\//i.test(type)) return json({ ok: false, error: "Foto non disponibile (" + r.status + ")." }, 502);
  return new Response(r.body, { headers: { "content-type": type, "cache-control": "private, max-age=86400" } });
}
