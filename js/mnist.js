(function () {
  const flat = a => Float32Array.from(a.flat(Infinity));
  let last = null;

  function build(w) {
    if (w.built) return w.built;
    const p = {};
    for (const k in w.state) p[k] = flat(w.state[k]);
    return (w.built = { arch: w.arch, p, shape: Object.fromEntries(Object.entries(w.state).map(([k, v]) => [k, shape(v)])) });
  }
  function shape(a) { const s = []; while (Array.isArray(a)) { s.push(a.length); a = a[0]; } return s; }

  function conv(t, W, b, [O, I, K], pad, stride) {
    const oh = Math.floor((t.h + 2 * pad - K) / stride) + 1, ow = Math.floor((t.w + 2 * pad - K) / stride) + 1;
    const out = new Float32Array(O * oh * ow);
    for (let o = 0; o < O; o++)
      for (let y = 0; y < oh; y++)
        for (let x = 0; x < ow; x++) {
          let s = b[o];
          for (let i = 0; i < I; i++)
            for (let ky = 0; ky < K; ky++) {
              const iy = y * stride - pad + ky;
              if (iy < 0 || iy >= t.h) continue;
              for (let kx = 0; kx < K; kx++) {
                const ix = x * stride - pad + kx;
                if (ix < 0 || ix >= t.w) continue;
                s += t.d[(i * t.h + iy) * t.w + ix] * W[((o * I + i) * K + ky) * K + kx];
              }
            }
          out[(o * oh + y) * ow + x] = s;
        }
    return { d: out, c: O, h: oh, w: ow };
  }

  function pool(t, K) {
    const oh = Math.floor(t.h / K), ow = Math.floor(t.w / K), out = new Float32Array(t.c * oh * ow);
    for (let c = 0; c < t.c; c++)
      for (let y = 0; y < oh; y++)
        for (let x = 0; x < ow; x++) {
          let m = -Infinity;
          for (let dy = 0; dy < K; dy++)
            for (let dx = 0; dx < K; dx++) m = Math.max(m, t.d[(c * t.h + y * K + dy) * t.w + x * K + dx]);
          out[(c * oh + y) * ow + x] = m;
        }
    return { d: out, c: t.c, h: oh, w: ow };
  }

  function linear(t, W, b, [O, I]) {
    const out = new Float32Array(O);
    for (let o = 0; o < O; o++) {
      let s = b[o];
      for (let i = 0; i < I; i++) s += t.d[i] * W[o * I + i];
      out[o] = s;
    }
    return { d: out, c: O, h: 1, w: 1 };
  }

  function predict(a, b) {
    let x = a, m = b;
    if (a && a.arch) { m = a; x = b; }
    m = build(m || last);
    let t = { d: Float32Array.from(x), c: 1, h: 28, w: 28 };
    for (const l of m.arch) {
      if (l.type === "normalize") t = { ...t, d: t.d.map(v => (v - l.mean) / l.std) };
      else if (l.type === "conv") t = conv(t, m.p[l.name + ".weight"], m.p[l.name + ".bias"], m.shape[l.name + ".weight"], l.pad, l.stride);
      else if (l.type === "relu") t = { ...t, d: t.d.map(v => Math.max(0, v)) };
      else if (l.type === "maxpool") t = pool(t, l.k);
      else if (l.type === "flatten") t = { d: t.d, c: t.d.length, h: 1, w: 1 };
      else if (l.type === "linear") t = linear(t, m.p[l.name + ".weight"], m.p[l.name + ".bias"], m.shape[l.name + ".weight"]);
      else throw new Error("unknown layer " + l.type);
    }
    return t.d;
  }

  async function load(url = "data/mnist/weights.json") {
    last = await (await fetch(url)).json();
    return build(last);
  }

  window.MNIST = { load, predict };
})();
