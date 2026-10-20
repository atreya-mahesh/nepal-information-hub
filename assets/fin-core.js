/* Nepal Information Hub — quantitative finance core
   GARCH / GJR-GARCH / EGARCH with Normal, Student-t, GED and Hansen skewed-t innovations (arch-package conventions),
   Extreme Value Theory (POT–GPD VaR and ES, GARCH-EVT, Kupiec test), Hurst exponent (R/S and DFA), fractal dimension
   (Higuchi, box-counting), PCA and FastICA factors, CAPM / multi-factor / APT regressions and Fama–MacBeth,
   portfolio construction (mean-variance, Black–Litterman, equal risk contribution, hierarchical risk parity),
   Bayesian models (Gibbs regression with Normal or Student-t errors, R-hat/ESS/HDI, conjugate return model,
   online change-point detection) and valuation models (FCFF/WACC, FCFE, DDM, residual income, EVA).
   Depends on ST (stats-core.js). */
'use strict';
const FIN = (() => {
  const S = typeof ST !== 'undefined' ? ST : require('./stats-core.js');
  const ok = S.ok, lg = S.lgamma;

  /* ====================== GARCH family ====================== */
  const DIST = {
    normal: {k: 0, names: [], start: [], ll: (z) => -0.5 * (Math.log(2 * Math.PI) + z * z), valid: () => true},
    t: {k: 1, names: ['nu'], start: [8], valid: ([nu]) => nu > 2.05 && nu < 500,
      ll: (z, [nu]) => lg((nu + 1) / 2) - lg(nu / 2) - 0.5 * Math.log(Math.PI * (nu - 2)) - (nu + 1) / 2 * Math.log(1 + z * z / (nu - 2))},
    ged: {k: 1, names: ['nu'], start: [1.5], valid: ([nu]) => nu > 0.3 && nu < 50,
      ll: (z, [nu]) => { const l = Math.sqrt(2 ** (-2 / nu) * Math.exp(lg(1 / nu) - lg(3 / nu))); return Math.log(nu) - Math.log(l) - (1 + 1 / nu) * Math.log(2) - lg(1 / nu) - 0.5 * Math.abs(z / l) ** nu; }},
    skewt: {k: 2, names: ['eta', 'lambda'], start: [8, -0.1], valid: ([e, l]) => e > 2.05 && e < 300 && l > -0.995 && l < 0.995,
      ll: (z, [e, l]) => { const c = Math.exp(lg((e + 1) / 2) - lg(e / 2)) / Math.sqrt(Math.PI * (e - 2)), a = 4 * l * c * (e - 2) / (e - 1), b = Math.sqrt(1 + 3 * l * l - a * a), s = z < -a / b ? 1 - l : 1 + l;
        return Math.log(b) + Math.log(c) - (e + 1) / 2 * Math.log(1 + ((b * z + a) / s) ** 2 / (e - 2)); }},
  };
  function backcast(e) { const n = Math.min(75, e.length); let w = 0, s = 0; for (let i = 0; i < n; i++) { const wi = 0.94 ** i; w += wi; s += wi * e[i] * e[i]; } return s / w; }
  function garchVar(e, model, [omega, alpha, gamma, beta], bc) {
    const n = e.length, s2 = new Array(n);
    if (model === 'egarch') { let ls = Math.log(bc); const k = Math.sqrt(2 / Math.PI); for (let t = 0; t < n; t++) { if (t === 0) ls = omega + beta * Math.log(bc); else { const z = e[t - 1] / Math.sqrt(s2[t - 1]); ls = omega + alpha * (Math.abs(z) - k) + gamma * z + beta * Math.log(s2[t - 1]); } s2[t] = Math.exp(Math.min(ls, 50)); } return s2; }
    for (let t = 0; t < n; t++) { if (t === 0) { s2[t] = omega + (alpha + beta + (model === 'gjr' ? gamma / 2 : 0)) * bc; continue; } const ep = e[t - 1]; s2[t] = omega + alpha * ep * ep + (model === 'gjr' && ep < 0 ? gamma * ep * ep : 0) + beta * s2[t - 1]; }
    return s2;
  }
  // r: returns (e.g. in percent). model: 'garch'|'gjr'|'egarch'; dist: 'normal'|'t'|'ged'|'skewt'; mean: 'constant'|'zero'
  function garch(r, {model = 'garch', dist = 'normal', mean = 'constant'} = {}) {
    const x = r.filter(ok), n = x.length; if (n < 100) throw new Error('GARCH needs at least 100 returns.');
    const D = DIST[dist], hasMu = mean === 'constant', mu0 = hasMu ? S.mean(x) : 0, v0 = S.variance(x);
    const unpack = th => { let i = 0; const mu = hasMu ? th[i++] : 0, omega = th[i++], alpha = th[i++], gamma = model === 'garch' ? 0 : th[i++], beta = th[i++], dp = th.slice(i); return {mu, omega, alpha, gamma, beta, dp}; };
    const nll = th => { const p = unpack(th);
      if (model !== 'egarch') { if (p.omega <= 0 || p.alpha < 0 || p.beta < 0 || (model === 'gjr' && p.alpha + p.gamma < 0) || p.alpha + p.beta + (model === 'gjr' ? p.gamma / 2 : 0) >= 0.9999) return 1e10; }
      else if (Math.abs(p.beta) >= 0.9999) return 1e10;
      if (!D.valid(p.dp)) return 1e10;
      const e = x.map(v => v - p.mu), s2 = garchVar(e, model, [p.omega, p.alpha, p.gamma, p.beta], backcast(e)); let ll = 0;
      for (let t = 0; t < n; t++) { if (!(s2[t] > 0)) return 1e10; ll += D.ll(e[t] / Math.sqrt(s2[t]), p.dp) - 0.5 * Math.log(s2[t]); }
      return ok(ll) ? -ll : 1e10; };
    const start = model === 'egarch' ? [...(hasMu ? [mu0] : []), 0.02 * Math.log(v0) * 0 + 0.01, 0.15, -0.05, 0.95, ...D.start] : [...(hasMu ? [mu0] : []), v0 * 0.05, 0.08, ...(model === 'gjr' ? [0.05] : []), 0.88, ...D.start];
    if (model === 'egarch') start[hasMu ? 1 : 0] = Math.log(v0) * (1 - 0.95);
    let best = S.nelderMead(nll, start, {maxIter: 8000, tol: 1e-12, step: 0.1});
    const st2 = start.slice(); st2[hasMu ? 2 : 1] = 0.05; st2[st2.length - 1 - D.k] = model === 'egarch' ? 0.9 : 0.9; const b2 = S.nelderMead(nll, st2, {maxIter: 8000, tol: 1e-12, step: 0.1}); if (b2.f < best.f) best = b2;
    const bf = S.bfgs(nll, best.x); if (bf.f < best.f) best = bf;
    const th = best.x, p = unpack(th), names = [...(hasMu ? ['mu'] : []), 'omega', 'alpha', ...(model === 'garch' ? [] : ['gamma']), 'beta', ...D.names];
    let se = th.map(() => null); try { const H = S.hessian(nll, th), Hi = S.inv(H); if (Hi) se = Hi.map((row, i) => row[i] > 0 ? Math.sqrt(row[i]) : null); } catch (e) {}
    const e = x.map(v => v - p.mu), s2 = garchVar(e, model, [p.omega, p.alpha, p.gamma, p.beta], backcast(e)), ll = -best.f, k = th.length;
    const persist = model === 'egarch' ? p.beta : p.alpha + p.beta + (model === 'gjr' ? p.gamma / 2 : 0);
    // one-step-ahead variance
    const eN = e[n - 1], sN = s2[n - 1]; let next;
    if (model === 'egarch') { const z = eN / Math.sqrt(sN); next = Math.exp(p.omega + p.alpha * (Math.abs(z) - Math.sqrt(2 / Math.PI)) + p.gamma * z + p.beta * Math.log(sN)); }
    else next = p.omega + p.alpha * eN * eN + (model === 'gjr' && eN < 0 ? p.gamma * eN * eN : 0) + p.beta * sN;
    return {model, dist, names, params: th, se, t: th.map((v, i) => ok(se[i]) ? v / se[i] : null), pv: th.map((v, i) => ok(se[i]) ? 2 * (1 - S.normCdf(Math.abs(v / se[i]))) : null), ...p,
      ll, aic: -2 * ll + 2 * k, bic: -2 * ll + Math.log(n) * k, n, sigma2: s2, resid: e, std: e.map((v, i) => v / Math.sqrt(s2[i])), persistence: persist,
      uncond: model === 'egarch' ? Math.exp(p.omega / (1 - p.beta)) : p.omega / (1 - persist), halfLife: persist > 0 && persist < 1 ? Math.log(0.5) / Math.log(persist) : null, nextVar: next};
  }
  function garchForecast(f, h, sims = 3000, seed = 3) {
    if (f.model !== 'egarch') { const out = [f.nextVar], ph = f.alpha + f.beta + (f.model === 'gjr' ? f.gamma / 2 : 0); for (let i = 1; i < h; i++) out.push(f.omega + ph * out[i - 1]); return out; }
    let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }, g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const acc = new Array(h).fill(0); for (let k = 0; k < sims; k++) { let v = f.nextVar; for (let i = 0; i < h; i++) { acc[i] += v; const z = g(); v = Math.exp(f.omega + f.alpha * (Math.abs(z) - Math.sqrt(2 / Math.PI)) + f.gamma * z + f.beta * Math.log(v)); } }
    return acc.map(v => v / sims);
  }
  // standardized-distribution quantile and expected shortfall (left tail) by numeric integration of the density
  function stdQuantES(dist, dp, q) {
    const D = DIST[dist], pdf = z => Math.exp(D.ll(z, dp)), lo = -40, N = 8000, h = (0 - lo) / N; let cdf = 0, prev = pdf(lo), zq = null, num = 0;
    // integrate from far left until cumulative mass reaches q
    for (let i = 1; i <= 2 * N; i++) { const z = lo + i * h, f = pdf(z), a = (prev + f) / 2 * h; if (cdf + a >= q) { const frac = (q - cdf) / a; zq = z - h + frac * h; num += (z - h / 2) * a * frac; break; } cdf += a; num += (z - h / 2) * a; prev = f; }
    return {zq, es: num / q};
  }
  function newsImpact(f, range = 3) { const s2 = f.uncond, pts = []; for (let i = -40; i <= 40; i++) { const e = i / 40 * range * Math.sqrt(s2); let v; if (f.model === 'egarch') { const z = e / Math.sqrt(s2); v = Math.exp(f.omega + f.alpha * (Math.abs(z) - Math.sqrt(2 / Math.PI)) + f.gamma * z + f.beta * Math.log(s2)); } else v = f.omega + f.alpha * e * e + (f.model === 'gjr' && e < 0 ? f.gamma * e * e : 0) + f.beta * s2; pts.push({e, v}); } return pts; }

  /* ====================== Extreme Value Theory ====================== */
  function gpdFit(y) { const k = y.length, m = S.mean(y), v = S.variance(y), xi0 = 0.5 * (1 - m * m / v), b0 = 0.5 * m * (m * m / v + 1);
    const nll = ([xi, lb]) => { const b = Math.exp(lb); let s = -k * Math.log(b); for (const v2 of y) { const z = 1 + xi * v2 / b; if (z <= 0) return 1e10; s -= Math.abs(xi) < 1e-9 ? v2 / b : (1 + 1 / xi) * Math.log(z); } return -s; };
    let r = S.nelderMead(nll, [Math.max(-0.4, Math.min(0.8, xi0)), Math.log(Math.max(b0, 1e-6))], {maxIter: 4000, tol: 1e-12}); const r2 = S.nelderMead(nll, [0.1, Math.log(m)], {maxIter: 4000}); if (r2.f < r.f) r = r2;
    const th = [r.x[0], Math.exp(r.x[1])], nllN = ([xi, b]) => nll([xi, Math.log(b)]); let se = [null, null]; try { const Hi = S.inv(S.hessian(nllN, th)); if (Hi) se = [Math.sqrt(Math.max(0, Hi[0][0])), Math.sqrt(Math.max(0, Hi[1][1]))]; } catch (e) {}
    return {xi: th[0], beta: th[1], se, ll: -r.f, k}; }
  // losses: positive numbers = losses. q: confidence (0.99). u: threshold
  function pot(losses, {u = null, uq = 0.9, qs = [0.95, 0.99, 0.995]} = {}) {
    const L = losses.filter(ok), n = L.length; u = u ?? S.quantile(L, uq); const y = L.filter(v => v > u).map(v => v - u), k = y.length; if (k < 15) throw new Error(`Only ${k} losses above the threshold. Lower the threshold or use more data.`);
    const g = gpdFit(y), out = qs.map(q => { const VaR = u + g.beta / g.xi * ((n / k * (1 - q)) ** (-g.xi) - 1), ES = g.xi < 1 ? VaR / (1 - g.xi) + (g.beta - g.xi * u) / (1 - g.xi) : Infinity; return {q, VaR, ES, histVaR: S.quantile(L, q), histES: S.mean(L.filter(v => v >= S.quantile(L, q)))}; });
    const sorted = L.slice().sort((a, b) => a - b), me = []; for (let i = Math.floor(n * 0.5); i < n - 5; i += Math.max(1, Math.floor(n / 120))) { const th = sorted[i], ex = sorted.filter(v => v > th).map(v => v - th); me.push({u: th, me: S.mean(ex), k: ex.length}); }
    // GPD fit check: empirical vs model exceedance quantiles
    const qq = y.slice().sort((a, b) => a - b).map((v, i) => { const p = (i + 0.5) / k; return {emp: v, mod: Math.abs(g.xi) < 1e-9 ? -g.beta * Math.log(1 - p) : g.beta / g.xi * ((1 - p) ** (-g.xi) - 1)}; });
    return {u, k, n, ...g, risk: out, meanExcess: me, qq};
  }
  function kupiec(hits, n, p) { const x = hits, ph = x / n; if (x === 0) { const lr = -2 * n * Math.log(1 - p); return {x, n, rate: 0, lr, p: S.chi2P(lr, 1)}; } const lr = -2 * ((n - x) * Math.log(1 - p) + x * Math.log(p) - ((n - x) * Math.log(1 - ph) + x * Math.log(ph))); return {x, n, rate: ph, lr, p: S.chi2P(lr, 1)}; }

  /* ====================== memory and fractals ====================== */
  function hurstRS(x0, {minN = 8} = {}) { const x = x0.filter(ok), N = x.length, sizes = []; for (let n = minN; n <= N / 2; n = Math.ceil(n * 1.25)) sizes.push(n); const pts = [];
    for (const n of sizes) { const m = Math.floor(N / n); let acc = 0, c = 0; for (let b = 0; b < m; b++) { const seg = x.slice(b * n, b * n + n), mu = S.mean(seg); let cum = 0, mx = -Infinity, mn = Infinity; for (const v of seg) { cum += v - mu; mx = Math.max(mx, cum); mn = Math.min(mn, cum); } const sd = S.sd(seg, 0); if (sd > 0) { acc += (mx - mn) / sd; c++; } } if (c) pts.push({n, rs: acc / c}); }
    // Anis–Lloyd–Peters expected R/S under independence
    const ea = n => { let s = 0; for (let i = 1; i < n; i++) s += Math.sqrt((n - i) / i); const g = n <= 340 ? Math.exp(lg((n - 1) / 2) - lg(n / 2)) / Math.sqrt(Math.PI) : 1 / Math.sqrt(n * Math.PI / 2); return (n - 0.5) / n * g * s; };
    const fit = S.ols(pts.map(p => Math.log(p.rs)), pts.map(p => [1, Math.log(p.n)])), fitE = S.ols(pts.map(p => Math.log(ea(p.n))), pts.map(p => [1, Math.log(p.n)]));
    const H = fit.coef[1], Hal = H - fitE.coef[1] + 0.5, se = Math.sqrt(1 / N);
    return {H, Hal, se, pts: pts.map(p => ({...p, exp: ea(p.n)})), z: (Hal - 0.5) / se, p: 2 * (1 - S.normCdf(Math.abs((Hal - 0.5) / se)))}; }
  function dfa(x0, {minN = 10} = {}) { const x = x0.filter(ok), N = x.length, mu = S.mean(x), Y = []; let c = 0; for (const v of x) { c += v - mu; Y.push(c); } const pts = [];
    for (let n = minN; n <= N / 4; n = Math.ceil(n * 1.25)) { const m = Math.floor(N / n); let f2 = 0; for (let b = 0; b < m; b++) { const seg = Y.slice(b * n, b * n + n), t = seg.map((_, i) => i), tm = (n - 1) / 2, sm = S.mean(seg); let sxy = 0, sxx = 0; t.forEach((ti, i) => { sxy += (ti - tm) * (seg[i] - sm); sxx += (ti - tm) ** 2; }); const bb = sxy / sxx; seg.forEach((v, i) => f2 += (v - (sm + bb * (i - tm))) ** 2); } pts.push({n, F: Math.sqrt(f2 / (m * n))}); }
    const f = S.ols(pts.map(p => Math.log(p.F)), pts.map(p => [1, Math.log(p.n)])); return {alpha: f.coef[1], pts}; }
  function higuchi(x0, kmax = 10) { const x = x0.filter(ok), N = x.length, pts = [];
    for (let k = 1; k <= kmax; k++) { let Lk = 0; for (let m = 0; m < k; m++) { const nm = Math.floor((N - m - 1) / k); if (nm < 1) continue; let s = 0; for (let i = 1; i <= nm; i++) s += Math.abs(x[m + i * k] - x[m + (i - 1) * k]); Lk += s * (N - 1) / (nm * k) / k; } pts.push({k, L: Lk / k}); }
    const f = S.ols(pts.map(p => Math.log(p.L)), pts.map(p => [1, Math.log(1 / p.k)])); return {D: f.coef[1], pts, r2: f.r2}; }
  function boxCount(x0) { const x = x0.filter(ok), N = x.length, mn = Math.min(...x), mx = Math.max(...x), y = x.map(v => (v - mn) / (mx - mn || 1)), pts = [];
    for (let s = 4; s <= Math.min(512, N / 2); s *= 2) { const eps = 1 / s; let count = 0; for (let c = 0; c < s; c++) { const a = Math.floor(c * (N - 1) / s), b = Math.min(N - 1, Math.ceil((c + 1) * (N - 1) / s)); let lo = Infinity, hi = -Infinity; for (let i = a; i <= b; i++) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); } count += Math.floor(Math.min(hi, 1 - 1e-12) / eps) - Math.floor(lo / eps) + 1; } pts.push({s, count}); }
    const f = S.ols(pts.map(p => Math.log(p.count)), pts.map(p => [1, Math.log(p.s)])); return {D: f.coef[1], pts, r2: f.r2}; }

  /* ====================== statistical factors ====================== */
  function pca(R) { const m = R[0].length, mu = Array.from({length: m}, (_, j) => S.mean(R.map(r => r[j]))), sd = Array.from({length: m}, (_, j) => S.sd(R.map(r => r[j]))), Z = R.map(r => r.map((v, j) => (v - mu[j]) / sd[j])), C = S.mul(S.T(Z), Z).map(r => r.map(v => v / (R.length - 1))), e = S.eigSym(C);
    const tot = e.values.reduce((a, b) => a + b, 0), scores = Z.map(z => e.vectors[0].map((_, k) => z.reduce((s, v, j) => s + v * e.vectors[j][k], 0)));
    return {values: e.values, share: e.values.map(v => v / tot), loadings: e.vectors, scores, mu, sd}; }
  function fastICA(R, k, {iters = 400, seed = 4} = {}) { const P = pca(R), n = R.length, W0 = P.loadings.map(r => r.slice(0, k)), lam = P.values.slice(0, k);
    const Xw = P.scores.map(s => s.slice(0, k).map((v, j) => v / Math.sqrt(lam[j]))); let s0 = seed; const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296 - 0.5; };
    let W = Array.from({length: k}, () => Array.from({length: k}, rnd)); const orth = M => { const e = S.eigSym(S.mul(M, S.T(M))), D = e.vectors.map((r, i) => r.map((_, j) => 0)); e.values.forEach((v, i) => D[i][i] = 1 / Math.sqrt(Math.max(v, 1e-12))); return S.mul(S.mul(S.mul(e.vectors, D), S.T(e.vectors)), M); };
    W = orth(W); for (let it = 0; it < iters; it++) { const Wn = W.map(w => { const g = new Array(k).fill(0); let gp = 0; for (const x of Xw) { const u = S.dot(w, x), t = Math.tanh(u); for (let j = 0; j < k; j++) g[j] += x[j] * t; gp += 1 - t * t; } return g.map((v, j) => v / n - gp / n * w[j]); }); const Wo = orth(Wn); const lim = Math.max(...Wo.map((w, i) => Math.abs(Math.abs(S.dot(w, W[i])) - 1))); W = Wo; if (lim < 1e-8) break; }
    const sources = Xw.map(x => W.map(w => S.dot(w, x))), mix = R[0].map((_, j) => W.map((w, i) => S.corr(R.map(r => r[j]), sources.map(s => s[i]))));
    const kurtos = W.map((_, i) => S.kurt(sources.map(s => s[i])) - 3); return {sources, mixCorr: mix, kurt: kurtos}; }

  /* ====================== asset pricing ====================== */
  // y: asset excess returns; F: factor matrix rows (excess market etc.); names
  function factorReg(y, F, names, ann = 240, se = 'hac') { const f = S.ols(y, F.map(r => [1, ...r]), ['alpha', ...names], {se}); return {...f, alphaAnn: f.coef[0] * ann, appraisal: f.coef[0] / f.s}; }
  function famaMacBeth(betas, rets) { // betas: assets×k, rets: T×assets  → premia per factor with FM t-stats
    const T_ = rets.length, k = betas[0].length, lam = []; for (let t = 0; t < T_; t++) { try { const f = S.ols(rets[t], betas.map(b => [1, ...b])); lam.push(f.coef); } catch (e) {} }
    return Array.from({length: k + 1}, (_, j) => { const v = lam.map(l => l[j]), m = S.mean(v), s = S.sd(v) / Math.sqrt(v.length); return {mean: m, se: s, t: m / s, p: S.tP2(m / s, v.length - 1)}; }); }

  /* ====================== portfolio construction ====================== */
  function projSimplex(v, lo = 0, hi = 1) { // projection onto {sum w = 1, lo <= w <= hi}
    let a = Math.min(...v) - hi - 1, b = Math.max(...v) - lo + 1; for (let it = 0; it < 100; it++) { const t = (a + b) / 2, s = v.reduce((acc, x) => acc + Math.min(hi, Math.max(lo, x - t)), 0); if (s > 1) a = t; else b = t; } const t = (a + b) / 2; return v.map(x => Math.min(hi, Math.max(lo, x - t))); }
  const pvar = (w, C) => S.dot(w, S.mv(C, w));
  function meanVar(mu, C, {lam = 1, lo = 0, hi = 1, iters = 4000} = {}) { const m = mu.length; let w = new Array(m).fill(1 / m); const L = Math.max(...S.eigSym(C).values) * 2 * lam + 1e-9, step = 1 / L;
    for (let it = 0; it < iters; it++) { const g = S.mv(C, w).map((v, i) => 2 * lam * v - mu[i]), wn = projSimplex(w.map((v, i) => v - step * g[i]), lo, hi); const d = Math.max(...wn.map((v, i) => Math.abs(v - w[i]))); w = wn; if (d < 1e-10) break; } return w; }
  function minVar(C, o = {}) { return meanVar(C.map(() => 0), C, {...o, lam: 1}); }
  function maxSharpe(mu, C, rf = 0, o = {}) { let best = null; for (let i = 0; i <= 80; i++) { const lam = 10 ** (-3 + i * 0.075), w = meanVar(mu, C, {...o, lam}), r = S.dot(w, mu), s = Math.sqrt(pvar(w, C)), sh = (r - rf) / s; if (!best || sh > best.sh) best = {w, sh}; } return best.w; }
  function frontier(mu, C, o = {}) { const pts = []; for (let i = 0; i <= 40; i++) { const lam = 10 ** (-3 + i * 0.15), w = meanVar(mu, C, {...o, lam}); pts.push({ret: S.dot(w, mu), vol: Math.sqrt(pvar(w, C)), w}); } return pts.sort((a, b) => a.vol - b.vol); }
  function erc(C, {iters = 2000} = {}) { const m = C.length; let w = C.map((r, i) => 1 / Math.sqrt(r[i])); const sw = w.reduce((a, b) => a + b, 0); w = w.map(v => v / sw);
    for (let it = 0; it < iters; it++) { const sig = Math.sqrt(pvar(w, C)); let maxd = 0; for (let i = 0; i < m; i++) { const ci = S.dot(C[i], w) - C[i][i] * w[i], a = C[i][i], b = ci, c = -sig / m; const wi = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); maxd = Math.max(maxd, Math.abs(wi - w[i])); w[i] = wi; } if (maxd < 1e-12) break; }
    const s = w.reduce((a, b) => a + b, 0); return w.map(v => v / s); }
  function riskContrib(w, C) { const Cw = S.mv(C, w), v = S.dot(w, Cw); return w.map((x, i) => x * Cw[i] / v); }
  function hrp(C) { const m = C.length, sd = C.map((r, i) => Math.sqrt(r[i])), Rho = C.map((r, i) => r.map((v, j) => v / (sd[i] * sd[j]))), Dm = Rho.map(r => r.map(v => Math.sqrt(Math.max(0, 0.5 * (1 - v)))));
    // distance of distances, then single-linkage agglomerative clustering
    const DD = Dm.map(a => Dm.map(b => Math.sqrt(a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0))));
    let clusters = Array.from({length: m}, (_, i) => ({items: [i], id: i})), links = []; const dist = (A, B) => { let d = Infinity; A.items.forEach(i => B.items.forEach(j => d = Math.min(d, DD[i][j]))); return d; };
    while (clusters.length > 1) { let bi = 0, bj = 1, bd = Infinity; for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) { const d = dist(clusters[i], clusters[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
      const nc = {items: [...clusters[bi].items, ...clusters[bj].items], left: clusters[bi], right: clusters[bj], d: bd}; links.push({a: clusters[bi].items.slice(), b: clusters[bj].items.slice(), d: bd}); clusters = clusters.filter((_, k) => k !== bi && k !== bj); clusters.push(nc); }
    const order = []; const walk = c => { if (c.left) { walk(c.left); walk(c.right); } else order.push(c.items[0]); }; walk(clusters[0]);
    const w = new Array(m).fill(1), ivp = idx => { const iv = idx.map(i => 1 / C[i][i]), s = iv.reduce((a, b) => a + b, 0); return iv.map(v => v / s); }, cvar = idx => { const ww = ivp(idx); return S.dot(ww, idx.map((i, a) => idx.reduce((s, j, b) => s + C[i][j] * ww[b], 0))); };
    const bis = items => { if (items.length < 2) return; const h = Math.floor(items.length / 2), L = items.slice(0, h), R = items.slice(h), vL = cvar(L), vR = cvar(R), a = 1 - vL / (vL + vR); L.forEach(i => w[i] *= a); R.forEach(i => w[i] *= 1 - a); bis(L); bis(R); };
    bis(order); return {w, order, links}; }
  function blackLitterman(C, wMkt, {delta = 2.5, tau = 0.05, P = [], Q = [], conf = []} = {}) { const pi = S.mv(C, wMkt).map(v => v * delta); if (!P.length) return {pi, mu: pi, w: wMkt};
    const tC = C.map(r => r.map(v => v * tau)), Om = P.map((p, i) => P.map((p2, j) => i === j ? S.dot(p, S.mv(tC, p)) * (conf[i] ? (1 - conf[i]) / Math.max(conf[i], 1e-6) : 1) : 0));
    const tCi = S.inv(tC), Omi = S.inv(Om), PtOP = S.mul(S.mul(S.T(P), Omi), P), A = tCi.map((r, i) => r.map((v, j) => v + PtOP[i][j])), Ai = S.inv(A), b = S.mv(tCi, pi).map((v, i) => v + S.mv(S.mul(S.T(P), Omi), Q)[i]);
    const mu = S.mv(Ai, b), Cp = C.map((r, i) => r.map((v, j) => v + Ai[i][j])); return {pi, mu, Cpost: Cp}; }

  /* ====================== Bayesian models ====================== */
  function rngG(seed) { let s = seed >>> 0; const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const n = () => { let a = 0; while (!a) a = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); };
    const gam = (k) => { if (k < 1) return gam(1 + k) * Math.pow(u() || 1e-12, 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = n(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const uu = u(); if (uu < 1 - 0.0331 * x ** 4 || Math.log(uu) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
    return {u, n, gam}; }
  // Gibbs sampler for y = Xb + e; prior b ~ N(b0, V0), s2 ~ IG(a0, d0); errors Normal or Student-t (scale mixture, nu fixed)
  function bayesReg(y, X, names, {chains = 4, iter = 2500, burn = 500, b0 = null, v0 = 100, a0 = 2, d0 = null, errors = 'normal', nu = 5, seed = 1} = {}) {
    const n = y.length, k = X[0].length; b0 = b0 || new Array(k).fill(0); d0 = d0 ?? S.variance(y) * (a0 - 1); const V0i = S.eye(k).map(r => r.map(v => v / v0));
    const draws = [];
    for (let ch = 0; ch < chains; ch++) { const R = rngG(seed * 101 + ch * 7919); let s2 = S.variance(y) * (0.5 + R.u()), lam = new Array(n).fill(1); const out = [];
      for (let it = 0; it < iter; it++) {
        const Xw = X.map((r, i) => r.map(v => v / Math.sqrt(lam[i]))), yw = y.map((v, i) => v / Math.sqrt(lam[i])), XtX = S.mul(S.T(Xw), Xw), Vn = S.inv(XtX.map((r, i) => r.map((v, j) => v / s2 + V0i[i][j]))), mn = S.mv(Vn, S.mv(S.T(Xw), yw).map((v, i) => v / s2 + S.dot(V0i[i], b0)));
        const L = S.chol(Vn), z = Array.from({length: k}, () => R.n()), b = mn.map((v, i) => v + L[i].reduce((s, l, j) => s + l * z[j], 0));
        const e = y.map((v, i) => v - S.dot(X[i], b)); let ss = 0; e.forEach((v, i) => ss += v * v / lam[i]); s2 = (d0 + ss / 2) / R.gam(a0 + n / 2);
        if (errors === 't') lam = e.map(v => ((nu + v * v / s2) / 2) / R.gam((nu + 1) / 2));
        if (it >= burn) out.push([...b, s2]); }
      draws.push(out); }
    const pn = [...names, 'sigma2'], summ = pn.map((nm, j) => { const all = draws.flatMap(c => c.map(d => d[j])); return {name: nm, mean: S.mean(all), sd: S.sd(all), hdi: hdi(all, 0.94), pPos: all.filter(v => v > 0).length / all.length, rhat: rhat(draws.map(c => c.map(d => d[j]))), ess: ess(draws.map(c => c.map(d => d[j])))}; });
    return {summary: summ, draws, names: pn}; }
  function hdi(a, mass = 0.94) { const s = a.slice().sort((x, y) => x - y), n = s.length, w = Math.floor(mass * n); let best = [s[0], s[n - 1]], bw = Infinity; for (let i = 0; i + w < n; i++) { const d = s[i + w] - s[i]; if (d < bw) { bw = d; best = [s[i], s[i + w]]; } } return best; }
  function rhat(chains) { // split R-hat
    const sp = chains.flatMap(c => { const h = Math.floor(c.length / 2); return [c.slice(0, h), c.slice(h, 2 * h)]; }), m = sp.length, n = sp[0].length, means = sp.map(c => S.mean(c)), W = S.mean(sp.map(c => S.variance(c))), B = n * S.variance(means); const v = (n - 1) / n * W + B / n; return Math.sqrt(v / W); }
  function ess(chains) { const m = chains.length, n = chains[0].length, all = chains.flat(), mu = S.mean(all), v = S.variance(all); let rhoSum = 0;
    for (let lag = 1; lag < Math.min(n - 1, 1000); lag++) { let r = 0; chains.forEach(c => { let s = 0; for (let t = lag; t < n; t++) s += (c[t] - mu) * (c[t - lag] - mu); r += s / (n - lag); }); r = r / m / v; if (r < 0.05) break; rhoSum += r; }
    return m * n / (1 + 2 * rhoSum); }
  // conjugate Normal–Inverse-Gamma model for returns: posterior of mean and variance, predictive Student-t
  function bayesReturns(r, {mu0 = 0, k0 = 1, a0 = 2, b0 = null} = {}) { const x = r.filter(ok), n = x.length, m = S.mean(x), ss = x.reduce((s, v) => s + (v - m) ** 2, 0); b0 = b0 ?? S.variance(x) * (a0 - 1) * 0.1;
    const kn = k0 + n, mun = (k0 * mu0 + n * m) / kn, an = a0 + n / 2, bn = b0 + ss / 2 + k0 * n * (m - mu0) ** 2 / (2 * kn), scaleMu = Math.sqrt(bn / (an * kn)), dfp = 2 * an, scalePred = Math.sqrt(bn * (kn + 1) / (an * kn));
    return {n, mun, kn, an, bn, sdMu: scaleMu * Math.sqrt(dfp / (dfp - 2)), pMuPos: S.tCdf(mun / scaleMu, dfp), muHdi: [mun - S.tInv(0.97, dfp) * scaleMu, mun + S.tInv(0.97, dfp) * scaleMu], sigmaMean: Math.sqrt(bn / (an - 1)), dfp, scalePred,
      predProb: thr => 1 - S.tCdf((thr - mun) / scalePred, dfp), predQ: q => mun + S.tInv(q, dfp) * scalePred}; }
  // Bayesian online change-point detection (Adams & MacKay 2007), Normal–Gamma unknown mean and variance
  function bocpd(x0, {hazard = 1 / 250, mu0 = null, k0 = 1, a0 = 1, b0 = null, maxRun = 600} = {}) { const x = x0.filter(ok), n = x.length; mu0 = mu0 ?? S.mean(x.slice(0, Math.min(50, n))); b0 = b0 ?? S.variance(x.slice(0, Math.min(100, n))) * a0;
    let R = [1], mu = [mu0], ka = [k0], al = [a0], be = [b0]; const cpProb = [], mapRun = [], runMean = [];
    for (let t = 0; t < n; t++) { const v = x[t], pred = mu.map((m, i) => { const sc = Math.sqrt(be[i] * (ka[i] + 1) / (al[i] * ka[i])), df = 2 * al[i], z = (v - m) / sc; return Math.exp(lg((df + 1) / 2) - lg(df / 2) - 0.5 * Math.log(df * Math.PI) - Math.log(sc) - (df + 1) / 2 * Math.log(1 + z * z / df)); });
      const growth = R.map((r, i) => r * pred[i] * (1 - hazard)), cp = R.reduce((s, r, i) => s + r * pred[i] * hazard, 0), nr = [cp, ...growth], tot = nr.reduce((a, b) => a + b, 0); R = nr.map(r => r / tot);
      const nmu = [mu0, ...mu.map((m, i) => (ka[i] * m + v) / (ka[i] + 1))], nk = [k0, ...ka.map(k => k + 1)], na = [a0, ...al.map(a => a + 0.5)], nb = [b0, ...be.map((b, i) => b + ka[i] * (v - mu[i]) ** 2 / (2 * (ka[i] + 1)))];
      mu = nmu; ka = nk; al = na; be = nb; if (R.length > maxRun) { R = R.slice(0, maxRun); mu = mu.slice(0, maxRun); ka = ka.slice(0, maxRun); al = al.slice(0, maxRun); be = be.slice(0, maxRun); const s = R.reduce((a, b) => a + b, 0); R = R.map(r => r / s); }
      const mr = R.indexOf(Math.max(...R)); mapRun.push(mr); cpProb.push(R.slice(0, 5).reduce((a, b) => a + b, 0)); runMean.push(mu[mr]); }
    const cps = []; for (let t = 1; t < n; t++) if (mapRun[t] < mapRun[t - 1] - 10) cps.push(t - mapRun[t]); return {mapRun, cpProb, runMean, cps: [...new Set(cps)].filter(c => c > 0)}; }

  /* ====================== valuation ====================== */
  const pvSum = (cfs, r, mid = false) => cfs.reduce((s, c, i) => s + c / (1 + r) ** (i + 1 - (mid ? 0.5 : 0)), 0);
  function wacc({rf, beta, erp, crp = 0, kdPre, tax, E, Dv}) { const ke = rf + beta * erp + crp, kd = kdPre * (1 - tax), V = E + Dv; return {ke, kd, wE: E / V, wD: Dv / V, wacc: E / V * ke + Dv / V * kd}; }
  // project a base cash flow with stage-1 growth g1 for n years, fading linearly to g2 if fade=true
  function project(base, g1, n, g2, fade) { const out = []; let c = base; for (let i = 1; i <= n; i++) { const g = fade ? g1 + (g2 - g1) * (i - 1) / Math.max(1, n - 1) : g1; c *= 1 + g; out.push(c); } return out; }
  function dcf({cf0, g1, n, gT, r, netDebt = 0, shares, fade = true, exitMultiple = null, metric = null}) { const cfs = project(cf0, g1, n, gT, fade), pv = pvSum(cfs, r), last = cfs[n - 1];
    if (r <= gT && !exitMultiple) throw new Error('Discount rate must exceed terminal growth.');
    const TV = exitMultiple ? exitMultiple * (metric ?? last) : last * (1 + gT) / (r - gT), pvTV = TV / (1 + r) ** n, EV = pv + pvTV, eq = EV - netDebt; return {cfs, pv, TV, pvTV, EV, equity: eq, perShare: eq / shares, tvShare: pvTV / EV}; }
  function ddm({d0, ke, g1 = 0, n = 0, gT, model = 'gordon', H = 0}) { if (ke <= gT) throw new Error('Cost of equity must exceed long-run growth.');
    if (model === 'gordon') return {value: d0 * (1 + gT) / (ke - gT)};
    if (model === 'h') return {value: d0 * ((1 + gT) + H * (g1 - gT)) / (ke - gT)};
    const ds = project(d0, g1, n, gT, model === 'three'), pv = pvSum(ds, ke), tv = ds[n - 1] * (1 + gT) / (ke - gT); return {value: pv + tv / (1 + ke) ** n, ds, pv, pvTV: tv / (1 + ke) ** n}; }
  function residualIncome({bv0, roe, ke, n, payout, omega = 0.6, gT = 0}) { const rows = []; let bv = bv0, pv = 0; const roes = Array.isArray(roe) ? roe : new Array(n).fill(roe);
    for (let t = 1; t <= n; t++) { const r = roes[t - 1], ni = r * bv, ri = (r - ke) * bv; pv += ri / (1 + ke) ** t; rows.push({t, bv, ni, ri, pv: ri / (1 + ke) ** t}); bv += ni * (1 - payout); }
    const riN = last(rows).ri, tv = omega < 1 ? riN * omega / (1 + ke - omega) : riN * (1 + gT) / (ke - gT), pvTV = tv / (1 + ke) ** n; return {rows, value: bv0 + pv + pvTV, pvRI: pv, pvTV}; }
  function eva({nopat0, ic0, waccR, g1, n, roic = null, reinvest = null, gT, netDebt = 0, shares}) { const rows = []; let ic = ic0, nopat = nopat0, pv = 0;
    for (let t = 1; t <= n; t++) { nopat *= 1 + g1; const r = roic ?? nopat / ic, ev = nopat - waccR * ic; pv += ev / (1 + waccR) ** t; rows.push({t, nopat, ic, roic: r, eva: ev, pv: ev / (1 + waccR) ** t}); ic += reinvest != null ? reinvest * nopat : nopat * g1 / Math.max(r, 1e-6); }
    const evaN = last(rows).eva, tv = evaN * (1 + gT) / (waccR - gT) / (1 + waccR) ** n, MVA = pv + tv, firm = ic0 + MVA, eq = firm - netDebt; return {rows, MVA, firm, equity: eq, perShare: eq / shares, pvTV: tv}; }
  const last = a => a[a.length - 1];

  return {DIST, garch, garchForecast, stdQuantES, newsImpact, gpdFit, pot, kupiec, hurstRS, dfa, higuchi, boxCount, pca, fastICA, factorReg, famaMacBeth,
    projSimplex, meanVar, minVar, maxSharpe, frontier, erc, riskContrib, hrp, blackLitterman, pvar, bayesReg, hdi, rhat, ess, bayesReturns, bocpd, wacc, dcf, ddm, residualIncome, eva, project};
})();
if (typeof module !== 'undefined') module.exports = FIN;
