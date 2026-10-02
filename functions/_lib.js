// Funzioni comuni: controllo dell'accesso (Cloudflare Access) e pagina del proprietario
let CERTS = null, CERTS_AT = 0;

export const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

const b64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

function cookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

// Chi sta usando il gestionale: email verificata da Cloudflare Access (null = nessun accesso)
export async function accessEmail(request, env) {
  if (env.DEV_BYPASS === "1") return env.DEV_EMAIL || "dev"; // solo per prove in locale: MAI in produzione
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion") || cookie(request, "CF_Authorization");
  if (!jwt || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null;
  try {
    const [h, p, s] = jwt.split(".");
    const head = JSON.parse(new TextDecoder().decode(b64u(h)));
    const pay = JSON.parse(new TextDecoder().decode(b64u(p)));
    const aud = Array.isArray(pay.aud) ? pay.aud : [pay.aud];
    if (!aud.includes(env.POLICY_AUD)) return null;
    if (pay.exp && pay.exp * 1000 < Date.now()) return null;
    if (!CERTS || Date.now() - CERTS_AT > 3600e3) {
      const r = await fetch(env.TEAM_DOMAIN.replace(/\/$/, "") + "/cdn-cgi/access/certs");
      CERTS = (await r.json()).keys; CERTS_AT = Date.now();
    }
    const jwk = CERTS.find(k => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(h + "." + p));
    return ok ? String(pay.email || "").toLowerCase() : null;
  } catch (e) { return null; }
}
// Ruolo: "viewer" se l'email è nella variabile VIEWERS (solo consultazione), altrimenti "admin" (Paolo)
export async function role(request, env) {
  const e = await accessEmail(request, env); if (e === null) return null;
  const V = String(env.VIEWERS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return V.includes(e) ? "viewer" : "admin";
}
export async function isAdmin(request, env) { return (await role(request, env)) === "admin"; }
// Dati per chi consulta: niente dati personali dei proprietari, contratti, documenti privati, firma di Paolo
export function viewerData(data) {
  const d = JSON.parse(JSON.stringify(data));
  for (const k of Object.keys(d.owners || {})) d.owners[k] = { name: d.owners[k].name || "" };
  for (const x of Object.values(d.dogs || {})) { delete x.contract; if (x.docs) x.docs = x.docs.filter(z => !z.private && !z.ct && !z.pp && !z.pp_en); }
  for (const l of Object.values(d.litters || {})) delete l.acc;
  delete d.accGen; delete d.settings; return d;
}
export const deny = () => json({ error: "Accesso non autorizzato" }, 403);

// Tabella dei contratti firmati: si crea da sola la prima volta
export async function ensureContracts(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS contracts (dog TEXT PRIMARY KEY, owner TEXT, json TEXT, signed_at TEXT)").run();
}

// Richieste dal modulo del sito: la tabella si crea da sola la prima volta
export async function ensureRequests(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, json TEXT, created TEXT)").run();
}

export async function loadData(env) {
  const row = await env.DB.prepare("SELECT version, json, updated FROM store WHERE id = 'main'").first();
  return row ? { version: row.version, data: JSON.parse(row.json), updated: row.updated } : null;
}

// Solo i dati che il proprietario può vedere: i suoi cani, i loro antenati, i test dei genitori.
export function ownerSubset(data, token) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token || "")) return null;
  const oid = Object.keys(data.owners || {}).find(k => data.owners[k].token === token);
  if (!oid) return null;
  const mine = Object.keys(data.dogs).filter(k => data.dogs[k].owner === oid);
  const depth = {}, q = mine.map(k => [k, 0]);
  while (q.length) {
    const [k, g] = q.shift();
    if (!k || !data.dogs[k] || (k in depth && depth[k] <= g)) continue;
    depth[k] = g;
    if (g < 10) q.push([data.dogs[k].sire, g + 1], [data.dogs[k].dam, g + 1]);
  }
  const PUB = ["name", "nick", "sex", "sire", "dam", "loi", "coiSbt", "tests", "tests_en", "color", "color_en", "birth", "year", "sbt", "ext", "bred", "titles"];
  const dogs = {};
  for (const [k, g] of Object.entries(depth)) {
    const d = data.dogs[k], own = mine.includes(k), o = {};
    if (own) { Object.assign(o, d); delete o.notes; o.owner = oid; if (o.contract && !o.contract.visible) delete o.contract; }
    else { PUB.forEach(f => { if (d[f] !== undefined) o[f] = d[f]; }); if (g <= 3 && d.photo) o.photo = d.photo; }
    if (g <= 2) o.docs = (d.docs || []).filter(x => !x.private); else delete o.docs;
    if (own) o.docs = (d.docs || []).filter(x => !x.private);
    dogs[k] = o;
  }
  const ow = data.owners[oid];
  const owners = { [oid]: { name: ow.name, country: ow.country || "", phone: ow.phone || "", email: ow.email || "", addr: ow.addr || "", lang: ow.lang || "it", cf: ow.cf || "", doc: ow.doc || "" } };
  const litters = {};
  mine.forEach(k => { const l = data.dogs[k].litter; if (l && data.litters[l]) { litters[l] = Object.assign({}, data.litters[l]); delete litters[l].acc; } }); // i conti restano solo a Paolo
  let txt = JSON.stringify({ dogs, owners, litters, matings: {} });
  const allowed = new Set([...txt.matchAll(/\/files\/([A-Za-z0-9._-]+)/g)].map(m => m[1]));
  txt = txt.split("/files/").join("/api/public/" + token + "/f/");
  return { oid, dogs: mine, data: JSON.parse(txt), allowed };
}
