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
// Chi entra (08/10/2026): se in ⚙️ Account è stato salvato l'elenco (tabella gbp, chiave "cfg:access" = { people: { email: "admin"|"conti"|"viewer" } }),
// decide solo quello e chi non c'è NON entra. Se l'elenco non c'è ancora: come prima (CONTI, VIEWERS, tutti gli altri admin).
let ACC = null, ACC_AT = 0;
export async function accessCfg(env, fresh) {
  if (!fresh && ACC && Date.now() - ACC_AT < 30e3) return ACC;
  try { const r = await env.DB.prepare("SELECT v FROM gbp WHERE k = 'cfg:access'").first(); ACC = r ? JSON.parse(r.v) : {}; } catch (e) { ACC = {}; }
  ACC_AT = Date.now(); return ACC;
}
export function accessReset() { ACC = null; }
// Permessi per sezione (08/10/2026, scelta di Paolo): ogni persona ha, per ogni voce del menu, 0 = no, 1 = vede, 2 = modifica.
// Nell'elenco "cfg:access" una persona è "admin" (tutto) oppure { cani:1, conti:2, … }; "conti" e "viewer" (vecchi ruoli)
// valgono come { conti:2 } e { cani:1, cucciolate:1, coi:1, attesa:1 }. Oggi, Traduci e Statistiche: al massimo 1.
export const SECT = ["oggi", "cani", "cucciolate", "proprietari", "coi", "agenda", "attesa", "recensioni", "anagrafe", "traduci", "conti", "scadenze", "statistiche"];
export const SECT_ONE = ["oggi", "traduci", "statistiche"];
export function permNorm(r) {
  if (r === "admin") return null;
  const src = r === "conti" ? { conti: 2 } : r === "viewer" ? { cani: 1, cucciolate: 1, coi: 1, attesa: 1 } : (r && typeof r === "object" ? r : {});
  const P = {}; for (const s of SECT) { let v = parseInt(src[s], 10) || 0; v = Math.max(0, Math.min(SECT_ONE.includes(s) ? 1 : 2, v)); if (v) P[s] = v; }
  return P;
}
// { email, role: "admin" | "limited" | null, perm } — perm null per l'admin
export async function who(request, env) {
  const e = await accessEmail(request, env); if (e === null) return { email: null, role: null, perm: {} };
  const A = await accessCfg(env);
  let r;
  if (A && A.people && Object.keys(A.people).length) { r = A.people[e]; if (r === undefined) return { email: e, role: null, perm: {} }; }
  else {
    const V = String(env.VIEWERS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
    const C = String(env.CONTI || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
    r = C.includes(e) ? "conti" : V.includes(e) ? "viewer" : "admin";
  }
  if (r === "admin") return { email: e, role: "admin", perm: null };
  const P = permNorm(r);
  return { email: e, role: Object.keys(P).length ? "limited" : null, perm: P };
}
export async function role(request, env) { return (await who(request, env)).role; }
// true se l'admin, o se per quella sezione la persona ha almeno il livello chiesto (1 vede, 2 modifica)
export async function can(request, env, sect, lvl) { const w = await who(request, env); if (w.role === "admin") return true; if (!w.role) return false; return [].concat(sect).some(s => (w.perm[s] || 0) >= (lvl || 1)); }
// Tetti di spesa del mese (08/10/2026): quelli scritti in ⚙️ Account (gbp "cfg:caps" = { maps, sott }), se no MAPS_CAP e
// SOTTOSOPRA_CAP di Cloudflare, se no 100 e 30. 0 = fermo.
export async function capsCfg(env) {
  let c = {}; try { const r = await env.DB.prepare("SELECT v FROM gbp WHERE k = 'cfg:caps'").first(); c = r ? JSON.parse(r.v) : {}; } catch (e) {}
  const n = (v, d) => { const x = parseInt(v, 10); return isNaN(x) ? d : Math.max(0, Math.min(100000, x)); };
  return { maps: n(c.maps, n(env.MAPS_CAP, 100)), sott: n(c.sott, n(env.SOTTOSOPRA_CAP, 30)) };
}
export async function isAdmin(request, env) { return (await role(request, env)) === "admin"; }
// Dati dell'allevamento (08/10/2026): stessi valori di partenza di FARM_DEF nelle pagine; si cambiano in ⚙️ Account
// (settings.farm). Usare sempre farmOf(data) lato server, mai scriverli a mano.
export const FARM_DEF = { name: "Del Piccolo Diavolo", first: "Paolo", last: "Boldrini", street: "Via Amerigo Chierici", num: "12", cap: "44020", city: "Ostellato", prov: "FE", provName: "Ferrara", phone: "392 463 5584", prefix: "39", email: "zonerosse@gmail.com", site: "delpiccolodiavolo.it", breed: "Staffordshire Bull Terrier", since: "2013" };
export function farmRaw(data) { const s = (data && data.settings && data.settings.farm) || {}, o = {}; for (const k of Object.keys(FARM_DEF)) if (s[k] != null && String(s[k]).trim() !== "") o[k] = String(s[k]).trim(); return o; }
export function farmOf(data) { const f = Object.assign({}, FARM_DEF, farmRaw(data)); f.site = f.site.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  f.person = f.first + " " + f.last; f.kennel = "Allevamento " + f.name; f.kennelEn = f.name + " kennel"; f.cityProv = f.city + (f.prov ? " (" + f.prov + ")" : "");
  f.phoneIntl = "+" + f.prefix + " " + f.phone; return f; }
// Dati per chi consulta: niente dati personali dei proprietari, contratti, documenti privati, firma di Paolo
export function viewerData(data) {
  const d = JSON.parse(JSON.stringify(data));
  for (const k of Object.keys(d.owners || {})) d.owners[k] = { name: d.owners[k].name || "" };
  for (const x of Object.values(d.dogs || {})) { delete x.contract; if (x.docs) x.docs = x.docs.filter(z => !z.private && !z.ct && !z.pp && !z.pp_en && !z.isc); }
  for (const l of Object.values(d.litters || {})) delete l.acc;
  delete d.accGen; d.settings = { farm: farmRaw(data) }; return d;
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
    if (own) { Object.assign(o, d); delete o.notes; o.owner = oid; if (o.contract && !o.contract.visible) delete o.contract; if (o.shows) o.shows = o.shows.filter(x => x.own); } // esposizioni: solo quelle condivise
    else { PUB.forEach(f => { if (d[f] !== undefined) o[f] = d[f]; }); if (g <= 3 && d.photo) o.photo = d.photo; }
    if (g <= 2) o.docs = (d.docs || []).filter(x => !x.private); else delete o.docs;
    if (own) o.docs = (d.docs || []).filter(x => !x.private);
    dogs[k] = o;
  }
  const ow = data.owners[oid];
  const owners = { [oid]: { name: ow.name, country: ow.country || "", phone: ow.phone || "", email: ow.email || "", addr: ow.addr || "", lang: ow.lang || "it", cf: ow.cf || "", doc: ow.doc || "" } };
  const litters = {};
  mine.forEach(k => { const l = data.dogs[k].litter; if (l && data.litters[l]) { litters[l] = Object.assign({}, data.litters[l]); delete litters[l].acc; } }); // i conti restano solo a Paolo
  let txt = JSON.stringify({ dogs, owners, litters, matings: {}, settings: { farm: farmRaw(data) } });
  const allowed = new Set([...txt.matchAll(/\/files\/([A-Za-z0-9._-]+)/g)].map(m => m[1]));
  txt = txt.split("/files/").join("/api/public/" + token + "/f/");
  return { oid, dogs: mine, data: JSON.parse(txt), allowed };
}

// ---------- Copie di sicurezza automatiche (punto 11) ----------
// Tabella daily: una copia al giorno (giorno italiano), 90 giorni; le copie "prima del ripristino" hanno note.
export async function ensureDaily(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, at TEXT, version INTEGER, json TEXT, dogs INTEGER, litters INTEGER, note TEXT)").run();
}
export const dayIT = d => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }); // AAAA-MM-GG
export async function dailyCopy(env, data, txt, now, version, note) {
  await ensureDaily(env);
  const day = note ? dayIT(now) + " " + new Date(now).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }) + " " + note : dayIT(now);
  const dogs = Object.keys(data.dogs || {}).length, litters = Object.keys(data.litters || {}).length;
  await env.DB.prepare("INSERT OR IGNORE INTO daily (day, at, version, json, dogs, litters, note) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(day, now, version, txt, dogs, litters, note || "").run();
  const old = new Date(Date.parse(now) - 90 * 864e5).toISOString().slice(0, 10);
  await env.DB.prepare("DELETE FROM daily WHERE substr(day, 1, 10) < ?").bind(old).run();
}

// ---------- Cucciolate sul sito (punto 10) ----------
// Solo le cucciolate con "Sul sito" (l.web): stato, numeri e genitori (foto, test e titoli in IT/EN/DE, genitori, SBT). Mai note né proprietari.
export function siteLitters(data) {
  const D = data || {}, dogs = D.dogs || {}, dn = k => (dogs[k] && dogs[k].name) || "";
  const split = s => String(s || "").split(" · ").map(x => x.trim()).filter(Boolean);
  const par = k => { const d = dogs[k]; if (!d) return null; const m = /\/files\/([A-Za-z0-9._-]+)/.exec(d.photo || "");
    const L = l => [...split(d["tests" + l] || d.tests), ...split(d["titles" + l] || d.titles)];
    return { id: k, name: d.name || "", photoKey: m ? m[1] : "", it: L(""), en: L("_en"), de: L("_de"), parents: [dn(d.sire), dn(d.dam)].filter(Boolean), sbt: d.sbt || "" }; };
  const out = [];
  for (const [lid, l] of Object.entries(D.litters || {})) {
    if (!l.web) continue;
    const pups = Object.values(dogs).filter(d => d.litter === lid);
    const avail = pups.some(d => !d.owner && !["prenotato", "ceduto", "deceduto", "casa"].includes(d.status || ""));
    out.push({ id: lid, state: l.state === "pianificata" ? "plan" : "born", date: l.date || "", n: pups.length,
      m: pups.filter(d => d.sex === "M").length, f: pups.filter(d => d.sex === "F").length, avail,
      sbtUrl: l.sbtUrl || "", dam: par(l.dam), sire: par(l.sire) });
  }
  return out.sort((a, b) => (a.state === b.state ? (b.date || "").localeCompare(a.date || "") : a.state === "plan" ? 1 : -1));
}

// ---------- Ruolo "conti" (Daniela, variabile CONTI): vede e modifica SOLO i Conti ----------
// Le manda solo cucciolate (genitori, data, stato, acc), i nomi dei cuccioli e dei genitori, le spese generali.
export function contiData(data) {
  const D = data || {}, dogs = {}, litters = {};
  for (const [k, l] of Object.entries(D.litters || {})) {
    litters[k] = { dam: l.dam || "", sire: l.sire || "", date: l.date || null, state: l.state || "", acc: l.acc || undefined };
    for (const p of [l.dam, l.sire]) if (p && D.dogs[p]) dogs[p] = { name: D.dogs[p].name, nick: D.dogs[p].nick || "", sex: D.dogs[p].sex, ext: !!D.dogs[p].ext };
  }
  for (const [k, d] of Object.entries(D.dogs || {})) if (d.litter && litters[d.litter]) dogs[k] = { name: d.name, nick: d.nick || "", sex: d.sex, litter: d.litter, birthOrder: d.birthOrder };
  return { dogs, litters, owners: {}, matings: {}, accGen: D.accGen || [], settings: { farm: farmRaw(D) } };
}
// Unisce ai dati veri solo i Conti mandati dal ruolo "conti": tutto il resto resta com'è
export function mergeConti(cur, body) {
  const out = JSON.parse(JSON.stringify(cur));
  for (const [k, l] of Object.entries((body && body.litters) || {})) if (out.litters && out.litters[k]) { if (l.acc) out.litters[k].acc = l.acc; else delete out.litters[k].acc; }
  out.accGen = Array.isArray(body && body.accGen) ? body.accGen : (out.accGen || []);
  return out;
}

// ---------- Permessi per sezione: dati da mandare e da accettare (08/10/2026) ----------
// Documenti che vede solo chi ha "Proprietari": contratti, passaggi, caparre, iscrizioni, privati.
const hiddenDoc = z => z && (z.private || z.ct || z.pp || z.pp_en || z.isc || z.dep);
export function limitedData(data, P) {
  const d = JSON.parse(JSON.stringify(data || {})), v = s => (P[s] || 0) >= 1, S = (data && data.settings) || {};
  d.dogs = d.dogs || {}; d.litters = d.litters || {}; d.owners = d.owners || {}; d.matings = d.matings || {};
  if (!v("proprietari")) {
    for (const k of Object.keys(d.owners)) d.owners[k] = { name: d.owners[k].name || "" };
    for (const x of Object.values(d.dogs)) { delete x.contract; delete x.dep; delete x.pp; if (x.docs) x.docs = x.docs.filter(z => !hiddenDoc(z)); }
  }
  if (!v("conti")) { for (const l of Object.values(d.litters)) delete l.acc; d.accGen = []; }
  if (!v("attesa")) { delete d.waitlist; delete d.interested; delete d.wlGone; }
  if (!v("agenda")) delete d.agenda;
  const s = { farm: farmRaw(data) }, cp = ks => ks.forEach(k => { if (S[k] !== undefined) s[k] = S[k]; });
  cp(["rules", "enti"]);
  if (v("scadenze")) cp(["scad", "alarms", "todo", "calToken"]);
  if (v("cani") || v("proprietari")) cp(["kitExtra"]);
  if (v("cucciolate")) cp(["modB", "drive", "sitePub"]);
  if (v("cucciolate") || v("anagrafe")) cp(["holders", "ppMe", "anagrafeEmail"]);
  if (v("anagrafe")) cp(["myIds"]);
  d.settings = s;
  return d;
}
// Unisce ai dati veri SOLO le parti che la persona può modificare (2); il resto resta com'è sul server.
export function mergeLimited(cur, body, P) {
  const out = JSON.parse(JSON.stringify(cur || {})), B = body || {}, m = s => (P[s] || 0) === 2, mm = a => a.some(m), v = s => (P[s] || 0) >= 1;
  const take = k => { if (B[k] === undefined) delete out[k]; else out[k] = JSON.parse(JSON.stringify(B[k])); };
  if (m("proprietari")) take("owners");
  if (m("coi")) take("matings");
  if (m("attesa")) { take("waitlist"); take("interested"); take("wlGone"); }
  if (m("agenda")) take("agenda");
  if (m("conti")) out.accGen = Array.isArray(B.accGen) ? B.accGen : (out.accGen || []);
  // cucciolate
  const L = out.litters = out.litters || {}, BL = B.litters || {};
  if (m("cucciolate")) {
    for (const k of Object.keys(L)) if (!BL[k]) delete L[k];
    for (const [k, l] of Object.entries(BL)) { const acc = L[k] && L[k].acc; L[k] = JSON.parse(JSON.stringify(l)); if (!m("conti")) { if (acc) L[k].acc = acc; else delete L[k].acc; } }
  } else if (m("conti")) for (const [k, l] of Object.entries(BL)) if (L[k]) { if (l.acc) L[k].acc = l.acc; else delete L[k].acc; }
  // cani: campo per campo, secondo la sezione a cui appartiene
  const G = f => ["health", "todo", "scMove", "scSkip"].includes(f) ? ["cani", "scadenze"] : f === "anag" ? ["cani", "anagrafe"]
    : ["contract", "dep", "pp", "owner", "nvSent", "nvPrev"].includes(f) ? ["proprietari"] : ["kit", "kitx"].includes(f) ? ["cani", "proprietari"]
    : ["litter", "birthOrder", "birthTime", "collar", "birthWeight", "weights", "wphotos"].includes(f) ? ["cani", "cucciolate"] : ["cani"];
  const DG = out.dogs = out.dogs || {}, BD = B.dogs || {}, docsOk = mm(["cani", "proprietari", "cucciolate", "anagrafe"]);
  for (const k of Object.keys(DG)) if (!BD[k] && m("cani")) delete DG[k];
  for (const [k, bd] of Object.entries(BD)) {
    const cd = DG[k];
    if (!cd) { if (mm(["cani", "cucciolate", "anagrafe"])) DG[k] = JSON.parse(JSON.stringify(bd)); continue; }
    for (const f of new Set([...Object.keys(cd), ...Object.keys(bd)])) {
      if (f === "docs") {
        if (!docsOk) continue;
        const keep = v("proprietari") ? [] : (cd.docs || []).filter(hiddenDoc);
        const had = new Set((cd.docs || []).map(z => z && z.file));
        cd.docs = (bd.docs || []).filter(z => v("proprietari") || !hiddenDoc(z) || !had.has(z.file)).concat(keep);
        continue;
      }
      if (JSON.stringify(cd[f]) === JSON.stringify(bd[f]) || !mm(G(f))) continue;
      if (bd[f] === undefined) delete cd[f]; else cd[f] = JSON.parse(JSON.stringify(bd[f]));
    }
  }
  // impostazioni: solo le voci delle sezioni modificabili
  const S = out.settings = out.settings || {}, BS = B.settings || {}, put = ks => ks.forEach(k => { if (BS[k] === undefined) delete S[k]; else S[k] = BS[k]; });
  if (m("scadenze")) put(["scad", "alarms", "todo", "calToken"]);
  if (mm(["cani", "proprietari"])) put(["kitExtra"]);
  if (m("cucciolate")) put(["drive", "sitePub"]);
  return out;
}
