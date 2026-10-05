import { json, role, deny } from "../_lib.js";
import { gbpGet, gbpSet, gbpToken, gget } from "../_gbp.js";
/* Post sul profilo Google (sezione "Aggiornamenti"), ottobre 2026. Solo Paolo; si pubblica solo con il suo tasto.
   GET  → { ok, posts:[{name,text,state,date,img,url}] }
   POST { text, url?, file? } → crea il post. `file` = chiave R2 della foto (da "/files/<chiave>"): Google la scarica da
   /api/public/gpost/<chiave>, aperto solo per 2 giorni e solo per le chiavi registrate qui (tabella gbp, "media:<chiave>").
   Regole di Google e di Paolo controllate anche qui: niente numeri di telefono, massimo 1.500 caratteri. */
const PHONE = /\+?\d[\d\s.\-]{7,}\d/;
export async function onRequestGet({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  try {
    const loc = await gbpGet(env, "loc"); if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
    const tk = await gbpToken(env);
    const j = await gget("https://mybusiness.googleapis.com/v4/" + loc + "/localPosts?pageSize=20", tk);
    return json({ ok: true, posts: (j.localPosts || []).map(p => ({ name: p.name, text: p.summary || "", state: p.state || "",
      date: (p.createTime || "").slice(0, 10), img: (p.media && p.media[0] && p.media[0].googleUrl) || "", url: p.searchUrl || "" })) });
  } catch (e) { return json({ ok: false, connect: !!e.connect, error: String(e.message || e) }); }
}
export async function onRequestPost({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  try {
    const p = await request.json(), text = String(p.text || "").trim();
    if (!text || text.length > 1500) return json({ ok: false, error: "Il testo deve avere fra 1 e 1.500 caratteri." });
    if (PHONE.test(text)) return json({ ok: false, error: "Nel testo c'è un numero di telefono: Google non lo accetta." });
    const loc = await gbpGet(env, "loc"); if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
    const body = { languageCode: "it", summary: text, topicType: "STANDARD" };
    if (p.url && /^https:\/\/delpiccolodiavolo\.it\//.test(p.url)) body.callToAction = { actionType: "LEARN_MORE", url: p.url };
    if (p.file && /^[\w\-./]+$/.test(p.file) && !p.file.includes("..")) {
      await gbpSet(env, "media:" + p.file, String(Date.now() + 2 * 86400e3));
      body.media = [{ mediaFormat: "PHOTO", sourceUrl: new URL(request.url).origin + "/api/public/gpost/" + p.file.split("/").map(encodeURIComponent).join("/") }];
    }
    const tk = await gbpToken(env);
    const j = await gget("https://mybusiness.googleapis.com/v4/" + loc + "/localPosts", tk, "POST", body);
    return json({ ok: true, name: j.name, state: j.state || "PROCESSING" });
  } catch (e) { return json({ ok: false, connect: !!e.connect, error: String(e.message || e) }); }
}
