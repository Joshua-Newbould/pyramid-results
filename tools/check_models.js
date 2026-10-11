const fs = require("fs"), path = require("path"), vm = require("vm");
const R = path.resolve(__dirname, "..");
const J = p => JSON.parse(fs.readFileSync(path.join(R, p), "utf8"));
function fail(m) { console.log("FAIL " + m); process.exit(1); }
async function main() {
  const window = {};
  const ctx = vm.createContext({ window, console, Math, Float32Array, Float64Array, Uint8Array, Int32Array, Promise, JSON, TextDecoder,
    fetch: async u => { const b = fs.readFileSync(path.join(R, String(u).replace(/^\.?\//, "").split("?")[0]));
      return { ok: true, json: async () => JSON.parse(b.toString()), text: async () => b.toString(), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; } });
  ctx.self = ctx.globalThis = ctx;
  for (const f of ["js/mnist.js", "js/gpt.js"]) {
    const p = path.join(R, f);
    if (!fs.existsSync(p)) fail("missing " + f);
    try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); } catch (e) { fail(f + ": " + e.message); }
  }
  const { MNIST, GPT } = window;
  if (!MNIST || !GPT) fail("window.MNIST / window.GPT not defined");
  const am = a => a.indexOf(Math.max(...a));
  const fx = J("data/mnist/fixture.json");
  const w = J("data/mnist/weights.json");
  if (MNIST.load) await MNIST.load();
  let agree = 0, md = 0;
  fx.x.forEach((x, i) => {
    const out = MNIST.predict(x, w), lg = Array.from(out.logits || out);
    if (am(lg) === am(fx.logits[i])) agree++;
    lg.forEach((v, k) => md = Math.max(md, Math.abs(v - fx.logits[i][k])));
  });
  console.log(`mnist agree ${agree}/${fx.x.length} max|dlogit| ${md}`);
  if (agree < 19 || !(md < 1e-2)) fail("mnist");
  const m = J("data/shakespeare/model.json");
  if (GPT.load) await GPT.load();
  const lg = Array.from(await GPT.logits(m.fixture.prompt));
  const gd = Math.max(...lg.map((v, k) => Math.abs(v - m.fixture.next_logits[k])));
  console.log(`gpt max|dlogit| ${gd}`);
  if (!(gd < 0.2)) fail("gpt");   // fixture logits were produced under bf16 autocast: rounding floor about 0.1 at magnitude 16
}
main().catch(e => fail(String(e && e.message || e)));
