(function () {
  let last = null;

  function erf(x) {
    const s = x < 0 ? -1 : 1, t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const gelu = v => 0.5 * v * (1 + erf(v * Math.SQRT1_2));

  async function load(jsonUrl = "data/shakespeare/model.json", binUrl = "data/shakespeare/model.bin") {
    const cfg = await (await fetch(jsonUrl)).json();
    const all = new Float32Array(await (await fetch(binUrl)).arrayBuffer());
    const p = {};
    let off = 0;
    for (const { name, shape } of cfg.params) {
      const n = shape.reduce((a, b) => a * b, 1);
      p[name] = all.subarray(off, off + n);
      off += n;
    }
    return (last = { cfg, p, eps: cfg.norm.eps });
  }

  function layerNorm(x, T, D, w, b, eps) {
    const out = new Float32Array(T * D);
    for (let t = 0; t < T; t++) {
      let mu = 0, v = 0;
      for (let i = 0; i < D; i++) mu += x[t * D + i];
      mu /= D;
      for (let i = 0; i < D; i++) v += (x[t * D + i] - mu) ** 2;
      const r = 1 / Math.sqrt(v / D + eps);
      for (let i = 0; i < D; i++) out[t * D + i] = (x[t * D + i] - mu) * r * w[i] + b[i];
    }
    return out;
  }

  function linear(x, T, I, W, b, O) {
    const out = new Float32Array(T * O);
    for (let t = 0; t < T; t++)
      for (let o = 0; o < O; o++) {
        let s = b ? b[o] : 0;
        for (let i = 0; i < I; i++) s += x[t * I + i] * W[o * I + i];
        out[t * O + o] = s;
      }
    return out;
  }

  function attention(qkv, T, D, H) {
    const hd = D / H, out = new Float32Array(T * D), sc = new Float32Array(T), scale = 1 / Math.sqrt(hd);
    for (let h = 0; h < H; h++)
      for (let t = 0; t < T; t++) {
        let mx = -Infinity;
        for (let u = 0; u <= t; u++) {
          let s = 0;
          for (let i = 0; i < hd; i++) s += qkv[t * 3 * D + h * hd + i] * qkv[u * 3 * D + D + h * hd + i];
          sc[u] = s * scale;
          if (sc[u] > mx) mx = sc[u];
        }
        let z = 0;
        for (let u = 0; u <= t; u++) z += (sc[u] = Math.exp(sc[u] - mx));
        for (let u = 0; u <= t; u++) {
          const a = sc[u] / z;
          for (let i = 0; i < hd; i++) out[t * D + h * hd + i] += a * qkv[u * 3 * D + 2 * D + h * hd + i];
        }
      }
    return out;
  }

  function toIndices(m, s) {
    return typeof s === "string" ? Array.from(s, c => m.cfg.vocab.indexOf(c)) : Array.from(s);
  }

  async function logits(a, b) {
    let m = a, idx = b;
    if (!(a && a.cfg)) { m = last; idx = a; }
    const { n_layer: L, n_head: H, n_embd: D, block_size, vocab } = m.cfg, p = m.p;
    idx = toIndices(m, idx).slice(-block_size);
    const T = idx.length, V = vocab.length;
    let x = new Float32Array(T * D);
    for (let t = 0; t < T; t++)
      for (let i = 0; i < D; i++) x[t * D + i] = p["tok.weight"][idx[t] * D + i] + p["pos.weight"][t * D + i];
    for (let l = 0; l < L; l++) {
      const n = `blocks.${l}.`;
      const h = layerNorm(x, T, D, p[n + "l1.weight"], p[n + "l1.bias"], m.eps);
      const at = attention(linear(h, T, D, p[n + "qkv.weight"], p[n + "qkv.bias"], 3 * D), T, D, H);
      const o = linear(at, T, D, p[n + "o.weight"], p[n + "o.bias"], D);
      for (let i = 0; i < x.length; i++) x[i] += o[i];
      const g = layerNorm(x, T, D, p[n + "l2.weight"], p[n + "l2.bias"], m.eps);
      const f = linear(g, T, D, p[n + "mlp.0.weight"], p[n + "mlp.0.bias"], 4 * D).map(gelu);
      const r = linear(f, T, 4 * D, p[n + "mlp.2.weight"], p[n + "mlp.2.bias"], D);
      for (let i = 0; i < x.length; i++) x[i] += r[i];
    }
    const last1 = layerNorm(x.subarray((T - 1) * D), 1, D, p["ln.weight"], p["ln.bias"], m.eps);
    return linear(last1, 1, D, p["tok.weight"], null, V);
  }

  async function generate(a, b, c, d, e, f) {
    let m = a, prompt = b, n = c, temp = d, onChar = e;
    if (!(a && a.cfg)) { m = last; prompt = a; n = b; temp = c; onChar = d; }
    const vocab = m.cfg.vocab;
    let idx = toIndices(m, prompt || "\n").filter(i => i >= 0);
    if (!idx.length) idx = [0];
    let out = "";
    for (let k = 0; k < n; k++) {
      const lg = await logits(m, idx), t = temp > 0 ? temp : 1e-4;
      let mx = -Infinity;
      for (const v of lg) if (v > mx) mx = v;
      const pr = Array.from(lg, v => Math.exp((v - mx) / t)), z = pr.reduce((s, v) => s + v, 0);
      let r = Math.random() * z, j = 0;
      while (j < pr.length - 1 && (r -= pr[j]) > 0) j++;
      idx.push(j);
      out += vocab[j];
      if (onChar) onChar(vocab[j]);
      await new Promise(res => (typeof setTimeout === "function" ? setTimeout(res, 0) : res()));
    }
    return out;
  }

  window.GPT = { load, logits, generate };
})();
