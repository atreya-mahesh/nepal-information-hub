/* Nepal Information Hub — Research lab › Optimization lab: numerics (OPT).
   Lagrangian (equality constraints), Karush–Kuhn–Tucker (inequality constraints) and Hamiltonian / Pontryagin
   (dynamic optimisation) methods as used in econometrics and finance. Pure JavaScript; uses ST (stats-core.js).
   Every solver returns its multipliers so the shadow prices / active constraints can be shown. */
'use strict';
const OPT = (() => {
  const S = typeof ST !== 'undefined' ? ST : require('./stats-core.js');
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const mv = (A, x) => A.map(r => dot(r, x)), tr = A => A[0].map((_, j) => A.map(r => r[j]));
  const mm = (A, B) => { const Bt = tr(B); return A.map(r => Bt.map(c => dot(r, c))); };
  const zeros = (n, m) => Array.from({length: n}, () => new Array(m).fill(0));
  const N = S.normCdf, n01 = S.normPdf, isN = v => typeof v === 'number' && isFinite(v);
  // Gaussian elimination with partial pivoting (more stable than an explicit inverse for KKT systems)
  function lsolve(A0, b0) { const n = b0.length, A = A0.map(r => r.slice()), b = b0.slice();
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-300) return null; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
    const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; }

  /* ================= convex QP: min ½x'Gx + c'x  s.t.  Ex = e,  Ax ≥ b   (primal–dual interior point, Mehrotra) =========
     returns x, y (equality multipliers), z ≥ 0 (inequality multipliers), s = Ax − b (slacks) */
  function qp(G, c, E = [], e = [], A = [], b = [], {tol = 1e-10, maxIter = 200} = {}) {
    const n = c.length, me = E.length, mi = A.length; let x = new Array(n).fill(0), y = new Array(me).fill(0);
    let s = A.map((r, i) => Math.max(1, dot(r, x) - b[i])), z = new Array(mi).fill(1), it = 0, conv = false;
    const At = mi ? tr(A) : [], Et = me ? tr(E) : [];
    const solveKKT = (D, rhs1, rhs2) => { // [[G + A'DA, −E'],[E, 0]] [dx; dy] = [rhs1; rhs2]
      const K = zeros(n + me, n + me); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let v = G[i][j]; for (let k = 0; k < mi; k++) v += A[k][i] * D[k] * A[k][j]; K[i][j] = v + (i === j ? 1e-13 : 0); }
      for (let k = 0; k < me; k++) for (let i = 0; i < n; i++) { K[i][n + k] = -E[k][i]; K[n + k][i] = E[k][i]; }
      const sol = lsolve(K, [...rhs1, ...rhs2]); if (!sol) throw new Error('The constraint system is singular (duplicate or conflicting constraints).'); return [sol.slice(0, n), sol.slice(n)]; };
    for (it = 0; it < maxIter; it++) {
      const Gx = mv(G, x), rd = Gx.map((v, i) => v + c[i] - (me ? dot(Et[i], y) : 0) - (mi ? dot(At[i], z) : 0)), re = E.map((r, k) => dot(r, x) - e[k]), ri = A.map((r, k) => dot(r, x) - s[k] - b[k]);
      const mu = mi ? dot(s, z) / mi : 0, scale = 1 + Math.max(...c.map(Math.abs), ...b.map(Math.abs), ...e.map(Math.abs), 0);
      const res = Math.max(0, ...rd.map(Math.abs), ...re.map(Math.abs), ...ri.map(Math.abs));
      if (res < tol * scale && mu < tol) { conv = true; break; }
      const D = s.map((v, k) => z[k] / v);
      const step = (sigmaMu, corr) => { // returns dx, dy, dz, ds
        const w = s.map((v, k) => (-v * z[k] + sigmaMu - (corr ? corr[k] : 0)) / v); // = −z + (σμ − corr)/s
        // (G + A'DA)dx − E'dy = −rd + A'(w − D·ri),  E dx = −re,  ds = A dx + ri,  dz = w − D·ds
        const t = w.map((v, k) => v - D[k] * ri[k]), rhs1 = rd.map((v, i) => { let acc = -v; for (let k = 0; k < mi; k++) acc += A[k][i] * t[k]; return acc; });
        const [dx, dy] = solveKKT(D, rhs1, re.map(v => -v));
        const ds = A.map((r, k) => dot(r, dx) + ri[k]), dz = ds.map((v, k) => w[k] - D[k] * v);
        return {dx, dy, dz, ds}; };
      const maxStep = (v, dv) => { let a = 1; for (let k = 0; k < v.length; k++) if (dv[k] < 0) a = Math.min(a, -v[k] / dv[k]); return a; };
      let d;
      if (mi) { const aff = step(0, null), ap = maxStep(s, aff.ds), ad = maxStep(z, aff.dz), muAff = s.reduce((acc, v, k) => acc + (v + ap * aff.ds[k]) * (z[k] + ad * aff.dz[k]), 0) / mi, sig = Math.min(1, Math.pow(muAff / mu, 3));
        d = step(sig * mu, aff.ds.map((v, k) => v * aff.dz[k])); }
      else d = step(0, null);
      const ap = mi ? Math.min(1, 0.995 * maxStep(s, d.ds)) : 1, ad = mi ? Math.min(1, 0.995 * maxStep(z, d.dz)) : 1;
      x = x.map((v, i) => v + ap * d.dx[i]); s = s.map((v, k) => v + ap * d.ds[k]); y = y.map((v, k) => v + ad * d.dy[k]); z = z.map((v, k) => v + ad * d.dz[k]);
      if (!mi && it > 2) { conv = true; break; }
    }
    const slack = A.map((r, k) => dot(r, x) - b[k]);
    return {x, y, z, s: slack, iters: it, converged: conv, obj: 0.5 * dot(x, mv(G, x)) + dot(c, x)};
  }

  /* ================= LAGRANGIAN ================= */
  /* parse linear restrictions "b1 + b2 = 1; 2*x_NEPSE - b3 = 0" against coefficient names */
  function parseRestr(text, names) {
    const lines = String(text || '').split(/[;\n]+/).map(t => t.trim()).filter(Boolean), R = [], r = [], labels = [];
    const find = tok => { const t = tok.trim(); const m = /^b(\d+)$/i.exec(t); if (m && +m[1] < names.length) return +m[1]; const i = names.findIndex(nm => nm.toLowerCase() === t.toLowerCase()); return i; };
    for (const ln of lines) { const parts = ln.split('='); if (parts.length !== 2) throw new Error(`Restriction "${ln}" needs exactly one "=".`);
      const row = new Array(names.length).fill(0); let rhs = 0;
      const side = (txt, sgn) => { const toks = txt.replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
        for (const tk of toks) { const m = /^(-?)([\d.]*)\*?(.*)$/.exec(tk); let coef = m[2] ? parseFloat(m[2]) : 1; if (m[1]) coef = -coef; const nm = m[3];
          if (!nm) { rhs -= sgn * coef; continue; } const j = find(nm); if (j < 0) throw new Error(`"${nm}" in "${ln}" is not a coefficient. Use b0, b1, … or a variable name (${names.join(', ')}).`); row[j] += sgn * coef; } };
      side(parts[0], 1); side(parts[1], -1); R.push(row); r.push(rhs); labels.push(ln); }
    if (!R.length) throw new Error('Type at least one restriction, e.g. b1 + b2 = 1.');
    return {R, r, labels};
  }
  /* restricted least squares by the Lagrangian  L = ½‖y − Xβ‖² − λ'(Rβ − r)  ⇒  β_R = β̂ − (X'X)⁻¹R'[R(X'X)⁻¹R']⁻¹(Rβ̂ − r),
     λ = [R(X'X)⁻¹R']⁻¹(r − Rβ̂). Wald / LR / LM trinity (W ≥ LR ≥ LM in the linear model). */
  function rls(y, X, R, r, names) {
    const n = y.length, k = X[0].length, q = R.length, u = S.ols(y, X, names), XtXi = u.XtXi, b = u.coef;
    const RXR = mm(mm(R, XtXi), tr(R)), RXRi = S.inv(RXR); if (!RXRi) throw new Error('The restrictions are linearly dependent.');
    const dev = R.map((row, i) => dot(row, b) - r[i]), lam = mv(RXRi, dev.map(v => -v)), corr = mv(XtXi, mv(tr(R), lam));
    const bR = b.map((v, i) => v + corr[i]), fitR = X.map(rw => dot(rw, bR)), eR = y.map((v, i) => v - fitR[i]), ssrR = dot(eR, eR), ssrU = u.ssr;
    const s2R = ssrR / (n - k + q), covR = (() => { const P = mm(mm(mm(XtXi, tr(R)), RXRi), mm(R, XtXi)); return XtXi.map((rw, i) => rw.map((v, j) => s2R * (v - P[i][j]))); })();
    const seR = covR.map((rw, i) => Math.sqrt(Math.max(rw[i], 0)));
    const lamCov = RXRi.map(rw => rw.map(v => v * s2R)), lamSe = lamCov.map((rw, i) => Math.sqrt(Math.max(rw[i], 0)));
    const F = ((ssrR - ssrU) / q) / (ssrU / (n - k)), W = n * (ssrR - ssrU) / ssrU, LR = n * Math.log(ssrR / ssrU), LM = n * (ssrR - ssrU) / ssrR;
    // score form: LM = s'I⁻¹s with s = X'ẽ/σ̃², I = X'X/σ̃², σ̃² = ẽ'ẽ/n  — equals n·R² (uncentred) of ẽ on X
    const s2t = ssrR / n, sc = mv(tr(X), eR).map(v => v / s2t), Iinv = XtXi.map(rw => rw.map(v => v * s2t)), LMscore = dot(sc, mv(Iinv, sc));
    return {u, bR, seR, eR, ssrR, ssrU, lam, lamSe, lamZ: lam.map((v, i) => v / lamSe[i]), lamP: lam.map((v, i) => 2 * (1 - N(Math.abs(v / lamSe[i])))), dev,
      F, Fp: S.fP(F, q, n - k), W, Wp: S.chi2P(W, q), LR, LRp: S.chi2P(LR, q), LM, LMp: S.chi2P(LM, q), LMscore, score: sc, q, n, k};
  }
  /* LM (score) diagnostic tests on an OLS fit, each as n·R² of an auxiliary regression */
  function lmTests(y, X, {bg = 4, arch = 4} = {}) {
    const f = S.ols(y, X), e = f.res, n = e.length, k = X[0].length, aux = (yy, Z) => { const g = S.ols(yy, Z); return g; };
    // Breusch–Godfrey: e_t on X_t and e_{t-1..p} (pre-sample residuals set to 0)
    const Zbg = X.map((rw, t) => [...rw, ...Array.from({length: bg}, (_, j) => t - j - 1 >= 0 ? e[t - j - 1] : 0)]), gbg = aux(e, Zbg);
    const r2bg = 1 - gbg.ssr / dot(e, e), LMbg = n * r2bg;
    // Breusch–Pagan (Koenker studentised): e² on X
    const e2 = e.map(v => v * v), Xc = X.every(rw => rw[0] === 1) ? X : X.map(rw => [1, ...rw]), gbp = aux(e2, Xc), LMbp = n * gbp.r2, dfbp = Xc[0].length - 1;
    // ARCH-LM: e²_t on 1, e²_{t-1..q}
    const ya = e2.slice(arch), Za = ya.map((_, t) => [1, ...Array.from({length: arch}, (_, j) => e2[t + arch - j - 1])]), ga = aux(ya, Za), LMa = ya.length * ga.r2;
    return {fit: f, bg: {lags: bg, LM: LMbg, df: bg, p: S.chi2P(LMbg, bg), r2: r2bg}, bp: {LM: LMbp, df: dfbp, p: dfbp > 0 ? S.chi2P(LMbp, dfbp) : null, r2: gbp.r2, aux: gbp}, arch: {lags: arch, LM: LMa, df: arch, p: S.chi2P(LMa, arch), r2: ga.r2, n: ya.length}, n, k};
  }
  /* analytic Markowitz with short sales:  L = ½w'Σw − λ1(w'μ − μ0) − λ2(w'1 − 1) */
  function markowitz(mu, C, rf = null) {
    const m = mu.length, Ci = S.inv(C); if (!Ci) throw new Error('The covariance matrix is singular (two assets move identically?).');
    const one = new Array(m).fill(1), Cim = mv(Ci, mu), Ci1 = mv(Ci, one), A = dot(one, Cim), B = dot(mu, Cim), Cc = dot(one, Ci1), D = B * Cc - A * A;
    if (!(D > 0)) throw new Error('All assets have the same expected return — the frontier is a single point.');
    const at = mu0 => { const l1 = (Cc * mu0 - A) / D, l2 = (B - A * mu0) / D, w = Cim.map((v, i) => l1 * v + l2 * Ci1[i]); return {mu0, w, l1, l2, var: (Cc * mu0 * mu0 - 2 * A * mu0 + B) / D, sd: Math.sqrt((Cc * mu0 * mu0 - 2 * A * mu0 + B) / D)}; };
    const gmv = {w: Ci1.map(v => v / Cc), mu: A / Cc, var: 1 / Cc, sd: Math.sqrt(1 / Cc)};
    let tan = null; if (isN(rf) && A / Cc > rf) { const ex = mu.map(v => v - rf), z = mv(Ci, ex), sz = z.reduce((a, b) => a + b, 0); if (Math.abs(sz) > 1e-12) { const w = z.map(v => v / sz), m1 = dot(w, mu), v1 = dot(w, mv(C, w)); tan = {w, mu: m1, sd: Math.sqrt(v1), sharpe: (m1 - rf) / Math.sqrt(v1), lambdaCML: (m1 - rf) / v1}; } }
    return {A, B, C: Cc, D, at, gmv, tan, Ci};
  }

  /* ================= KKT ================= */
  /* long-only / bounded mean–variance:  min ½w'Σw  s.t. w'μ ≥ μ0, 1'w = 1, lo ≤ w ≤ hi  (per-asset bounds allowed) */
  function portfolioKKT(mu, C, {mu0, lo = 0, hi = 1} = {}) {
    const m = mu.length, L = Array.isArray(lo) ? lo : new Array(m).fill(lo), U = Array.isArray(hi) ? hi : new Array(m).fill(hi);
    if (L.reduce((a, b) => a + b, 0) > 1 + 1e-12 || U.reduce((a, b) => a + b, 0) < 1 - 1e-12) throw new Error('The bounds are infeasible: lower bounds sum above 100% or upper bounds sum below 100%.');
    const maxRet = (() => { const ord = mu.map((v, i) => i).sort((a, b) => mu[b] - mu[a]), w = L.slice(); let left = 1 - L.reduce((a, b) => a + b, 0); for (const i of ord) { const add = Math.min(U[i] - L[i], left); w[i] += add; left -= add; } return dot(w, mu); })();
    if (isN(mu0) && mu0 > maxRet + 1e-12) throw new Error(`Target return ${mu0.toFixed(4)} is above the highest return reachable under these bounds (${maxRet.toFixed(4)}).`);
    const A = [], b = [], tags = [];
    if (isN(mu0)) { A.push(mu.slice()); b.push(mu0); tags.push({t: 'ret'}); }
    for (let i = 0; i < m; i++) { const r = new Array(m).fill(0); r[i] = 1; A.push(r); b.push(L[i]); tags.push({t: 'lo', i}); }
    for (let i = 0; i < m; i++) { const r = new Array(m).fill(0); r[i] = -1; A.push(r); b.push(-U[i]); tags.push({t: 'hi', i}); }
    const sol = qp(C, new Array(m).fill(0), [new Array(m).fill(1)], [1], A, b), w = sol.x, act = 1e-7;
    const g = mv(C, w), get = (t, i) => tags.findIndex(x => x.t === t && (i === undefined || x.i === i));
    const lamRet = isN(mu0) ? sol.z[get('ret')] : 0, lamBud = sol.y[0];
    const assets = w.map((wi, i) => { const nu = sol.z[get('lo', i)], xi = sol.z[get('hi', i)], sl = wi - L[i], su = U[i] - wi;
      return {w: wi, grad: g[i], nu, xi, slackLo: sl, slackHi: su, cs: Math.max(Math.abs(nu * sl), Math.abs(xi * su)), status: sl < act ? 'at lower bound' : su < act ? 'at upper bound' : 'interior',
        stat: g[i] - lamRet * mu[i] - lamBud - nu + xi}; });
    const retSlack = isN(mu0) ? dot(w, mu) - mu0 : null;
    return {w, ret: dot(w, mu), var: dot(w, g), sd: Math.sqrt(dot(w, g)), lamRet, lamBud, retSlack, retActive: isN(mu0) && retSlack < act, assets, sol, maxRet,
      maxStat: Math.max(...assets.map(a => Math.abs(a.stat))), maxCS: Math.max(...assets.map(a => a.cs), isN(mu0) ? Math.abs(lamRet * retSlack) : 0), minDual: Math.min(...sol.z)};
  }
  /* elastic net / lasso by coordinate descent on standardised X:  (1/2n)‖y − Xβ‖² + λ[α‖β‖₁ + ½(1−α)‖β‖²]  (glmnet / scikit-learn objective) */
  function enetStd(X, y) { const n = X.length, k = X[0].length, mx = [], sx = []; for (let j = 0; j < k; j++) { let m = 0; for (let i = 0; i < n; i++) m += X[i][j]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (X[i][j] - m) ** 2; mx.push(m); sx.push(Math.sqrt(v / n) || 1); }
    const Z = X.map(r => r.map((v, j) => (v - mx[j]) / sx[j])), my = y.reduce((a, b) => a + b, 0) / n; return {Z, yc: y.map(v => v - my), mx, sx, my}; }
  function enetCD(Z, yc, lam, alpha, b0 = null, {tol = 1e-12, maxIt = 20000} = {}) {
    const n = Z.length, k = Z[0].length, b = b0 ? b0.slice() : new Array(k).fill(0), r = yc.map((v, i) => v - dot(Z[i], b)), cn = Array.from({length: k}, (_, j) => { let s = 0; for (let i = 0; i < n; i++) s += Z[i][j] ** 2; return s / n; });
    for (let it = 0; it < maxIt; it++) { let mx = 0; for (let j = 0; j < k; j++) { const old = b[j]; let rho = 0; for (let i = 0; i < n; i++) rho += Z[i][j] * r[i]; rho = rho / n + cn[j] * old;
        const nb = Math.sign(rho) * Math.max(Math.abs(rho) - lam * alpha, 0) / (cn[j] + lam * (1 - alpha)); if (nb !== old) { for (let i = 0; i < n; i++) r[i] -= Z[i][j] * (nb - old); b[j] = nb; mx = Math.max(mx, Math.abs(nb - old)); } }
      if (mx < tol) break; }
    return {b, r}; }
  function lasso(X, y, {alpha = 1, lam = null, nLam = 60, ratio = 1e-3} = {}) {
    const {Z, yc, mx, sx, my} = enetStd(X, y), n = Z.length, k = Z[0].length, corr0 = Array.from({length: k}, (_, j) => Math.abs(dot(Z.map(r => r[j]), yc)) / n);
    const lmax = Math.max(...corr0) / Math.max(alpha, 1e-3), grid = Array.from({length: nLam}, (_, i) => lmax * Math.pow(ratio, i / (nLam - 1)));
    let b = null; const path = grid.map(l => { const f = enetCD(Z, yc, l, alpha, b); b = f.b; return {lam: l, b: f.b.slice(), nz: f.b.filter(v => v !== 0).length}; });
    const L = isN(lam) ? lam : lmax * 0.1, fit = enetCD(Z, yc, L, alpha, null), g = Array.from({length: k}, (_, j) => dot(Z.map(r => r[j]), fit.r) / n);
    const kkt = fit.b.map((bj, j) => { const gj = g[j] - L * (1 - alpha) * bj; return bj !== 0 ? {j, b: bj, g: gj, cond: `X'r/n − λ(1−α)β = λα·sign(β)`, viol: Math.abs(gj - L * alpha * Math.sign(bj))} : {j, b: 0, g: gj, cond: `|X'r/n| ≤ λα`, viol: Math.max(0, Math.abs(gj) - L * alpha)}; });
    const coefOrig = fit.b.map((v, j) => v / sx[j]), icpt = my - coefOrig.reduce((a, v, j) => a + v * mx[j], 0);
    return {lmax, grid, path, lam: L, alpha, b: fit.b, coefOrig, icpt, kkt, g, maxViol: Math.max(...kkt.map(x => x.viol)), r: fit.r, n, k};
  }
  /* Tobit (censored normal regression), lower limit L and/or upper limit U.  y* = xβ + ε; y = L if y* ≤ L, U if y* ≥ U */
  const logPhi = z => z > -5 ? Math.log(Math.max(N(z), 1e-300)) : (() => { const r = 0.5 * S.erfc(-z / Math.SQRT2); return Math.log(Math.max(r, 1e-300)); })();
  const mills = z => { const p = 0.5 * S.erfc(-z / Math.SQRT2); return p > 1e-300 ? n01(z) / p : -z; }; // φ(z)/Φ(z)
  function tobit(y, X, {L = 0, U = null} = {}) {
    const n = y.length, k = X[0].length, lo = isN(L), hi = isN(U), cens = y.map(v => lo && v <= L + 1e-12 ? -1 : hi && v >= U - 1e-12 ? 1 : 0);
    const nll = th => { const b = th.slice(0, k), s = Math.exp(th[k]); let ll = 0; for (let i = 0; i < n; i++) { const xb = dot(X[i], b);
        if (cens[i] < 0) ll += logPhi((L - xb) / s); else if (cens[i] > 0) ll += logPhi((xb - U) / s); else { const z = (y[i] - xb) / s; ll += -0.5 * z * z - 0.5 * Math.log(2 * Math.PI) - th[k]; } } return -ll; };
    const grad = th => { const b = th.slice(0, k), s = Math.exp(th[k]), g = new Array(k + 1).fill(0); for (let i = 0; i < n; i++) { const xb = dot(X[i], b); let gx, gs;
        if (cens[i] < 0) { const z = (L - xb) / s, m = mills(z); gx = -m / s; gs = -m * z; } else if (cens[i] > 0) { const z = (xb - U) / s, m = mills(z); gx = m / s; gs = -m * z; } else { const z = (y[i] - xb) / s; gx = z / s; gs = z * z - 1; }
        for (let j = 0; j < k; j++) g[j] -= gx * X[i][j]; g[k] -= gs; } return g; };
    const o = S.ols(y, X), th0 = [...o.coef, Math.log(Math.max(o.s, 1e-6))], res = bfgsG(nll, grad, th0);
    const H = numHessG(grad, res.x), V = S.inv(H); const th = res.x, b = th.slice(0, k), s = Math.exp(th[k]);
    const seT = V ? V.map((r, i) => Math.sqrt(Math.max(r[i], 0))) : th.map(() => NaN);
    // average marginal effect on the observed (censored) mean:  ∂E[y|x]/∂x_j = β_j·P(L < y* < U | x)
    const pIn = X.map(r => { const xb = dot(r, b); return (hi ? N((U - xb) / s) : 1) - (lo ? N((L - xb) / s) : 0); }), ame = b.map(bj => bj * pIn.reduce((a, v) => a + v, 0) / n);
    const ll = -res.f, z = b.map((v, j) => v / seT[j]);
    return {b, sigma: s, se: seT.slice(0, k), seLogS: seT[k], z, p: z.map(v => 2 * (1 - N(Math.abs(v)))), ll, aic: -2 * ll + 2 * (k + 1), ame, nCensLo: cens.filter(c => c < 0).length, nCensHi: cens.filter(c => c > 0).length, n, ols: o, gradMax: Math.max(...grad(th).map(Math.abs)), conv: res.conv};
  }
  function bfgsG(f, g, x0, {maxIter = 500, gtol = 1e-8} = {}) { let x = x0.slice(), fx = f(x), gx = g(x), n = x.length, H = S.eye(n), conv = false;
    for (let it = 0; it < maxIter; it++) { if (Math.max(...gx.map(Math.abs)) < gtol) { conv = true; break; }
      let d = mv(H, gx).map(v => -v), gd = dot(gx, d); if (gd >= 0) { H = S.eye(n); d = gx.map(v => -v); gd = dot(gx, d); }
      let a = 1, xn, fn; for (let ls = 0; ls < 60; ls++) { xn = x.map((v, i) => v + a * d[i]); fn = f(xn); if (isN(fn) && fn <= fx + 1e-4 * a * gd) break; a *= 0.5; }
      if (!isN(fn) || fn > fx) { conv = Math.max(...gx.map(Math.abs)) < 1e-5; break; }
      const gn = g(xn), s = xn.map((v, i) => v - x[i]), yv = gn.map((v, i) => v - gx[i]), sy = dot(s, yv);
      if (sy > 1e-16) { const Hy = mv(H, yv), yHy = dot(yv, Hy); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i][j] += ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy; }
      x = xn; fx = fn; gx = gn; }
    return {x, f: fx, conv}; }
  function numHessG(g, x) { const n = x.length, H = zeros(n, n); for (let j = 0; j < n; j++) { const h = 1e-5 * Math.max(1, Math.abs(x[j])), a = x.slice(), b = x.slice(); a[j] += h; b[j] -= h; const ga = g(a), gb = g(b); for (let i = 0; i < n; i++) H[i][j] = (ga[i] - gb[i]) / (2 * h); }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) H[i][j] = H[j][i] = (H[i][j] + H[j][i]) / 2; return H; }

  /* quantile regression — IRLS as in statsmodels QuantReg (check loss ρ_τ(u) = u(τ − 1{u<0})) */
  function qreg(y, X, tau, {maxIter = 1000, tol = 1e-6} = {}) {
    const n = y.length, k = X[0].length; let b = S.ols(y, X).coef, it;
    for (it = 0; it < maxIter; it++) { const r = y.map((v, i) => { let e = v - dot(X[i], b); if (Math.abs(e) < 1e-6) e = (e < 0 ? -1 : 1) * 1e-6; return Math.abs(e < 0 ? tau * e : (1 - tau) * e); });
      const XtW = zeros(k, k), Xty = new Array(k).fill(0); for (let i = 0; i < n; i++) { const w = 1 / r[i]; for (let a = 0; a < k; a++) { Xty[a] += w * X[i][a] * y[i]; for (let c = 0; c < k; c++) XtW[a][c] += w * X[i][a] * X[i][c]; } }
      const nb = lsolve(XtW, Xty); if (!nb) break; const d = Math.max(...nb.map((v, i) => Math.abs(v - b[i]))); b = nb; if (d < tol) break; }
    const loss = y.reduce((s, v, i) => { const e = v - dot(X[i], b); return s + e * (tau - (e < 0 ? 1 : 0)); }, 0);
    return {b, tau, loss, iters: it}; }
  /* non-crossing quantiles: fit τ1 < … < τm jointly with q_{τ(j+1)}(x_i) ≥ q_{τj}(x_i) at every design point,
     by the method of multipliers on a smoothed check loss (Huber-type, h → 0). Multipliers > 0 mark binding constraints. */
  function qregNonCross(y, X, taus, {Xc = null, h0 = null} = {}) {
    const n = y.length, k = X[0].length, m = taus.length, P = Xc || X, np = P.length, free = taus.map(t => qreg(y, X, t));
    const sdY = Math.sqrt(S.variance(y)) || 1; let B = free.map(f => f.b.slice()), mu = Array.from({length: m - 1}, () => new Array(np).fill(0)), rho = n / (sdY * sdY);
    const hs = [0.2, 0.05, 0.01, 0.002, 0.0005].map(v => v * sdY * (h0 || 1));
    const lossG = (bv, tau, h, onlyL) => { const g = new Array(k).fill(0), Hm = zeros(k, k); let L = 0; for (let i = 0; i < n; i++) { const u = y[i] - dot(X[i], bv); let l, d1, d2;
        // smoothed check: quadratic within |u| ≤ h
        if (u > h) { l = tau * (u - h / 2); d1 = tau; d2 = 0; } else if (u < -h) { l = (tau - 1) * (u + h / 2); d1 = tau - 1; d2 = 0; } else { l = u * u / (2 * h) * (u >= 0 ? tau : 1 - tau); d1 = u / h * (u >= 0 ? tau : 1 - tau); d2 = (u >= 0 ? tau : 1 - tau) / h; }
        L += l; for (let a = 0; a < k; a++) { g[a] -= d1 * X[i][a]; for (let c = 0; c < k; c++) Hm[a][c] += d2 * X[i][a] * X[i][c]; } } return {L, g, H: Hm}; };
    for (const h of hs) for (let outer = 0; outer < 30; outer++) {
      { const K2 = m * k, unpack = th => taus.map((_, j) => th.slice(j * k, (j + 1) * k));
        const phi = BB => { let v = 0; for (let j = 0; j < m; j++) v += lossG(BB[j], taus[j], h, true).L; for (let j = 0; j < m - 1; j++) for (let i = 0; i < np; i++) { const c = dot(P[i], BB[j + 1]) - dot(P[i], BB[j]), t = Math.max(0, mu[j][i] - rho * c); v += (t * t - mu[j][i] ** 2) / (2 * rho); } return v; };
        for (let it = 0; it < 80; it++) { const g = new Array(K2).fill(0), H = zeros(K2, K2);
          for (let j = 0; j < m; j++) { const r2 = lossG(B[j], taus[j], h); for (let a2 = 0; a2 < k; a2++) { g[j * k + a2] += r2.g[a2]; for (let c2 = 0; c2 < k; c2++) H[j * k + a2][j * k + c2] += r2.H[a2][c2]; } }
          for (let j = 0; j < m - 1; j++) for (let i = 0; i < np; i++) { const c = dot(P[i], B[j + 1]) - dot(P[i], B[j]), t = mu[j][i] - rho * c; if (t <= 0) continue;
            for (let a2 = 0; a2 < k; a2++) { g[(j + 1) * k + a2] -= t * P[i][a2]; g[j * k + a2] += t * P[i][a2];
              for (let c2 = 0; c2 < k; c2++) { const v = rho * P[i][a2] * P[i][c2]; H[(j + 1) * k + a2][(j + 1) * k + c2] += v; H[j * k + a2][j * k + c2] += v; H[(j + 1) * k + a2][j * k + c2] -= v; H[j * k + a2][(j + 1) * k + c2] -= v; } } }
          const tr0 = H.reduce((acc, r, a2) => acc + r[a2], 0) / K2; for (let a2 = 0; a2 < K2; a2++) H[a2][a2] += 1e-9 * tr0 + 1e-12;
          const d = lsolve(H, g.map(v => -v)); if (!d) break; const gd = dot(g, d); if (gd >= 0) break; const th0 = B.flat(), f0 = phi(B); let st = 1, nb;
          for (let ls = 0; ls < 50; ls++) { nb = unpack(th0.map((v, a2) => v + st * d[a2])); if (phi(nb) <= f0 + 1e-4 * st * gd) break; st *= 0.5; }
          B = nb; if (Math.max(...d.map(Math.abs)) * st < 1e-11 * (1 + Math.max(...th0.map(Math.abs)))) break; } }
      let mx = 0; for (let j = 0; j < m - 1; j++) for (let i = 0; i < np; i++) { const c = dot(P[i], B[j + 1]) - dot(P[i], B[j]), nm = Math.max(0, mu[j][i] - rho * c); mx = Math.max(mx, Math.max(0, -c)); mu[j][i] = nm; }
      if (mx < 1e-9 * sdY) break; rho *= 2; }
    const cross = BB => { let c = 0; for (let j = 0; j < m - 1; j++) for (let i = 0; i < np; i++) if (dot(P[i], BB[j + 1]) < dot(P[i], BB[j]) - 1e-10) c++; return c; };
    const loss = BB => BB.map((b, j) => y.reduce((s, v, i) => { const e = v - dot(X[i], b); return s + e * (taus[j] - (e < 0 ? 1 : 0)); }, 0));
    return {taus, free: free.map(f => f.b), con: B, crossFree: cross(free.map(f => f.b)), crossCon: cross(B), lossFree: loss(free.map(f => f.b)), lossCon: loss(B), mu, active: mu.map(r => r.filter(v => v > 1e-8).length)};
  }
  /* soft-margin SVM dual by SMO (maximal-violating-pair working set, as in LIBSVM):
     max Σα − ½ΣΣ α_i α_j y_i y_j K_ij  s.t. 0 ≤ α ≤ C, Σ α_i y_i = 0.  KKT: α=0 ⇒ y f ≥ 1; 0<α<C ⇒ y f = 1; α=C ⇒ y f ≤ 1 */
  function svmDual(X, y, {C = 1, kernel = 'linear', gamma = null, tol = 1e-4, maxIter = 200000} = {}) {
    const n = X.length, k = X[0].length, ys = y.map(v => v > 0 ? 1 : -1), gm = gamma || 1 / k;
    const Kf = kernel === 'rbf' ? (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.exp(-gm * s); } : dot;
    const K = Array.from({length: n}, (_, i) => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = i; j < n; j++) K[i][j] = K[j][i] = Kf(X[i], X[j]);
    const a = new Float64Array(n), G = new Float64Array(n).fill(-1); let it = 0;
    for (it = 0; it < maxIter; it++) { let i = -1, j = -1, gmax = -Infinity, gmin = Infinity;
      for (let t = 0; t < n; t++) { const v = -ys[t] * G[t]; if ((ys[t] > 0 && a[t] < C) || (ys[t] < 0 && a[t] > 0)) { if (v > gmax) { gmax = v; i = t; } } if ((ys[t] > 0 && a[t] > 0) || (ys[t] < 0 && a[t] < C)) { if (v < gmin) { gmin = v; j = t; } } }
      if (gmax - gmin < tol || i < 0 || j < 0) break;
      const qd = Math.max(K[i][i] + K[j][j] - 2 * ys[i] * ys[j] * K[i][j] * ys[i] * ys[j], 1e-12), ai = a[i], aj = a[j];
      // move along the feasible direction keeping Σ α y = 0
      let step = (gmax - gmin) / qd;
      const lim = (t, dir) => { const d = dir * ys[t]; return d > 0 ? C - a[t] : a[t]; }; step = Math.min(step, lim(i, 1), lim(j, -1));
      a[i] += ys[i] * step; a[j] -= ys[j] * step; const di = a[i] - ai, dj = a[j] - aj;
      for (let t = 0; t < n; t++) G[t] += ys[t] * (ys[i] * K[t][i] * di + ys[j] * K[t][j] * dj); }
    // bias from free support vectors
    let bs = 0, nf = 0; for (let t = 0; t < n; t++) if (a[t] > 1e-8 && a[t] < C - 1e-8) { bs += -ys[t] * G[t]; nf++; }
    let b; if (nf) b = bs / nf; else { let ub = Infinity, lb = -Infinity; for (let t = 0; t < n; t++) { const v = -ys[t] * G[t]; if ((ys[t] > 0 && a[t] < C) || (ys[t] < 0 && a[t] > 0)) lb = Math.max(lb, v); else ub = Math.min(ub, v); } b = (ub + lb) / 2; }
    // G_t = y_t Σ α_s y_s K_ts − 1  ⇒  decision f(x_t) = Σ α y K + b
    const f = Array.from({length: n}, (_, t) => ys[t] * (G[t] + 1) + b), margin = f.map((v, t) => ys[t] * v);
    const kktViol = Array.from({length: n}, (_, t) => a[t] <= 1e-8 ? Math.max(0, 1 - margin[t]) : a[t] >= C - 1e-8 ? Math.max(0, margin[t] - 1) : Math.abs(margin[t] - 1));
    let w = null; if (kernel !== 'rbf') { w = new Array(k).fill(0); for (let t = 0; t < n; t++) if (a[t] > 0) for (let c = 0; c < k; c++) w[c] += a[t] * ys[t] * X[t][c]; }
    const sv = [...a].map((v, t) => v > 1e-8 ? t : -1).filter(t => t >= 0);
    const predict = Xn => Xn.map(x => { let s = b; for (const t of sv) s += a[t] * ys[t] * Kf(X[t], x); return s; });
    return {alpha: [...a], b, w, f, margin, kktViol, maxViol: Math.max(...kktViol), sv, nFree: sv.filter(t => a[t] < C - 1e-8).length, nBound: sv.filter(t => a[t] >= C - 1e-8).length, iters: it, C, kernel, gamma: gm, predict, dual: [...a].reduce((s, v) => s + v, 0) - 0.5 * (() => { let q = 0; for (const s1 of sv) for (const s2 of sv) q += a[s1] * a[s2] * ys[s1] * ys[s2] * K[s1][s2]; return q; })()};
  }
  /* call-price no-arbitrage in strike: bounds, monotonicity, slope ≥ −e^{−rT}, convexity.
     Check the quotes, then project them onto the arbitrage-free set (least squares QP); multipliers show which constraints bind. */
  function arbCheck(K, Cq, {S0, r = 0, q = 0, T = 1, type = 'call'} = {}) {
    const n = K.length, o = K.map((v, i) => i).sort((a, b) => K[a] - K[b]), Ks = o.map(i => K[i]), Cs = o.map(i => Cq[i]), dfr = Math.exp(-r * T), dfq = Math.exp(-q * T), call = type === 'call';
    const rows = [], b = [], lab = [];
    const add = (coef, rhs, l) => { rows.push(coef); b.push(rhs); lab.push(l); };
    for (let i = 0; i < n; i++) { const lo = call ? Math.max(0, S0 * dfq - Ks[i] * dfr) : Math.max(0, Ks[i] * dfr - S0 * dfq), hi = call ? S0 * dfq : Ks[i] * dfr;
      const e1 = new Array(n).fill(0); e1[i] = 1; add(e1, lo, {kind: 'lower bound', i}); const e2 = new Array(n).fill(0); e2[i] = -1; add(e2, -hi, {kind: 'upper bound', i}); }
    for (let i = 0; i + 1 < n; i++) { const dK = Ks[i + 1] - Ks[i], e = new Array(n).fill(0);
      if (call) { e[i] = 1; e[i + 1] = -1; add(e, 0, {kind: 'monotone (C falls with K)', i}); const e2 = new Array(n).fill(0); e2[i] = -1; e2[i + 1] = 1; add(e2, -dfr * dK, {kind: 'slope ≥ −e^{−rT}', i}); }
      else { e[i] = -1; e[i + 1] = 1; add(e, 0, {kind: 'monotone (P rises with K)', i}); const e2 = new Array(n).fill(0); e2[i] = 1; e2[i + 1] = -1; add(e2, -dfr * dK, {kind: 'slope ≤ e^{−rT}', i}); } }
    for (let i = 0; i + 2 < n; i++) { const d1 = Ks[i + 1] - Ks[i], d2 = Ks[i + 2] - Ks[i + 1], e = new Array(n).fill(0); // convexity: C_{i+1} ≤ w C_i + (1−w) C_{i+2}
      e[i] = d2 / (d1 + d2); e[i + 1] = -1; e[i + 2] = d1 / (d1 + d2); add(e, 0, {kind: 'convex in K (butterfly ≥ 0)', i}); }
    const viol = rows.map((r2, k) => ({...lab[k], gap: dot(r2, Cs) - b[k]})).filter(v => v.gap < -1e-9);
    const sol = qp(S.eye(n), Cs.map(v => -v), [], [], rows, b), fit = sol.x;
    const binding = rows.map((_, k) => ({...lab[k], z: sol.z[k], slack: sol.s[k]})).filter(v => v.z > 1e-7);
    return {K: Ks, C: Cs, fit, viol, binding, adj: fit.map((v, i) => v - Cs[i]), sse: fit.reduce((s, v, i) => s + (v - Cs[i]) ** 2, 0), sol};
  }

  /* ================= HAMILTONIAN ================= */
  /* Almgren–Chriss (2000) optimal liquidation. Discrete solution of the Hamiltonian system ẍ = κ²x:
     x_j = X sinh(κ(T − t_j))/sinh(κT), cosh(κτ) = 1 + λσ²τ²/(2η̃), η̃ = η − γτ/2 */
  function almgrenChriss({X, T, N: Np, sigma, eta, gamma = 0, eps = 0, lam}) {
    const tau = T / Np, et = eta - gamma * tau / 2; if (et <= 0) throw new Error('η − γτ/2 must be positive: raise η, lower γ or use more trading periods.');
    const kap = lam > 0 ? Math.acosh(1 + lam * sigma * sigma * tau * tau / (2 * et)) / tau : 0;
    const t = Array.from({length: Np + 1}, (_, j) => j * tau), x = t.map(tj => kap > 0 ? X * Math.sinh(kap * (T - tj)) / Math.sinh(kap * T) : X * (1 - tj / T));
    const nTr = x.slice(1).map((v, j) => x[j] - v), v = nTr.map(nk => nk / tau);
    const EC = 0.5 * gamma * X * X + eps * nTr.reduce((s, a) => s + Math.abs(a), 0) + et / tau * nTr.reduce((s, a) => s + a * a, 0), VC = sigma * sigma * tau * x.slice(1).reduce((s, a) => s + a * a, 0);
    // co-state of the continuous problem: p(t) = 2η v(t) = marginal cost of holding one more share
    const p = t.map(tj => 2 * eta * (kap > 0 ? X * kap * Math.cosh(kap * (T - tj)) / Math.sinh(kap * T) : X / T));
    return {t, x, n: nTr, v, kap, EC, VC, SD: Math.sqrt(VC), U: EC + lam * VC, halfLife: kap > 0 ? Math.log(2) / kap : Infinity, tau, etaT: et, p, lam};
  }
  function acSimulate(o, {S0, sigma, eta, gamma = 0, eps = 0, paths = 2000, seed = 7}) { // implementation shortfall per path (Rs)
    let s = seed >>> 0; const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }, g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const out = []; for (let p = 0; p < paths; p++) { let S = S0, cash = 0; for (let k = 0; k < o.n.length; k++) { S += sigma * Math.sqrt(o.tau) * g(); const nk = o.n[k], px = S - eps * Math.sign(nk) - eta * nk / o.tau; cash += nk * px; S -= gamma * nk; }
      out.push(o.x[0] * S0 - cash); } return out; }
  /* Merton (1969/71) consumption–portfolio with CRRA utility, finite horizon, bequest u(W_T):
     π* = (μ − r)/(γσ²);  c*(t) = W/f(t),  f(t) = [1 + (ν − 1)e^{−ν(T−t)}]/ν,  ν = [ρ − (1−γ)(r + (μ−r)²/(2γσ²))]/γ */
  function merton({mu, r, sigma, gamma, rho, T}) {
    const pi = (mu - r) / (gamma * sigma * sigma), nu = (rho - (1 - gamma) * (r + (mu - r) ** 2 / (2 * gamma * sigma * sigma))) / gamma;
    const f = t => Math.abs(nu) < 1e-10 ? 1 + T - t : (1 + (nu - 1) * Math.exp(-nu * (T - t))) / nu;
    const u = c => Math.abs(gamma - 1) < 1e-9 ? Math.log(c) : c ** (1 - gamma) / (1 - gamma);
    const V = (t, W) => Math.abs(gamma - 1) < 1e-9 ? null : Math.exp(-rho * t) * f(t) ** gamma * W ** (1 - gamma) / (1 - gamma);
    // HJB residual: V_t + max_{c,π}[e^{−ρt}u(c) + V_W(rW + π(μ−r)W − c) + ½V_WW π²σ²W²] (evaluated numerically at the optimum)
    const hjb = (t, W) => { if (!V(t, W)) return null; const ht = 1e-5, hw = 1e-4 * W, Vt = (V(t + ht, W) - V(t - ht, W)) / (2 * ht), VW = (V(t, W + hw) - V(t, W - hw)) / (2 * hw), VWW = (V(t, W + hw) - 2 * V(t, W) + V(t, W - hw)) / (hw * hw);
      const c = W / f(t); return (Vt + Math.exp(-rho * t) * u(c) + VW * (r * W + pi * (mu - r) * W - c) + 0.5 * VWW * pi * pi * sigma * sigma * W * W) / Math.abs(V(t, W)); };
    return {pi, nu, f, c: (t, W) => W / f(t), V, hjb, u};
  }
  function mertonSim(o, {mu, r, sigma, gamma, rho, T, W0, steps = 240, paths = 1000, piOverride = null, seed = 11}) {
    let s = seed >>> 0; const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }, g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const dt = T / steps, pi = piOverride ?? o.pi, W = [], C = [], util = [];
    for (let p = 0; p < paths; p++) { let w = W0, U = 0; const wp = [w], cp = []; for (let i = 0; i < steps; i++) { const t = i * dt, c = w / o.f(t), z = g();
        U += Math.exp(-rho * t) * o.u(Math.max(c, 1e-12)) * dt; cp.push(c); w = w * Math.exp((r + pi * (mu - r) - c / w - 0.5 * pi * pi * sigma * sigma) * dt + pi * sigma * Math.sqrt(dt) * z); wp.push(w); }
      U += Math.exp(-rho * T) * o.u(Math.max(w, 1e-12)); W.push(wp); C.push(cp); util.push(U); }
    return {W, C, util, dt}; }
  /* Ramsey–Cass–Koopmans (per effective worker): k̇ = k^α − c − (n+g+δ)k,  ċ/c = (αk^{α−1} − δ − ρ − θg)/θ.
     Current-value Hamiltonian H = u(c) + μ[k^α − c − (n+g+δ)k];  ∂H/∂c = 0 ⇒ μ = c^{−θ}. Saddle path by shooting. */
  function ramsey({alpha, delta, rho, theta, n, g, k0}) {
    if (rho - n - (1 - theta) * g <= 0) throw new Error('Transversality fails: need ρ − n − (1 − θ)g > 0.');
    const ks = Math.pow(alpha / (delta + rho + theta * g), 1 / (1 - alpha)), cs = ks ** alpha - (n + g + delta) * ks, dep = n + g + delta;
    const F = ([k, c]) => [k ** alpha - c - dep * k, c * (alpha * k ** (alpha - 1) - delta - rho - theta * g) / theta];
    const rk4 = (y, h) => { const a = F(y), b = F([y[0] + h / 2 * a[0], y[1] + h / 2 * a[1]]), cc = F([y[0] + h / 2 * b[0], y[1] + h / 2 * b[1]]), d = F([y[0] + h * cc[0], y[1] + h * cc[1]]); return [y[0] + h / 6 * (a[0] + 2 * b[0] + 2 * cc[0] + d[0]), y[1] + h / 6 * (a[1] + 2 * b[1] + 2 * cc[1] + d[1])]; };
    const K0 = k0 * ks, below = K0 < ks, h = 0.05;
    const shoot = c0 => { let y = [K0, c0]; const path = [{t: 0, k: y[0], c: y[1]}]; for (let i = 1; i <= 8000; i++) { y = rk4(y, h); if (!(y[0] > 0) || !(y[1] > 0) || !isN(y[0])) return {v: 1, path}; const [dk, dc] = F(y); path.push({t: i * h, k: y[0], c: y[1]});
        if (Math.abs(y[0] - ks) < 1e-7 * ks && Math.abs(y[1] - cs) < 1e-7 * cs) return {v: 0, path};
        if (below) { if (dk < 0) return {v: 1, path}; if (dc < 0) return {v: -1, path}; } else { if (dc > 0) return {v: 1, path}; if (dk > 0) return {v: -1, path}; } } return {v: 0, path}; };
    let lo = 1e-9, hi = K0 ** alpha + (below ? 0 : K0), best; for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, s = shoot(mid); best = {c0: mid, ...s}; if (s.v > 0) hi = mid; else if (s.v < 0) lo = mid; else break; if (hi - lo < 1e-14 * cs) break; }
    const path = best.path.filter(p => Math.abs(p.k - ks) > 1e-4 * ks || p.t < 1).concat([]); const tHalf = (path.find(p => Math.abs(p.k - ks) <= 0.5 * Math.abs(K0 - ks)) || {}).t;
    // stable manifold through the steady state (for the phase diagram): Jacobian eigen-direction, integrate backwards
    const J = [[alpha * ks ** (alpha - 1) - dep, -1], [cs * alpha * (alpha - 1) * ks ** (alpha - 2) / theta, 0]], tr2 = J[0][0] + J[1][1], det = J[0][0] * J[1][1] - J[0][1] * J[1][0], lamS = (tr2 - Math.sqrt(tr2 * tr2 - 4 * det)) / 2;
    const vec = [1, (J[0][0] - lamS)]; const nrm = Math.hypot(...vec), dir = vec.map(v => v / nrm), mani = [];
    for (const sg of [-1, 1]) { let y = [ks + sg * 1e-4 * ks * dir[0], cs + sg * 1e-4 * ks * dir[1]]; const seg = []; for (let i = 0; i < 20000; i++) { const yn = rk4(y, -0.05); if (!(yn[0] > 1e-3 * ks) || !(yn[1] > 0) || yn[0] > 3 * ks || !isN(yn[1]) || Math.hypot(yn[0] - y[0], yn[1] - y[1]) > 0.2 * ks) break; y = yn; if (i % 5 === 0) seg.push({k: y[0], c: y[1]}); } mani.push(seg); }
    return {ks, cs, ys: ks ** alpha, sr: (cs > 0 ? 1 - cs / ks ** alpha : null), rStar: alpha * ks ** (alpha - 1) - delta, c0: best.c0, path, tHalf, lamS, manifold: [...mani[0].reverse(), {k: ks, c: cs}, ...mani[1]], kdot0: k => k ** alpha - dep * k, kGold: Math.pow(alpha / dep, 1 / (1 - alpha))};
  }
  /* American option as optimal stopping: binomial dynamic programme with the early-exercise boundary
     and the linear-complementarity check  V ≥ payoff,  V ≥ continuation,  (V − payoff)(V − continuation) = 0 */
  function american({S, K, T, r, q = 0, sigma, type = 'put', steps = 500}) {
    const dt = T / steps, u = Math.exp(sigma * Math.sqrt(dt)), d = 1 / u, p = (Math.exp((r - q) * dt) - d) / (u - d), df = Math.exp(-r * dt), pay = s => type === 'call' ? Math.max(s - K, 0) : Math.max(K - s, 0);
    if (!(p > 0 && p < 1)) throw new Error('Risk-neutral probability outside (0,1): use more steps.');
    let v = Array.from({length: steps + 1}, (_, j) => pay(S * u ** j * d ** (steps - j))), ve = v.slice(); const bnd = [], lcp = []; let maxLcp = 0;
    bnd[steps] = K;
    for (let i = steps - 1; i >= 0; i--) { const nv = new Array(i + 1), ne = new Array(i + 1); let bS = null;
      for (let j = 0; j <= i; j++) { const s = S * u ** j * d ** (i - j), cont = df * (p * v[j + 1] + (1 - p) * v[j]), ex = pay(s); nv[j] = Math.max(cont, ex); ne[j] = df * (p * ve[j + 1] + (1 - p) * ve[j]);
        maxLcp = Math.max(maxLcp, Math.abs((nv[j] - ex) * (nv[j] - cont)));
        if (ex > 0 && ex >= cont - 1e-12) { if (type === 'put') bS = bS === null ? s : Math.max(bS, s); else bS = bS === null ? s : Math.min(bS, s); } }
      bnd[i] = bS; v = nv; ve = ne; }
    const t = Array.from({length: steps + 1}, (_, i) => i * dt);
    return {price: v[0], euro: ve[0], premium: v[0] - ve[0], boundary: t.map((ti, i) => ({t: ti, S: bnd[i]})).filter(x => x.S !== null), maxLcp, steps};
  }
  /* option value across S at t = 0 (for the smooth-pasting plot) */
  function americanCurve(o, Ss) { return Ss.map(s => ({S: s, am: american({...o, S: s, steps: Math.min(o.steps || 300, 300)}).price})); }

  return {qp, lsolve, parseRestr, rls, lmTests, markowitz, portfolioKKT, lasso, enetStd, enetCD, tobit, qreg, qregNonCross, svmDual, arbCheck, almgrenChriss, acSimulate, merton, mertonSim, ramsey, american, americanCurve};
})();
if (typeof module !== 'undefined') module.exports = OPT;
