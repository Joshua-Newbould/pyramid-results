(() => {
const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const saved = localStorage.getItem("theme");
if (saved) root.dataset.theme = saved;
$("#theme").onclick = () => {
  const now = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  root.dataset.theme = now === "dark" ? "light" : "dark";
  localStorage.setItem("theme", root.dataset.theme);
};
const ready = () => new Promise((ok) => { const t = setInterval(() => { if ($("#shakespeare pre")) { clearInterval(t); ok(); } }, 40); });

// main.js shares el, sv, fmt and the chart geometry W, H, M as globals.
function scale(raw) {
  const pts = raw.map((p, i) => (Array.isArray(p) ? p : [i + 1, p]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const log = x0 > 0 && x1 / x0 > 100;
  const tx = (x) => (log ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / ((x1 - x0) || 1));
  return pts.map(([x, y]) => ({ x, y, px: M.l + tx(x) * (W - M.l - M.r), py: H - M.b - ((y - y0) / ((y1 - y0) || 1)) * (H - M.t - M.b) }));
}

function tips(tasks) {
  const tip = el("div", { class: "curve-tip" });
  document.body.append(tip);
  for (const t of tasks) for (const svg of document.querySelectorAll(`#${t.task} .curves svg`)) {
    const name = svg.getAttribute("aria-label"), pts = scale(t.curves[name]);
    const dot = sv("circle", { r: 4.5, class: "hot", opacity: 0 });
    svg.append(dot);
    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * W;
      const p = pts.reduce((a, b) => (Math.abs(b.px - vx) < Math.abs(a.px - vx) ? b : a));
      dot.setAttribute("cx", p.px); dot.setAttribute("cy", p.py); dot.setAttribute("opacity", 1);
      tip.textContent = `${name.replace(/_/g, " ")}  step ${fmt(p.x)}  ${fmt(p.y)}`;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
      tip.style.top = e.clientY - 36 + "px";
      tip.classList.add("on");
    });
    svg.addEventListener("pointerleave", () => { dot.setAttribute("opacity", 0); tip.classList.remove("on"); });
  }
}

function method(t) {
  const rows = Object.entries(t.config).map(([k, v]) => el("tr", {}, [el("th", {}, [k.replace(/_/g, " ")]), el("td", {}, [[].concat(v).join(", ")])]));
  return el("table", { class: "method" }, [el("caption", {}, ["Configuration"]), ...rows]);
}

function pad() {
  const cv = $("#pad"), c = cv.getContext("2d"), sm = $("#pad28").getContext("2d");
  const pred = $(".pad-pred"), probs = $(".pad-probs");
  const bars = [...Array(10)].map((_, d) => el("span", {}, [String(d)]));
  probs.append(...bars);
  c.lineWidth = 22; c.lineCap = c.lineJoin = "round"; c.strokeStyle = "#fff";
  const blank = () => { for (const k of [c, sm]) { k.fillStyle = "#000"; k.fillRect(0, 0, 280, 280); } };
  const reset = () => { blank(); pred.textContent = "–"; bars.forEach((b) => { b.style.setProperty("--p", 0); b.classList.remove("top"); }); };
  // MNIST style: ink box scaled into 20x20, then shifted so the centre of mass sits at (14, 14).
  const tiny = () => {
    const d = c.getImageData(0, 0, 280, 280).data;
    let x0 = 280, y0 = 280, x1 = -1, y1 = -1;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 32) {
      const x = (i / 4) % 280, y = ((i / 4) / 280) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = 20 / Math.max(bw, bh);
    sm.fillStyle = "#000"; sm.fillRect(0, 0, 28, 28);
    sm.drawImage(cv, x0, y0, bw, bh, 14 - (bw * s) / 2, 14 - (bh * s) / 2, bw * s, bh * s);
    const g = sm.getImageData(0, 0, 28, 28).data, a = [];
    let m = 0, mx = 0, my = 0;
    for (let i = 0; i < 784; i++) { a[i] = g[4 * i] / 255; m += a[i]; mx += a[i] * (i % 28); my += a[i] * ((i / 28) | 0); }
    const dx = Math.round(14 - mx / m), dy = Math.round(14 - my / m), out = Array(784).fill(0), im = sm.createImageData(28, 28);
    a.forEach((v, i) => { const x = (i % 28) + dx, y = ((i / 28) | 0) + dy; if (x >= 0 && x < 28 && y >= 0 && y < 28) out[y * 28 + x] = v; });
    out.forEach((v, i) => im.data.set([v * 255, v * 255, v * 255, 255], 4 * i));
    sm.putImageData(im, 0, 0);
    return out;
  };
  let weights;
  const run = async () => {
    const x = tiny();
    if (!x || !window.MNIST) return;
    weights ||= (async () => { if (MNIST.load) await MNIST.load(); return (await fetch("data/mnist/weights.json")).json(); })();
    const o = await MNIST.predict(x, await weights), lg = Array.from(o.logits || o), top = Math.max(...lg);
    const e = lg.map((v) => Math.exp(v - top)), sum = e.reduce((a, b) => a + b), k = lg.indexOf(top);
    pred.textContent = k;
    bars.forEach((b, i) => { b.style.setProperty("--p", e[i] / sum); b.classList.toggle("top", i === k); });
  };
  let last = null;
  const at = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) * 280) / r.width, ((e.clientY - r.top) * 280) / r.height]; };
  const line = (p) => { c.beginPath(); c.moveTo(...last); c.lineTo(...p); c.stroke(); last = p; };
  cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); last = at(e); line(last); run(); };
  cv.onpointermove = (e) => { if (last) { line(at(e)); run(); } };
  cv.onpointerup = () => { last = null; run(); };
  $("#mnist .clear").onclick = reset;
  reset();
}

function film(view, input, attr, src, horiz, ar, label) {
  const n = +input.max + 1;
  view.style.cssText = `background-image:url(${src});background-size:${horiz ? n * 100 + "% 100%" : "100% auto"};aspect-ratio:${ar}`;
  const set = () => {
    const i = Math.min(n - 1, +input.value);
    view.setAttribute(attr, i);
    view.style.backgroundPosition = horiz ? `${(i / (n - 1)) * 100}% 0` : `0 ${(i / (n - 1)) * 100}%`;
    label(i, n);
  };
  input.addEventListener("input", set); input.addEventListener("change", set);
  set();
  return set;
}

function gan() {
  const s = $("#gan"), out = s.querySelectorAll("output");
  film($("[data-epoch]", s), $(".epoch-scrub", s), "data-epoch", "data/gan/progress.png", false, "8/1", (i, n) => (out[0].textContent = `snapshot ${i + 1} of ${n}`));
  const walk = $(".walk-scrub", s), play = $(".walk-play", s);
  film($("[data-frame]", s), walk, "data-frame", "data/gan/walk.png", false, "8/1", (i, n) => (out[1].textContent = `step ${i + 1} of ${n}`));
  let timer;
  play.hidden = still;
  play.onclick = () => {
    if (timer) { clearInterval(timer); timer = 0; play.textContent = "Play"; return; }
    play.textContent = "Stop";
    timer = setInterval(() => { walk.value = (+walk.value + 1) % (+walk.max + 1); walk.dispatchEvent(new Event("input")); }, 110);
  };
}

function loupe(box) {
  const [recon, target] = box.querySelectorAll("img");
  const L = el("div", { class: "loupe" }, [el("i"), el("i")]);
  L.children[0].style.backgroundImage = `url(${target.src})`;
  L.children[1].style.backgroundImage = `url(${recon.src})`;
  box.append(L);
  box.addEventListener("pointermove", (e) => {
    const r = box.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    L.classList.add("on");
    const D = L.offsetWidth;
    L.style.transform = `translate(${e.clientX - r.left - D / 2}px,${e.clientY - r.top - D - 16}px)`;
    for (const h of L.children) h.style.backgroundPosition = `${D / 4 - fx * recon.naturalWidth}px ${D / 2 - fy * recon.naturalHeight}px`;
  });
  box.addEventListener("pointerleave", () => L.classList.remove("on"));
}

function ngp(t) {
  const s = $("#ngp"), psnr = scale(t.curves.psnr), steps = t.snapshot_steps;
  loupe($(".compare", s));
  film($("[data-step]", s), $(".step-scrub", s), "data-step", "data/ngp/steps.png", true, "512/344", (i) => {
    const p = psnr.filter((q) => q.x <= steps[i]).pop() || psnr[0];
    $(".step-out", s).textContent = `step ${steps[i].toLocaleString("en")}, ${p.y.toFixed(1)} dB`;
  });
}

function shakespeare() {
  const s = $("#shakespeare"), prompt = $(".prompt", s), temp = $(".temperature", s), go = $("button.generate", s), out = $(".generated", s);
  temp.oninput = () => ($(".temp-out", s).textContent = (+temp.value).toFixed(2));
  temp.oninput();
  go.onclick = async () => {
    if (!window.GPT) return;
    go.disabled = true; out.textContent = prompt.value;
    try {
      if (GPT.load) await GPT.load();
      await GPT.generate(prompt.value, 400, +temp.value, (x) => (out.textContent += x));
    } catch (e) { out.textContent += "\n[" + e.message + "]"; }
    go.disabled = false;
  };
}

(async () => {
  const [idx] = await Promise.all([fetch("data/index.json").then((r) => r.json()), ready()]);
  idx.tasks.forEach((t) => $("#" + t.task).append(method(t)));
  tips(idx.tasks); pad(); gan(); ngp(idx.tasks.find((t) => t.task === "ngp")); shakespeare();
})();
})();
