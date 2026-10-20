/* Factor & SEM lab: build observed variables from any series, then run
   - Exploratory factor analysis (KMO, Bartlett, parallel analysis, PCA / principal-axis, varimax, factor scores, prediction)
   - PLS-SEM (path weighting, Mode A), bootstrap significance, reliability and validity, PLSpredict, next-period prediction
   and export lavaan (CB-SEM) and seminr (PLS-SEM) syntax for R. Loaded before app.js; defines functions only. */
'use strict';

/* ============================== maths ============================== */
const SEMC = (() => {
  const ok = v => typeof v === 'number' && isFinite(v);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const zeros = (r, c) => Array.from({length: r}, () => Array(c).fill(0));
  const eye = n => Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => +(i === j)));
  const T = A => A[0].map((_, j) => A.map(r => r[j]));
  const mul = (A, B) => { const n = A.length, m = B[0].length, k = B.length, C = zeros(n, m); for (let i = 0; i < n; i++) for (let l = 0; l < k; l++) { const a = A[i][l]; if (a) for (let j = 0; j < m; j++) C[i][j] += a * B[l][j]; } return C; };
  const col = (X, j) => X.map(r => r[j]);
  function inv(A) {
    const n = A.length, M = A.map((r, i) => [...r, ...eye(n)[i]]);
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
    return M.map(r => r.slice(n));
  }
  function logdet(A) { const n = A.length, M = A.map(r => r.slice()); let s = 0;
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-300) return -Infinity;
      [M[c], M[p]] = [M[p], M[c]]; s += Math.log(Math.abs(M[c][c])); for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j < n; j++) M[r][j] -= f * M[c][j]; } }
    return s; }
  /* symmetric eigen decomposition (cyclic Jacobi); values sorted descending, vectors as columns */
  function eig(S) {
    const n = S.length, A = S.map(r => r.slice()), V = eye(n);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const idx = [...Array(n).keys()].sort((a, b) => A[b][b] - A[a][a]);
    return {values: idx.map(i => A[i][i]), vectors: V.map(r => idx.map(i => r[i]))};
  }
  /* regularized upper incomplete gamma Q(a, x) — for chi-square p-values */
  function lgamma(x) { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const c of g) s += c / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function gammaQ(a, x) {
    if (x <= 0) return 1; const gl = lgamma(a);
    if (x < a + 1) { let ap = a, s = 1 / a, d = s; for (let i = 0; i < 500; i++) { ap++; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-15) break; } return 1 - s * Math.exp(-x + a * Math.log(x) - gl); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
    return Math.exp(-x + a * Math.log(x) - gl) * h;
  }
  const chi2p = (x, df) => gammaQ(df / 2, x / 2);
  const normCdf = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804014327 * Math.exp(-z * z / 2), p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z > 0 ? 1 - p : p; };
  const pNorm2 = z => 2 * (1 - normCdf(Math.abs(z)));
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = r => () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

  function standardize(X, mu, sd) {
    const p = X[0].length; mu = mu || [...Array(p).keys()].map(j => mean(col(X, j))); sd = sd || [...Array(p).keys()].map(j => sdv(col(X, j)) || 1);
    return {Z: X.map(r => r.map((v, j) => (v - mu[j]) / sd[j])), mu, sd};
  }
  function corrOf(Z) { const n = Z.length, p = Z[0].length, R = zeros(p, p);
    for (const r of Z) for (let i = 0; i < p; i++) { const a = r[i]; for (let j = i; j < p; j++) R[i][j] += a * r[j]; }
    for (let i = 0; i < p; i++) for (let j = i; j < p; j++) { R[i][j] /= n - 1; R[j][i] = R[i][j]; }
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) if (i !== j) R[i][j] /= Math.sqrt(R[i][i] * R[j][j]);
    for (let i = 0; i < p; i++) R[i][i] = 1; return R; }
  function kmo(R) {
    const Ri = inv(R); if (!Ri) return null; const p = R.length; let r2 = 0, a2 = 0; const msa = [];
    for (let i = 0; i < p; i++) { let ri = 0, ai = 0; for (let j = 0; j < p; j++) if (i !== j) { const a = -Ri[i][j] / Math.sqrt(Ri[i][i] * Ri[j][j]); ri += R[i][j] ** 2; ai += a * a; } msa.push(ri / (ri + ai)); r2 += ri; a2 += ai; }
    return {kmo: r2 / (r2 + a2), msa};
  }
  function bartlett(R, n) { const p = R.length, ld = logdet(R), chi = -(n - 1 - (2 * p + 5) / 6) * ld, df = p * (p - 1) / 2; return {chi, df, p: chi2p(chi, df)}; }
  function parallel(n, p, reps = 60, seed = 20260930) {
    const g = gauss(rng(seed)), ev = [];
    for (let r = 0; r < reps; r++) { const X = Array.from({length: n}, () => Array.from({length: p}, g)); ev.push(eig(corrOf(standardize(X).Z)).values); }
    const q = (a, pr) => { const s = a.slice().sort((x, y) => x - y), h = (s.length - 1) * pr, lo = Math.floor(h); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo); };
    return {mean: [...Array(p).keys()].map(j => mean(ev.map(e => e[j]))), p95: [...Array(p).keys()].map(j => q(ev.map(e => e[j]), 0.95))};
  }
  function extract(R, k, method) {
    const p = R.length;
    if (method === 'pca') { const e = eig(R); return {L: R.map((_, i) => [...Array(k).keys()].map(j => e.vectors[i][j] * Math.sqrt(Math.max(e.values[j], 0)))), iter: 0, heywood: false}; }
    const Ri = inv(R); let h2 = Ri ? Ri.map((r, i) => Math.max(0.005, 1 - 1 / r[i])) : R.map((r, i) => Math.max(...r.filter((_, j) => j !== i).map(Math.abs)));
    let L, it = 0, heywood = false;
    for (; it < 500; it++) {
      const Rr = R.map((r, i) => r.map((v, j) => i === j ? h2[i] : v)), e = eig(Rr);
      L = R.map((_, i) => [...Array(k).keys()].map(j => e.vectors[i][j] * Math.sqrt(Math.max(e.values[j], 0))));
      const nh = L.map(r => r.reduce((s, x) => s + x * x, 0)); if (nh.some(v => v > 1)) heywood = true;
      const dmax = Math.max(...nh.map((v, i) => Math.abs(v - h2[i]))); h2 = nh.map(v => Math.min(v, 0.995)); if (dmax < 1e-6) break;
    }
    return {L, iter: it + 1, heywood};
  }
  function varimax(L0, normalize = true, eps = 1e-5) {
    const p = L0.length, k = L0[0].length; if (k < 2) return {L: L0.map(r => r.slice()), rot: eye(k)};
    const sc = L0.map(r => Math.sqrt(r.reduce((s, x) => s + x * x, 0)) || 1), x = normalize ? L0.map((r, i) => r.map(v => v / sc[i])) : L0.map(r => r.slice());
    let TT = eye(k), d = 0;
    for (let it = 0; it < 1000; it++) {
      const z = mul(x, TT), cs = [...Array(k).keys()].map(j => z.reduce((s, r) => s + r[j] ** 2, 0) / p);
      const B = mul(T(x), z.map(r => r.map((v, j) => v ** 3 - v * cs[j])));
      const e = eig(mul(T(B), B)), sv = e.values.map(v => Math.sqrt(Math.max(v, 1e-300)));
      const isq = mul(mul(e.vectors, e.vectors.map((_, i) => e.vectors.map((__, j) => i === j ? 1 / sv[i] : 0))), T(e.vectors));
      TT = mul(B, isq); const dp = d; d = sv.reduce((s, v) => s + v, 0); if (d < dp * (1 + eps)) break;
    }
    let L = mul(x, TT); if (normalize) L = L.map((r, i) => r.map(v => v * sc[i]));
    return {L, rot: TT};
  }
  /* full EFA on an n×p matrix */
  function efa(X, {k, method = 'pca', rotate = 'varimax'}) {
    const st = standardize(X), R = corrOf(st.Z), e = eig(R), p = R.length;
    k = Math.max(1, Math.min(k, p - (method === 'paf' ? 1 : 0), p));
    const ex = extract(R, k, method); let L = ex.L;
    if (rotate === 'varimax' && k > 1) L = varimax(L).L;
    const ssl = [...Array(k).keys()].map(j => L.reduce((s, r) => s + r[j] ** 2, 0)), order = [...Array(k).keys()].sort((a, b) => ssl[b] - ssl[a]);
    L = L.map(r => order.map(j => r[j])); const ss = order.map(j => ssl[j]);
    for (let j = 0; j < k; j++) { const s = L.reduce((a, r) => a + r[j], 0); if (s < 0) L.forEach(r => r[j] = -r[j]); }
    const Ri = inv(R) || inv(R.map((r, i) => r.map((v, j) => i === j ? v + 1e-6 : v))), W = mul(Ri, L);
    return {mu: st.mu, sd: st.sd, R, eig: e.values, L, W, k, h2: L.map(r => r.reduce((s, x) => s + x * x, 0)), ss, pv: ss.map(v => v / p * 100), iter: ex.iter, heywood: ex.heywood};
  }
  const efaScores = (X, f) => mul(standardize(X, f.mu, f.sd).Z, f.W);

  /* OLS without intercept on standardized data: returns beta and R² */
  function olsStd(y, Xc) { const k = Xc.length; if (!k) return {b: [], r2: 0};
    const XtX = Xc.map(a => Xc.map(b => a.reduce((s, v, i) => s + v * b[i], 0))), Xty = Xc.map(a => a.reduce((s, v, i) => s + v * y[i], 0)), Ii = inv(XtX);
    if (!Ii) throw new Error('Two or more constructs pointing to the same construct are perfectly collinear.');
    const b = Ii.map(r => r.reduce((s, v, j) => s + v * Xty[j], 0)), fit = y.map((_, i) => Xc.reduce((s, x, j) => s + b[j] * x[i], 0));
    const my = mean(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), sse = y.reduce((s, v, i) => s + (v - fit[i]) ** 2, 0);
    return {b, r2: sst ? 1 - sse / sst : 0}; }
  const stdz = a => { const m = mean(a), s = sdv(a) || 1; return a.map(v => (v - m) / s); };
  const corr = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa && sb ? sab / Math.sqrt(sa * sb) : 0; };
  function topo(m, paths) { const pre = [...Array(m).keys()].map(j => paths.filter(p => p[1] === j).map(p => p[0])), out = [], seen = new Set(), vis = new Set();
    const visit = j => { if (seen.has(j)) return; if (vis.has(j)) throw new Error('The structural model has a loop. PLS-SEM needs a recursive (one-way) model.'); vis.add(j); pre[j].forEach(visit); seen.add(j); out.push(j); };
    for (let j = 0; j < m; j++) visit(j); return {order: out, pre}; }

  /* PLS-SEM: path weighting scheme, Mode A (reflective) outer model.
     X: n×q raw item matrix; blocks: array of item-index arrays; paths: [from, to] construct indices */
  function pls(X, blocks, paths, opt = {}) {
    const n = X.length, m = blocks.length, st = opt.st || standardize(X), Z = st.Z, {order, pre} = topo(m, paths);
    const suc = [...Array(m).keys()].map(j => paths.filter(p => p[0] === j).map(p => p[1]));
    blocks.forEach((b, j) => { if (!pre[j].length && !suc[j].length) throw new Error('Every construct must be connected to at least one other construct by a path.'); });
    let W = opt.w0 ? opt.w0.map(w => w.slice()) : blocks.map(b => b.map(() => 1)), Y, it = 0, conv = false;
    const lv = () => blocks.map((b, j) => { const raw = Z.map(r => b.reduce((s, h, i) => s + r[h] * W[j][i], 0)), s = sdv(raw) || 1; W[j] = W[j].map(w => w / s); return raw.map(v => v / s); });
    Y = lv();
    for (; it < 300; it++) {
      const E = [...Array(m).keys()].map(j => { const z = Array(n).fill(0);
        if (pre[j].length) { const r = olsStd(Y[j], pre[j].map(i => Y[i])); pre[j].forEach((i, k) => { for (let t = 0; t < n; t++) z[t] += r.b[k] * Y[i][t]; }); }
        suc[j].forEach(i => { const c = corr(Y[j], Y[i]); for (let t = 0; t < n; t++) z[t] += c * Y[i][t]; });
        return z; });
      const old = W.map(w => w.slice());
      W = blocks.map((b, j) => b.map(h => { let s = 0; for (let t = 0; t < n; t++) s += Z[t][h] * E[j][t]; return s / (n - 1); }));
      Y = lv();
      const d = Math.max(...W.flatMap((w, j) => w.map((v, i) => Math.abs(v - old[j][i])))); if (d < 1e-7) { conv = true; it++; break; }
    }
    const load = blocks.map((b, j) => b.map(h => corr(Z.map(r => r[h]), Y[j])));
    const B = [...Array(m).keys()].map(() => Array(m).fill(0)), R2 = Array(m).fill(null), R2a = Array(m).fill(null), f2 = [...Array(m).keys()].map(() => Array(m).fill(null)), vif = [...Array(m).keys()].map(() => Array(m).fill(null));
    for (let j = 0; j < m; j++) { if (!pre[j].length) continue; const r = olsStd(Y[j], pre[j].map(i => Y[i])); pre[j].forEach((i, k) => B[i][j] = r.b[k]); R2[j] = r.r2; const kk = pre[j].length; R2a[j] = 1 - (1 - r.r2) * (n - 1) / (n - kk - 1);
      pre[j].forEach(i => { const others = pre[j].filter(x => x !== i); const rx = others.length ? olsStd(Y[j], others.map(o => Y[o])).r2 : 0; f2[i][j] = (r.r2 - rx) / (1 - r.r2);
        vif[i][j] = others.length ? 1 / Math.max(1e-12, 1 - olsStd(Y[i], others.map(o => Y[o])).r2) : 1; }); }
    // total effects: B + B² + …
    let P = B.map(r => r.slice()), Tt = B.map(r => r.slice()); for (let s = 1; s < m; s++) { P = mul(P, B); Tt = Tt.map((r, i) => r.map((v, j) => v + P[i][j])); }
    return {Y, W, load, B, R2, R2a, f2, vif, total: Tt, iter: it, conv, st, order, pre, suc, n};
  }
  function reliability(X, blocks, fit) {
    const Z = fit.st.Z, C = corrOf(fit.Y.map ? T(fit.Y) : fit.Y);
    return blocks.map((b, j) => { const k = b.length, l = fit.load[j];
      let alpha = null; if (k > 1) { const Rb = corrOf(Z.map(r => b.map(h => r[h]))), tot = Rb.flat().reduce((s, v) => s + v, 0); alpha = k / (k - 1) * (1 - k / tot); }
      const sl = l.reduce((s, v) => s + v, 0), se = l.reduce((s, v) => s + (1 - v * v), 0);
      return {alpha, rhoC: k > 1 ? sl * sl / (sl * sl + se) : null, ave: l.reduce((s, v) => s + v * v, 0) / k, k, lvCorr: C[j]}; });
  }
  function htmt(X, blocks, st) {
    const Z = st.Z, R = corrOf(Z), m = blocks.length, H = [...Array(m).keys()].map(() => Array(m).fill(null));
    const mono = b => { if (b.length < 2) return null; let s = 0, c = 0; for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { s += Math.abs(R[b[i]][b[j]]); c++; } return s / c; };
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) { const ma = mono(blocks[a]), mb = mono(blocks[b]); if (ma == null || mb == null) continue; let s = 0, c = 0; blocks[a].forEach(i => blocks[b].forEach(j => { s += Math.abs(R[i][j]); c++; })); H[a][b] = H[b][a] = s / c / Math.sqrt(ma * mb); }
    return H;
  }
  /* bootstrap (IID or moving-block for time series) */
  function bootstrap(X, blocks, paths, fit, {reps = 200, block = 0, seed = 7}) {
    const n = X.length, r = rng(seed), out = [];
    for (let b = 0; b < reps; b++) {
      let idx = [];
      if (block > 1) { while (idx.length < n) { const s = Math.floor(r() * (n - block + 1)); for (let i = 0; i < block && idx.length < n; i++) idx.push(s + i); } }
      else idx = Array.from({length: n}, () => Math.floor(r() * n));
      try { const f = pls(idx.map(i => X[i]), blocks, paths, {w0: fit.W}); out.push({B: f.B, load: f.load, total: f.total, R2: f.R2}); } catch (e) { /* skip degenerate resample */ }
    }
    return out;
  }
  /* PLSpredict (earliest antecedents): predict endogenous items from exogenous items only */
  function plsPredictRows(Xrows, blocks, fit) {
    const {mu, sd} = fit.st, m = blocks.length, Z = Xrows.map(r => r.map((v, j) => (v - mu[j]) / sd[j]));
    return Z.map(z => { const Yh = Array(m).fill(null);
      fit.order.forEach(j => { if (!fit.pre[j].length) Yh[j] = blocks[j].reduce((s, h, i) => s + z[h] * fit.W[j][i], 0); else Yh[j] = fit.pre[j].reduce((s, i) => s + fit.B[i][j] * Yh[i], 0); });
      const xh = Array(z.length).fill(null); blocks.forEach((b, j) => { if (!fit.pre[j].length) return; b.forEach((h, i) => xh[h] = mu[h] + sd[h] * fit.load[j][i] * Yh[j]); });
      return {Yh, xh}; });
  }
  return {mean, sdv, inv, eig, logdet, gammaQ, chi2p, normCdf, pNorm2, rng, standardize, corrOf, kmo, bartlett, parallel, extract, varimax, efa, efaScores, olsStd, pls, reliability, htmt, bootstrap, plsPredictRows, topo, mul, T};
})();
if (typeof module !== 'undefined') module.exports = SEMC;

/* ============================== state and presets ============================== */
const SM = {
  freq: 'day', agg: 'last', lastN: 1000, method: 'pls', holdout: 20,
  base: [], inds: [],
  efa: {items: [], target: '', k: 'auto', ext: 'pca', rot: 'varimax'},
  pls: {cons: [], paths: [], target: '', reps: 200, boot: 'block'},
  result: null, preset: ''};
const SEM_DAILY_BASE = [{name: 'NEPSE', ds: 'stock_ohlc', cat: 'NEPSE', col: 'close'}, {name: 'BANK', ds: 'stock_ohlc', cat: 'BANKING', col: 'close'}, {name: 'NABIL', ds: 'stock_ohlc', cat: 'NABIL', col: 'close'}, {name: 'TURN', ds: 'stock_ohlc', cat: 'NEPSE', col: 'volume'}];
const SEM_DAILY_INDS = [
  ['m20', 'pct(NEPSE,20)'], ['m60', 'pct(NEPSE,60)'], ['trend50', '(NEPSE/sma(NEPSE,50) - 1)*100'], ['rsi14', 'rsi(NEPSE,14)'],
  ['bank20', 'pct(BANK,20)'], ['nabil20', 'pct(NABIL,20)'], ['banktrend', '(BANK/sma(BANK,50) - 1)*100'],
  ['turn5', 'log(sma(TURN,5)/sma(TURN,60))'], ['turn20', 'log(sma(TURN,20)/sma(TURN,120))'],
  ['vol20', 'std(ret(NEPSE),20)*100'], ['vol60', 'std(ret(NEPSE),60)*100'], ['dd', '-drawdown(NEPSE)*100'],
  ['fwd5', 'lead(pct(NEPSE,5),5)']];
const SEM_MONTH_BASE = [{name: 'NEPSE', ds: 'stock_ohlc', cat: 'NEPSE', col: 'close'}, {name: 'IB', ds: 'rates_monthly', cat: '', col: 'interbank'}, {name: 'TB', ds: 'rates_monthly', cat: '', col: 'tbill91'},
  {name: 'LR', ds: 'rates_monthly', cat: '', col: 'lending'}, {name: 'CPI', ds: 'inflation_monthly', cat: '', col: 'cpi'}, {name: 'FX', ds: 'fx_monthly', cat: '', col: 'npr_usd'},
  {name: 'RES', ds: 'reserves_monthly', cat: '', col: 'usd_mn'}, {name: 'CD', ds: 'bank_monthly', cat: '', col: 'cr_dep'}, {name: 'NPL', ds: 'bank_monthly', cat: '', col: 'npl'}];
const SEM_MONTH_INDS = [   // changes, not levels: trending levels make spurious factors
  ['dib', 'diff(ffill(IB),3)'], ['dtb', 'diff(ffill(TB),3)'], ['dlr', 'diff(ffill(LR),3)'], ['cpi', 'ffill(CPI)'], ['fxg', 'ffill(pct(FX,12))'], ['resg', 'ffill(pct(RES,12))'], ['resg3', 'ffill(pct(RES,3))'],
  ['dcd', 'diff(ffill(CD),3)'], ['dnpl', 'diff(ffill(NPL),3)'], ['mom3', 'pct(NEPSE,3)'], ['fwd3', 'lead(pct(NEPSE,3),3)']];
const SEM_PRESETS = [
  {id: 'dpls', label: 'Daily market model (PLS-SEM): Momentum, Banking, Activity, Risk → next 5-session return', freq: 'day', lastN: 1000, base: SEM_DAILY_BASE, inds: SEM_DAILY_INDS, method: 'pls',
    cons: [['Momentum', ['m20', 'm60', 'trend50', 'rsi14']], ['Banking', ['bank20', 'nabil20', 'banktrend']], ['Activity', ['turn5', 'turn20']], ['Risk', ['vol20', 'vol60', 'dd']], ['Future', ['fwd5']]],
    paths: [['Activity', 'Momentum'], ['Momentum', 'Future'], ['Banking', 'Future'], ['Activity', 'Future'], ['Risk', 'Future']], target: 'Future'},
  {id: 'defa', label: 'Daily indicators (EFA): find the hidden factors, then predict the next 5-session return', freq: 'day', lastN: 1000, base: SEM_DAILY_BASE, inds: SEM_DAILY_INDS, method: 'efa',
    items: ['m20', 'm60', 'trend50', 'rsi14', 'bank20', 'nabil20', 'banktrend', 'turn5', 'turn20', 'vol20', 'vol60', 'dd'], etarget: 'fwd5'},
  {id: 'mpls', label: 'Monthly macro-financial model (PLS-SEM): Rates, Prices, External, Credit → next 3-month NEPSE return', freq: 'fym', agg: 'last', lastN: 0, base: SEM_MONTH_BASE, inds: SEM_MONTH_INDS, method: 'pls',
    cons: [['Rates', ['dib', 'dtb', 'dlr']], ['Prices', ['cpi', 'fxg']], ['External', ['resg', 'resg3']], ['Credit', ['dcd', 'dnpl']], ['Momentum', ['mom3']], ['Market', ['fwd3']]],
    paths: [['External', 'Rates'], ['Rates', 'Market'], ['Prices', 'Market'], ['External', 'Market'], ['Credit', 'Market'], ['Momentum', 'Market']], target: 'Market'},
  {id: 'mefa', label: 'Monthly macro indicators (EFA): factors behind rates, prices, reserves and credit', freq: 'fym', agg: 'last', lastN: 0, base: SEM_MONTH_BASE, inds: SEM_MONTH_INDS, method: 'efa',
    items: ['dib', 'dtb', 'dlr', 'cpi', 'fxg', 'resg', 'resg3', 'dcd', 'dnpl'], etarget: 'fwd3'},
  {id: 'news', label: 'News sentiment → market (PLS-SEM; needs 30+ sessions with news)', freq: 'day', lastN: 0, fromNews: true,
    base: [{name: 'NEPSE', ds: 'stock_ohlc', cat: 'NEPSE', col: 'close'}, {name: 'TONE', ds: 'news_sentiment', cat: '', col: 'tone'}, {name: 'NET', ds: 'news_sentiment', cat: '', col: 'net'}, {name: 'UNC', ds: 'news_sentiment', cat: '', col: 'unc'}],
    inds: [['tone3', 'ema(ffill(TONE),3)'], ['net3', 'ema(ffill(NET),3)'], ['unc3', 'ema(ffill(UNC),3)'], ['m5', 'pct(NEPSE,5)'], ['m20', 'pct(NEPSE,20)'], ['fwd5', 'lead(pct(NEPSE,5),5)']], method: 'pls',
    cons: [['Sentiment', ['tone3', 'net3']], ['Uncertainty', ['unc3']], ['Momentum', ['m5', 'm20']], ['Future', ['fwd5']]],
    paths: [['Sentiment', 'Future'], ['Uncertainty', 'Future'], ['Momentum', 'Future'], ['Momentum', 'Sentiment']], target: 'Future'},
];
function semLoadPreset(id) {
  const x = SEM_PRESETS.find(p => p.id === id); if (!x) return; SM.external = null;
  SM.preset = id; SM.freq = x.freq; SM.agg = x.agg || 'last'; SM.lastN = x.lastN; SM.method = x.method; SM.from = '';
  if (x.fromNews) { const d = (ds('news_docs')?.rows || []).map(r => r.date).filter(Boolean).sort(); SM.from = d[0] || ''; }
  SM.base = JSON.parse(JSON.stringify(x.base)).filter(v => ds(v.ds)); SM.inds = x.inds.map(([name, expr]) => ({name, expr}));
  if (x.method === 'efa') SM.efa = {items: x.items.slice(), target: x.etarget || '', k: 'auto', ext: 'pca', rot: 'varimax'};
  else SM.pls = {cons: x.cons.map(([name, items]) => ({name, items: items.slice()})), paths: x.paths.map(p => p.slice()), target: x.target, reps: 200, boot: x.freq === 'day' ? 'block' : 'block'};
  SM.result = null;
}

/* ============================== data ============================== */
const MON_OF = i => MON_CAL[i];
function dateToFym(s) {   // Nepali month ending about the 15th of Gregorian month M is labelled M (as in NRB monthly tables)
  const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1, d = +s.slice(8, 10); let lm = d <= 15 ? m : m + 1, ly = y; if (lm > 11) { lm = 0; ly++; }
  const lab = MON_OF(lm), fy0 = lm >= 7 ? ly : ly - 1; return fy0 + '/' + String((fy0 + 1) % 100).padStart(2, '0') + '|' + String(MON_AUG.indexOf(lab)).padStart(2, '0');
}
function semData() {
  if (SM.external) { const E = SM.external, n = E.keys.length, vars = {...E.vars};
    SM.inds.forEach(x => { let out; try { out = QC.evaluate(QC.parse(x.expr), {n, t: Array.from({length: n}, (_, i) => i), vars, params: {}}); } catch (e) { throw new Error(`${x.name}: ${e.message}`); } vars[x.name] = Array.isArray(out) ? out.map(v => isNum(v) ? v : null) : Array(n).fill(isNum(out) ? out : null); });
    return {freq: E.freq, keys: E.keys.slice(), vars, n}; }
  if (!SM.base.length) throw new Error('Add at least one base series.');
  const names = SM.base.map(v => v.name).concat(SM.inds.map(v => v.name)), dup = names.find((n, i) => names.indexOf(n) !== i); if (dup) throw new Error(`The name "${dup}" is used twice.`);
  names.forEach(n => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error(`"${n}" is not a valid name. Use letters, digits and _ only.`); if (QC.FUNCS.has(n) || ['t', 'n', 'pi', 'e'].includes(n)) throw new Error(`"${n}" is reserved. Pick another name.`); });
  const maps = SM.base.map(v => { const d = ds(v.ds); if (!d) throw new Error(`Dataset for ${v.name} is missing.`); const f = freqOf(d), m = new Map();
    if (SM.freq === 'day' && f !== 'day') throw new Error(`${v.name} (${d.title}) is not daily. Switch frequency to Month or pick a daily dataset.`);
    if (SM.freq === 'fym' && !['day', 'fym'].includes(f)) throw new Error(`${v.name} (${d.title}) is neither daily nor monthly (fiscal-year months).`);
    const rows = d.rows.filter(r => (!catKeys(d).length || catLabel(d, r) === v.cat) && isNum(r[v.col]));
    if (SM.freq === 'fym' && f === 'day') { const dk = periodKeys(d)[0], g = new Map(); rows.slice().sort((a, b) => a[dk] < b[dk] ? -1 : 1).forEach(r => { const k = dateToFym(r[dk]); if (!g.has(k)) g.set(k, []); g.get(k).push(r[v.col]); });
      g.forEach((a, k) => m.set(k, SM.agg === 'mean' ? a.reduce((s, x) => s + x, 0) / a.length : SM.agg === 'sum' ? a.reduce((s, x) => s + x, 0) : a[a.length - 1])); }
    else rows.forEach(r => m.set(alignKey(d, r), r[v.col]));
    if (!m.size) throw new Error(`${v.name} has no values. Check the item and column.`); return m; });
  let keys = SM.freq === 'day' ? [...maps[0].keys()].sort() : uniq(maps.flatMap(m => [...m.keys()])).sort();
  const n = keys.length, vars = {}; SM.base.forEach((v, i) => vars[v.name] = keys.map(k => maps[i].has(k) ? maps[i].get(k) : null));
  SM.inds.forEach(x => { if (!x.expr.trim()) throw new Error(`Indicator ${x.name} has no formula.`); let out;
    try { out = QC.evaluate(QC.parse(x.expr), {n, t: Array.from({length: n}, (_, i) => i), vars, params: {}}); } catch (e) { throw new Error(`${x.name}: ${e.message}`); }
    vars[x.name] = Array.isArray(out) ? out.map(v => isNum(v) ? v : null) : Array(n).fill(isNum(out) ? out : null); });
  let lo = 0; if (SM.from) lo = Math.max(0, keys.findIndex(k => k >= (SM.freq === 'day' ? SM.from : dateToFym(SM.from)))); if (SM.lastN > 0) lo = Math.max(lo, n - SM.lastN);
  keys = keys.slice(lo); Object.keys(vars).forEach(k => vars[k] = vars[k].slice(lo));
  return {freq: SM.freq, keys, vars, n: keys.length};
}
const semLbl = (freq, k) => alignLabel(freq, k);
function semMatrix(D, items) {   // complete cases
  const rows = [], idx = []; for (let i = 0; i < D.n; i++) { const r = items.map(v => D.vars[v]?.[i]); if (r.every(isNum)) { rows.push(r); idx.push(i); } } return {X: rows, idx};
}

/* ============================== UI ============================== */
function renderSem() {
  if (!SM.base.length && !SM.external) semLoadPreset('dpls');
  SM.base = SM.base.filter(v => ds(v.ds));
  const p = $('#p-sem');
  p.innerHTML = `
  <div class="card wide">
    <div class="chead"><div><h2>Factor analysis &amp; structural equation modelling</h2><p class="sub">Turn series into observed indicators, find the latent factors behind them (EFA), then test and predict with a path model (PLS-SEM). Export the same model to R (lavaan / seminr).</p></div>
      <div class="ctrls"><select id="smPreset" aria-label="Examples"><option value="">Load a model…</option>${SEM_PRESETS.map(x => `<option value="${x.id}" ${SM.preset === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div></div>
    <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      <div class="f"><label>Frequency</label><div class="seg" id="smFreq"><button data-v="day" aria-pressed="${SM.freq === 'day'}">Daily</button><button data-v="fym" aria-pressed="${SM.freq === 'fym'}">Monthly</button></div></div>
      <div class="f" ${SM.freq === 'fym' ? '' : 'style="display:none"'}><label for="smAgg">Daily series to month</label><select id="smAgg"><option value="last">Last value in month</option><option value="mean">Monthly average</option><option value="sum">Monthly total</option></select></div>
      <div class="f"><label for="smN">Sample: last N periods (0 = all)</label><input id="smN" type="text" inputmode="numeric" value="${SM.lastN}"></div>
      <div class="f"><label for="smFrom">Start from (optional)</label><input id="smFrom" type="date" value="${esc(SM.from || '')}"></div>
    </div>
    <h3>1. Base series</h3>
    ${SM.external ? `<p class="readout"><span>Using the working data from <b>Data analysis</b> (${Object.keys(SM.external.vars).length} variables, ${SM.external.keys.length} periods). Variable names can be used in the indicators below.</span> <button class="btn small" id="smExtClr">Use datasets instead</button></p>` : `<div id="smBase" style="display:grid;gap:8px"></div>
    <div class="actions"><button class="btn small" id="smAddBase">+ Add series</button></div>`}
    <h3>2. Observed indicators <span class="sub" style="font-weight:400">— any formula from the Quant lab language, e.g. <code>pct(NEPSE,20)</code>, <code>lead(pct(NEPSE,5),5)</code>, <code>ffill(IB)</code></span></h3>
    <div id="smInds" style="display:grid;gap:6px"></div>
    <div class="actions"><button class="btn small" id="smAddInd">+ Add indicator</button><button class="btn small" id="smCheck">Check indicators</button><span id="smDataMsg"></span></div>
    <h3>3. Model</h3>
    <div class="seg" id="smMethod"><button data-v="efa" aria-pressed="${SM.method === 'efa'}">Exploratory factor analysis</button><button data-v="pls" aria-pressed="${SM.method === 'pls'}">PLS-SEM path model</button></div>
    <div id="smModel" style="display:grid;gap:10px"></div>
    <div class="actions"><button class="btn primary" id="smRun">Run</button><span id="smMsg"></span></div>
    <details class="panel"><summary>How to read this (method notes)</summary><div class="sub" style="line-height:1.6">
      <p><b>EFA</b> looks for a few latent factors that explain the correlations among many indicators. Check <b>KMO</b> (≥ 0.6 acceptable, ≥ 0.8 good) and <b>Bartlett</b> (p &lt; 0.05) first. The number of factors comes from <b>parallel analysis</b> (keep factors whose eigenvalue beats the 95th percentile of random data). Loadings ≥ 0.40 are shown in bold. Factor scores are then used to predict the target, tested on the most recent ${SM.holdout}% of the sample that the model never saw.</p>
      <p><b>PLS-SEM</b> (variance-based SEM, as in SmartPLS / seminr) estimates constructs as weighted sums of their indicators and the paths between them. Measurement quality: loadings ≥ 0.70, Cronbach's α and composite reliability ρ<sub>c</sub> between 0.70 and 0.95, AVE ≥ 0.50, HTMT &lt; 0.85–0.90. Structural: path β with bootstrap t and p (moving-block resampling respects time order), R², f² (0.02 small, 0.15 medium, 0.35 large), VIF &lt; 3. <b>PLSpredict</b>: Q²<sub>predict</sub> &gt; 0 means the model beats the naive historical mean out of sample; compare its RMSE with the linear-model (LM) benchmark.</p>
      <p><b>Covariance-based SEM</b> (CFA fit indices such as CFI, RMSEA, SRMR) needs maximum-likelihood software: use <b>Export lavaan</b> and run it in R. Forward-return targets overlap day to day, so treat in-sample p-values with care and rely on the holdout test.</p>
    </div></details>
  </div>
  <div id="smOut" style="display:grid;gap:18px"></div>`;
  $('#smPreset').onchange = e => { if (!e.target.value) return; semLoadPreset(e.target.value); renderSem(); runSem(); };
  seg('#smFreq', v => { SM.freq = v; renderSem(); });
  $('#smAgg').value = SM.agg; $('#smAgg').onchange = e => SM.agg = e.target.value;
  $('#smN').onchange = e => SM.lastN = Math.max(0, parseInt(e.target.value, 10) || 0);
  $('#smFrom').onchange = e => SM.from = e.target.value;
  seg('#smMethod', v => { SM.method = v; drawSemModel(); });
  if ($('#smExtClr')) $('#smExtClr').onclick = () => { SM.external = null; semLoadPreset('dpls'); renderSem(); };
  if ($('#smAddBase')) $('#smAddBase').onclick = () => { SM.base.push({name: 'X' + (SM.base.length + 1), ds: SM.base[0]?.ds || 'stock_ohlc', cat: '', col: ''}); drawSemBase(); };
  $('#smAddInd').onclick = () => { SM.inds.push({name: 'x' + (SM.inds.length + 1), expr: ''}); drawSemInds(); drawSemModel(); };
  $('#smCheck').onclick = () => semCheck();
  $('#smRun').onclick = () => runSem();
  if (!SM.external) drawSemBase(); drawSemInds(); drawSemModel();
  if (SM.result) runSem(true);
}
function semDsOptions(sel) {
  const ok = d => ['day', 'fym'].includes(freqOf(d)) && numCols(d).length && (SM.freq === 'fym' || freqOf(d) === 'day');
  return uniq(allDs().map(d => d.group)).map(g => { const l = allDs().filter(d => d.group === g && ok(d)); return l.length ? `<optgroup label="${esc(g)}">${l.map(d => `<option value="${esc(d.id)}" ${d.id === sel ? 'selected' : ''}>${esc(d.title)}${freqOf(d) === 'day' ? ' (daily)' : ' (monthly)'}</option>`).join('')}</optgroup>` : ''; }).join('');
}
function drawSemBase() {
  const box = $('#smBase');
  box.innerHTML = SM.base.map((v, i) => { const d = ds(v.ds), cats = d ? catOptions(d) : [];
    if (cats.length && !cats.includes(v.cat)) v.cat = cats.find(c => c.toUpperCase().startsWith(v.name.toUpperCase())) || cats[0];
    if (d && !numCols(d).some(c => c.k === v.col)) v.col = (numCols(d).find(c => c.k === 'close') || numCols(d)[0])?.k;
    return `<div class="series-row sbase" data-i="${i}" style="grid-template-columns:110px minmax(160px,1.4fr) minmax(110px,1fr) minmax(130px,1fr) 28px">
      <input data-f="name" value="${esc(v.name)}" aria-label="Series name" style="font-family:var(--mono)">
      <select data-f="ds" aria-label="Dataset">${semDsOptions(v.ds)}</select>
      ${cats.length ? `<select data-f="cat" aria-label="Item">${cats.map(c => `<option ${c === v.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : '<span class="sub">–</span>'}
      <select data-f="col" aria-label="Column">${d ? numCols(d).map(c => `<option value="${esc(c.k)}" ${c.k === v.col ? 'selected' : ''}>${esc(c.label)}</option>`).join('') : ''}</select>
      <button class="btn small" data-rm="${i}" aria-label="Remove series">×</button></div>`; }).join('') || '<p class="sub">No base series. Add one.</p>';
  box.querySelectorAll('.sbase input, .sbase select').forEach(el => el.onchange = () => { const i = +el.closest('.sbase').dataset.i, f = el.dataset.f;
    SM.base[i][f] = f === 'name' ? el.value.trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') : el.value; if (f === 'ds') { SM.base[i].cat = ''; SM.base[i].col = ''; } drawSemBase(); });
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { SM.base.splice(+b.dataset.rm, 1); drawSemBase(); });
}
function drawSemInds(stats) {
  const box = $('#smInds');
  box.innerHTML = SM.inds.map((x, i) => `<div class="series-row sind" data-i="${i}" style="grid-template-columns:110px minmax(200px,3fr) minmax(150px,1fr) 28px">
    <input data-f="name" value="${esc(x.name)}" aria-label="Indicator name" style="font-family:var(--mono)">
    <input data-f="expr" value="${esc(x.expr)}" aria-label="Formula" style="font-family:var(--mono)" placeholder="e.g. pct(NEPSE,20)">
    <span class="sub" data-stat="${esc(x.name)}">${stats && stats[x.name] ? stats[x.name] : ''}</span>
    <button class="btn small" data-rm="${i}" aria-label="Remove indicator">×</button></div>`).join('') || '<p class="sub">No indicators yet.</p>';
  box.querySelectorAll('.sind input').forEach(el => el.onchange = () => { const i = +el.closest('.sind').dataset.i, f = el.dataset.f, old = SM.inds[i].name;
    SM.inds[i][f] = f === 'name' ? el.value.trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') : el.value.trim();
    if (f === 'name' && old !== SM.inds[i].name) semRenameItem(old, SM.inds[i].name); drawSemModel(); });
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const nm = SM.inds[+b.dataset.rm].name; SM.inds.splice(+b.dataset.rm, 1); semRenameItem(nm, null); drawSemInds(); drawSemModel(); });
}
function semRenameItem(a, b) {
  const f = l => b ? l.map(x => x === a ? b : x) : l.filter(x => x !== a);
  SM.efa.items = f(SM.efa.items); if (SM.efa.target === a) SM.efa.target = b || ''; SM.pls.cons.forEach(c => c.items = f(c.items));
}
function semCheck() {
  try { const D = semData(), st = {};
    SM.inds.forEach(x => { const v = D.vars[x.name].filter(isNum); st[x.name] = v.length ? `n ${v.length} · mean ${fmtAuto(QC.mean(v))} · sd ${fmtAuto(QC.sd(v))}` : '<span class="msg err">no values</span>'; });
    drawSemInds(st); msg('#smDataMsg', `${D.n} periods: ${semLbl(D.freq, D.keys[0])} to ${semLbl(D.freq, last(D.keys))}`, 'ok'); return D;
  } catch (e) { msg('#smDataMsg', e.message, 'err'); return null; }
}
const indNames = () => SM.inds.map(x => x.name);
const chk = (name, on, grp) => `<label class="pill" style="cursor:pointer;display:inline-flex;gap:5px;align-items:center;padding:3px 10px;margin:2px"><input type="checkbox" data-g="${grp}" value="${esc(name)}" ${on ? 'checked' : ''}> <span style="font-family:var(--mono)">${esc(name)}</span></label>`;
function drawSemModel() {
  const b = $('#smModel'), names = indNames();
  if (SM.method === 'efa') {
    b.innerHTML = `<div><div class="sub" style="margin-bottom:4px">Indicators to factor-analyse (tick at least 3)</div><div id="efaItems">${names.filter(n => n !== SM.efa.target).map(n => chk(n, SM.efa.items.includes(n), 'efa')).join('')}</div></div>
      <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="f"><label for="efaT">Target to predict (optional)</label><select id="efaT"><option value="">None</option>${names.map(n => `<option ${n === SM.efa.target ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="f"><label for="efaK">Number of factors</label><select id="efaK"><option value="auto">Auto (parallel analysis)</option>${[1, 2, 3, 4, 5, 6].map(k => `<option ${String(SM.efa.k) === String(k) ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="f"><label for="efaE">Extraction</label><select id="efaE"><option value="pca">Principal components</option><option value="paf">Principal axis factoring</option></select></div>
        <div class="f"><label for="efaR">Rotation</label><select id="efaR"><option value="varimax">Varimax (orthogonal)</option><option value="none">None</option></select></div>
        <div class="f"><label for="smHold">Holdout for testing (%)</label><select id="smHold">${[0, 10, 20, 30].map(h => `<option ${h === SM.holdout ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
      </div>`;
    $('#efaK').value = SM.efa.k; $('#efaE').value = SM.efa.ext; $('#efaR').value = SM.efa.rot;
    b.querySelectorAll('[data-g="efa"]').forEach(c => c.onchange = () => { SM.efa.items = [...b.querySelectorAll('[data-g="efa"]:checked')].map(x => x.value); });
    $('#efaT').onchange = e => { SM.efa.target = e.target.value; SM.efa.items = SM.efa.items.filter(x => x !== SM.efa.target); drawSemModel(); };
    $('#efaK').onchange = e => SM.efa.k = e.target.value; $('#efaE').onchange = e => SM.efa.ext = e.target.value; $('#efaR').onchange = e => SM.efa.rot = e.target.value;
    $('#smHold').onchange = e => SM.holdout = +e.target.value;
    return;
  }
  const P = SM.pls, cn = P.cons.map(c => c.name);
  if (!cn.includes(P.target)) P.target = last(cn) || '';
  b.innerHTML = `<div class="sub">Constructs (latent variables) and the indicators that measure them. Reflective measurement (Mode A). A single-indicator construct is fine for a target such as a forward return.</div>
    <div id="plsCons" style="display:grid;gap:8px">${P.cons.map((c, i) => `<div class="series-row pcon" data-i="${i}" style="grid-template-columns:140px 1fr 28px;align-items:start">
      <input data-f="name" value="${esc(c.name)}" aria-label="Construct name" style="font-weight:600">
      <div>${names.map(n => chk(n, c.items.includes(n), 'c' + i)).join('')}</div>
      <button class="btn small" data-rmc="${i}" aria-label="Remove construct">×</button></div>`).join('')}</div>
    <div class="actions"><button class="btn small" id="plsAddC">+ Add construct</button></div>
    <div class="sub">Structural paths (cause → effect)</div>
    <div id="plsPaths" style="display:grid;gap:6px">${P.paths.map((p, i) => `<div class="series-row ppath" data-i="${i}" style="grid-template-columns:minmax(120px,200px) 24px minmax(120px,200px) 28px">
      <select data-f="0">${cn.map(n => `<option ${n === p[0] ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><span style="text-align:center">→</span>
      <select data-f="1">${cn.map(n => `<option ${n === p[1] ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <button class="btn small" data-rmp="${i}" aria-label="Remove path">×</button></div>`).join('')}</div>
    <div class="actions"><button class="btn small" id="plsAddP">+ Add path</button></div>
    <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      <div class="f"><label for="plsT">Construct to predict</label><select id="plsT">${cn.map(n => `<option ${n === P.target ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><label for="plsB">Bootstrap samples</label><select id="plsB">${[0, 100, 200, 500, 1000].map(r => `<option ${r === P.reps ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="f"><label for="plsBt">Resampling</label><select id="plsBt"><option value="block">Moving blocks (time series)</option><option value="iid">Independent rows</option></select></div>
      <div class="f"><label for="smHold">Holdout for PLSpredict (%)</label><select id="smHold">${[0, 10, 20, 30].map(h => `<option ${h === SM.holdout ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
    </div>`;
  $('#plsBt').value = P.boot;
  b.querySelectorAll('.pcon input[data-f="name"]').forEach(el => el.onchange = () => { const i = +el.closest('.pcon').dataset.i, old = P.cons[i].name, nw = el.value.trim() || old;
    P.cons[i].name = nw; P.paths.forEach(p => { if (p[0] === old) p[0] = nw; if (p[1] === old) p[1] = nw; }); if (P.target === old) P.target = nw; drawSemModel(); });
  b.querySelectorAll('.pcon input[type=checkbox]').forEach(el => el.onchange = () => { const i = +el.closest('.pcon').dataset.i; P.cons[i].items = [...el.closest('.pcon').querySelectorAll('input[type=checkbox]:checked')].map(x => x.value); });
  b.querySelectorAll('[data-rmc]').forEach(x => x.onclick = () => { const nm = P.cons[+x.dataset.rmc].name; P.cons.splice(+x.dataset.rmc, 1); P.paths = P.paths.filter(p => p[0] !== nm && p[1] !== nm); drawSemModel(); });
  b.querySelectorAll('.ppath select').forEach(el => el.onchange = () => { P.paths[+el.closest('.ppath').dataset.i][+el.dataset.f] = el.value; });
  b.querySelectorAll('[data-rmp]').forEach(x => x.onclick = () => { P.paths.splice(+x.dataset.rmp, 1); drawSemModel(); });
  $('#plsAddC').onclick = () => { P.cons.push({name: 'LV' + (P.cons.length + 1), items: []}); drawSemModel(); };
  $('#plsAddP').onclick = () => { if (cn.length < 2) return msg('#smMsg', 'Add two constructs first.', 'err'); P.paths.push([cn[0], cn[1]]); drawSemModel(); };
  $('#plsT').onchange = e => P.target = e.target.value; $('#plsB').onchange = e => P.reps = +e.target.value; $('#plsBt').onchange = e => P.boot = e.target.value;
  $('#smHold').onchange = e => SM.holdout = +e.target.value;
}

function runSem(quiet) {
  msg('#smMsg', '');
  let D; try { D = semData(); } catch (e) { msg('#smMsg', e.message, 'err'); return; }
  $('#smRun').disabled = true; msg('#smMsg', 'Estimating…');
  setTimeout(() => { try { SM.method === 'efa' ? runEfa(D) : runPls(D); SM.result = true; msg('#smMsg', ''); } catch (e) { msg('#smMsg', e.message, 'err'); } finally { $('#smRun').disabled = false; } }, 20);
}
const pfmt = p => !isNum(p) ? '–' : p < 0.001 ? '<0.001' : fmt(p, 3);
const star = p => !isNum(p) ? '' : p < 0.01 ? '***' : p < 0.05 ? '**' : p < 0.1 ? '*' : '';
const heatCell = (v, strong = 0.4) => `<td class="num" style="${isNum(v) ? `background:rgba(${v >= 0 ? '42,120,214' : '227,73,72'},${Math.min(0.55, Math.abs(v) * 0.55).toFixed(3)});${Math.abs(v) >= strong ? 'font-weight:700' : 'color:var(--ink-3)'}` : ''}">${isNum(v) ? fmt(v, 3) : '–'}</td>`;
function splitIdx(n) { const h = SM.holdout / 100, nt = h > 0 ? Math.max(0, Math.floor(n * h)) : 0; return {ntr: n - nt, nte: nt}; }
const rmse = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

/* ---------- EFA ---------- */
function runEfa(D) {
  const E = SM.efa, items = E.items.filter(x => D.vars[x]); if (items.length < 3) throw new Error('Tick at least three indicators for factor analysis.');
  const {X, idx} = semMatrix(D, items); const n = X.length, p = items.length;
  if (n < Math.max(30, p * 3)) throw new Error(`Only ${n} complete observations for ${p} indicators. Factor analysis needs at least ${Math.max(30, p * 3)}; widen the sample.`);
  const R = SEMC.corrOf(SEMC.standardize(X).Z), K = SEMC.kmo(R), Bt = SEMC.bartlett(R, n), ev = SEMC.eig(R).values, pa = SEMC.parallel(n, p, 60);
  let kPA = 0; while (kPA < p && ev[kPA] > pa.p95[kPA]) kPA++; kPA = Math.max(1, kPA); const kK = Math.max(1, ev.filter(v => v > 1).length);
  const k = E.k === 'auto' ? kPA : Math.min(+E.k, p - 1);
  const F = SEMC.efa(X, {k, method: E.ext, rotate: E.rot}), S = SEMC.efaScores(X, F);
  const fname = F.L[0].map((_, j) => { const top = items.map((it, i) => [it, F.L[i][j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])); return `F${j + 1}`; });
  const fdesc = F.L[0].map((_, j) => items.map((it, i) => [it, F.L[i][j]]).filter(x => Math.abs(x[1]) >= 0.4).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(x => (x[1] < 0 ? '−' : '') + x[0]).join(', ') || 'no loading ≥ 0.40');
  // prediction
  let pred = null;
  if (E.target && D.vars[E.target]) {
    const y = D.vars[E.target], all = idx.map((i, r) => ({i, r})), have = all.filter(o => isNum(y[o.i])), fut = all.filter(o => !isNum(y[o.i]) && o.i > (last(have)?.i ?? -1));
    const {ntr, nte} = splitIdx(have.length), tr = have.slice(0, ntr), te = have.slice(ntr);
    if (ntr < 20) throw new Error('Too few observations with a known target to fit the prediction.');
    const Ftr = SEMC.efa(tr.map(o => X[o.r]), {k, method: E.ext, rotate: E.rot});
    const Str = SEMC.efaScores(tr.map(o => X[o.r]), Ftr), Ste = te.length ? SEMC.efaScores(te.map(o => X[o.r]), Ftr) : [];
    const cols = [...Array(k).keys()], fitTr = QC.ols(tr.map(o => y[o.i]), Str.map(r => [1, ...r]), ['const', ...fname]);
    const yh = Ste.map(r => fitTr.coef[0] + cols.reduce((s, j) => s + fitTr.coef[j + 1] * r[j], 0)), yt = te.map(o => y[o.i]), ybar = QC.mean(tr.map(o => y[o.i]));
    const oos = te.length ? {rmse: rmse(yt, yh), rmseN: rmse(yt, yt.map(() => ybar)), r2: 1 - yt.reduce((s, v, i) => s + (v - yh[i]) ** 2, 0) / yt.reduce((s, v) => s + (v - ybar) ** 2, 0), hit: yt.filter((v, i) => Math.sign(v) === Math.sign(yh[i])).length / yt.length * 100, n: te.length} : null;
    const full = QC.ols(have.map(o => y[o.i]), have.map(o => [1, ...S[o.r]]), ['const', ...fname]);
    const fc = fut.map(o => ({k: D.keys[o.i], v: full.coef[0] + cols.reduce((s, j) => s + full.coef[j + 1] * S[o.r][j], 0)}));
    pred = {full, oos, fc, te, yh, yt, target: E.target, have, ntr};
  }
  SM.lastEfa = {items, F, fname, fdesc, D, idx, S, target: E.target};
  const t = T(), out = $('#smOut'), kmoLab = K ? (K.kmo >= .9 ? 'marvellous' : K.kmo >= .8 ? 'meritorious' : K.kmo >= .7 ? 'middling' : K.kmo >= .6 ? 'mediocre' : K.kmo >= .5 ? 'miserable' : 'unacceptable') : '–';
  out.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Exploratory factor analysis</h2><p class="sub">${n} complete observations · ${p} indicators · ${semLbl(D.freq, D.keys[idx[0]])} to ${semLbl(D.freq, D.keys[last(idx)])} · ${E.ext === 'pca' ? 'principal components' : 'principal axis factoring'}${E.rot === 'varimax' && k > 1 ? ', varimax rotation' : ''}</p></div>
      <div class="ctrls"><button class="btn small" id="efaCsv">Download scores CSV</button><button class="btn small accent" id="efaSave">Save factor scores as dataset</button><button class="btn small primary" id="efaToPls">Build a PLS-SEM from these factors</button></div></div>
    <div class="kpis" id="efaK"></div>
    <div class="grid2">
      <div><h3>Scree plot and parallel analysis</h3><div class="cv short"><canvas id="cEfaScree"></canvas></div><div class="readout"><span>Parallel analysis suggests <b>${kPA}</b> factor${kPA > 1 ? 's' : ''}</span><span>Kaiser (eigenvalue &gt; 1): <b>${kK}</b></span><span>Using <b>${k}</b></span></div></div>
      <div><h3>Variance explained</h3><div class="tbl"><table><thead><tr><th class="txt">Factor</th><th class="txt">Main indicators (|loading| ≥ 0.40)</th><th>SS loadings</th><th>% variance</th><th>Cumulative</th></tr></thead><tbody>${F.ss.map((v, j) => `<tr><td class="txt"><b>${fname[j]}</b></td><td class="txt">${esc(fdesc[j])}</td><td class="num">${fmt(v, 2)}</td><td class="num">${fmt(F.pv[j], 1)}%</td><td class="num">${fmt(F.pv.slice(0, j + 1).reduce((a, b) => a + b, 0), 1)}%</td></tr>`).join('')}</tbody></table></div>${F.heywood ? '<p class="msg err">Heywood case: a communality reached 1. Try fewer factors or principal components.</p>' : ''}</div>
    </div>
    <h3>${E.rot === 'varimax' && k > 1 ? 'Rotated loadings' : 'Loadings'}</h3>
    <div class="tbl scroll"><table><thead><tr><th class="txt">Indicator</th>${fname.map(f => `<th>${f}</th>`).join('')}<th>Communality h²</th><th>Uniqueness</th><th>MSA</th></tr></thead><tbody>
      ${items.map((it, i) => `<tr><td class="txt" style="font-family:var(--mono)">${esc(it)}</td>${F.L[i].map(v => heatCell(v)).join('')}<td class="num">${fmt(F.h2[i], 3)}</td><td class="num">${fmt(1 - F.h2[i], 3)}</td><td class="num ${K && K.msa[i] < .5 ? 'neg' : ''}">${K ? fmt(K.msa[i], 2) : '–'}</td></tr>`).join('')}</tbody></table></div>
    <h3>Factor scores over time</h3><div class="cv tall"><canvas id="cEfaScores"></canvas></div>
    <div id="efaPred"></div>
    <details class="panel"><summary>Correlation matrix</summary><div><div class="tbl scroll"><table><thead><tr><th></th>${items.map(x => `<th style="font-family:var(--mono)">${esc(x)}</th>`).join('')}</tr></thead><tbody>${items.map((x, i) => `<tr><td class="txt" style="font-family:var(--mono)">${esc(x)}</td>${R[i].map((v, j) => i === j ? '<td class="num">1</td>' : heatCell(v, 0.5)).join('')}</tr>`).join('')}</tbody></table></div></div></details>
  </div>`;
  kpis('#efaK', [
    {k: 'KMO sampling adequacy', v: K ? fmt(K.kmo, 3) : '–', chip: kmoLab, dir: K && K.kmo >= .6 ? 'up' : 'dn'},
    {k: "Bartlett's sphericity", v: 'χ² ' + fmt(Bt.chi, 0), chip: `df ${Bt.df} · p ${pfmt(Bt.p)}`, dir: Bt.p < .05 ? 'up' : 'dn'},
    {k: 'Factors retained', v: String(k), chip: E.k === 'auto' ? 'parallel analysis' : 'fixed by you'},
    {k: 'Variance explained', v: fmt(F.pv.reduce((a, b) => a + b, 0), 1) + '%', chip: 'by ' + k + ' factor' + (k > 1 ? 's' : '')},
    ...(pred && pred.oos ? [{k: 'Out-of-sample R²', v: fmt(pred.oos.r2 * 100, 1) + '%', chip: `direction right ${fmt(pred.oos.hit, 0)}% of ${pred.oos.n}`, dir: pred.oos.r2 > 0 ? 'up' : 'dn'}] : []),
  ]);
  mk('cEfaScree', {type: 'line', data: {labels: ev.map((_, i) => i + 1), datasets: [line('Eigenvalue (data)', ev, t.s[0], {pointRadius: 3, tension: 0}), line('Random data, 95th pct', pa.p95, t.neutral, {borderDash: [5, 4], pointRadius: 0, tension: 0}), line('Kaiser = 1', ev.map(() => 1), t.ink3, {borderWidth: 1, pointRadius: 0})]},
    options: {plugins: {tooltip: tip('', 2)}, scales: {x: {grid: {display: false}, title: {display: true, text: 'Component', color: t.ink3}}, y: {beginAtZero: true}}}});
  const lab = idx.map(i => semLbl(D.freq, D.keys[i])), sets = fname.map((f, j) => line(f, S.map(r => r[j]), t.s[j % 8], {borderWidth: 1.5}));
  if (E.target) sets.push(line(E.target + ' (right axis)', idx.map(i => D.vars[E.target][i]), t.ink3, {borderWidth: 1, yAxisID: 'y2'}));
  mk('cEfaScores', {type: 'line', data: {labels: lab, datasets: sets}, options: {plugins: {tooltip: tip('', 2)}, scales: {x: xCat(10), y: {title: {display: true, text: 'factor score (SD)', color: t.ink3}}, ...(E.target ? {y2: {position: 'right', grid: {display: false}}} : {})}}});
  if (pred) {
    const c = pred.full, fc = pred.fc;
    $('#efaPred').innerHTML = `<div class="grid2"><div><h3>Predicting ${esc(pred.target)} from the factors</h3><p class="sub">OLS on factor scores, full sample (${c.n} obs). R² ${fmt(c.r2 * 100, 1)}%, F p ${pfmt(c.Fp)}, Durbin–Watson ${fmt(c.dw, 2)}.</p>
      <div class="tbl"><table><thead><tr><th class="txt">Term</th><th>Coef.</th><th>Std. err.</th><th>t</th><th>p</th></tr></thead><tbody>${['const', ...fname].map((nm, i) => `<tr><td class="txt">${nm === 'const' ? 'Intercept' : `<b>${nm}</b> <span class="sub">${esc(fdesc[i - 1])}</span>`}</td><td class="num">${fmt(c.coef[i], 4)}</td><td class="num">${fmt(c.se[i], 4)}</td><td class="num">${fmt(c.t[i], 2)}</td><td class="num">${pfmt(c.p[i])} ${star(c.p[i])}</td></tr>`).join('')}</tbody></table></div>
      ${pred.oos ? `<div class="readout" style="margin-top:8px"><span>Holdout (last ${pred.oos.n} obs, factors re-estimated on training only): RMSE <b>${fmt(pred.oos.rmse, 3)}</b></span><span>naive mean RMSE <b>${fmt(pred.oos.rmseN, 3)}</b></span><span>R²<sub>oos</sub> <b>${fmt(pred.oos.r2 * 100, 1)}%</b></span><span>direction hit <b>${fmt(pred.oos.hit, 0)}%</b></span></div>` : ''}
      ${fc.length ? `<h3>Next-period prediction</h3><div class="tbl"><table><thead><tr><th class="txt">As of</th><th>Predicted ${esc(pred.target)}</th></tr></thead><tbody>${fc.map(r => `<tr><td class="txt">${esc(semLbl(D.freq, r.k))}</td><td class="num ${r.v < 0 ? 'neg' : 'pos'}">${fmt(r.v, 3)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">No rows with known indicators and unknown target, so there is nothing to forecast yet.</p>'}
      </div><div><h3>Holdout: actual vs predicted</h3><div class="cv"><canvas id="cEfaOos"></canvas></div></div></div>`;
    if (pred.te.length) mk('cEfaOos', {type: 'line', data: {labels: pred.te.map(o => semLbl(D.freq, D.keys[o.i])), datasets: [line('Actual', pred.yt, t.ink3, {borderWidth: 1.2}), line('Predicted', pred.yh, t.s[1])]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(8)}}});
    else emptyChart('cEfaOos', 'Set a holdout above 0% to test out of sample.');
  }
  const scoreCols = fname.map((f, j) => { const a = Array(D.n).fill(null); idx.forEach((i, r) => a[i] = S[r][j]); return [f, a]; });
  $('#efaCsv').onclick = () => download('factor-scores.csv', ['Period,' + fname.join(','), ...idx.map((i, r) => csvCell(semLbl(D.freq, D.keys[i])) + ',' + S[r].map(v => v.toFixed(6)).join(','))].join('\n'), 'text/csv');
  $('#efaSave').onclick = () => saveQlDataset(D.freq, D.keys, scoreCols, 'Factor scores');
  $('#efaToPls').onclick = () => {
    const cons = fname.map((f, j) => ({name: f, items: items.filter((it, i) => Math.abs(F.L[i][j]) >= 0.4 && F.L[i].every((v, jj) => Math.abs(v) <= Math.abs(F.L[i][j])))})).filter(c => c.items.length);
    if (E.target) cons.push({name: 'Target', items: [E.target]});
    SM.pls = {cons, paths: E.target ? cons.filter(c => c.name !== 'Target').map(c => [c.name, 'Target']) : cons.slice(1).map(c => [cons[0].name, c.name]), target: E.target ? 'Target' : last(cons).name, reps: 200, boot: 'block'};
    SM.method = 'pls'; renderSem(); runSem(); toast('PLS-SEM built from the EFA factors. Rename the constructs to what they mean.');
  };
}

/* ---------- PLS-SEM ---------- */
function runPls(D) {
  const P = SM.pls, cons = P.cons.filter(c => c.items.length);
  if (cons.length < 2) throw new Error('Define at least two constructs, each with at least one indicator.');
  if (cons.length < P.cons.length) throw new Error(`Construct "${P.cons.find(c => !c.items.length).name}" has no indicators. Tick some or remove it.`);
  const names = cons.map(c => c.name); if (uniq(names).length < names.length) throw new Error('Two constructs have the same name.');
  const items = uniq(cons.flatMap(c => c.items)); if (items.length < cons.flatMap(c => c.items).length) throw new Error('An indicator can belong to only one construct.');
  const paths = uniq(P.paths.map(p => p.join('>'))).map(s => s.split('>')).filter(p => p[0] !== p[1]).map(p => [names.indexOf(p[0]), names.indexOf(p[1])]).filter(p => p[0] >= 0 && p[1] >= 0);
  if (!paths.length) throw new Error('Add at least one structural path.');
  const blocks = cons.map(c => c.items.map(x => items.indexOf(x))), tj = Math.max(0, names.indexOf(P.target));
  const {X, idx} = semMatrix(D, items), n = X.length;
  if (n < 30) throw new Error(`Only ${n} complete observations. PLS-SEM here needs at least 30${SM.preset === 'news' ? ' — keep adding news (Documents & coding, RSS, or import) until you have 30+ trading sessions with news' : '; widen the sample or drop indicators with many gaps'}.`);
  const fit = SEMC.pls(X, blocks, paths), rel = SEMC.reliability(X, blocks, fit), H = SEMC.htmt(X, blocks, fit.st), Yt = SEMC.T(fit.Y), LC = SEMC.corrOf(Yt);
  // bootstrap
  const blk = P.boot === 'block' ? Math.max(2, Math.round(Math.cbrt(n) * 1.5)) : 0, bs = P.reps ? SEMC.bootstrap(X, blocks, paths, fit, {reps: P.reps, block: blk}) : [];
  const q = (a, pr) => { const s = a.slice().sort((x, y) => x - y), h = (s.length - 1) * pr, lo = Math.floor(h); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo); };
  const bstat = (est, get) => { if (bs.length < 20) return {se: null, t: null, p: null, lo: null, hi: null}; const v = bs.map(get).filter(isNum), se = QC.sd(v), tt = se ? est / se : null; return {se, t: tt, p: isNum(tt) ? SEMC.pNorm2(tt) : null, lo: q(v, .025), hi: q(v, .975)}; };
  const pathRows = paths.map(([a, b]) => ({a, b, est: fit.B[a][b], ...bstat(fit.B[a][b], x => x.B[a][b]), f2: fit.f2[a][b], vif: fit.vif[a][b]}));
  const loadRows = blocks.flatMap((bl, j) => bl.map((h, i) => ({j, h, est: fit.load[j][i], w: fit.W[j][i], ...(bl.length > 1 ? bstat(fit.load[j][i], x => x.load[j][i]) : {se: null, t: null, p: null})})));
  const totRows = names.map((_, a) => a).filter(a => a !== tj && fit.total[a][tj]).map(a => ({a, est: fit.total[a][tj], ...bstat(fit.total[a][tj], x => x.total[a][tj])}));
  // PLSpredict on time-ordered holdout
  const {ntr, nte} = splitIdx(n); let pp = null;
  const endo = names.map((_, j) => j).filter(j => fit.pre[j].length), exoItems = blocks.filter((_, j) => !fit.pre[j].length).flat();
  if (nte >= 5 && ntr >= 30) {
    const tr = X.slice(0, ntr), te = X.slice(ntr), ftr = SEMC.pls(tr, blocks, paths), pr = SEMC.plsPredictRows(te, blocks, ftr);
    pp = endo.flatMap(j => blocks[j].map(h => { const act = te.map(r => r[h]), plsP = pr.map(o => o.xh[h]), mu = QC.mean(tr.map(r => r[h]));
      const lm = QC.ols(tr.map(r => r[h]), tr.map(r => [1, ...exoItems.map(e => r[e])]), ['c', ...exoItems]), lmP = te.map(r => lm.coef[0] + exoItems.reduce((s, e, k) => s + lm.coef[k + 1] * r[e], 0));
      const sseN = act.reduce((s, v) => s + (v - mu) ** 2, 0), q2 = 1 - act.reduce((s, v, i) => s + (v - plsP[i]) ** 2, 0) / sseN;
      return {j, h, rmse: rmse(act, plsP), mae: act.reduce((s, v, i) => s + Math.abs(v - plsP[i]), 0) / act.length, rmseLm: rmse(act, lmP), rmseN: rmse(act, act.map(() => mu)), q2, hit: act.filter((v, i) => Math.sign(v - 0) === Math.sign(plsP[i])).length / act.length * 100, act, plsP, lmP, keys: idx.slice(ntr).map(i => D.keys[i])}; }));
  }
  // next-period prediction with the full model: rows where the exogenous indicators are known
  const exoNames = exoItems.map(h => items[h]), lastIdx = last(idx), fut = [];
  for (let i = lastIdx + 1; i < D.n; i++) { const r = items.map(v => D.vars[v][i]); if (exoNames.every(v => isNum(D.vars[v][i]))) fut.push({i, row: r.map((v, h) => exoItems.includes(h) ? v : 0)}); }
  const futP = fut.length ? SEMC.plsPredictRows(fut.map(f => f.row), blocks, fit).map((o, k) => ({k: D.keys[fut[k].i], Yh: o.Yh, xh: o.xh})) : [];
  const tItems = blocks[tj];
  SM.lastPls = {D, idx, names, items, blocks, paths, fit, cons};
  // --- render ---
  const t = T(), out = $('#smOut'), relOk = (v, lo, hi = 2) => isNum(v) ? (v >= lo && v <= hi ? 'pos' : 'neg') : '';
  const pp1 = pp && pp.find(r => r.j === tj);
  out.innerHTML = `<div class="card wide"><div class="chead"><div><h2>PLS-SEM results</h2><p class="sub">${n} complete observations · ${semLbl(D.freq, D.keys[idx[0]])} to ${semLbl(D.freq, D.keys[lastIdx])} · path weighting scheme, Mode A · converged in ${fit.iter} iterations${fit.conv ? '' : ' (<b>not converged</b>)'} · ${bs.length ? `${bs.length} ${blk ? `moving-block (length ${blk})` : 'IID'} bootstrap samples` : 'no bootstrap'}</p></div>
    <div class="ctrls"><button class="btn small" id="plsLav">Export lavaan (R)</button><button class="btn small" id="plsSem">Export seminr (R)</button><button class="btn small" id="plsCsv">Download data CSV</button><button class="btn small accent" id="plsSave">Save construct scores as dataset</button></div></div>
    <div class="kpis" id="plsK"></div>
    <div class="grid2">
      <div><h3>Path diagram</h3><div id="plsDiag" style="overflow-x:auto"></div><p class="sub">Arrow labels: standardised β; <b>solid</b> = significant at 5%${bs.length ? '' : ' (run with bootstrap to test)'}; R² inside endogenous constructs; indicator loadings below each construct.</p></div>
      <div><h3>Structural paths</h3><div class="tbl scroll"><table><thead><tr><th class="txt">Path</th><th>β</th><th>SE</th><th>t</th><th>p</th><th>95% CI</th><th>f²</th><th>VIF</th></tr></thead><tbody>${pathRows.map(r => `<tr><td class="txt">${esc(names[r.a])} → ${esc(names[r.b])}</td><td class="num ${r.est < 0 ? 'neg' : ''}"><b>${fmt(r.est, 3)}</b></td><td class="num">${fmt(r.se, 3)}</td><td class="num">${fmt(r.t, 2)}</td><td class="num">${pfmt(r.p)} ${star(r.p)}</td><td class="num">${isNum(r.lo) ? `[${fmt(r.lo, 2)}, ${fmt(r.hi, 2)}]` : '–'}</td><td class="num">${fmt(r.f2, 3)}</td><td class="num ${r.vif > 3 ? 'neg' : ''}">${fmt(r.vif, 2)}</td></tr>`).join('')}</tbody></table></div>
        <div class="readout" id="plsRead" style="margin-top:8px;display:grid;gap:4px"></div>
        ${totRows.length ? `<h3>Total effects on ${esc(names[tj])}</h3><div class="tbl"><table><thead><tr><th class="txt">From</th><th>Total effect</th><th>p</th><th>95% CI</th></tr></thead><tbody>${totRows.map(r => `<tr><td class="txt">${esc(names[r.a])}</td><td class="num">${fmt(r.est, 3)}</td><td class="num">${pfmt(r.p)} ${star(r.p)}</td><td class="num">${isNum(r.lo) ? `[${fmt(r.lo, 2)}, ${fmt(r.hi, 2)}]` : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
    </div>
    <div class="grid2">
      <div><h3>Measurement model: outer loadings</h3><div class="tbl scroll" style="max-height:420px"><table><thead><tr><th class="txt">Construct</th><th class="txt">Indicator</th><th>Loading</th><th>t</th><th>p</th><th>Weight</th></tr></thead><tbody>${loadRows.map(r => `<tr><td class="txt">${esc(names[r.j])}</td><td class="txt" style="font-family:var(--mono)">${esc(items[r.h])}</td><td class="num ${Math.abs(r.est) < .7 && blocks[r.j].length > 1 ? 'neg' : ''}"><b>${fmt(r.est, 3)}</b></td><td class="num">${fmt(r.t, 2)}</td><td class="num">${pfmt(r.p)}</td><td class="num">${fmt(r.w, 3)}</td></tr>`).join('')}</tbody></table></div></div>
      <div><h3>Reliability and convergent validity</h3><div class="tbl"><table><thead><tr><th class="txt">Construct</th><th>Items</th><th>Cronbach's α</th><th>ρ<sub>c</sub></th><th>AVE</th><th>R²</th><th>adj. R²</th></tr></thead><tbody>${rel.map((r, j) => `<tr><td class="txt">${esc(names[j])}</td><td class="num">${r.k}</td><td class="num ${relOk(r.alpha, .7, .95)}">${fmt(r.alpha, 3)}</td><td class="num ${relOk(r.rhoC, .7, .95)}">${fmt(r.rhoC, 3)}</td><td class="num ${r.k > 1 ? relOk(r.ave, .5) : ''}">${fmt(r.ave, 3)}</td><td class="num">${fmt(fit.R2[j], 3)}</td><td class="num">${fmt(fit.R2a[j], 3)}</td></tr>`).join('')}</tbody></table></div>
        <h3>Discriminant validity</h3>
        <div class="tbl scroll"><table><thead><tr><th class="txt">Fornell–Larcker</th>${names.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${names.map((x, i) => `<tr><td class="txt">${esc(x)}</td>${names.map((_, j) => j > i ? '<td></td>' : i === j ? `<td class="num"><b>${fmt(Math.sqrt(rel[i].ave), 3)}</b></td>` : `<td class="num ${Math.abs(LC[i][j]) > Math.min(Math.sqrt(rel[i].ave), Math.sqrt(rel[j].ave)) ? 'neg' : ''}">${fmt(LC[i][j], 3)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="tbl scroll" style="margin-top:8px"><table><thead><tr><th class="txt">HTMT</th>${names.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${names.map((x, i) => `<tr><td class="txt">${esc(x)}</td>${names.map((_, j) => j >= i ? '<td></td>' : `<td class="num ${H[i][j] > .9 ? 'neg' : ''}">${isNum(H[i][j]) ? fmt(H[i][j], 3) : '<span class="sub">n/a</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="sub">Diagonal of Fornell–Larcker is √AVE and should exceed the correlations below it. HTMT needs 2+ indicators on both constructs; above 0.90 (red) signals the two constructs are not distinct.</p></div>
    </div>
    <div class="grid2">
      <div><h3>PLSpredict: out-of-sample test</h3>${pp ? `<p class="sub">Trained on the first ${ntr} observations, tested on the last ${nte}, predicting endogenous indicators from exogenous indicators only.</p><div class="tbl"><table><thead><tr><th class="txt">Indicator</th><th>RMSE PLS</th><th>RMSE LM</th><th>RMSE naive</th><th>Q²<sub>predict</sub></th><th>Direction hit</th></tr></thead><tbody>${pp.map(r => `<tr><td class="txt"><span style="font-family:var(--mono)">${esc(items[r.h])}</span> <span class="sub">${esc(names[r.j])}</span></td><td class="num"><b>${fmt(r.rmse, 3)}</b></td><td class="num">${fmt(r.rmseLm, 3)}</td><td class="num">${fmt(r.rmseN, 3)}</td><td class="num ${r.q2 > 0 ? 'pos' : 'neg'}">${fmt(r.q2, 3)}</td><td class="num">${fmt(r.hit, 0)}%</td></tr>`).join('')}</tbody></table></div>${pp1 ? `<p class="sub" style="margin-top:6px">${pp1.q2 > 0 ? `The model beats the naive historical mean for <b>${esc(items[pp1.h])}</b> out of sample${pp1.rmse < pp1.rmseLm ? ' and also beats the plain regression benchmark' : ', but a plain regression on the same indicators does better'}.` : `<b>Warning:</b> out of sample the model predicts <b>${esc(items[pp1.h])}</b> worse than simply using its historical mean (Q² ≤ 0). Use it to explain relationships, not to forecast, until more data or better indicators improve the test.`}</p>` : ''}` : '<p class="sub">Set a holdout of 10–30% to test prediction out of sample.</p>'}</div>
      <div><h3>${esc(names[tj])}: actual vs predicted (holdout)</h3><div class="cv"><canvas id="cPlsOos"></canvas></div></div>
    </div>
    <div id="plsFc"></div>
  </div>`;
  kpis('#plsK', [
    {k: 'Observations', v: fmt(n, 0), chip: `${names.length} constructs · ${items.length} indicators`},
    {k: `R² of ${names[tj]}`, v: isNum(fit.R2[tj]) ? fmt(fit.R2[tj] * 100, 1) + '%' : '–', chip: isNum(fit.R2[tj]) ? (fit.R2[tj] >= .5 ? 'moderate+' : fit.R2[tj] >= .25 ? 'weak–moderate' : 'weak') : 'exogenous'},
    {k: 'Significant paths (5%)', v: bs.length ? `${pathRows.filter(r => r.p < .05).length} of ${pathRows.length}` : '–', chip: bs.length ? 'bootstrap' : 'no bootstrap'},
    ...(pp1 ? [{k: `Q²predict (${items[pp1.h]})`, v: fmt(pp1.q2, 3), chip: pp1.rmse < pp1.rmseLm ? 'beats LM benchmark' : 'LM benchmark better', dir: pp1.q2 > 0 ? 'up' : 'dn'}, {k: 'Direction hit (holdout)', v: fmt(pp1.hit, 0) + '%', chip: `${nte} periods`, dir: pp1.hit > 50 ? 'up' : 'dn'}] : []),
  ]);
  $('#plsRead').innerHTML = pathRows.map(r => { const sig = isNum(r.p) ? r.p < .05 : null; return `<span>${esc(names[r.a])} → ${esc(names[r.b])}: ${sig === null ? '' : sig ? '<b>significant</b>, ' : 'not significant, '}a 1-SD rise in ${esc(names[r.a])} goes with a ${fmt(Math.abs(r.est), 2)} SD ${r.est >= 0 ? 'rise' : 'fall'} in ${esc(names[r.b])}${isNum(r.f2) ? ` (f² ${fmt(r.f2, 3)}: ${r.f2 >= .35 ? 'large' : r.f2 >= .15 ? 'medium' : r.f2 >= .02 ? 'small' : 'negligible'})` : ''}.</span>`; }).join('');
  $('#plsDiag').innerHTML = semDiagram(names, blocks.map(b => b.map(h => items[h])), paths, fit, pathRows);
  if (pp1) mk('cPlsOos', {type: 'line', data: {labels: pp1.keys.map(k => semLbl(D.freq, k)), datasets: [line('Actual', pp1.act, t.ink3, {borderWidth: 1.2}), line('PLS-SEM', pp1.plsP, t.s[0]), line('LM benchmark', pp1.lmP, t.s[3], {borderWidth: 1.2, borderDash: [5, 4]})]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(8)}}});
  else emptyChart('cPlsOos', fit.pre[tj].length ? 'Set a holdout of 10–30% to see the test.' : 'The chosen construct is exogenous; pick an endogenous construct to predict.');
  $('#plsFc').innerHTML = fit.pre[tj].length ? (futP.length ? `<h3>Next-period prediction for ${esc(names[tj])}</h3><p class="sub">Full-sample model, using the latest known values of the exogenous indicators (${esc(exoNames.join(', '))}).</p><div class="tbl"><table><thead><tr><th class="txt">As of</th><th>${esc(names[tj])} score (SD)</th>${tItems.map(h => `<th>Predicted ${esc(items[h])}</th>`).join('')}</tr></thead><tbody>${futP.map(r => `<tr><td class="txt">${esc(semLbl(D.freq, r.k))}</td><td class="num">${fmt(r.Yh[tj], 3)}</td>${tItems.map(h => `<td class="num ${r.xh[h] < 0 ? 'neg' : 'pos'}"><b>${fmt(r.xh[h], 3)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<p class="sub">Every period with known predictors also has a known target, so there is no future period to predict. A forward-looking target such as <code>lead(pct(NEPSE,5),5)</code> leaves the latest periods open for prediction.</p>') : '';
  const csvHead = ['Period', ...items], rows = idx.map((i, r) => [semLbl(D.freq, D.keys[i]), ...X[r]]);
  $('#plsCsv').onclick = () => download('sem-data.csv', [csvHead.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n'), 'text/csv');
  $('#plsLav').onclick = () => download('sem-model-lavaan.R', semLavaan(names, cons, paths), 'text/plain');
  $('#plsSem').onclick = () => download('sem-model-seminr.R', semSeminr(names, cons, paths), 'text/plain');
  $('#plsSave').onclick = () => saveQlDataset(D.freq, D.keys, names.map((nm, j) => { const a = Array(D.n).fill(null); idx.forEach((i, r) => a[i] = fit.Y[j][r]); return [nm, a]; }), 'Construct scores');
}
function semLavaan(names, cons, paths) {
  const meas = cons.map(c => c.items.length > 1 ? `  ${c.name} =~ ${c.items.join(' + ')}` : `  ${c.name} =~ 1*${c.items[0]}   # single indicator`).join('\n');
  const st = uniq(paths.map(p => p[1])).map(j => `  ${names[j]} ~ ${paths.filter(p => p[1] === j).map(p => names[p[0]]).join(' + ')}`).join('\n');
  return `# Covariance-based SEM (CB-SEM) of the model built in Nepal Information Hub, ${new Date().toISOString().slice(0, 10)}
# Save the data with "Download data CSV" as sem-data.csv next to this script.
# install.packages("lavaan")
library(lavaan)
d <- read.csv("sem-data.csv", check.names = FALSE)
model <- '
  # measurement model
${meas}
  # structural model
${st}
'
fit <- sem(model, data = d, std.lv = TRUE, estimator = "MLR", missing = "fiml")
summary(fit, standardized = TRUE, fit.measures = TRUE, rsquare = TRUE)
fitMeasures(fit, c("cfi", "tli", "rmsea", "srmr"))
modindices(fit, sort. = TRUE, maximum.number = 10)
`;
}
function semSeminr(names, cons, paths) {
  const q = s => '"' + s + '"';
  return `# PLS-SEM of the same model in R with seminr, to cross-check the app's estimates
# install.packages("seminr")
library(seminr)
d <- read.csv("sem-data.csv", check.names = FALSE)
mm <- constructs(
${cons.map(c => `  composite(${q(c.name)}, c(${c.items.map(q).join(', ')}), weights = mode_A)`).join(',\n')}
)
sm <- relationships(
${uniq(paths.map(p => p[0])).map(a => `  paths(from = ${q(names[a])}, to = c(${paths.filter(p => p[0] === a).map(p => q(names[p[1]])).join(', ')}))`).join(',\n')}
)
pls <- estimate_pls(data = d, measurement_model = mm, structural_model = sm, inner_weights = path_weighting)
summary(pls)
boot <- bootstrap_model(pls, nboot = 1000, seed = 1)
summary(boot)
`;
}
function semDiagram(names, itemNames, paths, fit, pathRows) {
  const m = names.length, depth = Array(m).fill(0);
  fit.order.forEach(j => { fit.pre[j].forEach(i => depth[j] = Math.max(depth[j], depth[i] + 1)); });
  const L = Math.max(...depth) + 1, cols = [...Array(L).keys()].map(d => names.map((_, j) => j).filter(j => depth[j] === d));
  const rowH = j => 70 + itemNames[j].length * 15, W = Math.max(560, L * 230), colH = cols.map(c => c.reduce((s, j) => s + rowH(j) + 20, 0)), Ht = Math.max(...colH) + 190;
  const pos = {}; cols.forEach((c, d) => { let y = (Ht - colH[d]) / 2 + 10; c.forEach(j => { pos[j] = {x: 30 + d * (W - 60) / Math.max(1, L - 1) * (L > 1 ? 1 : 0) + (L === 1 ? W / 2 - 30 : 0), y: y + 28}; y += rowH(j) + 20; }); });
  // keep ellipses inside the canvas
  Object.values(pos).forEach(p => { p.x = Math.min(Math.max(p.x, 80), W - 80); });
  const ink = 'currentColor', rx = 70, ry = 26;
  const edge = r => { const a = pos[r.a], b = pos[r.b], sig = isNum(r.p) && r.p < .05, col = r.est >= 0 ? 'var(--s1, #2a78d6)' : 'var(--crit, #e34948)';
    const mids = names.map((_, j) => j).filter(j => depth[j] > depth[r.a] && depth[j] < depth[r.b]), skip = mids.length > 0;
    let cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (skip) { const my = mids.reduce((s2, j) => s2 + pos[j].y, 0) / mids.length;
      cy = cy <= my ? Math.min(a.y, b.y, ...mids.map(j => pos[j].y)) - 95 : Math.max(a.y, b.y, ...mids.map(j => pos[j].y + rowH(j) - 30)) + 110; }
    const ex = (p, tx, ty) => { const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, sc = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2); return [p.x + ux * sc, p.y + uy * sc]; };
    const [x1, y1] = ex(a, skip ? cx : b.x, skip ? cy : b.y), [x2, y2] = ex(b, skip ? cx : a.x, skip ? cy : a.y);
    const lx = skip ? .25 * x1 + .5 * cx + .25 * x2 : x1 + (x2 - x1) * .45, ly = skip ? .25 * y1 + .5 * cy + .25 * y2 : y1 + (y2 - y1) * .45;
    return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} ${skip ? `Q${cx.toFixed(1)},${cy.toFixed(1)} ` : 'L'}${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${(1 + Math.min(4, Math.abs(r.est) * 6)).toFixed(1)}" ${sig ? '' : 'stroke-dasharray="6 4"'} marker-end="url(#semArr)"/>
      <rect x="${(lx - 34).toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="68" height="20" rx="6" fill="var(--panel)" stroke="var(--line)"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="11.5" font-family="JetBrains Mono, monospace" fill="${ink}">${fmt(r.est, 2)}${star(r.p)}</text>`; };
  const node = j => { const p = pos[j], r2 = fit.R2[j];
    return `<ellipse cx="${p.x}" cy="${p.y}" rx="${rx}" ry="${ry}" fill="var(--panel-2)" stroke="${ink}" stroke-width="1.4"/><text x="${p.x}" y="${p.y + (isNum(r2) ? -2 : 4)}" text-anchor="middle" font-size="13" font-weight="600" fill="${ink}">${esc(names[j])}</text>${isNum(r2) ? `<text x="${p.x}" y="${p.y + 13}" text-anchor="middle" font-size="11" fill="var(--ink-3)">R² ${fmt(r2, 2)}</text>` : ''}
      ${itemNames[j].map((it, i) => `<text x="${p.x}" y="${p.y + ry + 16 + i * 15}" text-anchor="middle" font-size="11" font-family="JetBrains Mono, monospace" fill="var(--ink-2)">${esc(it)} <tspan fill="${Math.abs(fit.load[j][i]) >= .7 ? 'var(--ink)' : 'var(--crit)'}">${fmt(fit.load[j][i], 2)}</tspan></text>`).join('')}`; };
  return `<svg viewBox="0 0 ${W} ${Ht}" width="100%" style="max-width:${W}px;color:var(--ink);font-family:Instrument Sans, system-ui, sans-serif" role="img" aria-label="Path diagram">
    <defs><marker id="semArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)"/></marker></defs>
    ${pathRows.map(edge).join('')}${names.map((_, j) => node(j)).join('')}</svg>`;
}
