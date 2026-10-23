import { json, role, deny, can } from "../_lib.js";
import { gbpGet, gbpSet, gbpToken, gget } from "../_gbp.js";
/* Post sul profilo Google (sezione "Aggiornamenti"), ottobre 2026. Solo Paolo; si pubblica solo con il suo tasto.
   GET  → { ok, posts:[{name,text,state,date,img,url,cta}] }  tutti i post (a pagine da 100, al massimo 300)
   POST { task:"del", name } → elimina quel post da Google (12/10/2026, scelta di Paolo; il gestionale chiede conferma prima)
   POST { text, url?, file? } → crea il post. `file` = chiave R2 della foto (da "/files/<chiave>"): Google la scarica da
   /api/public/gpost/<chiave>, aperto solo per 2 giorni e solo per le chiavi registrate qui (tabella gbp, "media:<chiave>").
   Regole di Google e di Paolo controllate anche qui: niente numeri di telefono, massimo 1.500 caratteri. */
const PHONE = /\+?\d[\d\s.\-]{7,}\d/;
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, "recensioni", 1))) return deny();
  try {
    const loc = await gbpGet(env, "loc"); if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
    const tk = await gbpToken(env);
    const L = []; let tok = "";
    for (let pg = 0; pg < 3; pg++) {
      const j = await gget("https://mybusiness.googleapis.com/v4/" + loc + "/localPosts?pageSize=100" + (tok ? "&pageToken=" + encodeURIComponent(tok) : ""), tk);
      L.push(...(j.localPosts || [])); tok = j.nextPageToken; if (!tok) break;
    }
    return json({ ok: true, posts: L.map(p => ({ name: p.name, text: p.summary || "", state: p.state || "",
      date: (p.createTime || "").slice(0, 10), img: (p.media && p.media[0] && p.media[0].googleUrl) || "", url: p.searchUrl || "",
      cta: (p.callToAction && p.callToAction.url) || "" })) });
  } catch (e) { return json({ ok: false, connect: !!e.connect, error: String(e.message || e) }); }
}
export async function onRequestPost({ request, env }) {
  if (!(await can(request, env, "recensioni", 2))) return deny();
  try {
    const p = await request.json(), text = String(p.text || "").trim();
    if (p.task === "del") {
      const loc = await gbpGet(env, "loc"); if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
      const name = String(p.name || "");
      // solo post della scheda dell'allevamento: niente altri percorsi
      if (!name.startsWith(loc + "/localPosts/") || !/^[\w\-\/]+$/.test(name)) return json({ ok: false, error: "Post non valido." });
      await gget("https://mybusiness.googleapis.com/v4/" + name, await gbpToken(env), "DELETE");
      return json({ ok: true });
    }
    if (!text || text.length > 1500) return json({ ok: false, error: "Il testo deve avere fra 1 e 1.500 caratteri." });
    if (PHONE.test(text)) return json({ ok: false, error: "Nel testo c'è un numero di telefono: Google non lo accetta." });
    if (p.task === "edit") {
      // 23/10/2026 (Paolo, 1A): cambia solo il testo di un post già pubblicato; foto e «Scopri di più» restano
      const loc = await gbpGet(env, "loc"); if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
      const name = String(p.name || "");
      if (!name.startsWith(loc + "/localPosts/") || !/^[\w\-\/]+$/.test(name)) return json({ ok: false, error: "Post non valido." });
      const j = await gget("https://mybusiness.googleapis.com/v4/" + name + "?updateMask=summary", await gbpToken(env), "PATCH", { summary: text });
      return json({ ok: true, text: j.summary || text, state: j.state || "" });
    }
    const loc = await gbpGet(env, "loc"); if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
    const body = { languageCode: "it", summary: text, topicType: "STANDARD" };
    if (p.url && /^https:\/\/delpiccolodiavolo\.it\//.test(p.url)) body.callToAction = { actionType: "LEARN_MORE", url: p.url };
    const okKey = k => k && /^[\w\-./]+$/.test(k) && !k.includes("..");
    const pub = k => new URL(request.url).origin + "/api/public/gpost/" + k.split("/").map(encodeURIComponent).join("/");
    // video (13/10/2026): si prova a mandarlo come VIDEO; se Google lo rifiuta la pagina chiede se pubblicare con il fotogramma
    if (okKey(p.video) && /\.(mp4|webm|mov)$/i.test(p.video)) {
      await gbpSet(env, "media:" + p.video, String(Date.now() + 2 * 86400e3));
      body.media = [{ mediaFormat: "VIDEO", sourceUrl: pub(p.video) }];
      try {
        const j = await gget("https://mybusiness.googleapis.com/v4/" + loc + "/localPosts", await gbpToken(env), "POST", body);
        return json({ ok: true, name: j.name, state: j.state || "PROCESSING", video: true });
      } catch (e) { if (e.connect) throw e; return json({ ok: false, video: true, error: String(e.message || e) }); }
    }
    if (p.file && /^[\w\-./]+$/.test(p.file) && !p.file.includes("..")) {
      await gbpSet(env, "media:" + p.file, String(Date.now() + 2 * 86400e3));
      body.media = [{ mediaFormat: "PHOTO", sourceUrl: new URL(request.url).origin + "/api/public/gpost/" + p.file.split("/").map(encodeURIComponent).join("/") }];
    }
    const tk = await gbpToken(env);
    const j = await gget("https://mybusiness.googleapis.com/v4/" + loc + "/localPosts", tk, "POST", body);
    return json({ ok: true, name: j.name, state: j.state || "PROCESSING" });
  } catch (e) { return json({ ok: false, connect: !!e.connect, error: String(e.message || e) }); }
}
