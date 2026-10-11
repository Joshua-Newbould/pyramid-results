const NS = "http://www.w3.org/2000/svg";
const W = 600, H = 220, M = { l: 52, r: 12, t: 12, b: 36 };
const el = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  e.append(...kids);
  return e;
};
const sv = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
};
const fmt = (v) => (Math.abs(v) >= 1000 ? v.toExponential(1) : +v.toPrecision(3)).toString();

function curve(name, raw) {
  const pts = raw.map((p, i) => (Array.isArray(p) ? p : [i + 1, p]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const log = x0 > 0 && x1 / x0 > 100;
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const tx = (x) => (log ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / ((x1 - x0) || 1));
  const px = (x) => M.l + tx(x) * (W - M.l - M.r);
  const py = (y) => H - M.b - ((y - y0) / ((y1 - y0) || 1)) * (H - M.t - M.b);
  const cols = new Map();
  pts.forEach(([x, y]) => cols.set(Math.round(px(x)), [px(x), py(y)]));
  const d = [...cols.values()].map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  const s = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": name });
  s.append(sv("path", { d, class: "line" }));
  const ticks = [[M.l, H - M.b + 14, x0, "start"], [W - M.r, H - M.b + 14, x1, "end"]];
  ticks.forEach(([x, y, v, a]) => s.append(sv("text", { x, y, "text-anchor": a }, fmt(v))));
  [[y0, H - M.b], [y1, M.t + 8]].forEach(([v, y]) => s.append(sv("text", { x: M.l - 6, y, "text-anchor": "end" }, fmt(v))));
  s.append(sv("text", { x: (W + M.l) / 2, y: H - 6, "text-anchor": "middle", class: "ax" }, (log ? "step (log)" : "step")));
  s.append(sv("text", { x: M.l, y: M.t - 2, class: "ax" }, name));
  return s;
}

function compare(a, b) {
  const top = el("img", { src: a, alt: "target" }), bot = el("img", { src: b, alt: "reconstruction" });
  const div = el("div", { "data-divider": "", role: "slider", "aria-label": "Compare target and reconstruction", tabindex: "0" });
  const box = el("div", { class: "compare" }, [bot, top, div]);
  const set = (f) => {
    f = Math.min(1, Math.max(0, f));
    box.style.setProperty("--pos", f * 100 + "%");
  };
  set(0.5);
  const move = (e) => set((e.clientX - box.getBoundingClientRect().left) / box.offsetWidth);
  div.addEventListener("pointerdown", (e) => { div.setPointerCapture(e.pointerId); div.onpointermove = move; });
  div.addEventListener("pointerup", () => (div.onpointermove = null));
  div.addEventListener("keydown", (e) => {
    const f = parseFloat(box.style.getPropertyValue("--pos")) / 100;
    if (e.key === "ArrowLeft") set(f - 0.05);
    if (e.key === "ArrowRight") set(f + 0.05);
  });
  return box;
}

const fact = (k, v) => [el("dt", {}, [k]), el("dd", {}, [v])];

async function main() {
  const idx = await (await fetch("data/index.json")).json();
  const text = await (await fetch("data/shakespeare/samples.txt")).text();
  for (const t of idx.tasks) {
    const sec = document.getElementById(t.task);
    const img = (f, extra = {}) => el("img", { src: "data/" + t.task + "/" + f, alt: t.title + " " + f.replace(/\..*/, ""), ...extra });
    const curves = el("figure", { class: "curves" }, Object.entries(t.curves).map(([n, c]) => curve(n, c)));
    const art = el("figure", { class: "artifacts" });
    if (t.task === "mnist") art.append(img("samples.png"));
    if (t.task === "gan") {
      art.append(img("samples.png"), el("div", { class: "strip" }, [img("progress.png", { class: "natural" })]));
    }
    if (t.task === "ngp") {
      art.append(compare("data/ngp/target.png", "data/ngp/recon.png"), img("progress.png"));
    }
    if (t.task === "shakespeare") art.append(el("pre", {}, [text]));
    art.append(el("figcaption", {}, [t.title]));
    const [k, v] = Object.entries(t.final)[0];
    const facts = el("dl", { class: "facts" }, [
      ...fact(k.replace(/_/g, " "), fmt(v)),
      ...fact("parameters", t.params.toLocaleString("en")),
      ...fact("training time", Math.round(t.train_seconds) + " s"),
    ]);
    sec.append(curves, art, facts);
  }
}
main();
