/* Nepal Information Hub — machine learning core (no dependencies)
   A small reverse-mode autodiff on matrices, Adam, and the models built on it: MLP, LSTM, TCN (dilated causal
   convolutions with residual blocks), DQN and PPO agents for trading; plus gradient-boosted trees implementing the
   XGBoost algorithm (second-order gain, L2-regularised leaf weights, shrinkage, gamma pruning, row/column sampling). */
'use strict';
const ML = (() => {
  /* ---------- seeded RNG ---------- */
  function RNG(seed = 42) { let s = seed >>> 0; const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.normal = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }; r.int = n => Math.floor(r() * n); return r; }

  /* ---------- autodiff ---------- */
  let TAPE = null;
  class Tn { constructor(r, c, data, req = false) { this.r = r; this.c = c; this.d = data || new Float64Array(r * c); this.req = req; this.g = null; this.back = null; }
    grad() { if (!this.g) this.g = new Float64Array(this.r * this.c); return this.g; } }
  const T = (r, c, d, req) => new Tn(r, c, d, req);
  const fromRows = rows => { const r = rows.length, c = rows[0].length, d = new Float64Array(r * c); rows.forEach((x, i) => x.forEach((v, j) => d[i * c + j] = v)); return T(r, c, d); };
  const node = (out, parents, back) => { if (TAPE && parents.some(p => p.req)) { out.req = true; out.back = back; TAPE.push(out); } return out; };
  function matmul(A, B) { const r = A.r, k = A.c, c = B.c, o = T(r, c), a = A.d, b = B.d, od = o.d;
    for (let i = 0; i < r; i++) for (let l = 0; l < k; l++) { const av = a[i * k + l]; if (av === 0) continue; const bo = l * c, oo = i * c; for (let j = 0; j < c; j++) od[oo + j] += av * b[bo + j]; }
    return node(o, [A, B], () => { const g = o.g; if (A.req) { const ga = A.grad(); for (let i = 0; i < r; i++) for (let l = 0; l < k; l++) { let s = 0; const bo = l * c, oo = i * c; for (let j = 0; j < c; j++) s += g[oo + j] * b[bo + j]; ga[i * k + l] += s; } }
      if (B.req) { const gb = B.grad(); for (let i = 0; i < r; i++) for (let l = 0; l < k; l++) { const av = a[i * k + l]; if (av === 0) continue; const bo = l * c, oo = i * c; for (let j = 0; j < c; j++) gb[bo + j] += av * g[oo + j]; } } }); }
  function add(A, B) { const o = T(A.r, A.c), bc = B.r === 1 && A.r > 1; for (let i = 0; i < A.r; i++) for (let j = 0; j < A.c; j++) o.d[i * A.c + j] = A.d[i * A.c + j] + B.d[(bc ? 0 : i) * A.c + j];
    return node(o, [A, B], () => { const g = o.g; if (A.req) { const ga = A.grad(); for (let i = 0; i < g.length; i++) ga[i] += g[i]; } if (B.req) { const gb = B.grad(); for (let i = 0; i < A.r; i++) for (let j = 0; j < A.c; j++) gb[(bc ? 0 : i) * A.c + j] += g[i * A.c + j]; } }); }
  function sub(A, B) { return add(A, scale(B, -1)); }
  function mul(A, B) { const o = T(A.r, A.c); for (let i = 0; i < o.d.length; i++) o.d[i] = A.d[i] * B.d[i]; return node(o, [A, B], () => { const g = o.g; if (A.req) { const ga = A.grad(); for (let i = 0; i < g.length; i++) ga[i] += g[i] * B.d[i]; } if (B.req) { const gb = B.grad(); for (let i = 0; i < g.length; i++) gb[i] += g[i] * A.d[i]; } }); }
  function scale(A, s) { const o = T(A.r, A.c); for (let i = 0; i < o.d.length; i++) o.d[i] = A.d[i] * s; return node(o, [A], () => { const ga = A.grad(); for (let i = 0; i < o.d.length; i++) ga[i] += o.g[i] * s; }); }
  const unary = (f, df) => A => { const o = T(A.r, A.c); for (let i = 0; i < o.d.length; i++) o.d[i] = f(A.d[i]); return node(o, [A], () => { const ga = A.grad(); for (let i = 0; i < o.d.length; i++) ga[i] += o.g[i] * df(A.d[i], o.d[i]); }); };
  const sigmoid = unary(x => 1 / (1 + Math.exp(-x)), (x, y) => y * (1 - y)), tanh = unary(Math.tanh, (x, y) => 1 - y * y), relu = unary(x => x > 0 ? x : 0, x => x > 0 ? 1 : 0), expT = unary(Math.exp, (x, y) => y), square = unary(x => x * x, x => 2 * x);
  function concatC(list) { const r = list[0].r, c = list.reduce((s, t) => s + t.c, 0), o = T(r, c); let off = 0; list.forEach(t => { for (let i = 0; i < r; i++) for (let j = 0; j < t.c; j++) o.d[i * c + off + j] = t.d[i * t.c + j]; t._off = off; off += t.c; });
    const offs = list.map(t => t._off); return node(o, list, () => { list.forEach((t, k) => { if (!t.req) return; const gt = t.grad(); for (let i = 0; i < r; i++) for (let j = 0; j < t.c; j++) gt[i * t.c + j] += o.g[i * c + offs[k] + j]; }); }); }
  function sliceC(A, a, b) { const c = b - a, o = T(A.r, c); for (let i = 0; i < A.r; i++) for (let j = 0; j < c; j++) o.d[i * c + j] = A.d[i * A.c + a + j]; return node(o, [A], () => { const ga = A.grad(); for (let i = 0; i < A.r; i++) for (let j = 0; j < c; j++) ga[i * A.c + a + j] += o.g[i * c + j]; }); }
  // causal shift of rows by d inside segments of length seg (zero padding at each segment start)
  function shiftRows(A, d, seg) { if (!d) return A; const o = T(A.r, A.c); for (let i = 0; i < A.r; i++) { const p = i % seg; if (p >= d) for (let j = 0; j < A.c; j++) o.d[i * A.c + j] = A.d[(i - d) * A.c + j]; }
    return node(o, [A], () => { const ga = A.grad(); for (let i = 0; i < A.r; i++) { const p = i % seg; if (p >= d) for (let j = 0; j < A.c; j++) ga[(i - d) * A.c + j] += o.g[i * A.c + j]; } }); }
  function rows(A, idx) { const o = T(idx.length, A.c); idx.forEach((ri, i) => { for (let j = 0; j < A.c; j++) o.d[i * A.c + j] = A.d[ri * A.c + j]; }); return node(o, [A], () => { const ga = A.grad(); idx.forEach((ri, i) => { for (let j = 0; j < A.c; j++) ga[ri * A.c + j] += o.g[i * A.c + j]; }); }); }
  function sumCols(A) { const o = T(A.r, 1); for (let i = 0; i < A.r; i++) { let s = 0; for (let j = 0; j < A.c; j++) s += A.d[i * A.c + j]; o.d[i] = s; } return node(o, [A], () => { const ga = A.grad(); for (let i = 0; i < A.r; i++) for (let j = 0; j < A.c; j++) ga[i * A.c + j] += o.g[i]; }); }
  function mean(A) { const o = T(1, 1), n = A.d.length; let s = 0; for (const v of A.d) s += v; o.d[0] = s / n; return node(o, [A], () => { const ga = A.grad(); for (let i = 0; i < n; i++) ga[i] += o.g[0] / n; }); }
  function minimum(A, B) { const o = T(A.r, A.c); for (let i = 0; i < o.d.length; i++) o.d[i] = Math.min(A.d[i], B.d[i]); return node(o, [A, B], () => { for (let i = 0; i < o.d.length; i++) { if (A.d[i] <= B.d[i]) { if (A.req) A.grad()[i] += o.g[i]; } else if (B.req) B.grad()[i] += o.g[i]; } }); }
  function clip(A, lo, hi) { const o = T(A.r, A.c); for (let i = 0; i < o.d.length; i++) o.d[i] = Math.max(lo, Math.min(hi, A.d[i])); return node(o, [A], () => { const ga = A.grad(); for (let i = 0; i < o.d.length; i++) if (A.d[i] > lo && A.d[i] < hi) ga[i] += o.g[i]; }); }
  const mse = (P, Y) => mean(square(sub(P, Y)));
  function backward(loss) { loss.grad()[0] = 1; for (let i = TAPE.length - 1; i >= 0; i--) { const n = TAPE[i]; if (n.back && n.g) n.back(); } }
  function record(fn) { const prev = TAPE; TAPE = []; try { const out = fn(); return out; } finally { /* caller calls step() which clears */ } }
  function step(params, loss, opt) { backward(loss); opt.update(params); TAPE.forEach(n => { n.g = null; }); TAPE = null; }
  const noGrad = fn => { const prev = TAPE; TAPE = null; try { return fn(); } finally { TAPE = prev; } };

  /* ---------- parameters and Adam ---------- */
  const P = (r, c, rng, scaleInit) => { const t = T(r, c, null, true); t.param = true; const s = scaleInit ?? Math.sqrt(2 / (r + c)); for (let i = 0; i < t.d.length; i++) t.d[i] = rng ? rng.normal() * s : 0; return t; };
  class Adam { constructor(lr = 1e-3, b1 = 0.9, b2 = 0.999, clipNorm = 5) { Object.assign(this, {lr, b1, b2, eps: 1e-8, t: 0, m: new Map(), v: new Map(), clipNorm}); }
    update(params) { this.t++; let norm = 0; params.forEach(p => { if (p.g) for (const v of p.g) norm += v * v; }); norm = Math.sqrt(norm); const cf = norm > this.clipNorm ? this.clipNorm / norm : 1;
      params.forEach(p => { if (!p.g) return; if (!this.m.has(p)) { this.m.set(p, new Float64Array(p.d.length)); this.v.set(p, new Float64Array(p.d.length)); } const m = this.m.get(p), v = this.v.get(p);
        for (let i = 0; i < p.d.length; i++) { const g = p.g[i] * cf; m[i] = this.b1 * m[i] + (1 - this.b1) * g; v[i] = this.b2 * v[i] + (1 - this.b2) * g * g; const mh = m[i] / (1 - this.b1 ** this.t), vh = v[i] / (1 - this.b2 ** this.t); p.d[i] -= this.lr * mh / (Math.sqrt(vh) + this.eps); } p.g = null; }); } }
  const copyParams = (from, to) => from.forEach((p, i) => to[i].d.set(p.d));

  /* ---------- models ---------- */
  class Dense { constructor(i, o, rng) { this.W = P(i, o, rng); this.b = P(1, o); } f(X) { return add(matmul(X, this.W), this.b); } params() { return [this.W, this.b]; } }
  class MLP { constructor(sizes, rng, act = 'relu', outAct = null) { this.L = sizes.slice(1).map((o, i) => new Dense(sizes[i], o, rng)); this.act = act; this.outAct = outAct; }
    f(X) { let h = X; this.L.forEach((l, i) => { h = l.f(h); if (i < this.L.length - 1) h = this.act === 'tanh' ? tanh(h) : relu(h); }); return this.outAct === 'sigmoid' ? sigmoid(h) : h; } params() { return this.L.flatMap(l => l.params()); } }
  class LSTM { constructor(F, H, rng) { this.H = H; this.Wx = P(F, 4 * H, rng); this.Wh = P(H, 4 * H, rng, Math.sqrt(1 / H)); this.b = P(1, 4 * H); for (let j = H; j < 2 * H; j++) this.b.d[j] = 1; this.head = new Dense(H, 1, rng); }
    // seq: array of T tensors (B×F); returns B×1
    f(seq) { const B = seq[0].r, H = this.H; let h = T(B, H), c = T(B, H);
      for (const x of seq) { const z = add(add(matmul(x, this.Wx), matmul(h, this.Wh)), this.b), i = sigmoid(sliceC(z, 0, H)), f = sigmoid(sliceC(z, H, 2 * H)), g = tanh(sliceC(z, 2 * H, 3 * H)), o = sigmoid(sliceC(z, 3 * H, 4 * H)); c = add(mul(f, c), mul(i, g)); h = mul(o, tanh(c)); }
      return this.head.f(h); }
    params() { return [this.Wx, this.Wh, this.b, ...this.head.params()]; } }
  class TCN { constructor(F, C, K, dil, rng) { this.K = K; this.dil = dil; this.blocks = dil.map((d, i) => { const cin = i ? C : F; return {d, w1: P(K * cin, C, rng), b1: P(1, C), w2: P(K * C, C, rng), b2: P(1, C), res: cin !== C ? P(cin, C, rng) : null}; }); this.head = new Dense(C, 1, rng); }
    conv(X, w, b, d, seg) { const parts = []; for (let k = 0; k < this.K; k++) parts.push(shiftRows(X, d * (this.K - 1 - k), seg)); return add(matmul(concatC(parts), w), b); }
    // X: (B*T)×F stacked by sample; returns B×1 using the last time step of each sample
    f(X, B, Tlen) { let h = X; for (const bl of this.blocks) { const y1 = relu(this.conv(h, bl.w1, bl.b1, bl.d, Tlen)), y2 = relu(this.conv(y1, bl.w2, bl.b2, bl.d, Tlen)); h = relu(add(y2, bl.res ? matmul(h, bl.res) : h)); }
      return this.head.f(rows(h, Array.from({length: B}, (_, i) => i * Tlen + Tlen - 1))); }
    receptive() { return 1 + this.blocks.reduce((s, b) => s + 2 * (this.K - 1) * b.d, 0); }
    params() { return [...this.blocks.flatMap(b => [b.w1, b.b1, b.w2, b.b2, ...(b.res ? [b.res] : [])]), ...this.head.params()]; } }

  /* ---------- supervised sequence forecasting ---------- */
  // feats: n×F (already aligned, no gaps); target: n (value to predict at row t, e.g. next-period return); window L
  function makeWindows(feats, target, L) { const X = [], y = [], idx = []; for (let t = L - 1; t < feats.length; t++) { if (!Number.isFinite(target[t])) continue; X.push(feats.slice(t - L + 1, t + 1)); y.push(target[t]); idx.push(t); } return {X, y, idx}; }
  async function trainSeq(kind, W, {trainFrac = 0.8, hidden = 16, epochs = 30, lr = 3e-3, batch = 32, seed = 7, kernel = 3, dilations = [1, 2, 4, 8], onEpoch, patience = 6} = {}) {
    const rng = RNG(seed), n = W.X.length, ntr = Math.floor(n * trainFrac), nva = Math.max(1, Math.floor(ntr * 0.15)), ntr2 = ntr - nva, F = W.X[0][0].length, L = W.X[0].length;
    // standardise features and target with training statistics
    const mu = Array(F).fill(0), sd = Array(F).fill(0); let cnt = 0; for (let i = 0; i < ntr; i++) for (const r of W.X[i]) { r.forEach((v, j) => mu[j] += v); cnt++; } mu.forEach((v, j) => mu[j] = v / cnt); for (let i = 0; i < ntr; i++) for (const r of W.X[i]) r.forEach((v, j) => sd[j] += (v - mu[j]) ** 2); sd.forEach((v, j) => sd[j] = Math.sqrt(v / cnt) || 1);
    const ym = W.y.slice(0, ntr).reduce((a, b) => a + b, 0) / ntr, ys = Math.sqrt(W.y.slice(0, ntr).reduce((a, b) => a + (b - ym) ** 2, 0) / ntr) || 1;
    const Xs = W.X.map(w => w.map(r => r.map((v, j) => (v - mu[j]) / sd[j]))), Ys = W.y.map(v => (v - ym) / ys);
    const model = kind === 'tcn' ? new TCN(F, hidden, kernel, dilations, rng) : new LSTM(F, hidden, rng), params = model.params(), opt = new Adam(lr);
    const fwd = ids => { if (kind === 'tcn') { const rowsArr = []; ids.forEach(i => Xs[i].forEach(r => rowsArr.push(r))); return model.f(fromRows(rowsArr), ids.length, L); } return model.f(Array.from({length: L}, (_, t) => fromRows(ids.map(i => Xs[i][t])))); };
    const predict = ids => { const out = []; for (let s = 0; s < ids.length; s += 256) { const ch = ids.slice(s, s + 256), p = noGrad(() => fwd(ch)); ch.forEach((_, k) => out.push(p.d[k] * ys + ym)); } return out; };
    let best = Infinity, bestW = null, bad = 0; const hist = [];
    for (let ep = 0; ep < epochs; ep++) {
      const order = Array.from({length: ntr2}, (_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      let tl = 0, nb = 0; for (let s = 0; s < ntr2; s += batch) { const ids = order.slice(s, s + batch); TAPE = []; const out = fwd(ids), loss = mse(out, T(ids.length, 1, Float64Array.from(ids.map(i => Ys[i])))); tl += loss.d[0]; nb++; step(params, loss, opt); }
      const vi = Array.from({length: nva}, (_, i) => ntr2 + i), vp = predict(vi), vl = vi.reduce((s2, i, k) => s2 + ((vp[k] - W.y[i]) / ys) ** 2, 0) / nva;
      hist.push({epoch: ep + 1, train: tl / nb, val: vl}); if (onEpoch) await onEpoch(ep + 1, tl / nb, vl);
      if (vl < best - 1e-6) { best = vl; bestW = params.map(p => Float64Array.from(p.d)); bad = 0; } else if (++bad >= patience) break;
    }
    if (bestW) params.forEach((p, i) => p.d.set(bestW[i]));
    const all = Array.from({length: n}, (_, i) => i), pred = predict(all);
    return {model, pred, ntr, hist, receptive: kind === 'tcn' ? model.receptive() : L, predictWindow: win => noGrad(() => { const z = win.map(r => r.map((v, j) => (v - mu[j]) / sd[j])); const o = kind === 'tcn' ? model.f(fromRows(z), 1, L) : model.f(z.map(r => fromRows([r]))); return o.d[0] * ys + ym; })};
  }

  /* ---------- reinforcement learning for execution / position sizing ---------- */
  // env: states n×F (standardised), rets n (next-period simple return earned by the position held at t), cost per unit turnover
  function runPolicy(states, rets, cost, act) { let pos = 0, eq = 1; const curve = [], posArr = []; for (let t = 0; t < rets.length; t++) { const np = act(states[t], pos, t); eq *= 1 + np * rets[t] - cost * Math.abs(np - pos); pos = np; curve.push(eq); posArr.push(np); } return {curve, pos: posArr}; }
  async function trainDQN(states, rets, {cost = 0.004, actions = [0, 0.5, 1], episodes = 30, hidden = 32, gamma = 0.97, lr = 1e-3, batch = 64, seed = 5, eps0 = 1, eps1 = 0.05, targetEvery = 250, onEpisode} = {}) {
    const rng = RNG(seed), F = states[0].length + 1, A = actions.length, q = new MLP([F, hidden, hidden, A], rng), qt = new MLP([F, hidden, hidden, A], rng), params = q.params(), opt = new Adam(lr), buf = []; copyParams(params, qt.params());
    const qv = (net, s) => noGrad(() => net.f(fromRows([s])).d); let steps = 0; const hist = [];
    for (let ep = 0; ep < episodes; ep++) { const eps = eps0 + (eps1 - eps0) * Math.min(1, ep / (episodes * 0.7)); let pos = 0, total = 0;
      for (let t = 0; t < rets.length - 1; t++) { const s = [...states[t], pos]; let a; if (rng() < eps) a = rng.int(A); else { const v = qv(q, s); a = v.indexOf(Math.max(...v)); }
        const np = actions[a], r = (np * rets[t] - cost * Math.abs(np - pos)) * 100; total += r; const s2 = [...states[t + 1], np]; buf.push([s, a, r, s2, t === rets.length - 2]); if (buf.length > 20000) buf.shift(); pos = np; steps++;
        if (buf.length >= batch && steps % 2 === 0) { const B = Array.from({length: batch}, () => buf[rng.int(buf.length)]), tq = noGrad(() => qt.f(fromRows(B.map(b => b[3])))), onl = noGrad(() => q.f(fromRows(B.map(b => b[3]))));
          const tgt = B.map((b, i) => { const row = Array.from(onl.d.slice(i * A, i * A + A)), aStar = row.indexOf(Math.max(...row)); return b[2] + (b[4] ? 0 : gamma * tq.d[i * A + aStar]); });   // double DQN target
          const mask = fromRows(B.map(b => actions.map((_, j) => +(j === b[1])))); TAPE = []; const out = sumCols(mul(q.f(fromRows(B.map(b => b[0]))), mask)), loss = mse(out, T(batch, 1, Float64Array.from(tgt))); step(params, loss, opt); }
        if (steps % targetEvery === 0) copyParams(params, qt.params()); }
      hist.push({episode: ep + 1, reward: total, eps}); if (onEpisode) await onEpisode(ep + 1, total, eps); }
    return {policy: (s, pos) => { const v = qv(q, [...s, pos]); return actions[v.indexOf(Math.max(...v))]; }, hist, actions};
  }
  async function trainPPO(states, rets, {cost = 0.004, iters = 40, horizon = 256, hidden = 32, gamma = 0.97, lam = 0.95, clipEps = 0.2, lr = 3e-4, epochsPer = 4, mb = 64, seed = 9, entCoef = 0.001, onIter} = {}) {
    const rng = RNG(seed), F = states[0].length + 1, actor = new MLP([F, hidden, hidden, 1], rng, 'tanh'), critic = new MLP([F, hidden, hidden, 1], rng, 'tanh'), logStd = P(1, 1); logStd.d[0] = Math.log(0.6);
    const pa = [...actor.params(), logStd], pc = critic.params(), oa = new Adam(lr), oc = new Adam(lr * 3), hist = [], n = rets.length - 1;
    const sig = x => 1 / (1 + Math.exp(-x)); let t0 = 0;
    for (let it = 0; it < iters; it++) {
      const S_ = [], Aa = [], R = [], V = [], LP = []; let pos = 0; const start = t0; let total = 0;
      for (let k = 0; k < horizon; k++) { const t = (start + k) % n; if (t === 0) pos = 0; const s = [...states[t], pos], m = noGrad(() => actor.f(fromRows([s]))).d[0], sd = Math.exp(logStd.d[0]), a = m + sd * rng.normal(), np = sig(a);
        const r = (np * rets[t] - cost * Math.abs(np - pos)) * 100; total += r; S_.push(s); Aa.push(a); R.push(r); V.push(noGrad(() => critic.f(fromRows([s]))).d[0]); LP.push(-((a - m) ** 2) / (2 * sd * sd) - Math.log(sd)); pos = np; }
      t0 = (start + horizon) % n; const lastV = noGrad(() => critic.f(fromRows([[...states[t0], pos]]))).d[0];
      const adv = new Array(horizon).fill(0); let g = 0; for (let k = horizon - 1; k >= 0; k--) { const nv = k === horizon - 1 ? lastV : V[k + 1], delta = R[k] + gamma * nv - V[k]; g = delta + gamma * lam * g; adv[k] = g; }
      const ret = adv.map((a, k) => a + V[k]), am = adv.reduce((a, b) => a + b, 0) / horizon, as = Math.sqrt(adv.reduce((a, b) => a + (b - am) ** 2, 0) / horizon) || 1, advN = adv.map(a => (a - am) / as);
      for (let e = 0; e < epochsPer; e++) { const ord = Array.from({length: horizon}, (_, i) => i); for (let i = ord.length - 1; i > 0; i--) { const j = rng.int(i + 1); [ord[i], ord[j]] = [ord[j], ord[i]]; }
        for (let s = 0; s < horizon; s += mb) { const ids = ord.slice(s, s + mb), B = ids.length, X = fromRows(ids.map(i => S_[i]));
          TAPE = []; const m = actor.f(X), std = expT(add(T(B, 1), logStd)), aT = T(B, 1, Float64Array.from(ids.map(i => Aa[i]))), z = mul(sub(aT, m), expT(scale(add(T(B, 1), logStd), -1)));
          const lp = sub(scale(square(z), -0.5), add(T(B, 1), logStd)), ratio = expT(sub(lp, T(B, 1, Float64Array.from(ids.map(i => LP[i]))))), At = T(B, 1, Float64Array.from(ids.map(i => advN[i])));
          const obj = minimum(mul(ratio, At), mul(clip(ratio, 1 - clipEps, 1 + clipEps), At)), loss = sub(scale(mean(obj), -1), scale(mean(add(T(B, 1), logStd)), entCoef)); void std; step(pa, loss, oa);
          TAPE = []; const vl = mse(critic.f(X), T(B, 1, Float64Array.from(ids.map(i => ret[i])))); step(pc, vl, oc); } }
      logStd.d[0] = Math.max(Math.log(0.05), Math.min(Math.log(2), logStd.d[0]));
      hist.push({iter: it + 1, reward: total, std: Math.exp(logStd.d[0])}); if (onIter) await onIter(it + 1, total);
    }
    return {policy: (s, pos) => sig(noGrad(() => actor.f(fromRows([[...s, pos]]))).d[0]), hist};
  }

  /* ---------- gradient-boosted trees (XGBoost algorithm, exact greedy) ---------- */
  function gbtFit(X, y, {rounds = 200, eta = 0.1, maxDepth = 3, lambda = 1, gamma = 0, minChildWeight = 1, subsample = 1, colsample = 1, objective = 'reg', baseScore = null, seed = 1} = {}) {
    const n = X.length, F = X[0].length, rng = RNG(seed), base = baseScore ?? (objective === 'logistic' ? 0 : y.reduce((a, b) => a + b, 0) / n);
    const pred = new Array(n).fill(objective === 'logistic' ? Math.log((base || 0.5) / (1 - (base || 0.5))) * 0 + 0 : base), trees = [], gain = new Array(F).fill(0), cover = new Array(F).fill(0), weight = new Array(F).fill(0);
    const sorted = Array.from({length: F}, (_, f) => Array.from({length: n}, (_, i) => i).sort((a, b) => X[a][f] - X[b][f]));
    const baseMargin = objective === 'logistic' ? Math.log(((baseScore ?? 0.5)) / (1 - (baseScore ?? 0.5))) : base; pred.fill(baseMargin);
    for (let r = 0; r < rounds; r++) {
      const G = new Float64Array(n), H = new Float64Array(n); for (let i = 0; i < n; i++) { if (objective === 'logistic') { const p = 1 / (1 + Math.exp(-pred[i])); G[i] = p - y[i]; H[i] = Math.max(p * (1 - p), 1e-16); } else { G[i] = pred[i] - y[i]; H[i] = 1; } }
      const inS = new Uint8Array(n); for (let i = 0; i < n; i++) inS[i] = subsample >= 1 || rng() < subsample ? 1 : 0;
      const feats = Array.from({length: F}, (_, f) => f).filter(() => colsample >= 1 || rng() < colsample); if (!feats.length) feats.push(rng.int(F));
      const nodeOf = new Int32Array(n).fill(0); const tree = []; tree.push({id: 0, depth: 0});
      const build = (nid, members) => { const nd = tree[nid]; let Gs = 0, Hs = 0; members.forEach(i => { Gs += G[i]; Hs += H[i]; });
        const leaf = () => { nd.leaf = -Gs / (Hs + lambda) * eta; };
        if (nd.depth >= maxDepth || Hs < 2 * minChildWeight) return leaf();
        let best = {gain: 0}; const mem = new Uint8Array(n); members.forEach(i => mem[i] = 1);
        for (const f of feats) { let GL = 0, HL = 0; const ord = sorted[f]; let prev = null;
          for (let k = 0; k < n; k++) { const i = ord[k]; if (!mem[i]) continue; if (prev !== null && X[i][f] !== X[prev][f] && HL >= minChildWeight && Hs - HL >= minChildWeight) { const GR = Gs - GL, HR = Hs - HL, gn = (GL * GL / (HL + lambda) + GR * GR / (HR + lambda) - Gs * Gs / (Hs + lambda)) - gamma; if (gn > best.gain) best = {gain: gn, f, thr: (X[i][f] + X[prev][f]) / 2, cover: Hs}; } GL += G[i]; HL += H[i]; prev = i; } }
        if (!(best.gain > 0)) return leaf();
        nd.f = best.f; nd.thr = best.thr; gain[best.f] += best.gain; cover[best.f] += best.cover; weight[best.f]++;
        const L = members.filter(i => X[i][best.f] < best.thr), Rr = members.filter(i => X[i][best.f] >= best.thr);
        nd.l = tree.length; tree.push({depth: nd.depth + 1}); build(nd.l, L); nd.r = tree.length; tree.push({depth: nd.depth + 1}); build(nd.r, Rr); };
      build(0, Array.from({length: n}, (_, i) => i).filter(i => inS[i]));
      trees.push(tree); for (let i = 0; i < n; i++) pred[i] += leafOf(tree, X[i]); void nodeOf;
    }
    const model = {trees, base: baseMargin, objective, F, importance: {gain, cover, weight}};
    model.predict = Xn => Xn.map(x => { let m = baseMargin; for (const t of trees) m += leafOf(t, x); return objective === 'logistic' ? 1 / (1 + Math.exp(-m)) : m; });
    return model;
  }
  function leafOf(tree, x) { let nd = tree[0]; while (nd.leaf === undefined) nd = tree[x[nd.f] < nd.thr ? nd.l : nd.r]; return nd.leaf; }

  return {RNG, T, fromRows, matmul, add, sub, mul, scale, sigmoid, tanh, relu, mean, mse, sumCols, rows, shiftRows, concatC, sliceC, Adam, MLP, LSTM, TCN, Dense, P,
    step, noGrad, makeWindows, trainSeq, trainDQN, trainPPO, runPolicy, gbtFit, setTape: v => { TAPE = v; }};
})();
if (typeof module !== 'undefined') module.exports = ML;
