import colorsys, json, re, subprocess, sys, time, urllib.request
from html.parser import HTMLParser
from pathlib import Path
R = Path(__file__).resolve().parents[1]
IDS = ["top", "mnist", "gan", "ngp", "shakespeare", "colophon"]
TASKS = IDS[1:5]
BUDGET = {"index.html": 180, "style.css": 560, "main.js": 300, "js/mnist.js": 130, "js/gpt.js": 240, "js/widgets.js": 380}
PORT = 8770
PY = sys.executable

def data():
    ts, f = json.loads((R / "data/index.json").read_text())["tasks"], []
    if [t["task"] for t in ts] != TASKS: f.append("index.json tasks not " + ",".join(TASKS))
    f += [f"missing {a}" for t in ts for a in t["artifacts"] if not (R / a).is_file()]
    return f

class P(HTMLParser):
    def __init__(s): super().__init__(); s.ids, s.refs = set(), []
    def handle_starttag(s, tag, a):
        a = dict(a)
        if "id" in a: s.ids.add(a["id"])
        for k in ("href", "src"):
            if k in a: s.refs.append(a[k])

def html():
    p, f = P(), []
    p.feed((R / "index.html").read_text())
    f += [f"missing id {i}" for i in IDS if i not in p.ids]
    for r in p.refs:
        if not re.match(r"(https?:|#|data:|mailto:)", r) and not (R / r.split("#")[0].split("?")[0]).exists():
            f.append(f"unresolved {r}")
        if re.match(r"(https?:|/)", r): f.append(f"non-relative {r}")
    for n, b in BUDGET.items():
        if n.endswith(".js") and (R / n).exists() and subprocess.run(["node", "--check", str(R / n)]).returncode: f.append(f"node --check {n}")
        if not (R / n).exists(): continue
        c = len((R / n).read_text().splitlines())
        if c > b: f.append(f"{n} {c} lines > {b}")
    return f

class W(HTMLParser):
    def __init__(s): super().__init__(); s.sec, s.skip, s.w = None, [], {}
    def handle_starttag(s, tag, a):
        a = dict(a)
        if tag == "section": s.sec = a.get("id"); s.w[s.sec] = 0
        if tag in ("pre", "figure"): s.skip.append(tag)
    def handle_endtag(s, tag):
        if s.skip and tag == s.skip[-1]: s.skip.pop()
        if tag == "section": s.sec = None
    def handle_data(s, d):
        if s.sec and not s.skip: s.w[s.sec] += len(d.split())

def prose():
    f = []
    if subprocess.run([PY, str(R / "tools/ai_lint.py"), str(R / "index.html")]).returncode: f.append("ai_lint failed")
    w = W(); w.feed((R / "index.html").read_text())
    f += [f"section {k} has {v} words > 80" for k, v in w.w.items() if v > 80]
    return f

def serve():
    try: urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=2)
    except Exception:
        subprocess.Popen([PY, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "-d", str(R)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.5)

def browse(fn, width=1024):
    from playwright.sync_api import sync_playwright
    serve()
    with sync_playwright() as pw:
        b = pw.chromium.launch(); pg = b.new_page(viewport={"width": width, "height": 800}); errs = []
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/index.html", wait_until="load"); pg.wait_for_timeout(500)
        r = fn(pg)
        b.close()
    return [f"console: {e}" for e in errs] + r

def browser_checks(pg):
    f = []
    for t in TASKS:
        ok = pg.evaluate("""t => { const s = document.getElementById(t); if (!s) return [0, 0, 0];
          const imgs = [...s.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0);
          const pre = [...s.querySelectorAll('pre')].some(p => p.textContent.length >= 1000);
          const w = s.getBoundingClientRect().width;
          const big = [...s.querySelectorAll('figure.artifacts img, figure.artifacts .strip')].every(e => e.getBoundingClientRect().width >= w / 2);
          return [s.querySelectorAll('svg path').length > 0, imgs || pre, big]; }""", t)
        for n, o in zip(["svg path", "loaded img or pre>=1000 chars", "artifact width >= half section"], ok):
            if not o: f.append(f"{t}: {n}")
    d = pg.query_selector("section#ngp [data-divider]")
    if not d: return f + ["ngp: no [data-divider]"]
    b0 = d.bounding_box(); x, y = b0["x"] + b0["width"] / 2, b0["y"] + b0["height"] / 2
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 40, y, steps=5); pg.mouse.up()
    if d.bounding_box() == b0: f.append("ngp: divider did not move")
    return f + interact(pg)

def interact(pg):
    f = []
    def has(sel): 
        if pg.query_selector(sel): return True
        f.append(f"missing {sel}"); return False
    def attr(sel, a): return pg.eval_on_selector(sel, f"e => e.getAttribute('{a}')")
    def scrub(sec, cls, a):
        sel = f"section#{sec} input.{cls}"
        if not has(sel) or not has(f"section#{sec} [{a}]"): return
        before = attr(f"section#{sec} [{a}]", a)
        pg.eval_on_selector(sel, "e => { e.value = e.max; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }")
        pg.wait_for_timeout(200)
        if attr(f"section#{sec} [{a}]", a) == before: f.append(f"{sec}: {cls} did not update [{a}]")
    h0 = pg.evaluate("document.documentElement.dataset.theme || ''")
    if has("button#theme"):
        pg.click("button#theme"); t = pg.evaluate("document.documentElement.dataset.theme")
        if t not in ("light", "dark") or t == h0: f.append("theme toggle did not change html[data-theme]")
        pg.reload(wait_until="load")
        if pg.evaluate("document.documentElement.dataset.theme") != t: f.append("theme did not survive reload")
    if has("section#mnist canvas#pad"):
        b = pg.query_selector("section#mnist canvas#pad"); b.scroll_into_view_if_needed(); b = b.bounding_box()
        pg.mouse.move(b["x"] + b["width"] * .3, b["y"] + b["height"] * .3); pg.mouse.down()
        pg.mouse.move(b["x"] + b["width"] * .6, b["y"] + b["height"] * .7, steps=8); pg.mouse.up(); pg.wait_for_timeout(500)
        if len(pg.inner_text("section#mnist .pad-pred").strip()) != 1 or not pg.inner_text("section#mnist .pad-pred").strip().isdigit(): f.append("mnist: .pad-pred not one digit")
        if pg.locator("section#mnist .pad-probs > *").count() != 10: f.append("mnist: .pad-probs not 10 bars")
    scrub("gan", "epoch-scrub", "data-epoch"); scrub("gan", "walk-scrub", "data-frame"); scrub("ngp", "step-scrub", "data-step")
    if has("section#ngp .loupe") and has("section#ngp .compare"):
        l = pg.query_selector("section#ngp .loupe"); c = pg.query_selector("section#ngp .compare"); c.scroll_into_view_if_needed(); cb = c.bounding_box(); p0 = l.bounding_box()
        pg.mouse.move(cb["x"] + cb["width"] * .3, cb["y"] + cb["height"] * .3); pg.mouse.move(cb["x"] + cb["width"] * .7, cb["y"] + cb["height"] * .6, steps=5)
        if l.bounding_box() == p0: f.append("ngp: .loupe did not move")
    s = "section#shakespeare "
    if all(has(s + x) for x in (".prompt", ".temperature", "button.generate", ".generated")):
        n0 = len(pg.inner_text(s + ".generated")); pg.click(s + "button.generate")
        try: pg.wait_for_function("([s, n]) => (document.querySelector(s).value ?? document.querySelector(s).textContent).length >= n + 50", arg=[s + ".generated", n0], timeout=15000)
        except Exception: f.append("shakespeare: .generated grew < 50 chars in 15 s")
    sv = pg.query_selector("figure.curves svg")
    if sv:
        sv.scroll_into_view_if_needed(); bb = sv.bounding_box(); pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, steps=4)
        if not pg.query_selector(".curve-tip") or not pg.inner_text(".curve-tip").strip(): f.append("curves: .curve-tip empty")
    else: f.append("missing figure.curves svg")
    for t in TASKS:
        if pg.locator(f"section#{t} table.method tr").count() < 5: f.append(f"{t}: table.method < 5 rows")
    return f

def browser():
    f = browse(browser_checks); (R / ".pyramid/shots").mkdir(parents=True, exist_ok=True)
    for w in (390, 1024, 1600):
        browse(lambda pg: pg.screenshot(path=str(R / f".pyramid/shots/w{w}.png"), full_page=True) and [], w)
    return f

DESIGN_JS = """() => { const out = []; for (const e of document.body.querySelectorAll('*')) {
  const c = getComputedStyle(e), r = e.getBoundingClientRect(); if (!r.width || !r.height || c.display === 'none') continue;
  let bg = null, n = e; while (n) { const b = getComputedStyle(n).backgroundColor; if (!/rgba\\(.*, 0\\)|transparent/.test(b)) { bg = b; break; } n = n.parentElement; }
  out.push({tag: e.tagName.toLowerCase(), font: c.fontFamily.split(',')[0].trim(), fs: parseFloat(c.fontSize), w: r.width, color: c.color,
    cols: [c.color, c.borderTopColor, c.backgroundColor], bg: bg || 'rgb(255, 255, 255)', sh: c.boxShadow, bi: c.backgroundImage}); }
  return out; }"""

def rgb(s): return [float(x) for x in re.findall(r"[\d.]+", s)[:3]]
def lum(c):
    l = [v / 255 for v in c]; l = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in l]
    return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]

def design_checks(pg):
    f, els, hues = [], pg.evaluate(DESIGN_JS), []
    fonts = {e["font"] for e in els}
    if len(fonts) > 2: f.append(f"{len(fonts)} font families: {sorted(fonts)}")
    for e in els:
        for s in e["cols"]:
            m = re.findall(r"[\d.]+", s)
            if len(m) > 3 and float(m[3]) == 0: continue
            h, l, sat = colorsys.rgb_to_hls(*[v / 255 for v in rgb(s)])
            if sat > .25: hues.append(h * 360)
        if e["tag"] == "p" and not 45 <= e["w"] / (e["fs"] * .5) <= 80: f.append(f"p measure {e['w'] / (e['fs'] * .5):.0f}")
        if e["tag"] in ("p", "li", "dd", "dt"):
            a, b = sorted([lum(rgb(e["color"])), lum(rgb(e["bg"]))], reverse=True)
            if (a + .05) / (b + .05) < 4.5: f.append(f"contrast {(a + .05) / (b + .05):.2f} on {e['tag']}")
        if e["sh"] != "none" and any(float(x[:-2]) > 1 for x in re.findall(r"[\d.]+px", re.sub(r"rgba?\([^)]*\)", "", e["sh"]))[2:3]): f.append("box-shadow blur > 1px")
        if "gradient" in e["bi"]: f.append("gradient background")
    fam = []
    for h in hues:
        if not any(min(abs(h - x), 360 - abs(h - x)) <= 30 for x in fam): fam.append(h)
    if len(fam) > 1: f.append(f"{len(fam)} chromatic hue families: {[round(x) for x in fam]}")
    return sorted(set(f))

CMDS = {"data": data, "html": html, "prose": prose, "browser": browser, "design": lambda: [f"{m}: {x}" for m in ("light", "dark") for x in browse(lambda pg: (pg.evaluate(f"document.documentElement.dataset.theme = '{m}'"), pg.wait_for_timeout(300), design_checks(pg))[2])]}
if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) != 1 or (a[0] != "all" and a[0] not in CMDS): print("usage: check.py data|html|prose|browser|design|all"); sys.exit(2)
    fails = [x for n in (CMDS if a[0] == "all" else [a[0]]) for x in [f"[{n}] {m}" for m in CMDS[n]()]]
    print("\n".join("FAIL " + x for x in fails) or "OK"); sys.exit(1 if fails else 0)
