import { json, role, deny } from "../_lib.js";
import { gbpGet, gbpToken, gget } from "../_gbp.js";
/* Recensioni del profilo Google (ottobre 2026). Solo Paolo.
   GET  → { ok, title, total, rating, reviews:[{name,who,photo,stars,text,date,reply,replyDate}], site:{total,rating} }
   POST { task:"reply", name, text } → pubblica o cambia la risposta su Google
   POST { task:"site", total, rating } → scrive i due numeri in hugo.toml del sito (un commit): si aggiorna SOLO con il tasto
   di Paolo, mai da solo (scelta di Paolo). Chiave GitHub: GITHUB_TOKEN (la stessa di "Pubblica sul sito"). */
const REPO = "https://api.github.com/repos/zonerosse/delpiccolodiavolo-hugo/contents/hugo.toml";
const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const gh = (env, method = "GET", body) => fetch(REPO + (method === "GET" ? "?ref=main" : ""), { method,
  headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "gestionale-delpiccolodiavolo",
    "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
const dec = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), c => c.charCodeAt(0)));
const enc = s => { const u = new TextEncoder().encode(s); let r = ""; for (let i = 0; i < u.length; i += 32768) r += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(r); };
async function siteNums(env) {
  if (!env.GITHUB_TOKEN) return null;
  const r = await gh(env); if (!r.ok) return null;
  const j = await r.json(), t = dec(j.content);
  const n = t.match(/^\s*recensioniTotale\s*=\s*"(\d+)"/m), v = t.match(/^\s*recensioniVoto\s*=\s*"([\d.,]+)"/m);
  return { total: n ? +n[1] : null, rating: v ? v[1] : null, sha: j.sha, text: t };
}
export async function onRequestGet({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  try {
    if (!env.GOOGLE_CLIENT_ID) return json({ ok: false, connect: true, setup: true, error: "Manca la chiave GOOGLE_CLIENT_ID in Cloudflare." });
    const loc = await gbpGet(env, "loc");
    if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
    const tk = await gbpToken(env);
    let out = [], page = "", total = 0, rating = 0;
    for (let i = 0; i < 10; i++) {
      const j = await gget("https://mybusiness.googleapis.com/v4/" + loc + "/reviews?pageSize=50" + (page ? "&pageToken=" + encodeURIComponent(page) : ""), tk);
      total = j.totalReviewCount || total; rating = j.averageRating || rating;
      for (const x of j.reviews || []) out.push({ name: x.name, who: (x.reviewer && !x.reviewer.isAnonymous && x.reviewer.displayName) || "Utente Google",
        photo: (x.reviewer && x.reviewer.profilePhotoUrl) || "", stars: STARS[x.starRating] || 0, text: x.comment || "",
        date: (x.createTime || "").slice(0, 10), reply: x.reviewReply ? x.reviewReply.comment || "" : null,
        replyDate: x.reviewReply ? (x.reviewReply.updateTime || "").slice(0, 10) : "" });
      if (!j.nextPageToken) break; page = j.nextPageToken;
    }
    const s = await siteNums(env).catch(() => null);
    return json({ ok: true, title: await gbpGet(env, "title"), total, rating, reviews: out, site: s ? { total: s.total, rating: s.rating } : null });
  } catch (e) { return json({ ok: false, connect: !!e.connect, error: String(e.message || e) }); }
}
export async function onRequestPost({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  try {
    const p = await request.json();
    if (p.task === "reply") {
      const loc = await gbpGet(env, "loc"), text = String(p.text || "").trim();
      if (!loc || !String(p.name || "").startsWith(loc + "/reviews/") || p.name.includes("..")) return json({ ok: false, error: "Recensione non valida." });
      if (!text || text.length > 4000) return json({ ok: false, error: "La risposta deve avere fra 1 e 4.000 caratteri." });
      const tk = await gbpToken(env);
      const j = await gget("https://mybusiness.googleapis.com/v4/" + p.name + "/reply", tk, "PUT", { comment: text });
      return json({ ok: true, reply: j.comment || text, replyDate: (j.updateTime || "").slice(0, 10) });
    }
    if (p.task === "site") {
      if (!env.GITHUB_TOKEN) return json({ ok: false, error: "Manca la chiave GITHUB_TOKEN in Cloudflare." });
      const n = parseInt(p.total, 10), v = Number(p.rating);
      if (!(n > 0 && n < 100000) || !(v >= 1 && v <= 5)) return json({ ok: false, error: "Numeri non validi." });
      const s = await siteNums(env); if (!s) return json({ ok: false, error: "Non riesco a leggere hugo.toml del sito." });
      const vs = v.toFixed(1);
      const t = s.text.replace(/^(\s*recensioniTotale\s*=\s*)"\d+"/m, `$1"${n}"`).replace(/^(\s*recensioniVoto\s*=\s*)"[\d.,]+"/m, `$1"${vs}"`);
      if (t === s.text) return json({ ok: true, unchanged: true, total: n, rating: vs });
      const r = await gh(env, "PUT", { message: "Recensioni Google: " + n + " (voto " + vs + ") dal gestionale", content: enc(t), sha: s.sha, branch: "main" });
      if (!r.ok) return json({ ok: false, error: "GitHub " + r.status + ": " + (await r.text()).slice(0, 200) });
      return json({ ok: true, total: n, rating: vs });
    }
    return json({ ok: false, error: "Richiesta sconosciuta." }, 400);
  } catch (e) { return json({ ok: false, connect: !!e.connect, error: String(e.message || e) }); }
}
