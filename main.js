const NS = "http://www.w3.org/2000/svg";
const W = 400, H = 210, M = { l: 40, r: 58, t: 30, b: 30 };
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

const io = "IntersectionObserver" in window && new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); }
}), { threshold: 0.5 });

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
  const [ex, ey] = [...cols.values()].pop();
  const s = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": name, class: io ? "draw" : "" });
  s.append(sv("line", { x1: M.l, x2: W - M.r, y1: H - M.b + 6, y2: H - M.b + 6, class: "base" }));
  s.append(sv("path", { d, class: "trace" }), sv("path", { d, class: "line", pathLength: 1 }));
  s.append(sv("circle", { cx: ex, cy: ey, r: 2.5, class: "end" }), sv("text", { x: ex + 8, y: ey + 4, class: "val" }, fmt(ys[ys.length - 1])));
  [[M.l, x0, "start"], [W - M.r, x1, "end"]].forEach(([x, v, a]) => s.append(sv("text", { x, y: H - M.b + 20, "text-anchor": a }, fmt(v))));
  [[y0, H - M.b + 3], [y1, M.t + 3]].forEach(([v, y]) => s.append(sv("text", { x: M.l - 8, y, "text-anchor": "end" }, fmt(v))));
  s.append(sv("text", { x: (W + M.l - M.r) / 2, y: H - M.b + 20, "text-anchor": "middle" }, log ? "step, log scale" : "step"));
  s.append(sv("text", { x: 0, y: 10, class: "name" }, name.replace(/_/g, " ")));
  if (io) io.observe(s);
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
    const plates = [];
    const plate = (cap, ...kids) => plates.push(el("figure", { class: "artifacts plate" }, [...kids, el("figcaption", {}, [cap])]));
    if (t.task === "mnist") plate("Test digits labelled prediction over truth, with errors in red.", img("samples.png"));
    if (t.task === "gan") {
      plate("Samples from the generator after the final epoch.", img("samples.png", { class: "pix" }));
      plate("The same fixed noise, one row per epoch from first to last. Scroll the strip to watch training.", el("div", { class: "strip" }, [img("progress.png")]));
    }
    if (t.task === "ngp") {
      plate("Target to the left of the line, reconstruction to the right. Drag the line to compare.", compare("data/ngp/target.png", "data/ngp/recon.png"));
      plate("The reconstruction over the course of training.", img("progress.png"));
    }
    if (t.task === "shakespeare") plate("Samples from the final model, unedited.", el("pre", {}, [text]));
    const [k, v] = Object.entries(t.final)[0];
    const facts = el("dl", { class: "facts" }, [
      ...fact(k.replace(/_/g, " "), fmt(v)),
      ...fact("parameters", t.params.toLocaleString("en")),
      ...fact("training time", Math.round(t.train_seconds) + " s"),
    ]);
    sec.append(curves, ...plates, facts);
  }
}
main();
