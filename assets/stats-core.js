/* Nepal Information Hub — statistics core for the Data analysis lab
   Linear algebra, distributions, OLS with the full set of classical-assumption tests, robust and HAC standard errors,
   unit-root tests (ADF with MacKinnon p-values, KPSS), ACF/PACF, Ljung-Box, panel estimators (pooled, FE, RE, Hausman),
   distribution fitting by maximum likelihood, and a generic optimiser. No dependencies; missing values are null. */
'use strict';
const ST = (() => {
  const ok = v => typeof v === 'number' && isFinite(v);
  const sum = a => { let s = 0; for (const v of a) s += v; return s; };
  const mean = a => sum(a) / a.length;
  const variance = (a, dd = 1) => { const m = mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return s / (a.length - dd); };
  const sd = (a, dd = 1) => Math.sqrt(variance(a, dd));
  const quantile = (a, p) => { const s = a.slice().sort((x, y) => x - y), h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo); };
  const median = a => quantile(a, .5);
  const skew = a => { const m = mean(a), n = a.length; let m2 = 0, m3 = 0; for (const v of a) { m2 += (v - m) ** 2; m3 += (v - m) ** 3; } m2 /= n; m3 /= n; return m3 / m2 ** 1.5; };
  const kurt = a => { const m = mean(a), n = a.length; let m2 = 0, m4 = 0; for (const v of a) { m2 += (v - m) ** 2; m4 += (v - m) ** 4; } m2 /= n; m4 /= n; return m4 / m2 ** 2; }; // raw (normal = 3)

  /* ---------- linear algebra ---------- */
  const zeros = (r, c) => Array.from({length: r}, () => new Array(c).fill(0));
  const eye = n => Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => +(i === j)));
  const T = A => A[0].map((_, j) => A.map(r => r[j]));
  function mul(A, B) { const n = A.length, k = B.length, m = B[0].length, C = zeros(n, m); for (let i = 0; i < n; i++) { const Ai = A[i], Ci = C[i]; for (let l = 0; l < k; l++) { const a = Ai[l]; if (a === 0) continue; const Bl = B[l]; for (let j = 0; j < m; j++) Ci[j] += a * Bl[j]; } } return C; }
  const mv = (A, x) => A.map(r => { let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * x[j]; return s; });
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  function inv(A) {
    const n = A.length, M = A.map((r, i) => { const z = new Array(2 * n).fill(0); for (let j = 0; j < n; j++) z[j] = r[j]; z[n + i] = 1; return z; });
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-13) return null; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
    return M.map(r => r.slice(n));
  }
  function solve(A, b) { const Ai = inv(A); return Ai ? mv(Ai, b) : null; }
  function chol(A) { const n = A.length, L = zeros(n, n); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; if (i === j) { if (s <= 0) s = 1e-12; L[i][j] = Math.sqrt(s); } else L[i][j] = s / L[j][j]; } return L; }
  function logdet(A) { const n = A.length, M = A.map(r => r.slice()); let s = 0; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-300) return -Infinity; [M[c], M[p]] = [M[p], M[c]]; s += Math.log(Math.abs(M[c][c])); for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j < n; j++) M[r][j] -= f * M[c][j]; } } return s; }
  function eigSym(S) { const n = S.length, A = S.map(r => r.slice()), V = eye(n);
    for (let sw = 0; sw < 100; sw++) { let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2; if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(A[p][q]) < 1e-300) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; } for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; } for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; } } }
    const idx = [...Array(n).keys()].sort((a, b) => A[b][b] - A[a][a]); return {values: idx.map(i => A[i][i]), vectors: V.map(r => idx.map(i => r[i]))}; }
  const kron = (A, B) => { const r = A.length * B.length, c = A[0].length * B[0].length, K = zeros(r, c); for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) for (let k = 0; k < B.length; k++) for (let l = 0; l < B[0].length; l++) K[i * B.length + k][j * B[0].length + l] = A[i][j] * B[k][l]; return K; };

  /* ---------- distributions ---------- */
  function lgamma(x) { const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x); x -= 1; let a = g[0]; const t = x + 7.5; for (let i = 1; i < 9; i++) a += g[i] / (x + i); return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a); }
  function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; } return h; }
  function ibeta(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  function gammaP(a, x) { if (x <= 0) return 0; const gl = lgamma(a);
    if (x < a + 1) { let ap = a, s = 1 / a, d = s; for (let i = 0; i < 1000; i++) { ap++; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-16) break; } return s * Math.exp(-x + a * Math.log(x) - gl); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 1000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - gl) * h; }
  function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
  const normCdf = z => z < -8 ? 0 : z > 8 ? 1 : 0.5 * erfc(-z / Math.SQRT2);
  const normPdf = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  function normInv(p) { if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00], b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01], c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00], d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r, x; if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const e = 0.5 * erfc(-x / Math.SQRT2) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); return x - u / (1 + x * u / 2); }
  const tCdf = (t, df) => { const x = df / (df + t * t), p = 0.5 * ibeta(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
  const tP2 = (t, df) => ok(t) ? ibeta(df / (df + t * t), df / 2, 0.5) : null;
  const fP = (F, d1, d2) => ok(F) && F > 0 ? ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2) : (F <= 0 ? 1 : null);
  const chi2P = (x, df) => ok(x) ? (x <= 0 ? 1 : 1 - gammaP(df / 2, x / 2)) : null;
  function tInv(p, df) { let lo = -50, hi = 50; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (tCdf(m, df) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
  function chi2Inv(p, df) { let lo = 0, hi = Math.max(10, df * 10); for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (1 - chi2P(m, df) < p) lo = m; else hi = m; } return (lo + hi) / 2; }

  /* ---------- optimisers ---------- */
  function nelderMead(f, x0, {maxIter = 4000, tol = 1e-10, step = 0.1} = {}) {
    const n = x0.length; let S = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] = x[i] !== 0 ? x[i] * (1 + step) : step; S.push(x); }
    let F = S.map(f);
    for (let it = 0; it < maxIter; it++) {
      const o = [...Array(n + 1).keys()].sort((a, b) => F[a] - F[b]); S = o.map(i => S[i]); F = o.map(i => F[i]);
      if (Math.abs(F[n] - F[0]) <= tol * (Math.abs(F[0]) + tol) && it > 20) break;
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
      const xr = c.map((v, j) => v + (v - S[n][j])), fr = f(xr);
      if (fr < F[0]) { const xe = c.map((v, j) => v + 2 * (v - S[n][j])), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else { const xc = fr < F[n] ? c.map((v, j) => v + 0.5 * (xr[j] - v)) : c.map((v, j) => v + 0.5 * (S[n][j] - v)), fc = f(xc);
        if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; } else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); } } }
    }
    const o = F.indexOf(Math.min(...F)); return {x: S[o], f: F[o]};
  }
  function numGrad(f, x, h = 1e-5) { return x.map((_, i) => { const a = x.slice(), b = x.slice(), e = h * Math.max(1, Math.abs(x[i])); a[i] += e; b[i] -= e; return (f(a) - f(b)) / (2 * e); }); }
  function bfgs(f, x0, {maxIter = 300, gtol = 1e-6} = {}) {
    let x = x0.slice(), fx = f(x), g = numGrad(f, x), n = x.length, H = eye(n);
    for (let it = 0; it < maxIter; it++) {
      if (Math.max(...g.map(Math.abs)) < gtol) break;
      const d = mv(H, g).map(v => -v); let a = 1, xn, fn; const gd = dot(g, d);
      if (gd >= 0) { H = eye(n); continue; }
      for (let ls = 0; ls < 40; ls++) { xn = x.map((v, i) => v + a * d[i]); fn = f(xn); if (ok(fn) && fn <= fx + 1e-4 * a * gd) break; a *= 0.5; }
      if (!ok(fn) || fn > fx) break;
      const gn = numGrad(f, xn), s = xn.map((v, i) => v - x[i]), y = gn.map((v, i) => v - g[i]), sy = dot(s, y);
      if (sy > 1e-12) { const Hy = mv(H, y), yHy = dot(y, Hy); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i][j] += ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy; }
      const conv = Math.abs(fx - fn) < 1e-12 * (1 + Math.abs(fx)); x = xn; fx = fn; g = gn; if (conv) break;
    }
    return {x, f: fx};
  }
  function hessian(f, x) { const n = x.length, H = zeros(n, n), f0 = f(x), h = x.map(v => 1e-4 * Math.max(1, Math.abs(v)));
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const e = (a, b) => { const z = x.slice(); z[i] += a; z[j] += b; return f(z); };
      H[i][j] = H[j][i] = i === j ? (e(h[i], 0) - 2 * f0 + e(-h[i], 0)) / (h[i] * h[i]) : (e(h[i], h[j]) - e(h[i], -h[j]) - e(-h[i], h[j]) + e(-h[i], -h[j])) / (4 * h[i] * h[j]); }
    return H; }

  /* ---------- OLS ---------- */
  // X: n×k rows (include a column of 1s for an intercept). opts.se: 'classic' | 'hc1' | 'hac' (Newey–West, opts.lags) | 'cluster' (opts.groups)
  function ols(y, X, names, opts = {}) {
    const n = y.length, k = X[0].length, Xt = T(X), XtX = mul(Xt, X), XtXi = inv(XtX);
    if (!XtXi) throw new Error('The regressors are perfectly collinear (for example a dummy for every category plus an intercept, or the same variable twice). Drop one.');
    const coef = mv(XtXi, mv(Xt, y)), fit = X.map(r => dot(r, coef)), res = y.map((v, i) => v - fit[i]), df = n - k;
    if (df <= 0) throw new Error(`Only ${n} observations for ${k} coefficients. Use fewer variables or more data.`);
    const ssr = dot(res, res), my = mean(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), hasC = X.every(r => r[0] === 1);
    const r2 = hasC ? 1 - ssr / sst : 1 - ssr / dot(y, y), adjR2 = 1 - (1 - r2) * (n - (hasC ? 1 : 0)) / df, s2 = ssr / df;
    let cov;
    if (opts.se === 'hc1') { const M = zeros(k, k); for (let i = 0; i < n; i++) { const e2 = res[i] ** 2; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) M[a][b] += e2 * X[i][a] * X[i][b]; } cov = mul(mul(XtXi, M), XtXi).map(r => r.map(v => v * n / df)); }
    else if (opts.se === 'hac') { const L = opts.lags ?? Math.floor(4 * (n / 100) ** (2 / 9)), M = zeros(k, k);
      for (let l = 0; l <= L; l++) { const w = l === 0 ? 1 : 1 - l / (L + 1); for (let i = l; i < n; i++) { const e = res[i] * res[i - l]; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const v = w * e * X[i][a] * X[i - l][b]; M[a][b] += v; if (l > 0) M[b][a] += v; } } }
      cov = mul(mul(XtXi, M), XtXi); }
    else if (opts.se === 'cluster' && opts.groups) { const g = new Map(); opts.groups.forEach((c, i) => { if (!g.has(c)) g.set(c, new Array(k).fill(0)); const u = g.get(c); for (let a = 0; a < k; a++) u[a] += X[i][a] * res[i]; });
      const M = zeros(k, k); g.forEach(u => { for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) M[a][b] += u[a] * u[b]; }); const G = g.size, c = G / (G - 1) * (n - 1) / df; cov = mul(mul(XtXi, M), XtXi).map(r => r.map(v => v * c)); }
    else cov = XtXi.map(r => r.map(v => v * s2));
    const se = cov.map((r, i) => Math.sqrt(Math.max(r[i], 0))), t = coef.map((b, i) => b / se[i]), p = t.map(v => tP2(v, df)), tc = tInv(0.975, df);
    const ll = -n / 2 * (Math.log(2 * Math.PI) + Math.log(ssr / n) + 1);
    // overall F (Wald with the chosen covariance)
    let F = null, Fp = null; const idx = [...Array(k).keys()].filter(i => !(hasC && i === 0));
    if (idx.length) { const b = idx.map(i => coef[i]), V = idx.map(i => idx.map(j => cov[i][j])), Vi = inv(V); if (Vi) { F = dot(b, mv(Vi, b)) / idx.length; Fp = fP(F, idx.length, df); } }
    let dw = 0; for (let i = 1; i < n; i++) dw += (res[i] - res[i - 1]) ** 2; dw /= ssr;
    return {coef, se, t, p, ci: coef.map((b, i) => [b - tc * se[i], b + tc * se[i]]), fit, res, n, k, df, r2, adjR2, F, Fp, s: Math.sqrt(s2), ssr, sst, ll, aic: -2 * ll + 2 * k, bic: -2 * ll + Math.log(n) * k, hqic: -2 * ll + 2 * Math.log(Math.log(n)) * k, dw, XtXi, cov, names: names || coef.map((_, i) => 'x' + i), hasC, seType: opts.se || 'classic'};
  }
  /* classical-assumption tests on a fitted OLS */
  function diagnostics(m, X, y, {bgLags = null} = {}) {
    const n = m.n, k = m.k, e = m.res, e2 = e.map(v => v * v), out = {};
    // normality: Jarque–Bera
    const S = skew(e), K = kurt(e), jb = n / 6 * (S * S + (K - 3) ** 2 / 4); out.jb = {stat: jb, p: chi2P(jb, 2), skew: S, kurt: K};
    // heteroskedasticity: Breusch–Pagan (Koenker, studentized) and White
    const Xc = m.hasC ? X : X.map(r => [1, ...r]), aux = Z => { try { const f = ols(e2, Z); return f.r2; } catch (er) { return null; } };
    const rbp = aux(Xc); if (ok(rbp)) out.bp = {stat: n * rbp, df: Xc[0].length - 1, p: chi2P(n * rbp, Xc[0].length - 1)};
    const base = Xc.map(r => r.slice(1)), q = base[0].length, W = Xc.map((r, i) => { const z = r.slice(); for (let a = 0; a < q; a++) for (let b = a; b < q; b++) z.push(base[i][a] * base[i][b]); return z; });
    // drop duplicate / constant columns (e.g. squared dummies)
    const keep = [0]; for (let j = 1; j < W[0].length; j++) { const c = W.map(r => r[j]), v = variance(c); if (v < 1e-14) continue; if (keep.some(kk => kk > 0 && Math.abs(corr(c, W.map(r => r[kk]))) > 0.9999999)) continue; keep.push(j); }
    if (keep.length < n - 1) { const Wk = W.map(r => keep.map(j => r[j])), rw = aux(Wk); if (ok(rw)) out.white = {stat: n * rw, df: keep.length - 1, p: chi2P(n * rw, keep.length - 1)}; }
    // functional form: Ramsey RESET with fitted^2 and fitted^3
    try { const Z = X.map((r, i) => [...r, m.fit[i] ** 2, m.fit[i] ** 3]), f2 = ols(y, Z), Fv = ((m.ssr - f2.ssr) / 2) / (f2.ssr / f2.df); out.reset = {stat: Fv, df1: 2, df2: f2.df, p: fP(Fv, 2, f2.df)}; } catch (er) {}
    // autocorrelation: Durbin–Watson and Breusch–Godfrey
    out.dw = m.dw; const L = bgLags || Math.min(Math.max(1, Math.round(n ** (1 / 3))), 12);
    try { const Z = X.map((r, i) => { const z = r.slice(); for (let l = 1; l <= L; l++) z.push(i - l >= 0 ? e[i - l] : 0); return z; }), f3 = ols(e, Z.map(r => m.hasC ? r : [1, ...r])), lm = n * f3.r2; out.bg = {stat: lm, df: L, p: chi2P(lm, L)}; } catch (er) {}
    out.lb = ljungBox(e, Math.min(10, Math.floor(n / 5)));
    // multicollinearity: VIF and condition number
    const cols = [...Array(k).keys()].filter(i => !(m.hasC && i === 0));
    out.vif = cols.map(j => { if (cols.length < 2) return 1; try { const Z = X.map(r => [1, ...cols.filter(c => c !== j).map(c => r[c])]), f = ols(X.map(r => r[j]), Z); return 1 / Math.max(1e-12, 1 - f.r2); } catch (er) { return Infinity; } });
    const Xs = X.map(r => r.map(v => v)), norms = T(Xs).map(c => Math.sqrt(dot(c, c))), Xn = Xs.map(r => r.map((v, j) => v / (norms[j] || 1))), ev = eigSym(mul(T(Xn), Xn)).values; out.cond = Math.sqrt(Math.max(...ev) / Math.max(1e-300, Math.min(...ev)));
    // mean of residuals (zero with an intercept)
    out.meanRes = mean(e);
    return out;
  }
  function corr(a, b) { const ma = mean(a), mb = mean(b); let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); x += (a[i] - ma) ** 2; y += (b[i] - mb) ** 2; } return x && y ? s / Math.sqrt(x * y) : 0; }

  /* ---------- time-series tools ---------- */
  function acf(x, nlags) { const n = x.length, m = mean(x); let c0 = 0; for (const v of x) c0 += (v - m) ** 2; const out = [1]; for (let k = 1; k <= nlags; k++) { let s = 0; for (let t = k; t < n; t++) s += (x[t] - m) * (x[t - k] - m); out.push(s / c0); } return out; }
  function pacf(x, nlags) { const r = acf(x, nlags), out = [1]; let phi = []; for (let k = 1; k <= nlags; k++) { let num = r[k], den = 1; for (let j = 1; j < k; j++) { num -= phi[j - 1] * r[k - j]; den -= phi[j - 1] * r[j]; } const pk = num / den, np = phi.map((v, j) => v - pk * phi[k - 2 - j]); np.push(pk); phi = np; out.push(pk); } return out; }
  function ljungBox(x, lags, dfAdj = 0) { const n = x.length, r = acf(x, lags); let q = 0; for (let k = 1; k <= lags; k++) q += r[k] ** 2 / (n - k); q *= n * (n + 2); const df = Math.max(1, lags - dfAdj); return {stat: q, df, p: chi2P(q, df), lags}; }
  const diff = (x, d = 1, s = 1) => { let a = x.slice(); for (let i = 0; i < d; i++) a = a.map((v, t) => t >= s && ok(v) && ok(a[t - s]) ? v - a[t - s] : null); return a; };
  /* MacKinnon (1994/2010) approximate p-values and critical values; N = number of I(1) series (1 for ADF) */
  const MK = {
    star: {n: [-1.04, -1.53, -2.68], c: [-1.61, -2.62, -3.13], ct: [-2.89, -3.19, -3.5]}, min: {n: [-19.04, -19.62, -21.21], c: [-18.83, -18.86, -23.48], ct: [-16.18, -21.15, -25.37]}, max: {n: [Infinity, 1.51, 0.86], c: [2.74, 0.92, 0.55], ct: [0.7, 0.63, 0.71]},
    small: {c: [[2.1659, 1.4412, 0.038269], [2.92, 1.5012, 0.039796], [3.4699, 1.4856, 0.03164]], ct: [[3.2512, 1.6047, 0.049588], [3.6646, 1.5419, 0.036448], [4.0983, 1.5173, 0.029898]], n: [[0.6344, 1.2378, 0.032496], [1.9129, 1.3857, 0.035322], [2.7648, 1.4502, 0.034186]]},
    large: {c: [[1.7339, 0.93202, -0.12745, -0.010368], [2.1945, 0.64695, -0.29198, -0.042377], [2.5893, 0.45168, -0.36529, -0.050074]], ct: [[2.5261, 0.61654, -0.37956, -0.060285], [2.85, 0.5272, -0.36622, -0.051695], [3.221, 0.5255, -0.32685, -0.041501]], n: [[0.4797, 0.93557, -0.06999, 0.033066], [1.5578, 0.8558, -0.2083, -0.033549], [2.2268, 0.68093, -0.32362, -0.054448]]},
    crit: {c: [[[-3.43035, -6.5393, -16.786, -79.433], [-2.86154, -2.8903, -4.234, -40.04], [-2.56677, -1.5384, -2.809, 0]], [[-3.89644, -10.9519, -33.527, 0], [-3.33613, -6.1101, -6.823, 0], [-3.04445, -4.2412, -2.72, 0]], [[-4.29374, -14.4354, -33.195, 47.433], [-3.74066, -8.5632, -10.852, 27.982], [-3.45218, -6.2143, -3.718, 0]]],
      ct: [[[-3.95877, -9.0531, -28.428, -134.155], [-3.41049, -4.3904, -9.036, -45.374], [-3.12705, -2.5856, -3.925, -22.38]], [[-4.32762, -15.4387, -35.679, 0], [-3.78057, -9.5106, -12.074, 0], [-3.49631, -7.0815, -7.538, 21.892]], [[-4.66305, -18.7688, -49.793, 104.244], [-4.1189, -11.8922, -19.031, 77.332], [-3.83511, -9.0723, -8.504, 35.403]]],
      n: [[[-2.56574, -2.2358, -3.627, 0], [-1.941, -0.2686, -3.365, 31.223], [-1.61682, 0.2656, -2.714, 25.364]]]}};
  function mackinnonP(stat, reg = 'c', N = 1) { const i = N - 1; if (stat > MK.max[reg][i]) return 1; if (stat < MK.min[reg][i]) return 0; const c = stat <= MK.star[reg][i] ? MK.small[reg][i] : MK.large[reg][i]; let v = 0; for (let j = c.length - 1; j >= 0; j--) v = v * stat + c[j]; return normCdf(v); }
  function mackinnonCrit(reg = 'c', N = 1, nobs = Infinity) { const tbl = (MK.crit[reg] || MK.crit.c)[Math.min(N, (MK.crit[reg] || MK.crit.c).length) - 1]; return tbl.map(c => c[0] + c[1] / nobs + c[2] / nobs ** 2 + c[3] / nobs ** 3); }
  /* Augmented Dickey–Fuller, lag length by AIC/BIC (as statsmodels.adfuller) */
  function adf(x0, {reg = 'c', maxlag = null, autolag = 'AIC', N = 1} = {}) {
    const x = x0.filter(ok), nobs = x.length; if (nobs < 12) return null;
    const ntrend = reg === 'ct' ? 2 : reg === 'c' ? 1 : 0;
    let ml = maxlag ?? Math.ceil(12 * (nobs / 100) ** 0.25); ml = Math.min(Math.floor(nobs / 2) - ntrend - 1, ml); if (ml < 0) return null;
    const dx = x.slice(1).map((v, i) => v - x[i]);
    const design = (L, start) => { const Y = [], X = []; for (let t = start; t < dx.length; t++) { const r = [x[t]]; for (let l = 1; l <= L; l++) r.push(dx[t - l]); if (ntrend >= 1) r.push(1); if (ntrend === 2) r.push(t + 1); X.push(r); Y.push(dx[t]); } return {Y, X}; };
    let L = ml;
    if (autolag) { let best = Infinity; for (let l = 0; l <= ml; l++) { const {Y, X} = design(l, ml), f = ols(Y, X), ic = autolag === 'BIC' ? f.bic : f.aic; if (ic < best - 1e-12) { best = ic; L = l; } } }
    const {Y, X} = design(L, L), f = ols(Y, X), stat = f.t[0];
    const cv = mackinnonCrit(reg, N, Y.length);
    return {stat, p: mackinnonP(stat, reg, N), lags: L, nobs: Y.length, crit: {'1%': cv[0], '5%': cv[1], '10%': cv[2]}, reg};
  }
  /* KPSS (stationarity null), Bartlett kernel; lags 'legacy' = int(12*(n/100)^(1/4)) */
  function kpss(x0, {reg = 'c', lags = null} = {}) {
    const x = x0.filter(ok), n = x.length; if (n < 12) return null;
    const e = reg === 'ct' ? ols(x, x.map((_, i) => [1, i + 1])).res : x.map(v => v - mean(x));
    const L = lags ?? Math.ceil(12 * (n / 100) ** 0.25); let s = 0; const S = []; for (const v of e) { s += v; S.push(s); }
    let lr = dot(e, e) / n; for (let l = 1; l <= L; l++) { let c = 0; for (let t = l; t < n; t++) c += e[t] * e[t - l]; lr += 2 * (1 - l / (L + 1)) * c / n; }
    const stat = dot(S, S) / (n * n * lr), cv = reg === 'ct' ? [0.119, 0.146, 0.176, 0.216] : [0.347, 0.463, 0.574, 0.739], pv = [0.10, 0.05, 0.025, 0.01];
    let p; if (stat < cv[0]) p = 0.1; else if (stat > cv[3]) p = 0.01; else { for (let i = 0; i < 3; i++) if (stat <= cv[i + 1]) { p = pv[i] + (stat - cv[i]) / (cv[i + 1] - cv[i]) * (pv[i + 1] - pv[i]); break; } }
    return {stat, p, lags: L, crit: {'10%': cv[0], '5%': cv[1], '1%': cv[3]}, reg, pBound: stat < cv[0] ? '>' : stat > cv[3] ? '<' : ''};
  }

  /* ---------- panel data ---------- */
  // rows: [{u: unit, t: time, y, x: [..]}]; returns pooled, FE (entity, optionally two-way), RE (Swamy–Arora), Hausman, F test, BP LM
  function panel(rows, names, {twoWay = false, cluster = true} = {}) {
    const k = names.length, n = rows.length, units = [...new Set(rows.map(r => r.u))], N = units.length, times = [...new Set(rows.map(r => r.t))];
    if (N < 2) throw new Error('Panel models need at least two units (companies, sectors, countries…).');
    const by = new Map(units.map(u => [u, rows.filter(r => r.u === u)])), Ti = units.map(u => by.get(u).length);
    const grp = rows.map(r => r.u), y = rows.map(r => r.y), X = rows.map(r => r.x);
    const pooled = ols(y, X.map(x => [1, ...x]), ['const', ...names], cluster ? {se: 'cluster', groups: grp} : {});
    // within transformation
    const um = new Map(units.map(u => { const rs = by.get(u); return [u, {y: mean(rs.map(r => r.y)), x: names.map((_, j) => mean(rs.map(r => r.x[j])))}]; }));
    const gm = {y: mean(y), x: names.map((_, j) => mean(X.map(x => x[j])))};
    let tm = null; if (twoWay) tm = new Map(times.map(t => { const rs = rows.filter(r => r.t === t); return [t, {y: mean(rs.map(r => r.y)), x: names.map((_, j) => mean(rs.map(r => r.x[j])))}]; }));
    const yw = rows.map(r => r.y - um.get(r.u).y + (twoWay ? -tm.get(r.t).y + gm.y : 0)), Xw = rows.map(r => r.x.map((v, j) => v - um.get(r.u).x[j] + (twoWay ? -tm.get(r.t).x[j] + gm.x[j] : 0)));
    const keepCols = names.map((_, j) => variance(Xw.map(x => x[j])) > 1e-12); if (!keepCols.some(Boolean)) throw new Error('Every regressor is constant within units, so fixed effects cannot estimate any slope.');
    const kn = names.filter((_, j) => keepCols[j]), Xw2 = Xw.map(x => x.filter((_, j) => keepCols[j]));
    const fe0 = ols(yw, Xw2, kn), dfFE = n - N - kn.length - (twoWay ? times.length - 1 : 0), s2 = fe0.ssr / dfFE;
    const feCov = cluster ? (() => { const f = ols(yw, Xw2, kn, {se: 'cluster', groups: grp}); return f.cov.map(r => r.map(v => v * fe0.df / (fe0.df - 1))); })() : fe0.XtXi.map(r => r.map(v => v * s2));   // Stata xtreg-style small-sample factor
    const feSe = feCov.map((r, i) => Math.sqrt(r[i])), feT = fe0.coef.map((b, i) => b / feSe[i]), dft = cluster ? N - 1 : dfFE;
    const ybar = mean(yw), sstW = yw.reduce((s, v) => s + (v - ybar) ** 2, 0);
    const fe = {coef: fe0.coef, se: feSe, t: feT, p: feT.map(v => tP2(v, dft)), names: kn, r2within: 1 - fe0.ssr / sstW, ssr: fe0.ssr, df: dfFE, s2, cov: feCov, n, N};
    fe.alpha = units.map(u => ({u, a: um.get(u).y - dot(um.get(u).x.filter((_, j) => keepCols[j]), fe0.coef)}));
    // F test: all unit effects = 0 (pooled OLS vs FE)
    const pooledPlain = ols(y, X.map(x => [1, ...x])), dfF1 = N - 1, Fu = ((pooledPlain.ssr - fe0.ssr) / dfF1) / (fe0.ssr / dfFE); fe.Ftest = {stat: Fu, df1: dfF1, df2: dfFE, p: fP(Fu, dfF1, dfFE)};
    // random effects (Swamy–Arora)
    const bx = units.map(u => [1, ...um.get(u).x]), byv = units.map(u => um.get(u).y); let re = null, haus = null, lm = null;
    try {
      const be = ols(byv, bx), sigE = s2, Th = N / Ti.reduce((s, t) => s + 1 / t, 0), sigU = Math.max(0, be.ssr / (N - k - 1) - sigE / Th);
      const theta = new Map(units.map((u, i) => [u, 1 - Math.sqrt(sigE / (Ti[i] * sigU + sigE))]));
      const yr = rows.map(r => r.y - theta.get(r.u) * um.get(r.u).y), Xr = rows.map(r => [1 - theta.get(r.u), ...r.x.map((v, j) => v - theta.get(r.u) * um.get(r.u).x[j])]);
      const r0 = ols(yr, Xr, ['const', ...names], cluster ? {se: 'cluster', groups: grp} : {});
      re = {...r0, sigma_u: Math.sqrt(sigU), sigma_e: Math.sqrt(sigE), rho: sigU / (sigU + sigE), theta: [...theta.values()]};
      // Hausman on the slopes both models estimate
      const idx = kn.map(nm => names.indexOf(nm)), b = fe0.coef.map((v, i) => v - r0.coef[idx[i] + 1]);
      const Vfe = fe0.XtXi.map(r => r.map(v => v * s2)), Vre = idx.map(i => idx.map(j => ols(yr, Xr).cov[i + 1][j + 1])), Vd = Vfe.map((r, i) => r.map((v, j) => v - Vre[i][j])), Vi = inv(Vd);
      if (Vi) { const H = dot(b, mv(Vi, b)); haus = {stat: H, df: b.length, p: chi2P(Math.abs(H), b.length)}; }
      // Breusch–Pagan LM for random effects vs pooled
      const e = pooledPlain.res; let num = 0; units.forEach(u => { let s = 0; rows.forEach((r, i) => { if (r.u === u) s += e[i]; }); num += s * s; }); const Tb = n / N, LM = n / (2 * (Tb - 1)) * (num / dot(e, e) - 1) ** 2; lm = {stat: LM, df: 1, p: chi2P(LM, 1)};
    } catch (er) { re = {error: er.message}; }
    return {pooled, fe, re, hausman: haus, bplm: lm, n, N, T: times.length, balanced: Ti.every(t => t === Ti[0])};
  }

  /* ---------- distributions: fitting by maximum likelihood ---------- */
  const DISTS = {
    normal: {label: 'Normal', k: 2, fit: x => { const m = mean(x), s = sd(x, 0); return [m, s]; }, pdf: (v, [m, s]) => normPdf((v - m) / s) / s, cdf: (v, [m, s]) => normCdf((v - m) / s), names: ['mean', 'sd']},
    t: {label: "Student's t", k: 3, names: ['location', 'scale', 'df'], pdf: (v, [m, s, nu]) => { const z = (v - m) / s; return Math.exp(lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - (nu + 1) / 2 * Math.log(1 + z * z / nu)) / s; }, cdf: (v, [m, s, nu]) => tCdf((v - m) / s, nu),
      fit: x => { const m0 = median(x), s0 = sd(x) * 0.8; const f = p => { const [m, ls, lnu] = p, s = Math.exp(ls), nu = Math.exp(lnu) + 0.5; let ll = 0; for (const v of x) ll += Math.log(DISTS.t.pdf(v, [m, s, nu]) + 1e-300); return -ll; }; const r = nelderMead(f, [m0, Math.log(s0), Math.log(5)]); return [r.x[0], Math.exp(r.x[1]), Math.exp(r.x[2]) + 0.5]; }},
    laplace: {label: 'Laplace', k: 2, names: ['location', 'scale'], fit: x => { const m = median(x); return [m, mean(x.map(v => Math.abs(v - m)))]; }, pdf: (v, [m, b]) => Math.exp(-Math.abs(v - m) / b) / (2 * b), cdf: (v, [m, b]) => v < m ? 0.5 * Math.exp((v - m) / b) : 1 - 0.5 * Math.exp(-(v - m) / b)},
    logistic: {label: 'Logistic', k: 2, names: ['location', 'scale'], pdf: (v, [m, s]) => { const z = Math.exp(-(v - m) / s); return z / (s * (1 + z) ** 2); }, cdf: (v, [m, s]) => 1 / (1 + Math.exp(-(v - m) / s)),
      fit: x => { const f = p => { let ll = 0; const s = Math.exp(p[1]); for (const v of x) ll += Math.log(DISTS.logistic.pdf(v, [p[0], s]) + 1e-300); return -ll; }, r = nelderMead(f, [mean(x), Math.log(sd(x) * Math.sqrt(3) / Math.PI)]); return [r.x[0], Math.exp(r.x[1])]; }},
    cauchy: {label: 'Cauchy', k: 2, names: ['location', 'scale'], pdf: (v, [m, s]) => 1 / (Math.PI * s * (1 + ((v - m) / s) ** 2)), cdf: (v, [m, s]) => 0.5 + Math.atan((v - m) / s) / Math.PI,
      fit: x => { const f = p => { let ll = 0; const s = Math.exp(p[1]); for (const v of x) ll += Math.log(DISTS.cauchy.pdf(v, [p[0], s])); return -ll; }, r = nelderMead(f, [median(x), Math.log((quantile(x, .75) - quantile(x, .25)) / 2 || 1)]); return [r.x[0], Math.exp(r.x[1])]; }},
    lognormal: {label: 'Lognormal', k: 2, pos: true, names: ['mu (log)', 'sigma (log)'], fit: x => { const l = x.map(Math.log); return [mean(l), sd(l, 0)]; }, pdf: (v, [m, s]) => v > 0 ? normPdf((Math.log(v) - m) / s) / (s * v) : 0, cdf: (v, [m, s]) => v > 0 ? normCdf((Math.log(v) - m) / s) : 0},
    exponential: {label: 'Exponential', k: 1, pos: true, names: ['rate'], fit: x => [1 / mean(x)], pdf: (v, [l]) => v >= 0 ? l * Math.exp(-l * v) : 0, cdf: (v, [l]) => v >= 0 ? 1 - Math.exp(-l * v) : 0},
    gamma: {label: 'Gamma', k: 2, pos: true, names: ['shape', 'scale'], pdf: (v, [a, b]) => v > 0 ? Math.exp((a - 1) * Math.log(v) - v / b - lgamma(a) - a * Math.log(b)) : 0, cdf: (v, [a, b]) => v > 0 ? gammaP(a, v / b) : 0,
      fit: x => { const m = mean(x), s = Math.log(m) - mean(x.map(Math.log)); let a = (3 - s + Math.sqrt((s - 3) ** 2 + 24 * s)) / (12 * s); for (let i = 0; i < 50; i++) { const dg = digamma(a), tg = trigamma(a), f = Math.log(a) - dg - s, fp = 1 / a - tg; const na = a - f / fp; if (!(na > 0)) break; if (Math.abs(na - a) < 1e-12) { a = na; break; } a = na; } return [a, m / a]; }},
    weibull: {label: 'Weibull', k: 2, pos: true, names: ['shape', 'scale'], pdf: (v, [c, l]) => v > 0 ? (c / l) * (v / l) ** (c - 1) * Math.exp(-((v / l) ** c)) : 0, cdf: (v, [c, l]) => v > 0 ? 1 - Math.exp(-((v / l) ** c)) : 0,
      fit: x => { const f = p => { const c = Math.exp(p[0]), l = Math.exp(p[1]); let ll = 0; for (const v of x) ll += Math.log(DISTS.weibull.pdf(v, [c, l]) + 1e-300); return -ll; }, r = nelderMead(f, [Math.log(1.2), Math.log(mean(x))]); return [Math.exp(r.x[0]), Math.exp(r.x[1])]; }},
  };
  function digamma(x) { let r = 0; while (x < 6) { r -= 1 / x; x += 1; } const f = 1 / (x * x); return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132)))); }
  function trigamma(x) { let r = 0; while (x < 6) { r += 1 / (x * x); x += 1; } const f = 1 / (x * x); return r + 1 / x + f / 2 + (1 / x) * f * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30))); }
  function ksP(D, n) { const en = Math.sqrt(n), l = (en + 0.12 + 0.11 / en) * D; let s = 0; for (let j = 1; j <= 100; j++) { const t = 2 * (-1) ** (j - 1) * Math.exp(-2 * j * j * l * l); s += t; if (Math.abs(t) < 1e-12) break; } return Math.min(1, Math.max(0, s)); }
  function fitDists(x0, which) {
    const x = x0.filter(ok), n = x.length, pos = x.every(v => v > 0), out = [];
    for (const key of which || Object.keys(DISTS)) { const D = DISTS[key]; if (D.pos && !pos) { out.push({key, label: D.label, skipped: 'needs all values > 0'}); continue; }
      try { const p = D.fit(x); let ll = 0; for (const v of x) ll += Math.log(D.pdf(v, p) + 1e-300); const s = x.slice().sort((a, b) => a - b); let Dks = 0; s.forEach((v, i) => { const F = D.cdf(v, p); Dks = Math.max(Dks, F - i / n, (i + 1) / n - F); });
        out.push({key, label: D.label, params: p, names: D.names, ll, aic: -2 * ll + 2 * D.k, bic: -2 * ll + Math.log(n) * D.k, ks: Dks, ksp: ksP(Dks, n)}); } catch (er) { out.push({key, label: D.label, skipped: er.message}); } }
    return out.sort((a, b) => (a.aic ?? Infinity) - (b.aic ?? Infinity));
  }
  function distQuantile(key, p, params, lo, hi) { const D = DISTS[key]; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (D.cdf(m, params) < p) lo = m; else hi = m; } return (lo + hi) / 2; }

  return {ok, sum, mean, variance, sd, quantile, median, skew, kurt, zeros, eye, T, mul, mv, dot, inv, solve, chol, logdet, eigSym, kron, corr,
    lgamma, ibeta, gammaP, normCdf, normPdf, normInv, tCdf, tP2, fP, chi2P, tInv, chi2Inv, erfc, nelderMead, bfgs, numGrad, hessian,
    ols, diagnostics, acf, pacf, ljungBox, diff, adf, kpss, mackinnonP, mackinnonCrit, panel, DISTS, fitDists, distQuantile, ksP};
})();
if (typeof module !== 'undefined') module.exports = ST;
