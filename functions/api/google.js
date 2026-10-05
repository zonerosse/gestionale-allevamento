import { json, role, deny } from "../_lib.js";
import { gbpGet, gbpSet, gget } from "../_gbp.js";
/* Collegamento del gestionale al profilo Google dell'attività (ottobre 2026). Solo Paolo.
   GET /api/google            → manda alla pagina di Google per dare il permesso (una volta sola)
   GET /api/google?code=…     → Google torna qui: salva il collegamento e trova da solo la scheda dell'allevamento,
                                 poi riporta il gestionale sulla scheda Recensioni. */
const SCOPE = "https://www.googleapis.com/auth/business.manage";
const back = (url, msg) => Response.redirect(new URL("/#recensioni=" + encodeURIComponent(msg), url).toString(), 302);
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
    const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code",
      scope: SCOPE, access_type: "offline", prompt: "consent", state });
    return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + q, 302);
  }
  try {
    if (u.searchParams.get("state") !== (await gbpGet(env, "state"))) return back(request.url, "Collegamento non valido: riprova.");
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirect, grant_type: "authorization_code" }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) return back(request.url, "Google non ha dato il permesso: riprova.");
    if (j.refresh_token) await gbpSet(env, "refresh", j.refresh_token);
    // la scheda dell'allevamento: quella che si chiama "…Piccolo Diavolo…", altrimenti la prima
    const acc = await gget("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", j.access_token);
    let pick = null;
    for (const a of acc.accounts || []) {
      const l = await gget("https://mybusinessbusinessinformation.googleapis.com/v1/" + a.name + "/locations?readMask=name,title&pageSize=100", j.access_token);
      for (const x of l.locations || []) {
        const loc = a.name + "/" + x.name; // accounts/…/locations/…
        if (!pick || /piccolo\s*diavolo/i.test(x.title || "")) pick = { loc, title: x.title || "" };
      }
    }
    if (!pick) return back(request.url, "Collegato, ma Google non mostra nessuna scheda attività per questo account.");
    await gbpSet(env, "loc", pick.loc); await gbpSet(env, "title", pick.title);
    return back(request.url, "Collegato a: " + pick.title);
  } catch (e) { return back(request.url, String(e.message || e)); }
}
