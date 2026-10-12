import { json } from "../../_lib.js";
/* Tocchi sul tasto WhatsApp del sito (ottobre 2026). Li manda la funzione /wa/ di delpiccolodiavolo.it, server a server,
   con la chiave condivisa WA_KEY (stesso valore nei due progetti Cloudflare). Si salva solo giorno, ora, pagina e lingua:
   niente IP, niente dati personali. */
export async function onRequestPost({ request, env }) {
  if (!env.WA_KEY || request.headers.get("x-wa-key") !== env.WA_KEY) return json({ ok: false }, 403);
  const p = await request.json().catch(() => ({}));
  let path = String(p.path || "").slice(0, 300);
  if (!/^\/[\w\-./%]*$/.test(path)) path = "";
  // provenienza di chi apre il link da fuori dal sito (12/10/2026): solo una parola, mai IP o dati personali
  const src = String(p.src || "").toLowerCase().replace(/[^a-z0-9 .\-]/g, "").slice(0, 40);
  const lang = /^\/en(\/|$)/.test(path) ? "en" : /^\/de(\/|$)/.test(path) ? "de" : "it";
  const now = new Date(), day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS wa (id INTEGER PRIMARY KEY, ts INTEGER, day TEXT, path TEXT, lang TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE wa ADD COLUMN src TEXT").run(); } catch (e) {}   // colonna in più, una volta sola
  await env.DB.prepare("INSERT INTO wa (ts, day, path, lang, src) VALUES (?,?,?,?,?)").bind(now.getTime(), day, path, lang, src).run();
  return json({ ok: true });
}
