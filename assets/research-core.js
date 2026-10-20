/* Nepal Information Hub — research workflow engine (numerics only; no DOM).
   Reproduces a full empirical study of a price/value series, step by step:
   data validation → derived variables → pre-tests (descriptive, Jarque–Bera, ADF, Phillips–Perron, KPSS, ACF, Ljung–Box,
   ARCH-LM) → Higuchi fractal dimension of returns and log price (rolling windows, k_max sensitivity, log–log diagnostic,
   sanity checks, Hurst cross-check) → direction models and volatility models (OLS with Newey–West HAC errors,
   chronological train/test split, out-of-sample RMSE/MAE, Diebold–Mariano) → GARCH(1,1)-t baseline, fractal-augmented
   ARCH-LM test and GARCH-X with the fractal term in the variance → window robustness → drawdowns and yearly returns.
   Validated against pandas / statsmodels / arch / scipy on NEPSE data. Depends on ST (stats-core.js) and FIN (fin-core.js). */
'use strict';
const RSC = (() => {
  const S = typeof ST !== 'undefined' ? ST : require('./stats-core.js'), F = typeof FIN !== 'undefined' ? FIN : require('./fin-core.js');
  const ok = v => typeof v === 'number' && isFinite(v);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sdS = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  // pandas-style bias-corrected skewness and excess kurtosis; scipy-style (biased) moments for Jarque–Bera
  function moments(x) { const n = x.length, m = mean(x), d = x.map(v => v - m), m2 = d.reduce((s, v) => s + v * v, 0) / n, m3 = d.reduce((s, v) => s + v ** 3, 0) / n, m4 = d.reduce((s, v) => s + v ** 4, 0) / n;
    const g1 = m3 / m2 ** 1.5, g2 = m4 / m2 ** 2 - 3, skew = Math.sqrt(n * (n - 1)) / (n - 2) * g1, kurt = (n - 1) / ((n - 2) * (n - 3)) * ((n + 1) * g2 + 6), jb = n / 6 * (g1 * g1 + g2 * g2 / 4);
    return {skew, kurt, g1, g2, jb, jbP: Math.exp(-jb / 2)}; }
  // Phillips–Perron Z-tau (constant), Bartlett long-run variance, lags = ceil(12 (n/100)^0.25) as in arch
  function pp(y0, lags = null) { const y = y0.filter(ok), n0 = y.length; lags = lags ?? Math.ceil(12 * Math.pow(n0 / 100, 0.25));
    const f = S.ols(y.slice(1), y.slice(0, -1).map(v => [v, 1])), u = f.res, n = u.length, k = 2, rho = f.coef[0], sigma = f.se[0];
    const g = j => { let s = 0; for (let t = j; t < n; t++) s += u[t] * u[t - j]; return s / n; }; let lam2 = g(0); for (let j = 1; j <= lags; j++) lam2 += 2 * (1 - j / (lags + 1)) * g(j);
    const s2 = u.reduce((s, v) => s + v * v, 0) / (n - k), gamma0 = s2 * (n - k) / n, lam = Math.sqrt(lam2);
    const stat = Math.sqrt(gamma0 / lam2) * ((rho - 1) / sigma) - 0.5 * ((lam2 - gamma0) / lam) * (n * sigma / Math.sqrt(s2));
    return {stat, p: S.mackinnonP(stat, 'c', 1), lags, crit: S.mackinnonCrit('c', 1, n)}; }
  // Engle's ARCH-LM on the series as given (statsmodels het_arch)
  function archLM(x0, L = 10) { const x = x0.filter(ok).map(v => v * v), y = [], X = []; for (let t = L; t < x.length; t++) { y.push(x[t]); X.push([1, ...Array.from({length: L}, (_, l) => x[t - l - 1])]); }
    const f = S.ols(y, X), n = y.length, lm = n * f.r2, Fv = (f.r2 / L) / ((1 - f.r2) / (n - L - 1)); return {lm, p: S.chi2P(lm, L), F: Fv, Fp: S.fP(Fv, L, n - L - 1)}; }
  function higuchi(x, kmax = 10) { const N = x.length, k = [], L = []; for (let kk = 1; kk <= kmax; kk++) { const Lm = []; for (let m = 0; m < kk; m++) { const nm = Math.floor((N - m - 1) / kk); if (nm < 1) continue; let s = 0; for (let i = 1; i <= nm; i++) s += Math.abs(x[m + i * kk] - x[m + (i - 1) * kk]); Lm.push(s * (N - 1) / (nm * kk * kk)); } if (Lm.length) { k.push(kk); L.push(mean(Lm)); } }
    const lx = k.map(v => Math.log(1 / v)), ly = L.map(Math.log), mx = mean(lx), my = mean(ly); let sxy = 0, sxx = 0, syy = 0; lx.forEach((v, i) => { sxy += (v - mx) * (ly[i] - my); sxx += (v - mx) ** 2; syy += (ly[i] - my) ** 2; });
    const slope = sxy / sxx; return {D: slope, intercept: my - slope * mx, r2: sxy * sxy / (sxx * syy), k, L, lx, ly}; }
  const rollFD = (x, w, kmax) => x.map((_, i) => { if (i < w - 1) return null; const seg = x.slice(i - w + 1, i + 1); return seg.every(ok) ? higuchi(seg, kmax).D : null; });
  const rollSD = (x, w) => x.map((_, i) => i < w - 1 ? null : sdS(x.slice(i - w + 1, i + 1)));
  // OLS with HAC (Newey–West, Bartlett) like statsmodels cov_type='HAC' (normal-based p-values); AIC/BIC from the Gaussian likelihood
  function olsHac(y, X, lags = 5) { const f = S.ols(y, X, null, {se: 'hac', lags}), n = y.length, k = X[0].length, ssr = f.res.reduce((s, v) => s + v * v, 0), llf = -n / 2 * (Math.log(2 * Math.PI) + Math.log(ssr / n) + 1);
    const z = f.coef.map((c, i) => c / f.se[i]); return {...f, z, pz: z.map(v => 2 * (1 - S.normCdf(Math.abs(v)))), llf, aic: -2 * llf + 2 * k, bic: -2 * llf + k * Math.log(n), predict: Xn => Xn.map(r => r.reduce((s, v, i) => s + v * f.coef[i], 0))}; }
  // Diebold–Mariano test of equal accuracy (squared loss), HAC variance with h−1 lags, Harvey small-sample correction
  function dm(e1, e2, h = 1) { const d = e1.map((v, i) => v * v - e2[i] * e2[i]), n = d.length, m = mean(d), g = j => { let s = 0; for (let t = j; t < n; t++) s += (d[t] - m) * (d[t - j] - m); return s / n; }; let v = g(0); for (let j = 1; j < h; j++) v += 2 * g(j);
    const stat = m / Math.sqrt(v / n), hln = Math.sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n), t = stat * hln; return {stat: t, p: S.tP2(t, n - 1), meanDiff: m}; }
  // GARCH(1,1) with standardized t errors and an optional exogenous term in the variance equation: σ²_t = ω + αε²_{t−1} + βσ²_{t−1} + γ z_{t−1}
  function garchX(r, z = null, start = null) { const n = r.length, bcW = Array.from({length: Math.min(75, n)}, (_, i) => Math.pow(0.94, i)), bwS = bcW.reduce((a, b) => a + b, 0);
    const path = (th) => { const [mu, om, al, be, nu, ga = 0] = th; const e = r.map(v => v - mu), bc = bcW.reduce((s, w, i) => s + w * e[i] * e[i], 0) / bwS, s2 = new Array(n); s2[0] = om + (al + be) * bc + (z ? ga * (z[0] ?? 0) : 0); for (let t = 1; t < n; t++) s2[t] = om + al * e[t - 1] ** 2 + be * s2[t - 1] + (z ? ga * (z[t - 1] ?? 0) : 0); return {e, s2}; };
    const lc = nu => S.lgamma((nu + 1) / 2) - S.lgamma(nu / 2) - 0.5 * Math.log(Math.PI * (nu - 2));
    const nll = th => { const [mu, om, al, be, nu] = th; if (om <= 0 || al < 0 || be < 0 || al + be >= 0.9999 || nu <= 2.05 || nu > 200) return 1e10; const {e, s2} = path(th), c = lc(nu); let ll = 0; for (let t = 0; t < n; t++) { if (!(s2[t] > 0)) return 1e10; ll += c - 0.5 * Math.log(s2[t]) - (nu + 1) / 2 * Math.log(1 + e[t] * e[t] / (s2[t] * (nu - 2))); } return -ll; };
    const v = S.variance(r), x0 = start || [mean(r), v * 0.05, 0.08, 0.88, 6, ...(z ? [0] : [])];
    let best = S.nelderMead(nll, x0, {maxIter: 6000, tol: 1e-10}); for (let rep = 0; rep < 2; rep++) { const b2 = S.nelderMead(nll, best.x, {maxIter: 6000, tol: 1e-12}); if (b2.f <= best.f) best = b2; }
    const th = best.x, {e, s2} = path(th), k = th.length, ll = -best.f; return {mu: th[0], omega: th[1], alpha: th[2], beta: th[3], nu: th[4], gamma: z ? th[5] : null, ll, aic: -2 * ll + 2 * k, bic: -2 * ll + k * Math.log(n), s2, std: e.map((v, i) => v / Math.sqrt(s2[i])), th}; }
  // filter a fitted GARCH through new data with fixed parameters and forecast average variance over the next h days
  function garchForecastPath(fit, r, z, h = 5) { const {mu, omega: om, alpha: al, beta: be, gamma: ga} = fit, n = r.length, s2 = new Array(n + 1); s2[0] = fit.s2Last ?? S.variance(r); const out = [];
    for (let t = 0; t < n; t++) { const e = r[t] - mu; s2[t + 1] = om + al * e * e + be * s2[t] + (ga ? ga * (z?.[t] ?? 0) : 0); const lr = (om + (ga ? ga * (z?.[t] ?? 0) : 0)) / (1 - al - be); let acc = 0; for (let j = 1; j <= h; j++) acc += lr + Math.pow(al + be, j - 1) * (s2[t + 1] - lr); out.push(Math.sqrt(acc / h)); } return out; }
  function hurstRolling(x, w) { return x.map((_, i) => { if (i < w - 1) return null; try { return F.hurstRS(x.slice(i - w + 1, i + 1), {minN: 8}).H; } catch (e) { return null; } }); }

  /* ---------- the full study ---------- */
  function run(D, o = {}) {
    o = Object.assign({windows: [30, 60, 90, 120], kmax: 10, main: 60, split: 0.8, hac: 5, h: 5, volW: 20, lb: [5, 10, 20], archL: 10, acfL: 30, extra: []}, o);
    const R = {opt: o, steps: {}}; const N0 = D.date.length;
    // 1. validation
    const dup = D.date.length - new Set(D.date).size, has = k => D[k] && D[k].some(ok), qc = {rows: N0, start: D.date[0], end: D.date[N0 - 1], dup, missing: {close: D.c.filter(v => !ok(v)).length}};
    if (has('h') && has('l')) Object.assign(qc, {hiLo: D.h.filter((v, i) => v < D.l[i]).length, hiOpen: has('o') ? D.h.filter((v, i) => v < D.o[i]).length : null, hiClose: D.h.filter((v, i) => v < D.c[i]).length, loOpen: has('o') ? D.l.filter((v, i) => v > D.o[i]).length : null, loClose: D.l.filter((v, i) => v > D.c[i]).length});
    qc.nonPos = Object.fromEntries(['o', 'h', 'l', 'c', 'v'].filter(has).map(k => [k, D[k].filter(v => ok(v) && v <= 0).length]));
    R.qc = qc;
    // 2. derived variables (aligned on the return index: the first observation has no return)
    const c = D.c, n = N0 - 1, idx = Array.from({length: n}, (_, i) => i + 1), V = {Date: idx.map(i => D.date[i]), Close: idx.map(i => c[i])};
    V.Return = idx.map(i => 100 * Math.log(c[i] / c[i - 1])); V.Squared_Return = V.Return.map(v => v * v); V.Absolute_Return = V.Return.map(Math.abs); V[`Volatility_${o.volW}`] = rollSD(V.Return, o.volW);
    if (has('h') && has('l')) V.Range = idx.map(i => (D.h[i] - D.l[i]) / c[i]); if (has('o')) V.Open_Close_Return = idx.map(i => (c[i] - D.o[i]) / D.o[i]); if (has('v')) V.Log_Volume = idx.map(i => ok(D.v[i]) ? Math.log1p(D.v[i]) : null);
    V.Log_Close = idx.map(i => Math.log(c[i]));
    for (const w of o.windows) { const km = Math.min(o.kmax, Math.floor(w / 6)); V[`FD_${w}`] = rollFD(V.Return, w, km); V[`FDPrice_${w}`] = rollFD(V.Log_Close, w, km); }
    V.Future_Return_1 = V.Return.map((_, i) => i + 1 < n ? V.Return[i + 1] : null); V[`Future_Return_${o.h}`] = V.Return.map((_, i) => i + o.h < n ? V.Return.slice(i + 1, i + 1 + o.h).reduce((a, b) => a + b, 0) : null); V[`Future_Volatility_${o.h}`] = V.Return.map((_, i) => i + o.h < n ? sdS(V.Return.slice(i + 1, i + 1 + o.h)) : null);
    let pk = -Infinity; V.Drawdown = V.Close.map(v => { pk = Math.max(pk, v); return (v / pk - 1) * 100; });
    for (const e of o.extra) if (D.extra?.[e]) V[e] = idx.map(i => D.extra[e][i]);
    R.V = V; R.n = n;
    // 3. pre-tests
    const r = V.Return, M = moments(r), srt = r.slice().sort((a, b) => a - b);
    R.desc = {mean: mean(r), median: S.median(r), sd: sdS(r), min: srt[0], max: srt[n - 1], skew: M.skew, kurt: M.kurt, jb: M.jb, jbP: M.jbP, annMean: mean(r) * (o.ppy || 240), annVol: sdS(r) * Math.sqrt(o.ppy || 240)};
    R.adfP = S.adf(V.Close); R.adfR = S.adf(r); R.ppP = pp(V.Close); R.ppR = pp(r); try { R.kpssP = S.kpss(V.Close); R.kpssR = S.kpss(r); } catch (e) {}
    R.acfR = S.acf(r, o.acfL); R.acfS = S.acf(V.Squared_Return, o.acfL); R.lbR = o.lb.map(L => ({L, ...S.ljungBox(r, L)})); R.lbS = o.lb.map(L => ({L, ...S.ljungBox(V.Squared_Return, L)})); R.arch = archLM(r, o.archL);
    // 4. fractal dimension
    R.fdFull = higuchi(r, o.kmax); R.fdPrice = higuchi(V.Log_Close, o.kmax); R.fdLevel = higuchi(V.Close, o.kmax);
    R.kmaxSens = [3, 5, 7, 10, 15, 20, 25, 30].filter(k => k < n / 4).map(k => ({k, ret: higuchi(r, k).D, price: higuchi(V.Log_Close, k).D}));
    const line = Array.from({length: 100}, (_, i) => i), u = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(), gauss = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u()), wn = Array.from({length: 2000}, gauss); let acc = 0; const rw = wn.map(v => acc += v);
    R.sanity = {line: higuchi(line, 10).D, noise: higuchi(wn, 10).D, walk: higuchi(rw, 10).D};
    R.fdStats = o.windows.flatMap(w => [`FD_${w}`, `FDPrice_${w}`]).map(k => { const a = V[k].filter(ok); const s2 = a.slice().sort((x, y) => x - y); return {k, n: a.length, mean: mean(a), sd: sdS(a), min: s2[0], q25: S.quantile(a, .25), med: S.median(a), q75: S.quantile(a, .75), max: s2[s2.length - 1]}; });
    const VW = `Volatility_${o.volW}`, FR5 = `Future_Return_${o.h}`, FV = `Future_Volatility_${o.h}`, FDm = `FDPrice_${o.main}`, FDr = `FD_${o.main}`;
    const corrOf = cols => { const rows = V.Date.map((_, i) => cols.map(k => V[k]?.[i])).filter(rw2 => rw2.every(ok)); return {cols, n: rows.length, m: cols.map((_, a) => cols.map((_, b) => S.corr(rows.map(x => x[a]), rows.map(x => x[b]))))}; };
    R.corr1 = corrOf([FDr, VW, 'Absolute_Return', 'Squared_Return']); R.corr2 = corrOf([FDm, 'Return', VW, ...(V.Log_Volume ? ['Log_Volume'] : []), 'Future_Return_1', FR5, FV]);
    // Hurst cross-check (R/S on returns, rolling) — for a self-affine path D ≈ 2 − H
    const hw = Math.max(120, o.main * 2); R.hurst = {full: F.hurstRS(r), dfa: F.dfa(r), w: hw, roll: hurstRolling(r, hw)};
    // 5. models with a chronological split
    const base = ['Return', VW, ...(V.Log_Volume ? ['Log_Volume'] : []), ...o.extra.filter(e => V[e])], volBase = [VW, 'Squared_Return', ...(V.Log_Volume ? ['Log_Volume'] : []), ...o.extra.filter(e => V[e])];
    const need = [...new Set(['Return', VW, 'Squared_Return', ...(V.Log_Volume ? ['Log_Volume'] : []), FDm, 'Future_Return_1', FR5, FV, ...o.extra.filter(e => V[e])])];
    const rowsOk = V.Date.map((_, i) => i).filter(i => need.every(k => ok(V[k][i]))), sp = Math.floor(rowsOk.length * o.split), tr = rowsOk.slice(0, sp), te = rowsOk.slice(sp);
    if (tr.length < 60 || te.length < 20) throw new Error(`Only ${rowsOk.length} complete rows for the models — use more data or a shorter fractal window.`);
    R.split = {n: rowsOk.length, train: tr.length, test: te.length, trainFrom: V.Date[tr[0]], trainTo: V.Date[tr[tr.length - 1]], testFrom: V.Date[te[0]], testTo: V.Date[te[te.length - 1]], testDates: te.map(i => V.Date[i])};
    const Xof = (ix, cols) => ix.map(i => [1, ...cols.map(k => V[k][i])]), yof = (ix, k) => ix.map(i => V[k][i]);
    const fitEval = (name, y, cols) => { const m = olsHac(yof(tr, y), Xof(tr, cols), o.hac), p = m.predict(Xof(te, cols)), a = yof(te, y), e = a.map((v, i) => v - p[i]); return {name, y, cols, m, pred: p, err: e, rmse: Math.sqrt(mean(e.map(v => v * v))), mae: mean(e.map(Math.abs)), hit: y.startsWith('Future_Return') ? p.filter((v, i) => Math.sign(v) === Math.sign(a[i])).length / p.length : null}; };
    const m0p = mean(yof(tr, 'Future_Return_1')), m0e = yof(te, 'Future_Return_1').map(v => v - m0p);
    R.dir = {M0: {name: 'M0 mean', rmse: Math.sqrt(mean(m0e.map(v => v * v))), mae: mean(m0e.map(Math.abs)), err: m0e, forecast: m0p}, M1: fitEval('M1', 'Future_Return_1', ['Return']), M2: fitEval('M2', 'Future_Return_1', base), M3: fitEval('M3', 'Future_Return_1', [...base, FDm])};
    R.dir.dm31 = dm(R.dir.M3.err, R.dir.M1.err, 1); R.dir.dm30 = dm(R.dir.M3.err, m0e, 1);
    R.vol = {V1: fitEval('V1', FV, [VW]), V2: fitEval('V2', FV, volBase), V3: fitEval('V3', FV, [...volBase, FDm])}; R.vol.dm32 = dm(R.vol.V3.err, R.vol.V2.err, o.h);
    // 6. GARCH(1,1)-t baseline, fractal-augmented ARCH-LM test, GARCH-X, out-of-sample comparison
    const gi = V.Date.map((_, i) => i).filter(i => ok(V[FDm][i])), gr = gi.map(i => V.Return[i]), gfd = gi.map(i => V[FDm][i]), fdLag = gfd.map((_, i) => i ? gfd[i - 1] : null);
    const gb = garchX(gr); const sr2 = gb.std.map(v => v * v), rows = sr2.map((v, i) => i ? [v, sr2[i - 1], fdLag[i]] : null).filter(x => x && x.every(ok)), al = olsHac(rows.map(x => x[0]), rows.map(x => [1, x[1], x[2]]), o.hac);
    const fz0 = fdLag.filter(ok), fm = mean(fz0), fs = sdS(fz0), fz = fdLag.map(v => ok(v) ? (v - fm) / fs : 0), gx = garchX(gr, fz, [...gb.th, 0]), lr = 2 * (gx.ll - gb.ll);
    R.garch = {base: gb, x: gx, lr, lrP: S.chi2P(Math.max(0, lr), 1), archFd: al, n: gr.length, dates: gi.map(i => V.Date[i])};
    // out-of-sample: fit on the training dates, filter through the test dates, forecast average volatility over the next h days
    const trSet = new Set(tr.map(i => V.Date[i])), cut = gi.findIndex(i => V.Date[i] > R.split.trainTo), trR = gr.slice(0, cut), trZ = fz.slice(0, cut);
    const gbT = garchX(trR), gxT = garchX(trR, trZ, [...gbT.th, 0]); gbT.s2Last = gbT.s2[gbT.s2.length - 1]; gxT.s2Last = gxT.s2[gxT.s2.length - 1];
    const allR = gr, pathB = garchForecastPath(gbT, allR.slice(cut), null, o.h), pathX = garchForecastPath(gxT, allR.slice(cut), fz.slice(cut), o.h), dIdx = new Map(gi.slice(cut).map((i, j) => [i, j]));
    const gte = te.filter(i => dIdx.has(i)), act = gte.map(i => V[FV][i]), pB = gte.map(i => pathB[dIdx.get(i)]), pX = gte.map(i => pathX[dIdx.get(i)]), eB = act.map((v, i) => v - pB[i]), eX = act.map((v, i) => v - pX[i]);
    R.garch.oos = {n: gte.length, rmseB: Math.sqrt(mean(eB.map(v => v * v))), maeB: mean(eB.map(Math.abs)), rmseX: Math.sqrt(mean(eX.map(v => v * v))), maeX: mean(eX.map(Math.abs)), dmB: dm(R.vol.V3.err.slice(-gte.length), eB, o.h), predB: pB, predX: pX, dates: gte.map(i => V.Date[i]), actual: act};
    // 7. robustness across windows (rows where every window exists)
    const allW = o.windows.map(w => `FDPrice_${w}`), rowsAll = V.Date.map((_, i) => i).filter(i => [...need, ...allW].every(k => ok(V[k][i]))), sp2 = Math.floor(rowsAll.length * o.split), tr2 = rowsAll.slice(0, sp2), te2 = rowsAll.slice(sp2);
    const fe2 = cols => { const m = olsHac(yof(tr2, FV), Xof(tr2, cols), o.hac), p = m.predict(Xof(te2, cols)), a = yof(te2, FV), e = a.map((v, i) => v - p[i]); return {m, rmse: Math.sqrt(mean(e.map(v => v * v))), mae: mean(e.map(Math.abs))}; };
    const ref = fe2(volBase); R.robust = {n: rowsAll.length, train: tr2.length, test: te2.length, ref: {rmse: ref.rmse, mae: ref.mae, adjR2: ref.m.adjR2, aic: ref.m.aic}, rows: o.windows.map(w => { const k = `FDPrice_${w}`, x = fe2([...volBase, k]), j = x.m.coef.length - 1; return {w, coef: x.m.coef[j], p: x.m.pz[j], adjR2: x.m.adjR2, aic: x.m.aic, rmse: x.rmse, mae: x.mae}; })};
    // 8. drawdowns and calendar-year returns
    let peak = V.Close[0], pi = 0; const eps = []; let cur = null; V.Close.forEach((v, i) => { if (v >= peak) { if (cur) { cur.end = V.Date[i]; cur.recovered = true; eps.push(cur); cur = null; } peak = v; pi = i; } else { const d = (v / peak - 1) * 100; if (!cur) cur = {start: V.Date[pi], trough: V.Date[i], depth: d, days: 0}; cur.days = i - pi; if (d < cur.depth) { cur.depth = d; cur.trough = V.Date[i]; } } }); if (cur) { cur.end = null; cur.recovered = false; eps.push(cur); }
    const ti = V.Drawdown.indexOf(Math.min(...V.Drawdown)), byY = new Map(); V.Date.forEach((d, i) => byY.set(String(d).slice(0, 4), V.Close[i])); const yrs = [...byY.keys()], first = {y: String(D.date[0]).slice(0, 4), c: D.c[0]};
    R.dd = {max: V.Drawdown[ti], maxDate: V.Date[ti], current: V.Drawdown[n - 1], trough: V.Close[ti], sinceTrough: (V.Close[n - 1] / V.Close[ti] - 1) * 100, peak: Math.max(...V.Close), episodes: eps.sort((a, b) => a.depth - b.depth).slice(0, 10), yearly: yrs.map((y, j) => ({y, close: byY.get(y), ret: j ? (byY.get(y) / byY.get(yrs[j - 1]) - 1) * 100 : (y === first.y ? null : null)}))};
    return R;
  }
  return {run, moments, pp, archLM, higuchi, rollFD, olsHac, dm, garchX, garchForecastPath};
})();
if (typeof module !== 'undefined') module.exports = RSC;
