/* Nepal Information Hub — time-series models
   ARIMA / SARIMA by exact Gaussian maximum likelihood (Kalman filter, Harvey state space, Monahan/Jones stationarity
   transform as in statsmodels SARIMAX), automatic order search, forecasts with intervals; VAR with lag selection,
   Granger causality, orthogonalised impulse responses, FEVD and forecasts; VARMA / VARIMA / seasonal VARIMA by the
   Hannan–Rissanen two-step estimator; and a Prophet-style decomposable trend + seasonality model.
   Depends on ST (stats-core.js). */
'use strict';
const TS = (() => {
  const S = typeof ST !== 'undefined' ? ST : require('./stats-core.js');
  const ok = S.ok;

  /* ---------- polynomial helpers ---------- */
  const polyMul = (a, b) => { const c = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => c[i + j] += x * y)); return c; };
  // AR polynomial 1 - phi1 B - ... ; seasonal 1 - Phi1 B^s - ...
  const arPoly = (phi, s = 1) => { const p = new Array(phi.length * s + 1).fill(0); p[0] = 1; phi.forEach((v, i) => p[(i + 1) * s] = -v); return p; };
  const maPoly = (th, s = 1) => { const p = new Array(th.length * s + 1).fill(0); p[0] = 1; th.forEach((v, i) => p[(i + 1) * s] = v); return p; };
  function constrain(u) { const n = u.length; if (!n) return []; const r = u.map(v => v / Math.sqrt(1 + v * v)), y = Array.from({length: n}, () => new Array(n).fill(0));
    for (let k = 0; k < n; k++) { for (let i = 0; i < k; i++) y[k][i] = y[k - 1][i] + r[k] * y[k - 1][k - i - 1]; y[k][k] = r[k]; } return y[n - 1].map(v => -v); }
  function unconstrain(c) { const n = c.length; if (!n) return []; const y = Array.from({length: n}, () => new Array(n).fill(0)); y[n - 1] = c.map(v => -v);
    for (let k = n - 1; k > 0; k--) for (let i = 0; i < k; i++) y[k - 1][i] = (y[k][i] - y[k][k] * y[k][k - i - 1]) / (1 - y[k][k] ** 2);
    return y.map((r, i) => r[i]).map(r => { const rr = Math.max(-0.999, Math.min(0.999, r)); return rr / Math.sqrt(1 - rr * rr); }); }
  function difference(y, d, D, s) { let w = y.slice(); for (let i = 0; i < D; i++) w = w.slice(s).map((v, t) => v - w[t]); for (let i = 0; i < d; i++) w = w.slice(1).map((v, t) => v - w[t]); return w; }

  /* ---------- exact ARMA likelihood via Kalman filter (σ² concentrated out) ---------- */
  function armaKalman(w, ar, ma, mu, keepInnov) {
    const n = w.length, p = ar.length, q = ma.length, r = Math.max(p, q + 1);
    const Tm = Array.from({length: r}, (_, i) => Array.from({length: r}, (_, j) => (j === 0 ? (ar[i] || 0) : 0) + (j === i + 1 ? 1 : 0)));
    // careful: first column holds AR coefficients, superdiagonal ones
    for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) Tm[i][j] = (j === 0 ? (ar[i] || 0) : 0) + (j === i + 1 ? 1 : 0);
    const Rv = [1, ...Array.from({length: r - 1}, (_, i) => ma[i] || 0)], RR = Rv.map(a => Rv.map(b => a * b));
    // stationary initial covariance by the doubling algorithm: P = sum_k T^k RR' T'^k
    let P = RR.map(r2 => r2.slice()), A = Tm.map(r2 => r2.slice());
    for (let it = 0; it < 60; it++) { const APA = S.mul(S.mul(A, P), S.T(A)); let d = 0; for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) { P[i][j] += APA[i][j]; d = Math.max(d, Math.abs(APA[i][j])); } if (d < 1e-12) break; A = S.mul(A, A); if (it === 59) return null; }
    let a = new Array(r).fill(0), sumLogF = 0, sumV2F = 0, steady = false; const innov = keepInnov ? [] : null, Fs = keepInnov ? [] : null;
    for (let t = 0; t < n; t++) {
      const v = w[t] - mu - a[0], F = P[0][0]; if (!(F > 0)) return null;
      sumLogF += Math.log(F); sumV2F += v * v / F; if (keepInnov) { innov.push(v); Fs.push(F); }
      const Pc = P.map(row => row[0]), TPc = Tm.map(row => S.dot(row, Pc)), K = TPc.map(x => x / F);
      const an = new Array(r); for (let i = 0; i < r; i++) { let s2 = 0; for (let j = 0; j < r; j++) s2 += Tm[i][j] * a[j]; an[i] = s2 + K[i] * v; } a = an;
      if (!steady) { const TP = S.mul(Tm, P), Pn = S.mul(TP, S.T(Tm)); let dmax = 0; for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) { const val = Pn[i][j] + RR[i][j] - K[i] * K[j] * F; dmax = Math.max(dmax, Math.abs(val - P[i][j])); Pn[i][j] = val; } P = Pn; if (dmax < 1e-11) steady = true; }
    }
    const s2 = sumV2F / n, ll = -n / 2 * (Math.log(2 * Math.PI) + Math.log(s2) + 1) - sumLogF / 2;
    return {ll, s2, innov, F: Fs, aEnd: a, PEnd: P, Tm, RR};
  }
  /* SARIMA(p,d,q)(P,D,Q)s with optional mean of the differenced series */
  function arima(y0, {p = 1, d = 0, q = 0, P = 0, D = 0, Q = 0, s = 0, mean = null} = {}) {
    const y = y0.slice(); if (y.some(v => !ok(v))) throw new Error('The series has gaps. Fill them in the Clean step (for example forward fill or interpolate) before ARIMA.');
    if (!s) { P = 0; D = 0; Q = 0; }
    const w = difference(y, d, D, s || 1), n = w.length, useMean = mean ?? (d + D === 0);
    if (n < p + q + s * (P + Q) + 10) throw new Error(`Only ${n} usable observations after differencing; too few for this order.`);
    const npar = p + P + q + Q + (useMean ? 1 : 0);
    const unpack = u => { let i = 0; const mu = useMean ? u[i++] : 0, phi = constrain(u.slice(i, i += p)), Phi = constrain(u.slice(i, i += P)), th = constrain(u.slice(i, i += q)).map(v => -v), Th = constrain(u.slice(i, i += Q)).map(v => -v); return {mu, phi, Phi, th, Th}; };
    const polys = ({phi, Phi, th, Th}) => { const c = polyMul(arPoly(phi), arPoly(Phi, s || 1)), m = polyMul(maPoly(th), maPoly(Th, s || 1)); return {ar: c.slice(1).map(v => -v), ma: m.slice(1), c, m}; };
    const wm = S.mean(w), wsd = S.sd(w) || 1, scale = useMean ? wsd : 1;
    const nll = u => { const pr = unpack(u), {ar, ma} = polys(pr), r = armaKalman(w, ar, ma, pr.mu * scale); return r ? -r.ll : 1e12; };
    let u0 = new Array(npar).fill(0); if (useMean) u0[0] = wm / scale;
    // Hannan–Rissanen start for the non-seasonal part
    try { if (p + q > 0) { const L = Math.min(Math.max(p + q + 2, Math.round(Math.log(n) ** 1.5)), Math.floor(n / 4)), wc = w.map(v => v - wm);
      const Xa = [], Ya = []; for (let t = L; t < n; t++) { Xa.push(Array.from({length: L}, (_, l) => wc[t - l - 1])); Ya.push(wc[t]); } const fa = S.ols(Ya, Xa), eh = new Array(L).fill(0).concat(fa.res);
      const m = Math.max(p, q), Xb = [], Yb = []; for (let t = L + m; t < n; t++) { Xb.push([...Array.from({length: p}, (_, l) => wc[t - l - 1]), ...Array.from({length: q}, (_, l) => eh[t - l - 1])]); Yb.push(wc[t]); }
      const fb = S.ols(Yb, Xb), ph = fb.coef.slice(0, p), tt = fb.coef.slice(p);
      const okRoots = c => { try { const uu = unconstrain(c); return uu.every(ok); } catch (e) { return false; } };
      let i = useMean ? 1 : 0; if (okRoots(ph)) unconstrain(ph).forEach((v, j) => u0[i + j] = v); i += p + P; if (okRoots(tt.map(v => -v))) unconstrain(tt.map(v => -v)).forEach((v, j) => u0[i + j] = v); } } catch (e) {}
    let best = S.nelderMead(nll, u0, {maxIter: 600 * Math.max(1, npar), tol: 1e-10, step: 0.3});
    const zero = new Array(npar).fill(0); if (useMean) zero[0] = wm / scale; const alt = S.nelderMead(nll, zero, {maxIter: 600 * Math.max(1, npar), step: 0.3}); if (alt.f < best.f) best = alt;
    const bf = S.bfgs(nll, best.x); if (bf.f < best.f) best = bf;
    const pr = unpack(best.x), pl = polys(pr), kf = armaKalman(w, pl.ar, pl.ma, pr.mu * scale, true), mu = pr.mu * scale;
    // standard errors from the numerical Hessian with respect to the constrained parameters
    const theta = [...(useMean ? [mu] : []), ...pr.phi, ...pr.Phi, ...pr.th, ...pr.Th], names = [...(useMean ? ['mean'] : []), ...pr.phi.map((_, i) => 'ar.L' + (i + 1)), ...pr.Phi.map((_, i) => 'ar.S.L' + (i + 1) * s), ...pr.th.map((_, i) => 'ma.L' + (i + 1)), ...pr.Th.map((_, i) => 'ma.S.L' + (i + 1) * s)];
    const nllC = th2 => { let i = 0; const m2 = useMean ? th2[i++] : 0, a = th2.slice(i, i += p), A2 = th2.slice(i, i += P), b = th2.slice(i, i += q), B2 = th2.slice(i, i += Q), pl2 = polys({phi: a, Phi: A2, th: b, Th: B2}), r = armaKalman(w, pl2.ar, pl2.ma, m2); return r ? -r.ll : 1e12; };
    let se = theta.map(() => null); try { const H = S.hessian(nllC, theta), Hi = S.inv(H); if (Hi) se = Hi.map((r, i) => r[i] > 0 ? Math.sqrt(r[i]) : null); } catch (e) {}
    const z = theta.map((v, i) => ok(se[i]) ? v / se[i] : null), pv = z.map(v => ok(v) ? 2 * (1 - S.normCdf(Math.abs(v))) : null);
    const ll = -best.f, k = npar + 1, sigma2 = kf.s2;
    const resid = kf.innov; // one-step prediction errors of the differenced series
    const offset = y.length - n;
    return {order: {p, d, q, P, D, Q, s}, mean: useMean ? mu : 0, useMean, phi: pr.phi, Phi: pr.Phi, theta: pr.th, Theta: pr.Th, ar: pl.ar, ma: pl.ma, names, coef: theta, se, z, p: pv,
      sigma2, ll, aic: -2 * ll + 2 * k, bic: -2 * ll + Math.log(n) * k, hqic: -2 * ll + 2 * Math.log(Math.log(n)) * k, nobs: n, resid, std: resid.map((v, i) => v / Math.sqrt(kf.F[i])), offset, y, w, c: pl.c, m: pl.m};
  }
  /* forecasts in levels with prediction intervals (psi weights of the integrated model) */
  function arimaForecast(fit, h, level = [0.8, 0.95]) {
    const {y, ar, ma, mean, order: {d, D, s}} = fit, sd2 = s || 1;
    let full = fit.c.slice(); for (let i = 0; i < D; i++) full = polyMul(full, [1, ...new Array(sd2 - 1).fill(0), -1]); for (let i = 0; i < d; i++) full = polyMul(full, [1, -1]);
    const aF = full.slice(1).map(v => -v), cst = mean * fit.c.reduce((s2, v) => s2 + v, 0);
    const e = new Array(y.length).fill(0); fit.resid.forEach((v, i) => e[i + fit.offset] = v);
    const yy = y.slice(), ee = e.slice(), out = [];
    for (let k = 1; k <= h; k++) { const t = yy.length; let v = cst; aF.forEach((a, i) => { v += a * (yy[t - i - 1] ?? 0); }); ma.forEach((m, j) => { v += m * (ee[t - j - 1] ?? 0); }); yy.push(v); ee.push(0); out.push(v); }
    // psi weights: full AR * psi = MA
    const psi = [1]; for (let j = 1; j < h; j++) { let v = ma[j - 1] || 0; for (let i = 1; i <= Math.min(j, aF.length); i++) v += aF[i - 1] * psi[j - i]; psi.push(v); }
    const se = out.map((_, k) => Math.sqrt(fit.sigma2 * psi.slice(0, k + 1).reduce((s2, v) => s2 + v * v, 0)));
    return {mean: out, se, bands: level.map(L => { const zq = S.normInv(0.5 + L / 2); return {level: L, lo: out.map((v, i) => v - zq * se[i]), hi: out.map((v, i) => v + zq * se[i])}; })};
  }
  /* in-sample one-step fitted values in levels */
  function arimaFitted(fit) { const {y, offset} = fit, f = new Array(y.length).fill(null); fit.resid.forEach((e, i) => { const t = i + offset; f[t] = y[t] - e; }); return f; }
  /* automatic order search (stepwise grid, AIC) */
  function autoArima(y, {maxP = 3, maxQ = 3, d = null, D = 0, s = 0, seasonal = false, ic = 'aic', trace} = {}) {
    if (d === null) { d = 0; let x = y.slice(); for (let i = 0; i < 2; i++) { const a = S.adf(x), k = S.kpss(x); if ((a && a.p > 0.05) || (k && k.p < 0.05)) { d++; x = x.slice(1).map((v, t) => v - x[t]); } else break; } }
    const cands = []; for (let p = 0; p <= maxP; p++) for (let q = 0; q <= maxQ; q++) for (const P of seasonal && s ? [0, 1] : [0]) for (const Q of seasonal && s ? [0, 1] : [0]) cands.push({p, q, P, Q});
    const res = []; for (const c of cands) { try { const f = arima(y, {...c, d, D: seasonal ? D : 0, s: seasonal ? s : 0}); res.push({...c, d, D, s, aic: f.aic, bic: f.bic, fit: f}); if (trace) trace(res.length, cands.length); } catch (e) {} }
    res.sort((a, b) => a[ic] - b[ic]); return {best: res[0]?.fit, table: res.map(r => ({p: r.p, d: r.d, q: r.q, P: r.P, D: r.D, Q: r.Q, s: r.s, aic: r.aic, bic: r.bic}))};
  }

  /* ---------- VAR ---------- */
  function varDesign(Y, p, trend) { const n = Y.length, Z = [], YY = []; for (let t = p; t < n; t++) { const z = []; if (trend !== 'n') z.push(1); if (trend === 'ct') z.push(t - p + 1); for (let l = 1; l <= p; l++) z.push(...Y[t - l]); Z.push(z); YY.push(Y[t]); } return {Z, YY}; }
  function varFit(Y, p, {trend = 'c', names} = {}) {
    const m = Y[0].length, {Z, YY} = varDesign(Y, p, trend), n = Z.length, kt = trend === 'n' ? 0 : trend === 'ct' ? 2 : 1, k = Z[0].length;
    if (n <= k) throw new Error(`Only ${n} observations for ${k} coefficients per equation. Use fewer lags or variables.`);
    const ZtZi = S.inv(S.mul(S.T(Z), Z)); if (!ZtZi) throw new Error('The VAR regressors are collinear. Remove a variable that is a combination of others.');
    const B = S.mul(ZtZi, S.mul(S.T(Z), YY)), fit = S.mul(Z, B), U = YY.map((r, i) => r.map((v, j) => v - fit[i][j]));
    const UtU = S.mul(S.T(U), U), sigma = UtU.map(r => r.map(v => v / (n - k))), sigmaMle = UtU.map(r => r.map(v => v / n)), ld = S.logdet(sigmaMle), free = p * m * m + m * kt;
    const A = Array.from({length: p}, (_, l) => Array.from({length: m}, (_, i) => Array.from({length: m}, (_, j) => B[kt + l * m + j][i])));
    const se = B.map((row, a) => row.map((_, i) => Math.sqrt(sigma[i][i] * ZtZi[a][a]))), tst = B.map((row, a) => row.map((v, i) => v / se[a][i])), pv = tst.map(r => r.map(v => S.tP2(v, n - k)));
    return {p, m, n, k, kt, trend, B, A, U, sigma, sigmaMle, ZtZi, se, t: tst, pv, Y, names: names || Array.from({length: m}, (_, i) => 'y' + (i + 1)),
      aic: ld + 2 / n * free, bic: ld + Math.log(n) / n * free, hqic: ld + 2 * Math.log(Math.log(n)) / n * free, fpe: ((n + k) / (n - k)) ** m * Math.exp(ld), ll: -n * m / 2 * Math.log(2 * Math.PI) - n / 2 * ld - n * m / 2};
  }
  function varSelect(Y, maxLags, trend = 'c') { const rows = []; for (let p = 0; p <= maxLags; p++) { try { const Yt = Y.slice(maxLags - p), f = p === 0 ? varFit0(Yt, trend) : varFit(Yt, p, {trend}); rows.push({p, aic: f.aic, bic: f.bic, hqic: f.hqic, fpe: f.fpe}); } catch (e) {} }
    const pick = k => rows.reduce((a, b) => b[k] < a[k] ? b : a, rows[0])?.p; return {rows, aic: pick('aic'), bic: pick('bic'), hqic: pick('hqic'), fpe: pick('fpe')}; }
  function varFit0(Y, trend) { const m = Y[0].length, n = Y.length, kt = trend === 'n' ? 0 : 1, mu = Array.from({length: m}, (_, j) => kt ? S.mean(Y.map(r => r[j])) : 0), U = Y.map(r => r.map((v, j) => v - mu[j])), sm = S.mul(S.T(U), U).map(r => r.map(v => v / n)), ld = S.logdet(sm), free = m * kt, k = kt;
    return {aic: ld + 2 / n * free, bic: ld + Math.log(n) / n * free, hqic: ld + 2 * Math.log(Math.log(n)) / n * free, fpe: ((n + k) / (n - k)) ** m * Math.exp(ld)}; }
  function granger(fit, caused, causing) { const {p, m, kt, B, sigma, ZtZi, n, k} = fit; const rows = []; for (let l = 0; l < p; l++) causing.forEach(j => rows.push(kt + l * m + j));
    const b = rows.map(r => B[r][caused]), V = rows.map(a => rows.map(c => sigma[caused][caused] * ZtZi[a][c])), Vi = S.inv(V); if (!Vi) return null; const W = S.dot(b, S.mv(Vi, b)), q = rows.length, F = W / q, df2 = m * (n - k);
    return {F, df1: q, df2, p: S.fP(F, q, df2)}; }
  function maRep(A, h, M) { const m = A[0]?.length || M?.[0]?.length, Phi = [S.eye(m)]; for (let i = 1; i <= h; i++) { let P = Array.from({length: m}, () => new Array(m).fill(0)); for (let j = 1; j <= Math.min(i, A.length); j++) if (A[j - 1]) P = add(P, S.mul(A[j - 1], Phi[i - j])); if (M && M[i - 1]) P = add(P, M[i - 1]); Phi.push(P); } return Phi; }
  const add = (X, Yv) => X.map((r, i) => r.map((v, j) => v + Yv[i][j]));
  function irf(A, sigma, h, M) { const Phi = maRep(A, h, M), Pc = S.chol(sigma); return {Phi, Theta: Phi.map(Ph => S.mul(Ph, Pc))}; }
  function fevd(Theta, h) { const m = Theta[0].length, out = []; for (let i = 0; i < m; i++) { const rows = []; for (let s2 = 1; s2 <= h; s2++) { const c = new Array(m).fill(0); for (let t = 0; t < s2; t++) for (let j = 0; j < m; j++) c[j] += Theta[t][i][j] ** 2; const tot = c.reduce((a, b) => a + b, 0); rows.push(c.map(v => v / tot)); } out.push(rows); } return out; }
  function varForecast(fit, h, level = 0.95) { const {A, B, kt, trend, Y, sigma, m} = fit, p = A.length, yy = Y.map(r => r.slice()), out = [], c = kt ? B[0] : new Array(m).fill(0);
    for (let s2 = 1; s2 <= h; s2++) { const t = yy.length, v = c.slice(); if (trend === 'ct') for (let j = 0; j < m; j++) v[j] += B[1][j] * (t - p + 1); for (let l = 1; l <= p; l++) { const x = yy[t - l]; for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) v[i] += A[l - 1][i][j] * x[j]; } yy.push(v); out.push(v); }
    const Phi = maRep(A, h), z = S.normInv(0.5 + level / 2), se = []; let mse = Array.from({length: m}, () => new Array(m).fill(0)); for (let s2 = 0; s2 < h; s2++) { mse = add(mse, S.mul(S.mul(Phi[s2], sigma), S.T(Phi[s2]))); se.push(mse.map((r, i) => Math.sqrt(r[i]))); }
    return {mean: out, se, lo: out.map((r, s2) => r.map((v, i) => v - z * se[s2][i])), hi: out.map((r, s2) => r.map((v, i) => v + z * se[s2][i]))}; }
  function companionRadius(A) { const p = A.length, m = A[0].length, K = m * p, C = Array.from({length: K}, () => new Array(K).fill(0)); for (let l = 0; l < p; l++) for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) C[i][l * m + j] = A[l][i][j]; for (let i = m; i < K; i++) C[i][i - m] = 1;
    let M = C, lr = 0; for (let k = 0; k < 40; k++) { const nrm = Math.sqrt(M.flat().reduce((s2, v) => s2 + v * v, 0)); if (nrm === 0) return 0; lr += Math.log(nrm) / 2 ** k; const Mn = M.map(r => r.map(v => v / nrm)); M = S.mul(Mn, Mn); } return Math.exp(lr); }
  function varBootIrf(fit, h, reps = 100, seed = 11) { let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const {Y, p, U, B, kt, trend, m} = fit, out = [];
    for (let r = 0; r < reps; r++) { const Yb = Y.slice(0, p).map(x => x.slice()); for (let t = p; t < Y.length; t++) { const u = U[Math.floor(rnd() * U.length)], v = kt ? B[0].slice() : new Array(m).fill(0); if (trend === 'ct') for (let j = 0; j < m; j++) v[j] += B[1][j] * (t - p + 1); for (let l = 1; l <= p; l++) for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) v[i] += fit.A[l - 1][i][j] * Yb[t - l][j]; Yb.push(v.map((x, i) => x + u[i])); }
      try { const f = varFit(Yb, p, {trend}); out.push(irf(f.A, f.sigma, h).Theta); } catch (e) {} }
    const q = (a, pr) => S.quantile(a, pr); const lo = [], hi = []; for (let s2 = 0; s2 <= h; s2++) { lo.push(Array.from({length: m}, (_, i) => Array.from({length: m}, (_, j) => q(out.map(o => o[s2][i][j]), 0.05)))); hi.push(Array.from({length: m}, (_, i) => Array.from({length: m}, (_, j) => q(out.map(o => o[s2][i][j]), 0.95)))); }
    return {lo, hi, reps: out.length}; }

  /* ---------- VARMA / VARIMA / seasonal VARIMA: Hannan–Rissanen two-step ---------- */
  function varma(Y, {p = 1, q = 1, P = 0, Q = 0, s = 0, trend = 'c', names} = {}) {
    const m = Y[0].length, n = Y.length, arL = [...Array.from({length: p}, (_, i) => i + 1), ...Array.from({length: s ? P : 0}, (_, i) => (i + 1) * s)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b), maL = [...Array.from({length: q}, (_, i) => i + 1), ...Array.from({length: s ? Q : 0}, (_, i) => (i + 1) * s)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    const maxAr = Math.max(0, ...arL), maxMa = Math.max(0, ...maL);
    let pL = Math.max(maxAr + maxMa, Math.min(Math.round(1.5 * Math.log(n) ** 1.2), 12)); pL = Math.min(pL, Math.floor((n - 10) / (m + 1))); if (pL < 1) throw new Error('Series too short for VARMA.');
    const long = varFit(Y, pL, {trend: 'c'}), Uh = Array.from({length: pL}, () => new Array(m).fill(0)).concat(long.U);
    const start = Math.max(pL, maxAr) + maxMa, rows = [], tgt = [];
    for (let t = start; t < n; t++) { const z = []; if (trend !== 'n') z.push(1); arL.forEach(l => z.push(...Y[t - l])); maL.forEach(l => z.push(...Uh[t - l])); rows.push(z); tgt.push(Y[t]); }
    const N = rows.length, k = rows[0].length; if (N <= k + 5) throw new Error('Too few observations for this VARMA order.');
    const Zi = S.inv(S.mul(S.T(rows), rows)); if (!Zi) throw new Error('VARMA regressors are collinear; lower the order.');
    const B = S.mul(Zi, S.mul(S.T(rows), tgt)), fitv = S.mul(rows, B), U = tgt.map((r, i) => r.map((v, j) => v - fitv[i][j])), sigma = S.mul(S.T(U), U).map(r => r.map(v => v / (N - k))), kt = trend === 'n' ? 0 : 1;
    const coefMat = off => Array.from({length: m}, (_, i) => Array.from({length: m}, (_, j) => B[off + j][i]));
    const A = {}, M = {}; arL.forEach((l, i) => A[l] = coefMat(kt + i * m)); maL.forEach((l, i) => M[l] = coefMat(kt + arL.length * m + i * m));
    const se = B.map((row, a) => row.map((_, i) => Math.sqrt(sigma[i][i] * Zi[a][a]))), tst = B.map((row, a) => row.map((v, i) => v / se[a][i]));
    const ld = S.logdet(S.mul(S.T(U), U).map(r => r.map(v => v / N))), free = k * m;
    const resid = Array.from({length: n}, () => new Array(m).fill(0)); U.forEach((u, i) => resid[start + i] = u);
    return {kind: 'varma', p, q, P, Q, s, arL, maL, A, M, B, c: kt ? B[0] : new Array(m).fill(0), sigma, U, resid, Y, m, n: N, k, se, t: tst, pv: tst.map(r => r.map(v => S.tP2(v, N - k))), names: names || Array.from({length: m}, (_, i) => 'y' + (i + 1)),
      aic: ld + 2 * free / N, bic: ld + Math.log(N) * free / N, hqic: ld + 2 * Math.log(Math.log(N)) * free / N};
  }
  function varmaForecast(f, h, level = 0.95) { const {Y, A, M, c, m, resid, sigma} = f, yy = Y.map(r => r.slice()), ee = resid.map(r => r.slice()), out = [];
    for (let s2 = 0; s2 < h; s2++) { const t = yy.length, v = c.slice(); Object.entries(A).forEach(([l, Am]) => { const x = yy[t - l]; for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) v[i] += Am[i][j] * x[j]; }); Object.entries(M).forEach(([l, Mm]) => { const x = ee[t - l]; for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) v[i] += Mm[i][j] * x[j]; }); yy.push(v); ee.push(new Array(m).fill(0)); out.push(v); }
    const maxl = Math.max(0, ...Object.keys(A).map(Number)), Al = Array.from({length: maxl}, (_, i) => A[i + 1] || null), Ml = Array.from({length: h}, (_, i) => M[i + 1] || null), Phi = maRep(Al.map(a => a || zerosM(m)), h, Ml);
    const z = S.normInv(0.5 + level / 2), se = []; let mse = zerosM(m); for (let s2 = 0; s2 < h; s2++) { mse = add(mse, S.mul(S.mul(Phi[s2], sigma), S.T(Phi[s2]))); se.push(mse.map((r, i) => Math.sqrt(r[i]))); }
    return {mean: out, se, lo: out.map((r, s2) => r.map((v, i) => v - z * se[s2][i])), hi: out.map((r, s2) => r.map((v, i) => v + z * se[s2][i])), Phi}; }
  const zerosM = m => Array.from({length: m}, () => new Array(m).fill(0));
  function varmaIrf(f, h) { const maxl = Math.max(0, ...Object.keys(f.A).map(Number)), Al = Array.from({length: maxl}, (_, i) => f.A[i + 1] || zerosM(f.m)), Ml = Array.from({length: h}, (_, i) => f.M[i + 1] || null); const Phi = maRep(Al, h, Ml), Pc = S.chol(f.sigma); return {Phi, Theta: Phi.map(x => S.mul(x, Pc))}; }
  // integrate forecasts of differenced series back to levels (d regular and D seasonal differences)
  function integrate(levels, dfc, d, D, s) {
    // rebuild the chain of differenced series from the levels, then cumulate forward
    const chain = [levels.slice()]; let cur = levels.slice(); for (let i = 0; i < D; i++) { cur = cur.slice(s).map((v, t) => v - cur[t]); chain.push(cur); } for (let i = 0; i < d; i++) { cur = cur.slice(1).map((v, t) => v - cur[t]); chain.push(cur); }
    let fc = dfc.slice(); for (let lvl = chain.length - 2; lvl >= 0; lvl--) { const base = chain[lvl], lag = lvl < D ? s : 1, ext = base.slice(); fc.forEach(v => ext.push(v + ext[ext.length - lag])); fc = ext.slice(base.length); }
    return fc;
  }

  /* ---------- Prophet-style model: piecewise-linear trend with changepoints + Fourier seasonality (ridge MAP) ---------- */
  function prophetLike(dates, y, {nCp = 25, cpRange = 0.8, cpScale = 0.05, seasScale = 10, yearly = 'auto', weekly = 'auto', monthly = false, h = 30, futureDates = null, sims = 300, interval = 0.8} = {}) {
    const day = d => new Date(d + 'T00:00:00Z').getTime() / 864e5, ds = dates.map(day), t0 = ds[0], span = ds[ds.length - 1] - t0 || 1, tt = ds.map(v => (v - t0) / span);
    const ymax = Math.max(...y.map(Math.abs)) || 1, ys = y.map(v => v / ymax), n = y.length;
    const cps = []; const hist = Math.floor(n * cpRange); for (let i = 1; i <= Math.min(nCp, hist - 1); i++) cps.push(tt[Math.floor(i * hist / (Math.min(nCp, hist - 1) + 1))]);
    const useY = yearly === 'auto' ? span >= 730 : yearly, step = S.median(ds.slice(1).map((v, i) => v - ds[i])), useW = weekly === 'auto' ? step < 7 && span >= 14 : weekly;
    const four = (dayv, period, order) => { const r = []; for (let k = 1; k <= order; k++) { const a = 2 * Math.PI * k * dayv / period; r.push(Math.sin(a), Math.cos(a)); } return r; };
    const feat = (tv, dv) => [1, tv, ...cps.map(c => Math.max(0, tv - c)), ...(useY ? four(dv, 365.25, 10) : []), ...(useW ? four(dv, 7, 3) : []), ...(monthly ? four(dv, 30.4375, 5) : [])];
    const X = tt.map((tv, i) => feat(tv, ds[i])), k = X[0].length, pen = new Array(k).fill(0); cps.forEach((_, j) => pen[2 + j] = 1 / (cpScale * cpScale)); for (let j = 2 + cps.length; j < k; j++) pen[j] = 1 / (seasScale * seasScale);
    const XtX0 = S.mul(S.T(X), X), Xty = S.mv(S.T(X), ys), ridge = lam => { const M = XtX0.map((r, i) => r.map((v, j) => v + (i === j ? lam[i] : 0))); return S.mv(S.inv(M), Xty); };
    const b0 = ridge(pen.map(v => v ? 1e-6 : 0)), s2 = Math.max(1e-8, S.mean(ys.map((v, i) => (v - S.dot(X[i], b0)) ** 2))); const beta = ridge(pen.map(v => v * s2));   // MAP with Gaussian priors (Laplace prior approximated)
    const fit = X.map(r => S.dot(r, beta) * ymax), res = y.map((v, i) => v - fit[i]), sig = S.sd(res);
    let fd = futureDates; if (!fd) { fd = []; let last = ds[ds.length - 1]; for (let i = 0; i < h; i++) { last += Math.max(1, Math.round(step)); fd.push(last); } } else fd = fd.map(day);
    const ftt = fd.map(v => (v - t0) / span), deltas = beta.slice(2, 2 + cps.length), slope = beta[1] + deltas.reduce((a, b) => a + b, 0), lambda = S.mean(deltas.map(Math.abs)) || 1e-6, rate = cps.length / 1;
    const trendAt = tv => S.dot(feat(tv, 0).slice(0, 2 + cps.length), beta.slice(0, 2 + cps.length));
    const fmean = ftt.map((tv, i) => S.dot(feat(tv, fd[i]), beta) * ymax);
    // uncertainty: simulate future trend changes (Laplace magnitudes at the historical changepoint rate) + noise
    let sd0 = 7; const rnd = () => { sd0 = (sd0 * 1103515245 + 12345) % 2147483648; return sd0 / 2147483648; };
    const sims_ = []; for (let r = 0; r < sims; r++) { let extra = 0, slp = 0, prev = 1; const path = ftt.map((tv, i) => { const dt = tv - prev; if (rnd() < rate * dt) { const u = rnd() - 0.5; slp += -lambda * Math.sign(u) * Math.log(1 - 2 * Math.abs(u)); } extra += slp * dt; prev = tv; const g = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); return fmean[i] + extra * ymax + g * sig; }); sims_.push(path); }
    const lo = fmean.map((_, i) => S.quantile(sims_.map(p => p[i]), (1 - interval) / 2)), hi = fmean.map((_, i) => S.quantile(sims_.map(p => p[i]), 1 - (1 - interval) / 2));
    const trend = tt.map(tv => trendAt(tv) * ymax), seas = fit.map((v, i) => v - trend[i]);
    return {fit, res, sigma: sig, trend, seasonal: seas, changepoints: cps.map((c, j) => ({date: new Date((t0 + c * span) * 864e5).toISOString().slice(0, 10), delta: deltas[j] * ymax / span})), future: fd.map(v => new Date(v * 864e5).toISOString().slice(0, 10)), mean: fmean, lo, hi, useY, useW, slope: slope * ymax / span};
  }

  return {arima, arimaForecast, arimaFitted, autoArima, armaKalman, constrain, unconstrain, difference, integrate, polyMul,
    varFit, varSelect, granger, irf, fevd, varForecast, companionRadius, varBootIrf, varma, varmaForecast, varmaIrf, prophetLike};
})();
if (typeof module !== 'undefined') module.exports = TS;
