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
