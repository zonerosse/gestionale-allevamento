import { json, role, deny, farmNow } from "../_lib.js";
import { gbpGet, gbpSet, gget } from "../_gbp.js";
/* Collegamento del gestionale al profilo Google dell'attività (ottobre 2026). Solo Paolo.
   GET /api/google            → manda alla pagina di Google per dare il permesso (una volta sola)
   GET /api/google?code=…     → Google torna qui: salva il collegamento e trova da solo la scheda dell'allevamento,
                                 poi riporta il gestionale sulla scheda Recensioni. */
// Profilo dell'attività + Search Console in sola lettura (statistiche del sito, ottobre 2026)
const SCOPE = "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/webmasters.readonly";
let RET = "recensioni";
const back = (url, msg) => Response.redirect(new URL("/#" + RET + "=" + encodeURIComponent(msg), url).toString(), 302);
export async function onRequestGet({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    return json({ ok: false, error: "Mancano GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET in Cloudflare (Settings → Variables and Secrets)." });
  const u = new URL(request.url), redirect = u.origin + "/api/google";
  const code = u.searchParams.get("code"), err = u.searchParams.get("error");
  if (err) return back(request.url, "Collegamento annullato su Google.");
  if (!code) {
    const state = crypto.randomUUID();
    await gbpSet(env, "state", state);
    await gbpSet(env, "ret", u.searchParams.get("ret") === "sito" ? "sitostat" : "recensioni");
    const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code",
      scope: SCOPE, access_type: "offline", prompt: "consent", state });
    return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + q, 302);
  }
  RET = (await gbpGet(env, "ret")) || "recensioni";
  try {
    if (u.searchParams.get("state") !== (await gbpGet(env, "state"))) return back(request.url, "Collegamento non valido: riprova.");
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirect, grant_type: "authorization_code" }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) return back(request.url, "Google non ha dato il permesso: riprova.");
    if (j.refresh_token) await gbpSet(env, "refresh", j.refresh_token);
    if (RET === "sitostat") {
      // Statistiche del sito: basta il permesso; la scheda del profilo si cerca solo se Google ha già approvato
      try { await findLoc(env, j.access_token); } catch (e) {}
      return back(request.url, "Collegato a Google: statistiche del sito pronte.");
    }
    // la scheda dell'allevamento: quella che si chiama "…Piccolo Diavolo…", altrimenti la prima
    const acc = await gget("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", j.access_token);
    const F0 = await farmNow(env), nm = (F0.name || "").trim(), MY = nm ? new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"), "i") : /$^/;
    let pick = null;
    for (const a of acc.accounts || []) {
      const l = await gget("https://mybusinessbusinessinformation.googleapis.com/v1/" + a.name + "/locations?readMask=name,title&pageSize=100", j.access_token);
      for (const x of l.locations || []) {
        const loc = a.name + "/" + x.name; // accounts/…/locations/…
        if (!pick || MY.test(x.title || "")) pick = { loc, title: x.title || "" };
      }
    }
    if (!pick) return back(request.url, "Collegato, ma Google non mostra nessuna scheda attività per questo account.");
    await gbpSet(env, "loc", pick.loc); await gbpSet(env, "title", pick.title);
    return back(request.url, "Collegato a: " + pick.title);
  } catch (e) { return back(request.url, String(e.message || e)); }
}

async function findLoc(env, token) {
  const acc = await gget("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token);
  const F0 = await farmNow(env), nm = (F0.name || "").trim(), MY = nm ? new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"), "i") : /$^/;
  let pick = null;
  for (const a of acc.accounts || []) {
    const l = await gget("https://mybusinessbusinessinformation.googleapis.com/v1/" + a.name + "/locations?readMask=name,title&pageSize=100", token);
    for (const x of l.locations || []) { const loc = a.name + "/" + x.name; if (!pick || MY.test(x.title || "")) pick = { loc, title: x.title || "" }; }
  }
  if (pick) { await gbpSet(env, "loc", pick.loc); await gbpSet(env, "title", pick.title); }
}
