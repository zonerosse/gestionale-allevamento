import { json, role, deny, can } from "../_lib.js";
/* Biblioteca (25/10/2026): tesi, articoli e appunti sulla riproduzione. Il PDF originale sta in R2 (/files/...);
   il testo pagina per pagina e gli appunti stanno in D1 (tabelle biblio e biblio_txt, si creano da sole), NON nei dati
   del gestionale. Il testo delle pagine lo estrae il browser con pdf.js; le pagine fotografate o scansionate le
   trascrive Claude. Poi Claude studia il documento a pezzi ("part") e scrive appunti, mappa e soluzioni ("final").
   Vede chi vede Cani; aggiunge e cancella chi modifica Cani. Le risposte di "ask" usano SOLO i documenti caricati. */
const MODEL = "claude-sonnet-5-5";

const wait = ms => new Promise(r => setTimeout(r, ms));

async function ask(env, system, content, max) {
  // 25/10/2026 (letture interrotte): Claude occupato o sovraccarico (429, 500, 529…) → si aspetta e si riprova da soli
  for (let i = 0, busy = 0; i < 2; i++) {
    let r, j;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: max || 2000, system: system + "\nRispondi SOLO con un oggetto JSON valido, senza altro testo.", messages: [{ role: "user", content }] }) });
      j = await r.json().catch(() => ({}));
    } catch (e) { r = { ok: false, status: 0 }; j = {}; }
    if (!r.ok) {
      const m = (j.error && j.error.message) || "errore";
      if (/credit|balance/i.test(m)) throw new Error("Credito di Claude finito: ricarica in console.anthropic.com → Billing.");
      if ((r.status === 0 || r.status === 429 || r.status >= 500) && busy < 4) { busy++; i--; await wait(4000 * busy); continue; }
      throw new Error("Claude " + r.status + ": " + m);
    }
    const t = (j.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "").trim(), a = t.indexOf("{"), z = t.lastIndexOf("}");
    try { if (a >= 0 && z > a) return JSON.parse(t.slice(a, z + 1)); } catch (e) {}
  }
  throw new Error("Claude ha risposto in modo strano. Riprova tra un attimo.");
}

async function tables(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS biblio (id TEXT PRIMARY KEY, title TEXT, file TEXT, fname TEXT, pages INTEGER, status TEXT, created TEXT, notes TEXT, parts TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS biblio_txt (doc TEXT, n INTEGER, text TEXT, PRIMARY KEY (doc, n))").run();
  // 25/10/2026: un pezzo studiato per riga, così più pezzi si studiano insieme senza sovrascriversi
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS biblio_part (doc TEXT, a INTEGER, b INTEGER, json TEXT, PRIMARY KEY (doc, a))").run();
}

const S = (v, n) => String(v == null ? "" : v).slice(0, n || 300);
const PG = v => (Array.isArray(v) ? v : [v]).map(x => parseInt(x, 10)).filter(x => x > 0 && x < 5000).slice(0, 8);
const terms = q => [...new Set(String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^(che|con|per|una|uno|del|della|dei|degli|delle|nel|nella|sono|come|quando|quale|quali|cosa|dopo|prima|alla|alle|dal|dalla|non|piu|gli|le|il|lo|la|conviene|devo|posso|serve|fare)$/.test(w)).map(w => w.length > 7 ? w.slice(0, w.length - 3) : w.length > 5 ? w.slice(0, w.length - 2) : w))].slice(0, 8); // radice: «montare» trova anche «monta»
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function findPages(env, q, lim) {
  const T = terms(q); if (!T.length) return [];
  const where = T.map(() => "lower(t.text) LIKE ?").join(" OR ");
  const R = (await env.DB.prepare(`SELECT t.doc, t.n, t.text, b.title FROM biblio_txt t JOIN biblio b ON b.id = t.doc WHERE ${where} LIMIT 400`).bind(...T.map(t => "%" + t + "%")).all()).results || [];
  // lower() di SQLite non toglie gli accenti: si ricontrolla qui, con il testo senza accenti
  return R.map(r => { const x = norm(r.text); const sc = T.reduce((s, t) => s + (x.split(t).length - 1) * (t.length > 6 ? 2 : 1), 0) + T.filter(t => x.includes(t)).length * 5; return Object.assign(r, { sc, x }); })
    .filter(r => r.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, lim || 20);
}

function snip(r, q) {
  const T = terms(q), x = r.x, i = Math.max(0, Math.min(...T.map(t => { const k = x.indexOf(t); return k < 0 ? 1e9 : k; })));
  const a = Math.max(0, (i > 1e8 ? 0 : i) - 110), s = r.text.slice(a, a + 300).replace(/\s+/g, " ").trim();
  return (a > 0 ? "…" : "") + s + (a + 300 < r.text.length ? "…" : "");
}

// Le operazioni lunghe (Claude scrive per minuti) rispondono subito e mandano uno spazio ogni 10 secondi finché il lavoro
// non è finito, poi il JSON: così né il telefono né Cloudflare chiudono la connessione perché «non arriva niente».
function slow(fn) {
  const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder();
  const t = setInterval(() => { w.write(enc.encode(" ")).catch(() => {}); }, 10000);
  (async () => {
    let out;
    try { out = await fn(); } catch (e) { out = { ok: false, error: e.message || "errore", retry: !/Credito|ANTHROPIC_API_KEY/.test(e.message || "") }; }
    clearInterval(t);
    try { await w.write(enc.encode(JSON.stringify(out))); await w.close(); } catch (e) {}
  })();
  return new Response(readable, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export async function onRequest({ request, env }) {
  const admin = await role(request, env) === "admin";
  const canSee = admin || await can(request, env, ["cani"], 1), canEdit = admin || await can(request, env, ["cani"], 2);
  if (!canSee) return deny();
  await tables(env);
  const url = new URL(request.url);
  const p = request.method === "POST" ? await request.json().catch(() => ({})) : Object.fromEntries(url.searchParams);
  const op = p.op || "list";
  if (op === "list") {
    const R = (await env.DB.prepare("SELECT id, title, file, fname, pages, status, created, (SELECT count(*) FROM biblio_txt t WHERE t.doc = biblio.id) AS got, length(parts) AS pl FROM biblio ORDER BY created DESC").all()).results || [];
    return json({ ok: true, docs: R });
  }
  if (op === "doc") {
    const r = await env.DB.prepare("SELECT id, title, file, fname, pages, status, created, notes FROM biblio WHERE id = ?").bind(S(p.id, 40)).first();
    if (!r) return json({ ok: false, error: "Documento non trovato." });
    let notes = null; try { notes = r.notes ? JSON.parse(r.notes) : null; } catch (e) {}
    return json({ ok: true, doc: Object.assign(r, { notes }) });
  }
  if (op === "search") {
    const R = await findPages(env, p.q, 30);
    return json({ ok: true, res: R.map(r => ({ doc: r.doc, title: r.title, n: r.n, s: snip(r, p.q) })) });
  }
  if (op === "ask") {
    if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "Claude non è collegato: manca ANTHROPIC_API_KEY." });
    const R = await findPages(env, p.q, 12);
    if (!R.length) return json({ ok: true, a: "Nei documenti della Biblioteca non trovo niente su questo. Prova con altre parole o carica un documento che ne parla.", src: [] });
    const content = [{ type: "text", text: R.map(r => `[[${r.title} | p. ${r.n}]]\n${r.text.slice(0, 6000)}`).join("\n\n") + "\n\nDomanda dell'allevatore: " + S(p.q, 500) }];
    const o = await ask(env, `Sei l'assistente della biblioteca di un allevamento di cani. Rispondi in italiano, semplice e chiaro, SOLO con quello che c'è nelle pagine date (non aggiungere conoscenze tue). Se le pagine non bastano dillo. Niente diagnosi: per le decisioni conta il veterinario.
Rispondi con {"a":"risposta (al massimo 8 frasi)","src":[{"title":"titolo del documento","p":numero di pagina}]} citando solo le pagine usate.`, content, 1500);
    const D = new Map(R.map(r => [r.title + "|" + r.n, r.doc]));
    const src = (Array.isArray(o.src) ? o.src : []).map(x => ({ title: S(x.title, 200), p: parseInt(x.p, 10) || 0 })).filter(x => x.p).slice(0, 8).map(x => Object.assign(x, { doc: D.get(x.title + "|" + x.p) || (R.find(r => r.title === x.title) || {}).doc || "" }));
    return json({ ok: true, a: S(o.a, 3000), src });
  }
  if (op === "refs") {
    // Valori di riferimento (25/10/2026): soglie del progesterone, finestra della monta, prelievi, gestazione, presi SOLO dai documenti
    if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "Claude non \u00e8 collegato: manca ANTHROPIC_API_KEY." });
    const Q = ["progesterone ovulazione", "picco LH ormone luteinizzante", "monta accoppiamento inseminazione fertile", "gestazione parto giorni ovulazione", "prelievo dosaggio progesterone ore"];
    const seen = new Map();
    for (const q of Q) for (const r of await findPages(env, q, 8)) { const k = r.doc + "|" + r.n; if (!seen.has(k)) seen.set(k, r); }
    const R = [...seen.values()].sort((a, b) => b.sc - a.sc).slice(0, 24);
    if (!R.length) return json({ ok: true, items: {}, note: "Nei documenti della Biblioteca non ci sono pagine su progesterone, monta o gestazione." });
    const content = [{ type: "text", text: R.map(r => `[[${r.title} | p. ${r.n}]]\n${r.text.slice(0, 7000)}`).join("\n\n") }];
    const o = await ask(env, `Leggi queste pagine di tesi e studi veterinari sulla riproduzione della cagna. Trova SOLO i valori scritti esplicitamente (non dedurre, non usare conoscenze tue) per queste voci:
- "lh": progesterone (ng/ml) al picco di LH
- "ov": progesterone (ng/ml) all'ovulazione
- "lhOv": giorni dal picco di LH all'ovulazione
- "mWin": giorni dopo l'ovulazione in cui fare la monta (periodo fertile)
- "m2": ore tra la prima e la seconda monta
- "pLow": ogni quante ore fare il prelievo del progesterone quando \u00e8 ancora basso
- "pHigh": ogni quante ore fare il prelievo quando sale / vicino all'ovulazione
- "gest": giorni di gestazione contati dall'ovulazione (o dal picco di LH: in quel caso scrivilo in txt)
Se un valore \u00e8 in nmol/l convertilo in ng/ml (dividi per 3,18) e dillo in txt. Rispondi con {"items":{"lh":[{"v":[min,max] oppure [numero],"title":"titolo del documento come tra [[ ]]","p":pagina,"txt":"le parole del documento, massimo 15"}],...}}; una voce senza valori nei testi: [].`, content, 3000);
    const keys = ["lh", "ov", "lhOv", "mWin", "m2", "pLow", "pHigh", "gest"], items = {}, I = o.items || {};
    const docOf = t => (R.find(r => r.title === t) || R.find(r => r.title && t && (r.title.includes(t) || t.includes(r.title))) || {}).doc || "";
    for (const k of keys) items[k] = (Array.isArray(I[k]) ? I[k] : []).slice(0, 6).map(x => ({ v: (Array.isArray(x.v) ? x.v : [x.v]).map(n => parseFloat(String(n).replace(",", "."))).filter(n => !isNaN(n) && n >= 0 && n < 1000).slice(0, 2), title: S(x.title, 200), p: parseInt(x.p, 10) || 0, txt: S(x.txt, 160), doc: docOf(S(x.title, 200)) })).filter(x => x.v.length);
    return json({ ok: true, items });
  }
  if (!canEdit) return deny();
  if (op === "new") {
    const id = "b" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    await env.DB.prepare("INSERT INTO biblio (id, title, file, fname, pages, status, created, notes, parts) VALUES (?, ?, ?, ?, ?, 'pagine', ?, NULL, '[]')")
      .bind(id, S(p.title, 200) || "Documento", S(p.file, 200), S(p.fname, 200), Math.max(1, Math.min(2000, parseInt(p.pages, 10) || 1)), new Date().toISOString()).run();
    return json({ ok: true, id });
  }
  const id = S(p.id, 40), doc = await env.DB.prepare("SELECT * FROM biblio WHERE id = ?").bind(id).first();
  if (!doc) return json({ ok: false, error: "Documento non trovato." });
  if (op === "rename") { await env.DB.prepare("UPDATE biblio SET title = ? WHERE id = ?").bind(S(p.title, 200) || doc.title, id).run(); return json({ ok: true }); }
  if (op === "del") {
    await env.DB.prepare("DELETE FROM biblio_txt WHERE doc = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM biblio_part WHERE doc = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM biblio WHERE id = ?").bind(id).run();
    if (doc.file && /^\/files\//.test(doc.file)) { try { await env.FILES.delete(doc.file.replace(/^\/files\//, "")); } catch (e) {} }
    return json({ ok: true });
  }
  if (op === "pages" || op === "part" || op === "final") return slow(() => work(env, op, p, id, doc));
  return json({ ok: false, error: "Operazione sconosciuta." });
}

async function work(env, op, p, id, doc) {
  if (op === "pages") {
    const L = (Array.isArray(p.pages) ? p.pages : []).slice(0, 12);
    for (const x of L) {
      const n = parseInt(x.n, 10); if (!(n > 0)) continue;
      let text = S(x.text, 40000);
      if (x.img) {
        if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "Per le pagine fotografate serve Claude (ANTHROPIC_API_KEY)." };
        const data = String(x.img).replace(/^data:[^,]*,/, ""), media = /^image\/(jpeg|png|webp)$/.test(x.media || "") ? x.media : "image/jpeg";
        const o = await ask(env, "Trascrivi parola per parola il testo di questa pagina (in qualsiasi lingua, senza tradurre). Tabelle: una riga per riga, celle separate da \" | \". Se ci sono figure scrivi [Figura: breve descrizione]. Rispondi con {\"text\":\"...\"}.", [{ type: "image", source: { type: "base64", media_type: media, data } }], 4000);
        text = S(o.text, 40000);
      }
      await env.DB.prepare("INSERT OR REPLACE INTO biblio_txt (doc, n, text) VALUES (?, ?, ?)").bind(id, n, text).run();
    }
    const got = (await env.DB.prepare("SELECT count(*) AS c FROM biblio_txt WHERE doc = ?").bind(id).first()).c;
    return { ok: true, got };
  }
  if (op === "part") {
    if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "Claude non è collegato: manca ANTHROPIC_API_KEY." };
    const a = parseInt(p.from, 10) || 1, b = parseInt(p.to, 10) || a;
    const R = (await env.DB.prepare("SELECT n, text FROM biblio_txt WHERE doc = ? AND n BETWEEN ? AND ? ORDER BY n").bind(id, a, b).all()).results || [];
    const txt = R.filter(r => (r.text || "").trim()).map(r => `[[p. ${r.n}]]\n${r.text.slice(0, 12000)}`).join("\n\n").slice(0, 300000);
    let part = { sec: [], sol: [] };
    if (txt) {
      const o = await ask(env, `Studia queste pagine di un documento veterinario (tesi, articolo o appunti) per un allevatore di cani. Leggi TUTTO. Scrivi in italiano semplice gli appunti dei punti importanti e pratici, con i valori e i numeri come sono scritti, e la pagina da cui vengono (i numeri [[p. N]]).
Rispondi con {"title":"titolo del documento se compare in queste pagine, altrimenti \\"\\"","sec":[{"t":"argomento","pts":[{"x":"punto, una frase","p":[pagine]}]}],"sol":[{"q":"situazione pratica o problema","a":"cosa fare secondo il documento","p":[pagine]}]}`, [{ type: "text", text: txt }], 5000);
      part = { title: S(o.title, 200), sec: (Array.isArray(o.sec) ? o.sec : []).slice(0, 20).map(s => ({ t: S(s.t, 120), pts: (Array.isArray(s.pts) ? s.pts : []).slice(0, 25).map(x => ({ x: S(x.x, 500), p: PG(x.p) })) })), sol: (Array.isArray(o.sol) ? o.sol : []).slice(0, 15).map(s => ({ q: S(s.q, 300), a: S(s.a, 700), p: PG(s.p) })) };
    }
    await env.DB.prepare("INSERT OR REPLACE INTO biblio_part (doc, a, b, json) VALUES (?, ?, ?, ?)").bind(id, a, b, JSON.stringify(part)).run();
    await env.DB.prepare("UPDATE biblio SET status = 'studio' WHERE id = ?").bind(id).run();
    return { ok: true };
  }
  if (op === "final") {
    if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "Claude non è collegato: manca ANTHROPIC_API_KEY." };
    // 25/10/2026 (troppo lento): Claude non riscrive più tutti gli appunti (minuti di scrittura). Gli appunti dei pezzi si
    // uniscono qui (stesso argomento = un solo argomento, punti uguali una volta sola); Claude scrive solo titolo, riassunto,
    // mappa e parole chiave, guardando l'elenco degli argomenti.
    let parts = []; try { parts = JSON.parse(doc.parts || "[]"); } catch (e) {}
    const rows = (await env.DB.prepare("SELECT a, b, json FROM biblio_part WHERE doc = ? ORDER BY a").bind(id).all()).results || [];
    for (const r of rows) { let part = {}; try { part = JSON.parse(r.json); } catch (e) {} parts = parts.filter(x => x.from !== r.a).concat([{ from: r.a, to: r.b, part }]); }
    parts.sort((x, y) => x.from - y.from);
    const key = t => norm(t).replace(/[^a-z0-9]+/g, " ").trim();
    const SM = new Map(), sec = [], SQ = new Set(), sol = [];
    for (const x of parts) {
      for (const s of x.part.sec || []) {
        const k = key(s.t); let g = SM.get(k);
        if (!g) { g = { t: S(s.t, 120), pts: [], seen: new Set() }; SM.set(k, g); sec.push(g); }
        for (const q of s.pts || []) { const kk = key(q.x); if (kk && !g.seen.has(kk)) { g.seen.add(kk); g.pts.push({ x: S(q.x, 600), p: PG(q.p) }); } }
      }
      for (const s of x.part.sol || []) { const k = key(s.q); if (k && !SQ.has(k)) { SQ.add(k); sol.push({ q: S(s.q, 300), a: S(s.a, 800), p: PG(s.p) }); } }
    }
    sec.forEach(g => delete g.seen);
    const ttl = (parts.find(x => x.part.title) || {}).part;
    const list = sec.map((g, i) => `${i}. ${g.t}: ` + g.pts.slice(0, 3).map(q => q.x).join(" / ")).join("\n").slice(0, 60000);
    const o = await ask(env, `Hai l'elenco numerato degli argomenti degli appunti di un documento veterinario per un allevatore di cani (con i primi punti di ognuno). Scrivi in italiano semplice titolo, riassunto, mappa e parole chiave.
Rispondi con {"title":"titolo breve del documento","sum":"di cosa parla, 2 frasi","map":[{"t":"ramo","it":[{"t":"voce breve","s":numero dell'argomento nell'elenco}]}],"kw":["parole chiave"]}
La mappa ha 3-7 rami con 2-6 voci ciascuno.`, [{ type: "text", text: (ttl && ttl.title ? "Titolo trovato nel documento: " + ttl.title + "\n" : "") + list }], 2500);
    const pg = i => ((sec[i] || {}).pts || []).map(q => q.p[0]).find(Boolean) || 0;
    const notes = { sum: S(o.sum, 600), sec, map: (Array.isArray(o.map) ? o.map : []).slice(0, 8).map(b => ({ t: S(b.t, 80), it: (Array.isArray(b.it) ? b.it : []).slice(0, 8).map(x => { const s = Math.max(0, Math.min(sec.length - 1, parseInt(x.s, 10) || 0)); return { t: S(x.t, 80), s, p: pg(s) }; }) })),
      sol: sol.slice(0, 60), kw: (Array.isArray(o.kw) ? o.kw : []).slice(0, 20).map(x => S(x, 40)) };
    // il titolo di Claude prende il posto del nome del file (o di «Foto di N pagine»); un titolo scritto da Paolo resta
    const auto = !doc.title || doc.title === String(doc.fname || "").replace(/\.pdf$/i, "") || /^Foto di \d+ pagin/.test(doc.title) || doc.title.length < 4;
    const title = auto ? S(o.title || (ttl && ttl.title), 200) || doc.title : doc.title;
    await env.DB.prepare("UPDATE biblio SET notes = ?, status = 'ok', title = ? WHERE id = ?").bind(JSON.stringify(notes), title, id).run();
    return { ok: true };
  }
}
