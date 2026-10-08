# CLAUDE.md – Gestionale allevamento

Istruzioni per chi (Claude o uno sviluppatore) modifica questo programma.

## Com'è fatto
| Pezzo | Dove |
|---|---|
| Pagine | `public/index.html` (allevatore), `public/proprietario.html` (famiglia), `public/coppia.html` (coppia condivisa). HTML/CSS/JS in un file, nessun build |
| API | `functions/` (Cloudflare Pages Functions) |
| Dati | D1, binding `DB`: tabella `store` (riga `main` = tutto il gestionale in JSON + `version`), `history`, `daily` (copie), `contracts`, `requests`, `gbp` (impostazioni del server), `wa` |
| File | R2, binding `FILES`: nei dati compaiono come `/files/<chiave>` |
| Accesso | Cloudflare Access (`POLICY_AUD`, `TEAM_DOMAIN`); bypass su `/p` e `/api/public` |

- `index.html` e `proprietario.html` contengono **lo stesso blocco di codice**: ogni modifica va fatta identica nei due file.
- Nessun dato dell'allevamento nel codice: nome, titolare, indirizzo, telefono, email, sito e razza si leggono sempre con
  `FM()` nelle pagine e `farmOf(data)` nel server (da `settings.farm`, ⚙️ Account → Allevamento).
- Permessi: `who()`, `can()`, `limitedData()`, `mergeLimited()` in `functions/_lib.js`; ogni persona ha per ogni sezione
  0 (no), 1 (vede), 2 (modifica). Non indebolire mai questi controlli né il controllo di versione del salvataggio.
- La pagina della famiglia riceve solo `ownerSubset()`: mai note, documenti privati, altri cani o altre famiglie.

## Regole
1. I dati inseriti non devono mai andare persi: niente cambi di formato incompatibili; un campo nuovo parte vuoto.
2. Codici fiscali e documenti d'identità solo per l'allevatore: mai nella pagina delle famiglie.
3. Mai dati veri (cani, persone, foto, chiavi) nel repository.
