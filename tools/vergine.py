"""Genera il gestionale "vergine" per altri allevatori (08/10/2026).

Parte da questo repository e scrive in build/vergine/ (e nello zip indicato) una copia:
- senza nessun dato dell'allevamento Del Piccolo Diavolo: valori di partenza vuoti (FARM_DEF, delegazione ENCI,
  anagrafe, Google Drive, repository del sito), contratto vuoto, intestatario unico "titolare";
- senza commenti nel codice (raccontano la storia di questo allevamento) e senza CLAUDE.md/LEGGIMI.md;
- con icone generiche, INSTALLA.md (per l'allevatore), LEGGIMI.md e un CLAUDE.md neutro.
Alla fine controlla che non resti nessuna parola della lista PROIBITE: se ne trova, si ferma con errore.

Uso:  python tools/vergine.py [percorso-dello-zip]
Serve Node.js con terser (npm i terser) per togliere i commenti dal JavaScript: cartella indicata da TERSER_DIR.
"""
import os, re, sys, shutil, subprocess, json, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "vergine")
TERSER_DIR = os.environ.get("TERSER_DIR", os.path.join(ROOT, "node_modules"))
ZIP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "build", "gestionale-vergine.zip")

SALTA = {"CLAUDE.md", "LEGGIMI.md", "tools/vergine.py", ".gitignore", "functions/api/public/budget.js"}
PROIBITE = r"Boldrini|Ostellato|4635584|463 5584|zonerosse|Chierici|Piccolo\s*Diavolo|piccolodiavolo|PiccoloDiavolo|Daniela|Veronesi|" \
           r"Cristina|gcferrarese|3382141637|toselli|Comacchio|1051634257234|\bPaolo\b|\bpaolo\b|Tikus|Maris|Brando|Tevini|" \
           r"delpiccolo|BLDPLA|VRNDNL|44020|Amerigo|Sottosopra|puntowebferrara"

def tracked():
    r = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True)
    return [f for f in r.stdout.splitlines() if f and f not in SALTA and not f.startswith("tools/vergine/") and not f.startswith("build/")]

def rep(s, old, new, f, count=None):
    n = s.count(old)
    if n == 0 or (count is not None and n != count):
        raise SystemExit(f"vergine.py: in {f} non trovo (o trovo {n} volte): {old[:80]!r}")
    return s.replace(old, new)

def rx(s, pat, new, f, flags=0):
    s2, n = re.subn(pat, new, s, flags=flags)
    if n == 0:
        raise SystemExit(f"vergine.py: in {f} nessuna corrispondenza per {pat[:80]!r}")
    return s2

FARM_VUOTO = '{name:"",first:"",last:"",street:"",num:"",cap:"",city:"",prov:"",provName:"",phone:"",prefix:"39",email:"",site:"",breed:"",since:""}'
FARM_VUOTO_JS = '{ name: "", first: "", last: "", street: "", num: "", cap: "", city: "", prov: "", provName: "", phone: "", prefix: "39", email: "", site: "", breed: "", since: "" }'

def pagina(s, f):
    s = rx(s, r'const FARM_DEF=\{[^}]*\};', 'const FARM_DEF=' + FARM_VUOTO + ';', f)
    s = rx(s, r'<title>[^<]*</title>', '<title>Gestionale allevamento</title>', f)
    s = rx(s, r'<p class="brand">[^<]*</p>', '<p class="brand">Gestionale allevamento</p>', f)
    s = rx(s, r'const MA_DEF=\{[^}]*\};', 'const MA_DEF={email:"",wa:"",who:"",deleg:""};', f)
    s = rx(s, r'const DRIVE_DEF="[^"]*"', 'const DRIVE_DEF=""', f)
    s = rx(s, r'const ANAG_EMAIL_DEF="[^"]*";', 'const ANAG_EMAIL_DEF="";', f)
    s = rx(s, r'const AC_SOTT_ON=true,AC_SOTT_NAME="[^"]*";', 'const AC_SOTT_ON=false,AC_SOTT_NAME="";', f)
    # contratto vuoto: l'allevatore metterà il suo testo
    i = s.find("const CT=[")
    if i < 0: raise SystemExit("vergine.py: contratto CT non trovato in " + f)
    j = s.find("\n];", i)
    s = s[:i] + "const CT=[" + s[j + 1:]
    # intestatari: solo il titolare
    s = rx(s, r'\n\s*daniela:\{[^\n]*\}\};', '};', f) if "daniela:{" in s else s
    s = re.sub(r'\bpaolo\b', 'titolare', s)
    s = s.replace("@delpiccolodiavolo", "@gestionale-allevamento")
    return s

def pulisci_html(s, f):
    s = re.sub(r"<!--(?!\s*GESTIONALE).*?-->", "", s, flags=re.S)
    # CSS: via i commenti
    s = re.sub(r"(<style[^>]*>)(.*?)(</style>)", lambda m: m.group(1) + re.sub(r"/\*.*?\*/", "", m.group(2), flags=re.S) + m.group(3), s, flags=re.S)
    # JavaScript: via i commenti con terser (nessuna compressione né cambio di nomi)
    def js(m):
        return m.group(1) + terser(m.group(2), False, f) + m.group(3)
    return re.sub(r"(<script>)(.*?)(</script>)", js, s, flags=re.S)

def terser(code, module, f):
    tmp = os.path.join(OUT, ".t.js")
    open(tmp, "w", encoding="utf-8").write(code)
    cfg = json.dumps({"compress": False, "mangle": False, "module": module, "format": {"comments": False, "beautify": True, "indent_level": 1}})
    script = f"const {{minify}}=require({json.dumps(os.path.join(TERSER_DIR, 'terser'))});const fs=require('fs');" \
             f"minify(fs.readFileSync({json.dumps(tmp)},'utf8'),{cfg}).then(r=>process.stdout.write(r.code)).catch(e=>{{console.error(e.message);process.exit(1)}})"
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True, encoding="utf-8")
    os.remove(tmp)
    if r.returncode != 0:
        raise SystemExit(f"vergine.py: terser non riesce a leggere {f}: {r.stderr[:400]}")
    return "\n" + r.stdout + "\n"

def server(s, f):
    if f.endswith("_lib.js"):
        s = rx(s, r'export const FARM_DEF = \{[^}]*\};', 'export const FARM_DEF = ' + FARM_VUOTO_JS + ';', f)
        s = rx(s, r'export const SITE_REPO_DEF = "[^"]*";', 'export const SITE_REPO_DEF = "";', f)
    if f.endswith("maps.js"):
        i = s.find("const DEF = {"); j = s.find("};", i)
        s = s[:i] + 'const DEF = { kw: [], cities: [{ n: "Italia", loc: "Italy" }] };' + s[j + 2:]
        s = rx(s, r'\n[^\n]*"Ostellato\|Ferrara\|[^\n]*', '', f)
    s = s.replace("@delpiccolodiavolo.it", "@gestionale-allevamento").replace("@gestionale.delpiccolodiavolo.it", "@gestionale-allevamento")
    return terser(s, True, f).lstrip("\n")

def coppia(s, f):
    s = rx(s, r'const F=Object\.assign\(\{name:"[^"]*",person:"[^"]*",cityProv:"[^"]*",phoneIntl:"[^"]*",site:"[^"]*"\}',
           'const F=Object.assign({name:"",person:"",cityProv:"",phoneIntl:"",site:""}', f)
    s = rx(s, r'<title>[^<]*</title>', '<title>Accoppiamento</title>', f)
    s = rx(s, r'<img src="https://[^"]*logo\.webp" alt="">', '<img src="" alt="">', f)
    s = rx(s, r'<b>[^<]*Piccolo Diavolo</b>', '<b></b>', f)
    return s

def icone():
    from PIL import Image, ImageDraw
    def zampa(n, pad, bg):
        im = Image.new("RGB", (n, n), bg); d = ImageDraw.Draw(im); c = (140, 43, 35)
        s = n - 2 * pad; ox = oy = pad
        e = lambda x, y, w, h: d.ellipse([ox + x * s, oy + y * s, ox + (x + w) * s, oy + (y + h) * s], fill=c)
        e(.28, .45, .44, .40); e(.10, .28, .18, .22); e(.30, .10, .18, .24); e(.52, .10, .18, .24); e(.72, .28, .18, .22)
        return im
    P = os.path.join(OUT, "public")
    for name, n, pad in [("apple-touch-icon.png", 180, 28), ("icon-192.png", 192, 28), ("icon-512.png", 512, 70), ("favicon-32.png", 32, 3)]:
        zampa(n, pad, (255, 255, 255)).save(os.path.join(P, name))
    zampa(512, 120, (255, 255, 255)).save(os.path.join(P, "icon-maskable-512.png"))

def main():
    if os.path.exists(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    for f in tracked():
        src, dst = os.path.join(ROOT, f), os.path.join(OUT, f)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if f in ("public/index.html", "public/proprietario.html"):
            s = open(src, encoding="utf-8").read()
            s = pulisci_html(pagina(s, f), f)
            open(dst, "w", encoding="utf-8").write(s)
        elif f == "public/coppia.html":
            s = pulisci_html(coppia(open(src, encoding="utf-8").read(), f), f)
            open(dst, "w", encoding="utf-8").write(s)
        elif f.startswith("functions/") and f.endswith(".js"):
            open(dst, "w", encoding="utf-8").write(server(open(src, encoding="utf-8").read(), f))
        elif f == "public/manifest.webmanifest":
            m = json.load(open(src, encoding="utf-8"))
            m["name"] = "Gestionale allevamento"; m["short_name"] = "Gestionale"; m["description"] = "Gestionale dell'allevamento"
            json.dump(m, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        else:
            shutil.copy2(src, dst)
    icone()
    D = os.path.join(ROOT, "tools", "vergine")
    for doc in ("INSTALLA.md", "LEGGIMI.md", "CLAUDE.md"):
        shutil.copy2(os.path.join(D, doc), os.path.join(OUT, doc))
    open(os.path.join(OUT, ".gitignore"), "w").write(".dev.vars\nnode_modules/\nbuild/\n")
    # controllo finale: nessuna parola proibita
    trovate = []
    for dp, _, fs in os.walk(OUT):
        for n in fs:
            p = os.path.join(dp, n)
            if n.endswith((".png", ".jpg", ".pdf")) or n == "pdf-lib.min.js": continue
            t = open(p, encoding="utf-8", errors="ignore").read()
            for m in re.finditer(PROIBITE, t):
                trovate.append(f"{os.path.relpath(p, OUT)}: …{t[max(0, m.start() - 50):m.end() + 30]!r}…")
    if trovate:
        print("\n".join(trovate[:40])); raise SystemExit(f"vergine.py: {len(trovate)} parole proibite ancora presenti")
    os.makedirs(os.path.dirname(ZIP), exist_ok=True)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, _, fs in os.walk(OUT):
            for n in fs:
                p = os.path.join(dp, n); z.write(p, os.path.join("gestionale-allevamento", os.path.relpath(p, OUT)))
    print("FATTO:", ZIP)

if __name__ == "__main__":
    main()
