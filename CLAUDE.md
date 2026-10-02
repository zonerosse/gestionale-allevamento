# CLAUDE.md – Gestionale Del Piccolo Diavolo

Istruzioni per chi (Claude, in chat o in Claude Code) lavora su questo repository.
Leggere tutto prima di proporre o scrivere modifiche.

## Cos'è
Il gestionale dell'allevamento **Del Piccolo Diavolo** (Staffordshire Bull Terrier, Ostellato FE) di Paolo Boldrini:
cani, pedigree a 8 generazioni, COI, cucciolate, proprietari, salute (vaccini, sverminazioni, esami feci),
referti e documenti, profili DNA, pagina privata per ogni proprietario.

- Online: **https://gestionale.delpiccolodiavolo.it** (Cloudflare Pages, progetto `gestionale-allevamento`,
  alias `gestionale-allevamento-gie.pages.dev`).
- Repository pubblico: `zonerosse/gestionale-allevamento`. In locale: `C:\Hugo\gestionale-allevamento`.
- **Nel repository c'è solo il programma, mai dati.** Cani, proprietari, file e link segreti stanno su Cloudflare.

## Architettura
| Pezzo | Dove | Note |
|---|---|---|
| Pagine | `public/index.html` (allevatore), `public/proprietario.html` (proprietario) | HTML/CSS/JS in un file solo, nessun build |
| API | `functions/` (Cloudflare Pages Functions) | |
| Dati | D1 `gestionale-allevamento`, binding **`DB`** | tabelle `store` (riga `id='main'`: tutto il gestionale in JSON + `version`) e `history` (ultimi 200 salvataggi) |
| File | R2 `gestionale-allevamento-file`, binding **`FILES`** | foto e PDF; nei dati compaiono come `/files/<chiave>` |
| Accesso | Cloudflare Access (team `delpiccolodiavolo-site-pages`) | app "gestionale" (solo email di Paolo, One-time PIN) + app bypass su `/p` e `/api/public` |
| Variabili | Pages → Variabili | `POLICY_AUD` (AUD dell'app "Solo Paolo"), `TEAM_DOMAIN` (`https://delpiccolodiavolo-site-pages.cloudflareaccess.com`) |

### API
- `GET/PUT /api/data` – legge/salva tutto il gestionale. PUT con `version`: se non coincide → 409 (conflitto, non sovrascrive).
- `POST /api/upload` – carica foto/PDF in R2, risponde `{url:"/files/<chiave>"}`.
- `GET /files/<chiave>` – file per l'allevatore.
- `POST /api/import` – solo primo avvio (database vuoto).
- `GET /api/public/<token>` – dati della pagina del proprietario (senza login).
- `GET /api/public/<token>/f/<chiave>` – file del proprietario: solo quelli presenti nella sua pagina.
- `GET /p/<token>` – serve `proprietario.html`.

Tutto ciò che non è `/p` o `/api/public` richiede `isAdmin()` in `functions/_lib.js`
(verifica firma del JWT di Access con le chiavi del team + `POLICY_AUD`). Non indebolire mai questo controllo.
`DEV_BYPASS=1` esiste solo per le prove in locale: **mai** come variabile su Cloudflare.

### Pagina del proprietario (`ownerSubset` in `functions/_lib.js`)
Il proprietario vede solo: i suoi cani, gli antenati (per pedigree e COI), i documenti non privati dei suoi cani
e di genitori/nonni, i propri dati di contatto. **Mai**: `notes`, documenti con `private:true`, altri cani,
altri proprietari, token. I percorsi `/files/` vengono riscritti in `/api/public/<token>/f/`.
Proprietari esteri (`lang:"en"`): la pagina deve essere **tutta in inglese** (funzione `T(it,en)`, campi `*_en`).

### Struttura del codice nelle due pagine
`index.html` e `proprietario.html` contengono **lo stesso blocco di codice dell'applicazione**,
da `/* ---------- Utilità ---------- */` fino a prima di:
- `/* ---------- Salvataggio online ---------- */` in `index.html`;
- `/* ---------- Pagina privata del proprietario ---------- */` in `proprietario.html`.
**Ogni modifica a quel blocco va fatta identica nei due file.** CSS: idem (stesso `<style>`).
Il salvataggio online sta in fondo a `index.html`: salva da solo ogni 3 secondi se i dati cambiano;
prima di salvare carica su R2 ogni `data:...;base64,` (foto/PDF nuovi) e lo sostituisce con `/files/...`.

### Modello dei dati (`D`)
- `D.dogs[id]`: `name, nick, sex (M/F), birth, color, color_en, loi, chip, sbt, sire, dam, status
  (fattrice/stallone/casa/prenotato/ceduto/sterilizzata/deceduto), ext (esterno), bred (allevato da Paolo),
  breeder, owner, litter, coiSbt, tests, tests_en, titles, notes, photo,
  health{vacc[],verm[],feci[]}, docs[{title,title_en,date,file,fname,private}], dna{...}`
- `D.owners[id]`: `name, country, phone, email, addr, lang (it/en), notes, token` (link segreto `/p/<token>`)
- `D.litters[id]`: `dam, sire, date, state (nata/pianificata), notes, sbtA`
  - `sbtA` (facoltativo) = analisi SBT del test mating, vale per tutti i cuccioli della cucciolata:
    `{c3,c5,c8 (stringhe con virgola), uniq, max, loss, gens:[[unici,max,ignoti]×8], top:[{name,n,pct}], src, date, pdf}`.
    Si mostra con la grafica "Scala" (`coiScale`): nella scheda di Paolo con la fascia 6–9% e il calcolo Wright,
    nella pagina del proprietario solo numeri.
- `D.matings["sire|dam"]`: `{coiSbt}`

### COI
**Analisi SBT a ogni cucciolata:** Paolo manda a Claude il PDF della simulazione (test mating) di SBTpedigree;
Claude prepara `analisi-sbt-<madre>-x-<padre>.json` = `{"analisiSbt":{"sire":"<nome>","dam":"<nome>","a":{...sbtA, pdf:"data:application/pdf;base64,..."}}}`.
Paolo lo carica con "Importa modifiche": il gestionale trova la cucciolata dai nomi dei genitori (anche pianificata),
chiede conferma e salva `sbtA`; il PDF va su R2 da solo al salvataggio. Il PDF di SBT è un'immagine: i numeri li legge Claude.
Il numero principale è sempre il **COI 8 generazioni di SBTPedigree**, inserito a mano (`coiSbt`).
Il calcolo del gestionale (Wright, 8 generazioni) si mostra sotto, come secondario. Fascia ideale **6–9%**.

## Regole di Paolo (vincolanti)
1. **Modifiche all'interfaccia: sempre prima un'anteprima** HTML autonoma da aprire col doppio clic
   (dati di esempio, oppure una sua "Copia di sicurezza" se la allega). Solo dopo l'approvazione, il codice vero.
2. **Le scelte le fa lui**: nomi, testi, cosa tenere o togliere si presentano come opzioni (A/B…). Si decide al
   posto suo solo se lo chiede.
3. **Non scrive codice a mano**: le modifiche si consegnano pronte in uno zip **`gestionale-*.zip`** da estrarre in
   `C:\Hugo\gestionale-allevamento` (sovrascrivendo), poi `git add . ; git commit -m "..." ; git push`.
   Oppure le applica Claude Code direttamente nella cartella.
4. **Dati di cani e proprietari si cambiano solo da "Modifica" con un "Salva" esplicito**: niente modifiche dirette
   nei campi; "Annulla modifiche" esce senza domande. Le aggiunte (salute, documenti) hanno il loro modulo con Salva.
5. **I dati inseriti non devono mai andare persi**: nessuna modifica al programma deve toccare D1/R2,
   cambiare il formato dei dati in modo incompatibile o richiedere di ricaricare i dati.
   Se serve un nuovo campo: si aggiunge, con valore vuoto di default.
6. **Codici fiscali e documenti d'identità dei proprietari non vanno nel gestionale** (né online): restano nei PDF stampati.
7. Lingua: italiano, testi semplici e diretti; date `gg/mm/aaaa`; simboli ♂ azzurro / ♀ rosa (icone SVG spesse).
8. Scelte grafiche già fatte: Proprietari raggruppati per cucciolata, tutti aperti; Cucciolate come linea del tempo
   con foto dei genitori; Salute con bottone siringa fisso;
   Cani → filtro Ceduti raggruppato per cucciolata (dalla più recente, gruppi aperti, alfabetico dentro);
   Consanguineità con la grafica "Scala" quando la cucciolata ha l'analisi SBT (pagina proprietario: solo numeri);
   "Copia link" anche nella scheda del cane e nell'elenco proprietari.
   "Scheda della cucciolata" (`litterSheet`, solo allevatore): da Cucciolate e dalla scheda dei genitori; mostra la scala SBT
   e "Su chi cade la consanguineità" = antenati comuni ordinati per peso sul COI Wright (`coiParts`, stessi percorsi di `coi8`).

## Prova in locale (facoltativa)
```
npm i -g wrangler@3
printf "DEV_BYPASS=1\n" > .dev.vars
wrangler d1 execute gestionale-test --local --file=schema.sql
wrangler pages dev public --d1 DB=gestionale-test --r2 FILES=gestionale-test
```
`.dev.vars` è nel `.gitignore`: non deve mai finire su GitHub.

## Da non fare mai
- Mettere dati veri (JSON dei cani, foto, documenti, token) nel repository.
- Togliere o aggirare `isAdmin()`, il controllo di versione del PUT o i filtri di `ownerSubset`.
- Rendere visibili al proprietario note, documenti privati o dati di altri.

## Contratto di cessione (ottobre 2026)
- Testo dei contratti di Paolo (maschio/femmina, scelto dal sesso) in `CT`/`V32`/`C36`/`CL1341` nel blocco comune, con traduzione
  inglese: per i proprietari con `lang:"en"` il contratto è **tutto in inglese**, con in fondo il testo italiano che **fa fede** (scelta di Paolo). Caparra e presa in consegna con
  formula fissa senza importi né date (consegna presso l'allevamento a Ostellato); niente "segni particolari". Punto 1.4 invariato (scelta di Paolo).
- `D.dogs[id].contract = {price, meSig, visible}`: lo compila Paolo nella scheda del cucciolo
  (`contractBox`); quando è `visible` i dati sono bloccati. `D.owners[id].cf` e `.doc` (codice fiscale, documento) precompilano.
- Firma **solo con il dito/mouse** (firma elettronica semplice): niente servizi a pagamento, scelta di Paolo.
- Il proprietario firma dalla sua pagina (`ctOwnerBox`) → `POST /api/public/<token>/contract`: unica scrittura possibile dalla
  pagina del proprietario, una volta sola. Il server ricostruisce le condizioni dai dati di Paolo (il browser non può cambiarle),
  calcola l'impronta SHA-256 e salva nella tabella D1 `contracts` (si crea da sola), **non** nei dati del gestionale.
- `GET /api/contracts` (solo Paolo) → `CONTR`; all'apertura il gestionale crea il PDF firmato (jsPDF da cdnjs) e lo mette nei
  documenti del cucciolo (`docs[].ct = hash`), visibile anche al proprietario.
- Flusso semplificato (scelto da Paolo): nella scheda un solo riquadro a 3 stati (`ctState`: todo → sent → done):
  prezzo + firma + tasto "Firma e manda" (salva e rende visibile insieme); poi "Avvisa su WhatsApp" (wa.me con link),
  "Ritira e correggi"; infine "Firmato" con PDF. Etichetta dello stato nelle righe dell'elenco (`ctBadge`): sempre per i
  prenotati, per gli altri solo se il contratto è iniziato. Il proprietario vede prima i dati, il contratto completo è
  in un riquadro da aprire, la scelta foto/nome è scritta in parole semplici (nel PDF resta il testo del punto 3.6).
- Firma di Paolo salvata una volta sola in `D.settings.sellerSig` (la prima che fa); "Firma e manda" la copia in
  `contract.meSig` di quel contratto. "Cambia firma" vale solo per i contratti futuri.
- Pagina del proprietario: se c'è un contratto da firmare, in cima (sotto il nome) l'avviso rosso "Hai un contratto da firmare"
  con "Firma ora" e **subito sotto il modulo da firmare** (`ctTop`, scelta C di Paolo); dopo la firma in cima resta solo
  una riga verde con il PDF, e il riquadro "firmato" torna in fondo.
- Liberatoria foto (punto 3.6): dopo la firma la scelta si vede nella scheda di Paolo (riga "📷 Foto: …"), in prima pagina
  del contratto (riquadro verde) e al punto 3.6 (voci su righe separate, scelta in grassetto "SCELTA DELL'ACQUIRENTE").

## Antiparassitari e calendario del primo anno (ottobre 2026)
- Salute: due sezioni nuove `health.pz` (Pulci e zecche) e `health.lf` (Leishmania e filaria, con `kind`: ple/pfi/vle/test),
  campi `date, prod, prod_en, next, file`. Anche nell'inserimento rapido (siringa). `HA(d,k)` crea la lista se manca.
- Calendario deciso da Paolo: richiamo vaccino a 3 mesi e annuale a 1 anno; 1° aprile avviso "stagione a rischio";
  antirabbica, leishmania e sverminazione a discrezione del proprietario e del suo veterinario (non in calendario).
  In più le "prossime dosi" che Paolo scrive (vaccini, pz, lf) che cadono nel primo anno. Solo per il proprietario.
- Pagina del proprietario, in cima alla Salute: `calBox` con le scadenze future e il tasto che apre
  `GET /api/public/<token>/cal?dog=<id>` → file .ics con due avvisi per evento (giorno prima 9:00, giorno stesso 9:00).
  La logica delle scadenze è in `calEvents()` (pagina) e in `functions/api/public/[token]/cal.js` (server): tenerle uguali.
  Per Android senza import .ics: link Google Calendar uno per uno.
- Scelta di Paolo: "Pulci e zecche" solo per i cuccioli che cede fino al primo anno di vita (`pupYear`: Frontline spray),
  insieme alla guida per il proprietario; per tutti gli altri cani resta com'era ("Leishmania e filaria" sui suoi cani).
  Ogni sezione compare comunque se ha già delle voci. Il proprietario non riceve un registro ma
  la "Guida al primo anno" con i promemoria: il libretto lo aggiorna il suo veterinario, dopo il primo anno non arriva più nulla.
- Pagina del proprietario larga fino a 1240px su computer e tablet (prima 900px), dati del cane su una riga; telefono invariato.
- Contratto versione `2026-10b`: nuovo punto **4-bis** "Pagamento del saldo e riserva di proprietà" (artt. 1376, 1523, 1460,
  1385 c. 2 c.c.), anche tra le clausole approvate (1341–1342). I contratti hanno `snap.ver`: le voci di `CT` con 4° elemento
  (versione minima) compaiono solo dalla versione indicata in poi (`ctCT`), così i contratti già firmati non cambiano testo.
- Salute a riquadri colorati che si aprono (`details.hs.c-<voce>`): da chiusi mostrano icona, titolo, numero di voci,
  ultima data e prossima scadenza; dentro l'elenco e "Aggiungi". Uguale nella pagina del proprietario (senza "Aggiungi").
  I riquadri aperti restano aperti dopo un aggiornamento (`hsOpen`).
- Colori ovunque (scelta di Paolo): `colorize(root)` dopo ogni render, nei riquadri (sheet) e nella pagina del proprietario
  dà a ogni titolo h2 un'icona e un colore secondo il testo (tabella `CZ`, IT/EN) e una striscia colorata al riquadro sotto.
  Nuove sezioni: aggiungerle a `CZ`.

## Accoppiamenti (ottobre 2026)
- Due tendine: Femmina = fattrici attuali (`mateFemales`: F, non esterne, fattrice o `fattr`, non sterilizzate/decedute);
  Maschio = maschi vivi in archivio (`mateMales`: non deceduti, 1–12 anni, o aggiunti da SBT), in ordine alfabetico,
  divisi "I tuoi maschi"/"Stalloni in archivio". Accanto a ogni maschio il COI con la femmina scelta (`pairCoi`):
  SBT se c'è (analisi della cucciolata o valore inserito), altrimenti Wright solo se antenati inseriti ≥70%, se no
  "COI non affidabile". Pallini: 🟢 6–9% · 🔵 sotto · 🔴 sopra · ⚪ non affidabile.
- Sotto: la coppia (COI, fascia, su chi cade, test genetici, "Pianifica la cucciolata" o "Scheda della cucciolata").
- "Aggiungi un maschio da SBT": `GET /api/sbt?id=` (solo Paolo) prova a leggere nome, nascita e genitori dalla meta
  description della pagina SBT; se SBT blocca, il gestionale chiede solo il nome e salva il link (`sbtAdded:true`).

## Solo consultazione (ottobre 2026)
- Variabile Cloudflare Pages `VIEWERS` = email separate da virgola: chi entra con quelle email (e passa Cloudflare Access)
  è "viewer": `GET /api/data` gli dà `viewerData` (proprietari solo col nome, niente contratti, documenti privati,
  firma) e `role:"viewer"`; PUT dati, upload, contratti, SBT, import rispondono 403. I file (foto, PDF) li può leggere.
- Nell'interfaccia (`RO`): niente scheda Proprietari, niente tasti che modificano (`RO_OK` = azioni permesse:
  aprire, filtrare, simulare accoppiamenti), banner "Solo consultazione", `saveNow` non salva. `roClean()` dopo ogni render.
- Paolo resta "admin" perché la sua email non è in `VIEWERS`.
- Navigazione: `navPush()` alla fine di `render()` mette ogni pagina (tab+cane) nella cronologia del browser; aprire un
  riquadro (`sheet`) aggiunge un passo; il tasto "indietro" chiude prima il riquadro, poi torna alla pagina precedente
  (`popstate`). Le foto (link a immagini) si aprono sopra la pagina (`#lbx`) e si chiudono con la X o con "indietro".
- Pagina del proprietario, Pedigree (scelta A di Paolo): niente albero con le foto, ma le schede di Padre e Madre con la
  loro foto (`d.photo`), LOI, colore, anno e test (`ovParents`) e il riquadro "La cucciolata su SBTpedigree" se la
  cucciolata ha `sbtUrl` (si inserisce dalla Scheda della cucciolata). Anche nella scheda di Paolo: genitori + link SBT, e l'albero a 4 generazioni dentro un riquadro richiudibile (per completare gli antenati).

## Calori, monte e parto previsto (ottobre 2026)
- Solo fattrici di Paolo (`isFattrice`): `d.repro=[{t:"heat"|"prog"|"mating"|"visit",date,val,sire,kind,note}]`, sezione
  "Calori e monte" (`reproHtml`) prima della Salute. In gravidanza (prima monta dopo l'ultimo calore, nessuna cucciolata
  nata dopo, entro 75 giorni): parto previsto = monta + 63, tappe ecografia +25, radiografia +55, cassa parto +56,
  finestra +58→+68. Fuori gravidanza: prossimo calore = ultimo + media degli intervalli (default 180 giorni).
  In Cucciolate la cucciolata pianificata mostra la riga della gravidanza (`pregLine`).
- Il tasto "‹ …" in cima alle schede torna alla pagina da cui si è arrivati (`NAVSTACK` + `history.back()`), con la
  scritta giusta (es. "‹ Cucciolate", "‹ Laran") e lo stesso punto di scorrimento e filtro; se non c'è una pagina
  precedente va all'elenco.
- Le tendine (`details`) dell'elenco restano aperte o chiuse come lasciate (`DOPEN`, chiave tab+cane+filtro+titolo),
  anche tornando indietro; il tasto in alto dice anche il filtro (es. "‹ Prenotati").
- "Calori e monte" è un riquadro a tendina (`details.hs.c-rep`), chiuso: da chiuso mostra "In gravidanza · giorno … ·
  parto previsto …" oppure "Prossimo calore previsto: …".

## Nascita e peso dei cuccioli (ottobre 2026)
- Cucciolata: `l.birth={type,start,note}`; cucciolo: `birthOrder, birthTime, collar (colore), birthWeight, weights:[{date,g}]`.
- Scheda della cucciolata → "Nascita e crescita": tabella, "Modifica la nascita" (`bForm`), "⚖️ Pesata" (`wForm`: tutti i
  cuccioli in una schermata, giorno scelto, differenza dall'ultima pesata, rosso se cala) e grafico (`growthSvg`, linee col
  colore del collarino). Scheda del cucciolo e pagina del proprietario: grafico solo di quel cucciolo (`growthDog`).
- Il grafico compare solo con almeno 3 pesi (nascita compresa): con meno dati non si mostra, né a Paolo né al proprietario.

## Foto settimana per settimana (ottobre 2026)
- Cucciolo: `d.wphotos=[{file,date,cap}]` (sezione "Foto della crescita" nella scheda: "Aggiungi foto", anche più insieme;
  tocco = modifica data/frase o elimina). Cucciolata: `l.gphotos` = foto di gruppo; nella Scheda della cucciolata
  "Foto della cucciolata": scegli più foto e per ognuna il cucciolo o "Tutta la cucciolata" (`wpAssign`).
- Settimana di vita = giorni dalla nascita / 7 + 1 (`weekOf`). Pagina del proprietario: "<nome> settimana per
  settimana" con le sue foto e quelle di gruppo ("Con i fratelli"), dalla più recente; foto a tutto schermo.

## Lista d'attesa (ottobre 2026)
- Scheda del menu "Attesa" (`tab="attesa"`, `waitList`): `D.waitlist=[{id,created,name,email,phone,city,country,sex,exp,note,
  source,litter,status,depDate,dog,lang}]`, divisa per cucciolata (pianificate/nate da poco + "Prossima cucciolata,
  qualsiasi"). Stati: new, contacted, deposit, assigned, dropped. "Assegna un cucciolo" crea il proprietario (con link
  privato) e lo collega al cucciolo come prenotato. Caparra: solo la data.
- Modulo del sito (repo delpiccolodiavolo-hugo, `layouts/partials/prenota.html`): oltre allo script Google manda una copia a
  `POST /api/public/richiesta` (pubblico, solo aggiunta, anti-spam col campo "azienda") → tabella D1 `requests`.
  All'apertura il gestionale legge `GET /api/requests` e aggiunge le nuove come "Nuovo" (`wlSync`, id = rid, mai doppie).

## Lista d'attesa (ottobre 2026)
- `D.waitlist=[{id,created,name,email,phone,city,country,sex,exp,note,source,litter,status,depDate,dog,lang}]`, menu "Attesa".
- Il modulo del sito (`layouts/partials/prenota.html` in `zonerosse/delpiccolodiavolo-hugo`) manda ogni richiesta sia al foglio Google
  (Apps Script) sia a `POST /api/public/richiesta` → tabella D1 `requests`; all'apertura il gestionale le prende (`wlSync`, `GET /api/requests`).
- Le richieste vecchie del foglio Google sono state importate una volta (ottobre 2026) con un file "Importa modifiche" (`patch.waitlist.$add`).

## Passaggio di proprietà e consegna (ottobre 2026)
- Modulo **del Comune di Ostellato** (= modulo regionale ER): scansione in `public/modulo-cessione.jpg` (1240×1754, 150 dpi).
  Scelta di Paolo: si usa il foglio vero del Comune, il gestionale ci scrive sopra dati e firme (`PP_POS`: posizioni in pixel
  dell'immagine a 827×1169 + larghezza utile; il testo si rimpicciolisce da solo se non ci sta).
- Scheda del cucciolo (allevato, con proprietario, non esterno: `ppOn`): riquadro "Passaggio di proprietà" (`ppBox`) →
  "Compila e firma" (`ppForm`): data della cessione (va anche nelle due "Data"), dati dell'acquirente presi dal contratto firmato
  (`CONTR[id].buyer`, se no dal proprietario) e modificabili, luogo e data di nascita dell'acquirente a mano, firma di Paolo
  (quella salvata, `D.settings.sellerSig`) e dell'acquirente **con il dito sul telefono di Paolo alla consegna** (scelta A).
- `ppGo` crea il PDF (jsPDF) e lo mette nei documenti del cucciolo `{title:"Passaggio di proprietà firmato",pp:true,private:false}`:
  **lo vede anche il proprietario** (scelta di Paolo). "Rifai" sostituisce il PDF precedente. `d.pp={date,at}`.
- I dati dell'acquirente (cod. fisc., nascita) **non** si salvano nel gestionale: stanno solo nel PDF.
  I dati di Paolo per il modulo (`D.settings.ppMe={cf,bplace,bdate}`) si scrivono la prima volta; `viewerData` toglie `settings`
  e i documenti `pp`. Fotocopie dei documenti d'identità: fuori dal gestionale (regola 6), le allega Paolo.
- "Consegna" (`kitBox`, solo Paolo): spunte `d.kit=[bool×3]` per `KIT` (Kit puppy Farmina, libretto veterinario, certificato di
  buona salute). Pagina del proprietario: "Cosa ricevi con <nome>" (`kitOwner`), sempre l'elenco completo (scelta C).
- Proprietario: campi `bplace` (luogo di nascita) e `bdate` (data di nascita), nel modulo "Modifica proprietario"; precompilano
  "Nato a / Il" dell'acquirente nel passaggio di proprietà. Non vanno nella pagina del proprietario né a chi consulta.
  "Importa modifiche" con `{nascite:[{dog,name,bplace,bdate}]}` (`importNascite`): trova il proprietario dal nome del cane, se no
  dal suo nome (anche con nome e cognome invertiti), chiede conferma e scrive i due campi.
- `saveOwner` ora **unisce** i campi (`Object.assign`) invece di ricreare il proprietario: prima perdeva `token` (link privato),
  `cf` e `doc` a ogni "Salva proprietario".
- Barra in basso sul telefono: 5 voci su una riga (`repeat(5,minmax(0,1fr))`); lì "Accoppiamenti" si chiama **"Coppie"**
  (scelta B di Paolo), nella barra laterale del computer resta "Accoppiamenti". Nuove sezioni: ripensare la barra.

## Conti delle cucciolate (ottobre 2026, solo Paolo)
- Menu "Conti" (`tab="conti"`, `contiPage`): in cima totali dell'anno (entrate, spese, saldo; anni da scegliere se più d'uno),
  poi le cucciolate di quell'anno (della fattrice di Paolo, non esterne) e "Spese generali". `view` = id cucciolata o `"gen"`.
- Dati: `D.litters[lid].acc={prices:{<id cucciolo>:numero},exp:[{id,date,cat,txt,amt,file}]}`, `D.accGen=[…]` (spese generali).
  Entrate = una riga per cucciolo (`litPups`), prezzo scritto a mano (scelta di Paolo, non dai contratti). Spese con voce
  (`AC_CAT`; nelle Spese generali `AC_GEN`: Crocchette, Vaccini, Visite, Terapie, Altro), descrizione, importo e foto della ricevuta facoltativa (immagine ridotta con `shrink`, o PDF; va su R2 al salvataggio).
  Anno di una cucciolata = data di nascita, se no prima spesa, se no oggi.
- Riservati: `ownerSubset` toglie `acc` dalle cucciolate, `viewerData` toglie `acc` e `accGen`; per chi consulta la voce "Conti"
  non c'è.
- Barra in basso sul telefono: se le voci sono più di 5, le prime 4 + **"Altro"** con menu a tendina per le altre (Attesa, Conti
  e le prossime): scelta di Paolo. Sul computer la barra a sinistra le mostra tutte.
- Tasto indietro: chiudere un riquadro (sheet) lasciava un passo doppio nella cronologia e "‹" sembrava non funzionare; ora il
  passo doppio si salta da solo (`popstate`).
