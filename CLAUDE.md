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
6. **Codici fiscali e documenti d'identità dei proprietari** (regola cambiata da Paolo, ottobre 2026): si tengono nel gestionale
   **solo per Paolo** (`owners[id].cf`, `.doc`, `.bplace`, `.bdate`, `.ids`; i suoi in `settings`): mai nella pagina del proprietario,
   mai a chi consulta (`ownerSubset` manda solo i campi elencati, `viewerData` riduce i proprietari al nome e toglie `settings`).
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
- I dati dell'acquirente scritti nel modulo non si salvano a parte: stanno nel PDF (nascita: da `owners[id].bplace/bdate`).
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

## Documenti d'identità e invio all'anagrafe (ottobre 2026)
- Proprietario: riquadro "Documenti d'identità" nella sua scheda (`idsHtml("o:"+id)`), foto (ridotte con `shrink`) o PDF in
  `owners[id].ids=[{id,title,fname,date,file}]`; quello di Paolo in `settings.myIds` (riquadro nella Scheda della cucciolata).
  "Importa modifiche" con `{documentiIdentita:[{dog,name,files:[{title,fname,file}]}]}` (`importIds`, stessa ricerca di `importNascite`).
- Scheda della cucciolata → "Passaggi di proprietà" (`ppLitBox`): cuccioli con proprietario, stato (firmato / da firmare),
  documenti presenti o no, avviso se manca qualcosa. "Scarica i 2 PDF" / "Prepara l'email all'anagrafe" (`ppPack`): con pdf-lib
  (`public/pdf-lib.min.js`, servito dal gestionale, niente CDN) unisce tutti i passaggi firmati in un PDF e fa un secondo PDF con i
  documenti (Paolo per primo, poi gli acquirenti nello stesso ordine; pagina "non ancora caricato" se manca).
  Sul telefono: `navigator.share` con i 2 PDF e il testo (l'indirizzo viene copiato negli appunti: la condivisione non può
  riempire il destinatario). Sul computer: scarica i 2 PDF e apre `mailto:` con oggetto e testo.
  Indirizzo: `settings.anagrafeEmail`, di base p.toselli@comune.ostellato.fe.it (dal sito del Comune), "cambia" nel riquadro.
- Proprietari stranieri (`lang:"en"`): firmano solo il modulo italiano (scelta di Paolo). In "Compila e firma" c'è il riquadro
  "🇬🇧 For …" con la spiegazione (`PP_WHY`); dopo la firma nei documenti del cucciolo va anche la traduzione inglese
  (`ppEnPdf`, `pp_en:true`, "not to be signed"), visibile al proprietario, non a chi consulta.
- jsPDF si carica con `loadJsPDF()`: prima la funzione si chiamava `jspdf` e lo script di jsPDF la sovrascriveva
  (`window.jspdf`), così dal secondo PDF nella stessa sessione (contratti o passaggi) non funzionava più.
- La firma salvata (`settings.sellerSig`) dopo il salvataggio è un file `/files/…`: per i PDF va passata da `toDataURL`.

## Certificati di iscrizione all'anagrafe (ottobre 2026)
- Il veterinario accreditato iscrive i cuccioli in ARAA e rilascia per ognuno la "Dichiarazione / Certificato di identificazione e
  registrazione" (Comune di Ostellato). Non si mandano all'anagrafe con i passaggi (l'iscrizione l'hanno già).
- Scheda della cucciolata → "Iscrizione all'anagrafe" (`iscBox`): cuccioli con microchip e ✅ Iscritto / Manca il certificato;
  "Carica certificati" (più file) → per ogni file il cucciolo o "Tutta la cucciolata" (`iscSave`). Nei documenti del cucciolo:
  `{title:"Certificato di iscrizione all'anagrafe",isc:true,private:false}`: **li vede il proprietario** (scelta B di Paolo),
  non chi consulta (`viewerData` toglie `isc`).
- "Importa modifiche" con `{certificatiIscrizione:[{name,owner,chip,sex,date,fname,file}]}` (`importIsc`): cerca il cucciolo dal
  microchip, poi dal proprietario, poi dal nome di chiamata nel nome o nel soprannome; scrive il microchip dove manca e avvisa se
  sesso o microchip non tornano.
- "Importa modifiche" con `{aggiungiAlCane:[{chip,name,owner,vacc:[…],docs:[…]}]}` (`importAdd`): aggiunge vaccinazioni
  (`health.vacc`, con `HA`) e documenti al cane trovato come in `importIsc`, senza doppioni (vaccino: data+prodotto; documento: fname).
  Usato per libretti e certificati di buona salute fotografati da Paolo.
- Riquadro "Certificati" (`certHtml`, `isCert`: `isc`, `cert` o titolo che inizia con "Certificat…") prima di "Referti e
  documenti", nella scheda di Paolo e nella pagina del proprietario. "Referti e documenti" non mostra più i certificati né i file
  delle vaccinazioni (restano in Salute → Vaccinazioni; scelta A di Paolo); sverminazioni ed esami delle feci con file sì.

## Spese per l'espatrio (ottobre 2026)
- Solo per i cuccioli che vanno all'estero (`abOn`: allevati, con proprietario `lang:"en"`): nella scheda di Paolo, sotto il
  contratto, riquadro "Spese per l'espatrio" (`abroadBox`) con la frase "Costi aggiuntivi per l'espatrio a parte, da quantificare
  man mano…"; il proprietario la vede in inglese nella sua pagina ("Costs for taking <nome> abroad", `abroadOwner`).
  Scelte di Paolo: solo la frase (niente elenco di importi), visibile anche al proprietario, solo per chi va all'estero.
- `d.abroad={it,en}` solo se Paolo cambia la frase ("Modifica la frase", `abEdit`/`abSave`); se manca valgono le frasi di base (`abTxt`).
- LOI mancante sui cani allevati da Paolo (non esterni): nella scheda "In attesa N. LOI" (si tocca per inserirlo, come prima);
  nella pagina del proprietario "In attesa N. LOI" / in inglese "Pending – available after ENCI registration". Appena si scrive il
  numero in Modifica, compare quello.

## Link ai proprietari (ottobre 2026)
- Scheda della cucciolata → "Link ai proprietari" (`linkBox`): per ogni cucciolo con proprietario i bottoni **WhatsApp** (wa.me con
  il numero e il messaggio già scritto), **Email** (mailto con oggetto e testo) e "Copia link"; messaggio in inglese per i proprietari
  `lang:"en"` (`lkMsg`). Dopo l'invio `owners[id].linkSent` = data → "✔ mandato il …". Scelte A B A di Paolo.
  Numero: `lkPhone` (toglie + e 00, aggiunge 39 ai numeri italiani senza prefisso). Bottone disattivato se manca telefono o email.

## Visualizza / Scarica (ottobre 2026)
- Ogni file (voci di Salute, Certificati, Referti e documenti, referto DNA, documenti d'identità, certificati di iscrizione,
  passaggio di proprietà) ha due bottoni (`fBtns`): **Visualizza** (foto sopra la pagina con `#lbx`, PDF in una scheda) e
  **Scarica** (`class="fb-dl"`, con `download`; il visualizzatore di foto la lascia passare). Anche nella pagina del proprietario
  ("View" / "Download"). Scelta B di Paolo. Prima i link scaricavano soltanto.
- Chiudere una foto con la X fa `history.back()`: `LB_BACK` fa ignorare quel `popstate`, altrimenti la regola del passo doppio
  riportava alla pagina precedente.
- Testi delle firme (scelta di Paolo): ovunque si firma c'è scritto "col dito dal telefono, col mouse dal computer" (contratto per
  Paolo e per il proprietario, prima e seconda firma, passaggio di proprietà, messaggio WhatsApp del contratto; in inglese "with your
  finger on a phone, with the mouse on a computer"). La frase nel PDF dei contratti firmati ("firma con il dito") non è cambiata.

## Esposizioni (punto 7, ottobre 2026)
- Scheda di ogni cane → "Esposizioni" (`showsBox`), prima di "Titoli": riepilogo (uscite, CAC, CACIB, BOB, Eccellente), una scheda per
  esposizione (`shCard`) con data, tipo, nome e luogo, giudice, classe, qualifica, classifica, titoli presi, giudizio scritto e foto
  del giudizio (Visualizza/Scarica). "＋ Aggiungi esposizione" / "Modifica" (`shForm`, elenchi `SH_TP`, `SH_CL`, `SH_Q`, `SH_TI`).
- `d.shows=[{id,date,type,name,judge,cls,qual,rank,titles,text,file,fname,own,web,inSite}]`. Due interruttori per esposizione:
  **Proprietario** (`own`, parte spento: scelta di Paolo) e **Sul sito** (`web`). I titoli presi compaiono anche in "Titoli" (`shTitles`).
- Proprietario: `showsOwner` mostra solo quelle `own` (in inglese per i proprietari stranieri, `SH_EN`); `ownerSubset` gli manda solo
  quelle (`o.shows.filter(x=>x.own)`).
- Sito: `GET /api/public/esposizioni` (functions/api/public/esposizioni.js) → risultati `web` senza giudizio né foto, CORS per
  delpiccolodiavolo.it, cache 60 s. "🌐 Prepara per il sito" (`shPrep`, nel riquadro di ogni cane) scarica
  `delpiccolodiavolo-esposizioni.zip` con `data/esposizioni.json` (zip fatto in casa, `zipStore`) e segna `inSite`.
  Il sito mostra i risultati nel Palmarès e sotto ogni cane in Femmine/Maschi (vedi CLAUDE.md del repository del sito).

## Scadenze (punto 8, ottobre 2026)
- Voce "Scadenze" (`tab="scadenze"`, sul telefono in Altro; non per chi consulta): tutte le cose da fare in ordine di data,
  gruppi Scadute / Questa settimana / Prossimi 30 giorni / Più avanti, filtri Salute, Calori e parti, Cuccioli, Esposizioni.
  Tocco su una riga → scheda del cane. Calcolo in `scEvents()`:
  - Salute dei cani di Paolo (`scMine`: non esterni, senza proprietario, non ceduti/deceduti) e dei cuccioli ancora prenotati
    (`scPup`, ≤ 180 giorni): voci con data futura, "prossima dose" (`next`), e per i cani di Paolo le date **suggerite** (scelta B),
    con le regole di Paolo: **vaccino** (ultimo + 365) e **vaccino leishmania** (`lf` tipo `vle`, + 365) solo per i cani "attivi"
    = fattrici (`isFattrice`) o con un'esposizione negli ultimi 12 mesi o in programma (i cani anziani, sterilizzati, a casa non si
    vaccinano); **prevenzione leishmania mai** (a Ferrara non c'è); **prevenzione filaria** (`pfi`, NexGard Spectra) e pulci/zecche
    ultima + 30 solo se cade tra aprile e novembre; vermifugo ultimo + 90. Leishmania e filaria si ragionano per tipo
    (chiavi `lf:pfi`, `lf:vle` in `scSkip`/`scMove`).
  - Cuccioli prenotati: richiamo del vaccino a 3 mesi (sparisce con un vaccino dal 70° giorno). Nessuna consegna (scelta di Paolo).
    Le scadenze uguali dei cuccioli della stessa cucciolata diventano una riga ("8 cuccioli Billy × Black Jack").
  - Fattrici (`reproState`): parto previsto (monta + 63) e tappe (ecografia +25, radiografia +55, cassa parto +56), oppure
    prossimo calore previsto. Esposizioni con data da oggi in poi.
  - Una scadenza passata resta finché non si registra la cosa fatta (scelta B): `scDone` = voce dello stesso tipo con data da 7
    giorni prima della scadenza in poi; il calore e il parto si aggiornano da soli con un nuovo calore o la cucciolata nata.
- Telefono: "Aggiungi al telefono" (`scPhone`) crea `settings.calToken` e mostra il link `/api/public/scadenze/<token>.ics`
  (iPhone: `webcal://`; Google: "Da URL"). `functions/api/public/scadenze/[token].js` serve `settings.scad`, che `scSync()`
  riscrive a ogni salvataggio e all'apertura del gestionale. Avviso alle 9 del giorno prima.
- Aggiungere e togliere dalle Scadenze (scelte B A di Paolo): "＋ Aggiungi scadenza" (`scAddF`/`scAdd`): cane (o "Tutti i cuccioli
  …", o nessun cane = promemoria dell'allevamento in `settings.todo`), tipo, data, descrizione. Vaccino/vermifugo/antiparassitari
  → `d.todo=[{id,k,date,text}]` (in Salute compare "📌 In programma", `scPlanned`); Esposizione → nuova voce in `d.shows`;
  Altro → promemoria (`k:"memo"`).
- Tocco su una scadenza (`scAct`): **Fatto…** apre il modulo della Salute già compilato (stesso prodotto dell'ultima volta o del
  promemoria; per i cuccioli spunta "tutta la cucciolata"); al salvataggio `scAfterDone` toglie il promemoria. **Sposta la data**
  (`scMove`: voce futura, prossima dose, suggerita → `d.scMove`, richiamo dei cuccioli, esposizione, promemoria). **Non serve**
  sulle suggerite → `d.scSkip[tipo]=true`, non torna più per quel cane (in fondo alla pagina "Suggerimenti tolti" → Riattiva).
  **Elimina** per quelle scritte da Paolo. Calore e parto si cambiano solo da "Calori e monte".

## Regole ENCI (punto 9, ottobre 2026)
- Fonte: Norme tecniche del Libro genealogico in vigore dal 1/9/2023 (DM 116130 del 22/2/2023) + codice etico ENCI. Paolo ha scelto
  limiti più prudenti: **18 mesi** di età al parto e **180 giorni** tra due parti (`EN_AGE`, `EN_GAP`); l'ENCI chiede 16 mesi e 170 giorni.
- `enciCheck(fattrice, maschio, dataMonta)` → righe 🟢 ok / 🟠 warn / 🔴 bad / ℹ️ info: età al parto (monta + 63), giorni dall'ultimo
  parto, numero di cucciolate (certificato veterinario di idoneità prima della monta dai 7 anni o con già 5 cucciolate; codice
  etico: massimo 5), parentele vietate (genitore/figlio, fratelli pieni, mezzi fratelli), 2° calore (dai calori in "Calori e monte").
- Dove: **Accoppiamenti** (riquadro "📋 Regole ENCI" con la data di monta ipotizzata, `MATE_DT`; di base la monta in corso, il
  prossimo calore + 12 giorni o oggi + 30), **scheda della fattrice** dentro "Calori e monte" (`enciFattr`: età, cucciolate, prossimo
  parto possibile, certificato), **cucciolate pianificate** (`enciLitLine`, con la monta in corso o "se la monta fosse oggi"),
  **Scadenze**: Modello A (nascita + 25) e Modello B (nascita + 90) per le cucciolate nate negli ultimi 180 giorni; "Fatto:
  consegnato oggi" scrive `l.enciA` / `l.enciB`.
- Accoppiamenti: i maschi **non permessi dall'ENCI** per parentela con la fattrice (`enciRel`: genitore/figlio, fratelli pieni, mezzi
  fratelli) non compaiono nell'elenco "Maschio"; una riga dice quanti sono, con "mostrali" (`MATE_NO`) che li mette in fondo nel
  gruppo "🚫 Non permessi dall'ENCI" con il motivo. Nessun filtro sul COI (l'ENCI non ha limiti di COI; restano i colori). Scelte A A.

## Copie di sicurezza automatiche (punto 11, ottobre 2026)
- Tabella D1 `daily` (si crea da sola, `ensureDaily`): al **primo salvataggio di ogni giorno** (giorno italiano) `PUT /api/data`
  mette da parte com'era il gestionale **prima** di quel salvataggio (`dailyCopy`); si tengono **90 giorni** (scelta di Paolo).
  Resta anche la tabella `history` (ultimi 200 salvataggi).
- "Copia di sicurezza" nella fascia in alto apre il riquadro **💾 Copie di sicurezza** (`bkSheet`): "Scarica una copia adesso"
  (scrive `settings.lastDl`) e l'elenco delle copie automatiche (`GET /api/backups`) con **Scarica** (`?day=`) e **Ripristina**
  (`POST /api/backups {day}`: prima salva la situazione attuale come copia "prima del ripristino", poi sostituisce i dati e la
  pagina si ricarica). Solo Paolo (`isAdmin`). Foto e documenti restano su R2: la copia contiene i dati e i collegamenti.
- Scadenze: una volta a settimana "Scarica la copia di sicurezza sul computer" (`src:"bk"`, `settings.lastDl` + 7 giorni);
  "Fatto" la scarica subito.

## Cucciolate sul sito (punto 10, ottobre 2026)
- Scheda della cucciolata → "Sul sito" (`cuBox`): interruttore `l.web` e "🌐 Prepara per il sito" (`cuPrep`): zip
  `delpiccolodiavolo-cucciolate.zip` con `data/cucciolate.json` e le foto dei genitori in `static/images/cucciolate/`; segna `l.inSite`.
- `GET /api/public/cucciolate` (functions/api/public/cucciolate.js, `siteLitters` in _lib.js) e `…/cucciolate/f/<chiave>` (solo
  le foto dei genitori delle cucciolate "Sul sito"). Sul sito: genitori con foto, test e titoli in IT/EN/DE (`tests_en`, `tests_de`,
  `titles_en`, `titles_de`; se mancano, italiano), genitori dei genitori, SBT; etichetta Disponibili (c'è un cucciolo senza
  proprietario e senza stato prenotato/ceduto/deceduto/in casa) / Non disponibili / In programma; numero di cuccioli. Mai note né
  proprietari; niente cuccioli singoli né prenotazioni (scelte di Paolo). `cuItems()` nella pagina = stessa logica di `siteLitters()`.
- Finestre (`.sheet`): sul computer larghe fino a 880 px (94% dello schermo); i campi dei moduli si stringono (`min-width:0`,
  `width:100%`) invece di far scorrere la finestra di lato (prima un elenco con nomi lunghi la allargava e tagliava i campi).
- "Importa modifiche" con `{coiTestMating:[{sire:{sbt,name},dam:{sbt,name},coi:"16,139"}]}`: trova i cani dal numero SBT (o dal
  nome) e scrive `D.matings["maschio|femmina"].coiSbt`, come la casella "COI SBT del test mating" in Accoppiamenti.

## Statistiche, richiesta di recensione, accesso di Daniela (ottobre 2026)
- **Statistiche** (`tab="statistiche"`, nel menu sotto Scadenze; non per chi consulta): cucciolate nate, cuccioli, media, maschi/
  femmine; tabelle per cucciolata, per fattrice, per stallone (`stPage`); titoli ed esposizioni dei cani allevati. Le cucciolate
  senza schede dei cuccioli: "Scrivi quanti" → `l.bornM` / `l.bornF` (`stLit`; scelta A di Paolo).
- **Recensione**: in "Link ai proprietari" il bottone "⭐ Chiedi recensione" (`lkRev`): WhatsApp (o email) con il link
  https://delpiccolodiavolo.it/chiedi-recensione/ (italiano/inglese), segna `owners[id].revAsked`. In Scadenze "Chiedi la recensione
  alle famiglie" a nascita + 88 giorni (60 + 4 settimane) per le cucciolate degli ultimi 180 giorni, finché non è chiesta a tutti o
  "Fatto" (`l.revDone`).
- **Ruolo "conti"** (Daniela, veronesi.daniela73@gmail.com): variabile Cloudflare Pages `CONTI` = email separate da virgola (e la
  stessa email nella policy di Cloudflare Access dell'app "gestionale"). `GET /api/data` le dà `contiData` (cucciolate con
  genitori, data, stato e `acc`; nomi di cuccioli e genitori; `accGen`; niente proprietari, note, documenti, impostazioni) e
  `role:"conti"`; `PUT /api/data` salva solo i Conti (`mergeConti`: `litters[*].acc` e `accGen`, il resto resta quello vero);
  `/api/upload` permesso (ricevute). Nella pagina (`CONTI`) c'è solo la voce Conti, senza Copia di sicurezza/Importa.
- Nome di chiamata in rilievo (stile C scelto da Paolo): sotto il nome nella scheda di Paolo e nella pagina del proprietario
  (`.nick-c`, grassetto colorato più grande) e nell'elenco Cani (`.nick-l`). Per i cuccioli è il nome dato dai proprietari
  (Rocco, Batman, Raya, Luce, Yuky); niente campo "aka".

## Modello B ENCI (ottobre 2026)
- `public/modello-b.pdf` = modulo originale ENCI F-7234_09 (4 fogli: dati + 12 cuccioli). I suoi campi sono difettosi (fogli 3 e 4
  con gli stessi nomi), quindi si tolgono campi e annotazioni e si scrive sopra con pdf-lib alle posizioni `MB_POS` (p0 = foglio 1,
  slots = 12 cuccioli). `mbBuild(lid)`: allevatore (Paolo, CF da `settings.ppMe`), razza, data di nascita, fattrice e stallone (LOI
  "LO…" → ROI, microchip a caselle), proprietario dello stallone (dalla scheda o dalle note "Proprietaria: …", modificabile),
  cuccioli (prima i maschi) con nome, sesso, microchip, mantello e dati del nuovo proprietario (indirizzo letto da `mbAddr`),
  totale fogli 4, data, consensi presto/presto/nego, firma di Paolo (`settings.sellerSig`) sulle due righe del foglio 1 e su
  "Firma dell'allevatore" del foglio 4. "Somma €" e "L'allevatore è" restano vuoti salvo scelta nella finestra (`l.modB.status`).
- Finestra `mbForm`: controllo dei dati mancanti (`mbCheck`), Visualizza / Scarica / Invia per email / WhatsApp (sul telefono
  condivisione con il PDF allegato; sul computer scarica + mailto o wa.me) / ✔ Consegnato (`l.enciB`). Email e WhatsApp di
  destinazione in `settings.modB`.
- **Riquadro colorato in alto** (`mbBanners`) per le cucciolate nate da ≤ 120 giorni senza Modello B consegnato: nella prima pagina
  (Cani), in cima a Scadenze e in cima alla Scheda della cucciolata. Blu > 30 giorni, arancione 15–30, rosso < 15 o scaduto; barra
  dei 90 giorni. Anche la scadenza "ENCI Modello B" ha il bottone "📄 Prepara il Modello B".
- **Conto alla rovescia del Modello B sul telefono**: finché `l.enciB` è vuoto, `scEvents` aggiunge eventi `src:"mbcd"` (solo per il
  calendario, `phone:true`, non compaiono nella pagina Scadenze) ogni 4 giorni a ritroso dalla scadenza (nascita + 90) a partire da oggi,
  il giorno della scadenza e poi ogni 4 giorni per 4 settimane se è scaduto: "📄 Modello B ENCI: mancano N giorni". Con `al:"9"`
  il calendario avvisa alle 9 del giorno stesso (`TRIGGER:PT9H`), invece che il giorno prima.
- Codice a barre del microchip (scelta B di Paolo): `mbBarcode` disegna un Code 128 (`c128`, set C per le coppie di cifre) del
  numero di microchip nel riquadro "Spazio riservato alla applicazione del codice a barre" di ogni cucciolo (`MB_BOX`), con il
  numero sotto. Verificato con un lettore: si legge uguale al numero. Con il codice a barre le caselle "microchip N°" del cucciolo
  restano vuote, come chiede il modulo ("Non compilare in caso di applicazione etichetta codice a barre"); si compilano solo se
  il microchip manca o è troppo corto. Le caselle del microchip di fattrice e stallone si compilano sempre.


## Allarme sul telefono voce per voce (ottobre 2026)
- In Scadenze ogni riga ha il campanello 🔔 (`scBell`): chiede quando avvisare (scelta A di Paolo: il giorno prima alle 9, il giorno
  stesso alle 9, tutte e due), salva `settings.alarms[id]`, salva i dati e apre
  `/api/public/scadenze/<calToken>/ev?id=…&al=prima|giorno|tutte` (functions/api/public/scadenze/[token]/ev.js): un file .ics con un
  solo evento, che l'iPhone apre nel Calendario ("Aggiungi"). Campanello giallo + "🔔 sul telefono" se già messa.
  In alto resta "Aggiungi tutto al telefono" (abbonamento a tutto il calendario): usando tutti e due i modi gli eventi si doppiano.
- **Preavviso e ripetizione per ogni voce** (scelta A di Paolo, solo per quella voce): nel campanello si sceglie "Primo avviso"
  (il giorno stesso, 1, 3, 7, 14, 20, 30 giorni prima o un numero) e "Poi ripeti ogni" (mai, 1, 2, 3, 4, 7 giorni); la finestra mostra
  l'elenco degli avvisi. `settings.alarms[id]={pre,every}` (`alCfg`, `alDates`); ogni avviso è un evento a sé alle 9 ("⏰ …: mancano N
  giorni"), perché l'iPhone tiene al massimo due avvisi per evento. Vale per il campanello (`ev?id=&pre=&every=`) e per "Aggiungi
  tutto" (`scSync`). Se il Modello B ha un'impostazione sua, sostituisce il conto alla rovescia automatico ogni 4 giorni.

## Salva in Drive (ottobre 2026)
- Google Cloud: progetto `staffordshire-bull-terrier`, Google Drive API attivata, client OAuth web
  `1051634257234-j2bpevh0giietep68ntut2ece36usaf5.apps.googleusercontent.com` con origine `https://gestionale.delpiccolodiavolo.it`
  (`DRIVE_CLIENT`). Permesso `drive.file`: il gestionale vede solo i file che crea lui. Accesso con Google Identity Services
  (https://accounts.google.com/gsi/client), token in memoria (1 ora).
- Scheda della cucciolata → "Google Drive" (`drBox`) → "☁️ Salva in Drive" (`drSave`, solo col bottone: scelta A). Tutti i documenti
  (scelta di Paolo): contratti firmati, passaggi di proprietà (anche traduzione inglese), certificati di iscrizione, documenti
  d'identità dei proprietari, Modello B (rifatto e aggiornato ogni volta). Cartelle A e B: originale in
  "Del Piccolo Diavolo – Documenti/<AAAA-MM> <madre> × <padre>/<cucciolo> (<proprietario>)/", collegamento (shortcut) nelle cartelle
  per tipo. `settings.drive={folders,files}`: un file già salvato e non cambiato non si ricarica.

## Caparra e ricevuta (ottobre 2026)
- Bottoni del riquadro Caparra (scelta di Paolo): solo "💾 Salva" (prepara e salva la ricevuta tra i documenti privati del cucciolo,
  da lì Visualizza/Scarica) e "WhatsApp". Niente Visualizza/Scarica/Email nel riquadro.
- Interruttore "Condividi con il proprietario" sotto i bottoni (quando la ricevuta c'è): di base spento (`private:true`); acceso →
  `depShare:true`, `private:false`, la ricevuta compare nella pagina del proprietario. Rifacendo la ricevuta lo stato resta.
- Scheda del cucciolo (solo Paolo) → "Caparra" (`depBox`): bonifico e/o contanti, ognuno con importo e data; la data dei contanti è facoltativa (`d.dep={bon,cash}`). Rifacendo la ricevuta, quella nuova (con il totale aggiornato) sostituisce la vecchia.
  "Visualizza / Scarica / WhatsApp / Email" (`depGo`) prepara la **ricevuta di caparra confirmatoria** (art. 1385 c.c., come il
  contratto): dati di Paolo e dell'acquirente, totale in cifre e lettere (`numIt`), "di cui € … tramite bonifico il … e € … in
  contanti il …", cucciolo (nome, sesso, nascita, genitori, microchip), "In caso di rinuncia da parte dell'acquirente, la somma
  versata non viene restituita" + eccezione del cucciolo morto o malato (come l'art. 4), firma salvata, "Ricevuta tra privati: non è
  un documento fiscale". Proprietari stranieri (`lang:"en"` oppure paese diverso dall'Italia), scelta A di Paolo: un solo foglio, sopra il testo italiano che fa fede, una riga, sotto la traduzione inglese più piccola in grigio; firma una volta in fondo, nota "non è un documento fiscale" in tutte e due le lingue. La ricevuta va in `d.docs` con `dep:true` e
  **`private:true`** (scelta A di Paolo: NON compare nella pagina del proprietario; se e quando mandarla lo decide lui con WhatsApp/Email)
  e in Drive nella cartella per tipo "Ricevute caparra". Le ricevute fatte prima (private:false) diventano private da sole all apertura del gestionale (`loadAll`).

## PDF fatti con jsPDF: lettere speciali (ottobre 2026)
- I caratteri standard di jsPDF coprono solo l'Europa occidentale: con š, č, ž, ł (es. "Hriberšek", "davčna številka") il testo usciva
  spaziato e fuori pagina. `loadJsPDF()` restituisce un jsPDF "protetto": `text`, `splitTextToSize`, `getTextWidth` ricevono il
  testo senza segni (š→s, č→c, ł→l…). Vale per contratti, passaggi di proprietà (anche la traduzione) e ricevute di caparra.
- Ricevuta: per i proprietari stranieri "codice fiscale estero …" invece di "C.F." (in inglese "tax ID").

## RIEPILOGO DELLE SCELTE DI PAOLO (da rispettare; aggiornato al 3 ottobre 2026)
Regole di lavoro
- Prima di ogni modifica all'interfaccia: anteprima HTML autonoma, poi il codice solo dopo il suo ok. Le scelte le fa Paolo (opzioni
  A/B), Claude decide solo se Paolo lo chiede. Istruzioni semplicissime, percorso esatto; meglio un file da importare che cercare
  nelle schede. Zip del gestionale `gestionale-*.zip`, del sito `delpiccolodiavolo-*.zip`. Messaggi pronti in blocco di codice.
- Ogni zip contiene tutto (sostituisce i precedenti). Dopo Push: 2–3 minuti, poi riaprire il gestionale.
Dati e anagrafe
- Documenti d'identità dei proprietari solo per Paolo. Proprietari stranieri `lang:"en"`: pagina, messaggi e PDF in inglese.
- Nome di chiamata dei cuccioli = quello dato dai proprietari (Rocco, Batman, Raya, Luce, Yuky), in rilievo (stile C); niente "aka".
- LOI mancante dei cani allevati: "In attesa N. LOI". Spese per l'espatrio: solo la frase, visibile anche al proprietario straniero.
- Firma di Paolo (`settings.sellerSig`) su contratti, passaggi di proprietà e Modello B. Firme: "col dito dal telefono, col mouse dal computer".
- File: due bottoni "Visualizza" e "Scarica" ovunque.
Modello B ENCI
- Modulo originale compilato, firmato, 4 fogli sempre (totale fogli 4), consensi presto/presto/nego, "somma €" vuota, "L'allevatore è"
  nessuna casella salvo scelta nella finestra, codice a barre Code 128 del microchip al posto delle caselle del cucciolo.
- Riquadro grande e colorato in alto (prima pagina, Scadenze, Scheda della cucciolata), blu/arancione/rosso secondo i giorni.
- Conto alla rovescia sul telefono: avviso ogni 4 giorni alle 9 fino alla scadenza (e per 4 settimane dopo, se scaduto).
Scadenze e regole
- Date suggerite: vaccino e vaccino leishmania solo per fattrici e cani da expo; prevenzione leishmania mai (a Ferrara non c'è);
  prevenzione filaria (NexGard Spectra) e pulci/zecche ogni mese da aprile a novembre a tutti; vermifugo ogni 3 mesi.
  "Fatto" apre la Salute già compilata; "Non serve" non la suggerisce più per quel cane. Nessuna consegna dei cuccioli in Scadenze.
- Regole ENCI con limiti prudenti di Paolo: 18 mesi di età al parto e 180 giorni tra due parti (ENCI: 16 mesi e 170 giorni);
  avvisi anche del codice etico (2° calore, massimo 5 cucciolate). Maschi non permessi per parentela nascosti in Accoppiamenti
  (con "mostrali"); nessun filtro sul COI (fascia di Paolo 6–9% solo come colori).
- Recensione: bottone "Chiedi recensione" + promemoria 4 settimane dopo i 60 giorni.
- Allarmi sul telefono: per ogni scadenza col campanello 🔔, con giorni di preavviso e ripetizione scelti voce per voce (es. Modello B
  e vaccini con anticipo, perché servono appuntamenti); oppure tutto insieme.
Sito delpiccolodiavolo.it
- Esposizioni: interruttori "Proprietario" (parte spento) e "Sul sito"; sul sito niente giudizi né foto; titoli presi anche in "Titoli".
  Pagine: Palmarès e sotto ogni cane in Femmine/Maschi, IT/EN/DE.
- Cucciolate: solo quelle accese con "Sul sito"; genitori come nel Programma allevamento, etichetta Disponibili/Non disponibili/In
  programma, niente cuccioli singoli, niente prenotazioni né riquadro contatti; test e titoli tradotti in EN/DE (campi `_en`, `_de`).
- Sempre: "in automatico" + "Prepara per il sito" per il testo vero (Google e IA).
- Ricevuta della caparra: "caparra confirmatoria", non restituita in caso di rinuncia; bonifico e contanti anche insieme (data dei
  contanti facoltativa); firma salvata; solo dalla scheda del cucciolo; bottoni Salva e WhatsApp; di base privata, con l'interruttore
  "Condividi con il proprietario" per mostrarla nella sua pagina.
Accessi e copie
- Documenti firmati in Google Drive col bottone "Salva in Drive" (tutti i tipi, cartelle per cucciolata/cucciolo + collegamenti per tipo).
- Daniela (veronesi.daniela73@gmail.com, variabile `CONTI`): vede e modifica solo i Conti.
- Copie di sicurezza automatiche: una al giorno per 90 giorni, Scarica e Ripristina; promemoria settimanale per scaricarla sul computer.
- Statistiche nel menu sotto Scadenze; per le cucciolate senza schede si scrive quanti maschi e femmine sono nati.

## PDF appena creati: Visualizza e Drive (ottobre 2026)
- Ricevute, contratti e passaggi nascono come `data:application/pdf;base64,…` e diventano `/files/…` solo quando `saveNow` li
  carica su R2. Chrome apre i link `data:` con una pagina bianca: un gestore dei clic apre i PDF `data:` come blob.
- `depGo` aspetta il salvataggio e ridisegna; `drSave` prima finisce di salvare, perché `drItems` prende solo i file `/files/`
  (prima la ricevuta appena rifatta veniva saltata e in Drive restava la vecchia).
- Drive (ottobre 2026): le cartelle memorizzate in `settings.drive.folders` si controllano una volta per giro (`drAlive`): se sono
  cestinate o cancellate si ritrovano/ricreano. Un file sostituito (`drUpload` con `oldId`) viene spostato nella cartella del
  cucciolo se stava altrove; il collegamento nella cartella per tipo si rifà se manca.
- Drive: a ogni "Salva in Drive" anche i file già salvati vengono controllati (`drPlace`): il file deve stare nella cartella del
  cucciolo e il collegamento nella cartella per tipo ("Ricevute caparra", "Contratti"…); se manca o è cestinato si rifà, se è
  altrove si sposta. (Caso Maris, 03/10/2026: il collegamento in "Ricevute caparra" mancava.)

## Modello A ENCI (ottobre 2026)
- Modulo originale `public/modello-a.pdf` (F-7233_11, 2 fogli) compilato scrivendo sopra come il B (`maBuild`, posizioni `MA_POS`
  prese dai campi del modulo). Scelta di Paolo: precompilato con i suoi dati (sottoscritto, "controllabile presso", razza,
  Delegazione **Ferrara**, "Non è Socio ENCI", consensi presto/presto/nego, data, firma su foglio 1 e 2). Fattrice, stallone,
  monta (ultima "monta" in Calori e monte prima del parto) e cuccioli si aggiungono da soli quando ci sono. Dati del proprietario
  dello stallone oltre al nome: a mano. Fattrice non sua (es. Queen di Tevini): dati del proprietario e niente firma di Paolo.
- Riquadro "📄 Modello A ENCI" nella Scheda della cucciolata (`maBox`, sotto Google Drive): Visualizza, 💾 Salva (`l.modA.file`,
  `l.modA.saved`; va in Drive nella cartella per tipo "Modelli A"), ✉️ Email a gcferrarese@gmail.com, WhatsApp a Cristina
  338 214 1637 (`MA_TO`). Per la cucciolata di Billy non serve (scelta di Paolo).
- Riquadro "📄 Modello B ENCI" nella Scheda della cucciolata (`mbBox`, sotto quello del Modello A), sempre disponibile anche dopo
  "Consegnato" (sparisce solo l'avviso in alto): Visualizza, 💾 Salva (`l.mbFile`, `l.mbSaved`), Email e WhatsApp alla delegazione
  (se `settings.modB` è vuoto si usano i contatti di Ferrara `MA_TO`), ✏️ Altri dati (`mbForm`), ✔ Consegnato con scadenza.

## Passaggi di proprietà: conferma prima dell'email all'anagrafe (ottobre 2026)
- Indirizzo di base p.toselli@comune.ostellato.fe.it (o `settings.anagrafeEmail` con "cambia"). "✉️ Prepara l'email all'anagrafe"
  apre prima `ppMailAsk`: passaggi che partono (verde) e quelli non firmati che mancano (arancione), campo "Manda a" (un altro
  indirizzo vale solo per quella volta, `PP_TO`), "Sì, prepara l'email" (`ppMailGo` → `ppPack(lid,"mail")`) o Annulla.
- Bottoni "Scarica i 2 PDF" e "Prepara l'email all'anagrafe" sempre attivi (scelta B di Paolo): con 0 passaggi firmati compare
  l'avviso "Nessun passaggio firmato: non c'è ancora niente da mandare. Mancano ancora N passaggi da firmare." (`ppNone`).

## Scheda della cucciolata senza consanguineità (ottobre 2026)
- Scelta di Paolo: nella Scheda della cucciolata (`litterSheet`) della consanguineità resta solo il link di SBTpedigree. Tolti la
  scala COI, "Calcolo del gestionale (Wright)" e "Su chi cade la consanguineità". Accoppiamenti e pagina dei proprietari invariati;
  `l.sbtA` resta salvato.
