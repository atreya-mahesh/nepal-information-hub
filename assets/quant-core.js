/* Nepal Information Hub — maths core
   Technical indicators, statistics, a safe expression language, OLS, nonlinear least squares, Monte Carlo.
   Everything works on plain arrays; missing values are null. No eval() anywhere. */
'use strict';
const QC = (() => {
  const ok = v => typeof v === 'number' && isFinite(v);
  const mean = a => { let s = 0, n = 0; for (const x of a) if (ok(x)) { s += x; n++; } return n ? s / n : null; };
  const sd = (a, ddof = 1) => { const m = mean(a); if (m == null) return null; let s = 0, n = 0; for (const x of a) if (ok(x)) { s += (x - m) ** 2; n++; } return n > ddof ? Math.sqrt(s / (n - ddof)) : null; };
  const quantile = (a, q) => { const v = a.filter(ok).sort((x, y) => x - y); if (!v.length) return null; const p = (v.length - 1) * q, i = Math.floor(p); return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (p - i); };

  /* ---------------- technical indicators ---------------- */
  function sma(a, n) { const o = Array(a.length).fill(null); let s = 0, c = 0; const q = [];
    for (let i = 0; i < a.length; i++) { q.push(a[i]); if (ok(a[i])) { s += a[i]; c++; } if (q.length > n) { const r = q.shift(); if (ok(r)) { s -= r; c--; } } if (q.length === n && c === n) o[i] = s / n; } return o; }
  function ema(a, n) { const o = Array(a.length).fill(null), k = 2 / (n + 1); let e = null, seed = [];
    for (let i = 0; i < a.length; i++) { const x = a[i]; if (!ok(x)) { o[i] = e; continue; } if (e == null) { seed.push(x); if (seed.length === n) { e = mean(seed); o[i] = e; } } else { e = x * k + e * (1 - k); o[i] = e; } } return o; }
  function rstd(a, n) { const o = Array(a.length).fill(null); for (let i = n - 1; i < a.length; i++) { const w = a.slice(i - n + 1, i + 1); if (w.every(ok)) o[i] = sd(w, 1); } return o; }
  function rmax(a, n) { return a.map((_, i) => { if (i < n - 1) return null; const w = a.slice(i - n + 1, i + 1).filter(ok); return w.length ? Math.max(...w) : null; }); }
  function rmin(a, n) { return a.map((_, i) => { if (i < n - 1) return null; const w = a.slice(i - n + 1, i + 1).filter(ok); return w.length ? Math.min(...w) : null; }); }
  function rsi(a, n = 14) { const o = Array(a.length).fill(null); let g = 0, l = 0, cnt = 0, prev = null, ag = null, al = null;
    for (let i = 0; i < a.length; i++) { const x = a[i]; if (!ok(x)) continue; if (prev == null) { prev = x; continue; }
      const ch = x - prev; prev = x; const up = Math.max(ch, 0), dn = Math.max(-ch, 0);
      if (ag == null) { g += up; l += dn; cnt++; if (cnt === n) { ag = g / n; al = l / n; o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } }
      else { ag = (ag * (n - 1) + up) / n; al = (al * (n - 1) + dn) / n; o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } } return o; }
  function macd(a, f = 12, s = 26, sig = 9) { const ef = ema(a, f), es = ema(a, s); const m = a.map((_, i) => ok(ef[i]) && ok(es[i]) ? ef[i] - es[i] : null);
    const first = m.findIndex(ok); const sg = Array(a.length).fill(null); if (first >= 0) { const e = ema(m.slice(first), sig); e.forEach((v, j) => sg[first + j] = v); }
    return {macd: m, signal: sg, hist: m.map((v, i) => ok(v) && ok(sg[i]) ? v - sg[i] : null)}; }
  function bollinger(a, n = 20, k = 2) { const m = sma(a, n), s = rstd(a, n); return {mid: m, up: m.map((v, i) => ok(v) && ok(s[i]) ? v + k * s[i] : null), lo: m.map((v, i) => ok(v) && ok(s[i]) ? v - k * s[i] : null)}; }
  function atr(h, l, c, n = 14) { const tr = c.map((_, i) => { if (!ok(h[i]) || !ok(l[i])) return null; const pc = i ? c[i - 1] : null; return ok(pc) ? Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc)) : h[i] - l[i]; });
    const o = Array(c.length).fill(null); let a = null, seed = []; tr.forEach((t, i) => { if (!ok(t)) return; if (a == null) { seed.push(t); if (seed.length === n) { a = mean(seed); o[i] = a; } } else { a = (a * (n - 1) + t) / n; o[i] = a; } }); return o; }
  function stoch(h, l, c, n = 14, d = 3) { const hh = rmax(h, n), ll = rmin(l, n); const k = c.map((x, i) => ok(hh[i]) && ok(ll[i]) && hh[i] !== ll[i] ? (x - ll[i]) / (hh[i] - ll[i]) * 100 : null); return {k, d: sma(k, d)}; }
  function obv(c, v) { const o = []; let s = 0; c.forEach((x, i) => { if (i && ok(x) && ok(c[i - 1]) && ok(v[i])) s += x > c[i - 1] ? v[i] : x < c[i - 1] ? -v[i] : 0; o.push(s); }); return o; }
  const simpleRet = a => a.map((x, i) => i && ok(x) && ok(a[i - 1]) && a[i - 1] !== 0 ? x / a[i - 1] - 1 : null);
  const logRet = a => a.map((x, i) => i && ok(x) && ok(a[i - 1]) && a[i - 1] > 0 && x > 0 ? Math.log(x / a[i - 1]) : null);
  function drawdown(a) { let pk = -Infinity; return a.map(x => { if (!ok(x)) return null; pk = Math.max(pk, x); return x / pk - 1; }); }
  function corr(a, b) { const p = []; for (let i = 0; i < Math.min(a.length, b.length); i++) if (ok(a[i]) && ok(b[i])) p.push([a[i], b[i]]); if (p.length < 3) return null;
    const mx = mean(p.map(x => x[0])), my = mean(p.map(x => x[1])); let sxy = 0, sx = 0, sy = 0; p.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sx += (x - mx) ** 2; sy += (y - my) ** 2; }); return sx && sy ? sxy / Math.sqrt(sx * sy) : null; }
  function beta(ra, rm) { const p = []; for (let i = 0; i < ra.length; i++) if (ok(ra[i]) && ok(rm[i])) p.push([ra[i], rm[i]]); if (p.length < 10) return null;
    const ma = mean(p.map(x => x[0])), mm = mean(p.map(x => x[1])); let c = 0, v = 0; p.forEach(([a, m]) => { c += (a - ma) * (m - mm); v += (m - mm) ** 2; }); return v ? c / v : null; }
  const pivots = (h, l, c) => { const p = (h + l + c) / 3; return {p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l), r3: h + 2 * (p - l), s3: l - 2 * (h - p)}; };

  /* ---------------- distributions ---------------- */
  function gammaln(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function betacf(a, b, x) { const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break; } return h; }
  function ibeta(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  const tPval = (t, df) => ok(t) && df > 0 ? ibeta(df / (df + t * t), df / 2, 0.5) : null;          // two-sided
  const fPval = (F, d1, d2) => ok(F) && F >= 0 ? ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2) : null;
  function normInv(p) { // Acklam
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
      b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
      c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
      d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00], pl = 0.02425;
    let q, r; if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  function tCrit(df, p = 0.975) { let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; (1 - tPval(m, df) / 2) < p ? lo = m : hi = m; } return (lo + hi) / 2; }

  /* ---------------- linear algebra ---------------- */
  function inv(A) { const n = A.length, M = A.map((r, i) => [...r, ...Array.from({length: n}, (_, j) => i === j ? 1 : 0)]);
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
    return M.map(r => r.slice(n)); }
  const xtx = X => { const k = X[0].length, o = Array.from({length: k}, () => Array(k).fill(0)); for (const r of X) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) o[i][j] += r[i] * r[j]; return o; };
  const xty = (X, y) => { const k = X[0].length, o = Array(k).fill(0); X.forEach((r, n) => { for (let i = 0; i < k; i++) o[i] += r[i] * y[n]; }); return o; };
  const mv = (M, v) => M.map(r => r.reduce((s, x, j) => s + x * v[j], 0));

  function ols(y, X, names) {
    const n = y.length, k = X[0].length; if (n <= k) throw new Error(`Only ${n} complete observations for ${k} coefficients. Use a longer sample or fewer terms.`);
    const XtXi = inv(xtx(X)); if (!XtXi) throw new Error('The regressors are perfectly collinear (one term is a copy or combination of others). Remove one.');
    const b = mv(XtXi, xty(X, y)), fit = X.map(r => r.reduce((s, x, j) => s + x * b[j], 0)), res = y.map((v, i) => v - fit[i]);
    const sse = res.reduce((s, e) => s + e * e, 0), ym = mean(y), sst = y.reduce((s, v) => s + (v - ym) ** 2, 0), df = n - k, s2 = sse / df;
    const hasC = names.includes('(Intercept)'), r2 = hasC ? 1 - sse / sst : 1 - sse / y.reduce((s, v) => s + v * v, 0);
    const se = XtXi.map((r, i) => Math.sqrt(Math.max(0, r[i] * s2))), tv = b.map((v, i) => se[i] ? v / se[i] : null), pv = tv.map(t => tPval(t, df));
    const kk = hasC ? k - 1 : k, F = kk > 0 ? ((sst - sse) / kk) / s2 : null;
    let dw = 0; for (let i = 1; i < n; i++) dw += (res[i] - res[i - 1]) ** 2; dw /= sse || 1;
    const ll = -n / 2 * (Math.log(2 * Math.PI) + Math.log(sse / n) + 1);
    return {coef: b, se, t: tv, p: pv, names, fit, res, n, k, df, r2, adjR2: 1 - (1 - r2) * (n - (hasC ? 1 : 0)) / df, s: Math.sqrt(s2), rmse: Math.sqrt(sse / n), F, Fp: F != null ? fPval(F, kk, df) : null, dw,
      aic: -2 * ll + 2 * k, bic: -2 * ll + k * Math.log(n), XtXi, mae: mean(res.map(Math.abs))};
  }

  /* Levenberg–Marquardt for y ≈ f(p) */
  function lm(fn, y, p0, maxIt = 200) {
    let p = p0.slice(), lambda = 1e-3; const n = y.length, k = p.length;
    const resid = q => { const f = fn(q); return y.map((v, i) => v - f[i]); };
    let r = resid(p), sse = r.reduce((s, e) => s + (ok(e) ? e * e : 1e30), 0);
    for (let it = 0; it < maxIt; it++) {
      const J = Array.from({length: n}, () => Array(k).fill(0));
      for (let j = 0; j < k; j++) { const h = 1e-6 * Math.max(1, Math.abs(p[j])), q = p.slice(); q[j] += h; const f1 = fn(q), f0 = y.map((v, i) => v - r[i]); for (let i = 0; i < n; i++) J[i][j] = (f1[i] - f0[i]) / h; }
      const A = xtx(J), g = xty(J, r); let improved = false;
      for (let tries = 0; tries < 12; tries++) {
        const Al = A.map((row, i) => row.map((v, j) => i === j ? v * (1 + lambda) + 1e-12 : v)), Ai = inv(Al); if (!Ai) { lambda *= 10; continue; }
        const dp = mv(Ai, g), q = p.map((v, j) => v + dp[j]), rq = resid(q), s2 = rq.reduce((s, e) => s + (ok(e) ? e * e : 1e30), 0);
        if (s2 < sse) { const rel = (sse - s2) / (sse || 1); p = q; r = rq; sse = s2; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (rel < 1e-12) it = maxIt; break; }
        lambda *= 10;
      }
      if (!improved) break;
    }
    const J = Array.from({length: n}, () => Array(k).fill(0));
    for (let j = 0; j < k; j++) { const h = 1e-6 * Math.max(1, Math.abs(p[j])), q = p.slice(); q[j] += h; const f1 = fn(q), f0 = y.map((v, i) => v - r[i]); for (let i = 0; i < n; i++) J[i][j] = (f1[i] - f0[i]) / h; }
    const df = n - k, s2 = sse / Math.max(1, df), Ci = inv(xtx(J)), se = Ci ? Ci.map((row, i) => Math.sqrt(Math.max(0, row[i] * s2))) : p.map(() => null);
    const ym = mean(y), sst = y.reduce((s, v) => s + (v - ym) ** 2, 0);
    return {p, se, t: p.map((v, i) => se[i] ? v / se[i] : null), pv: p.map((v, i) => se[i] ? tPval(v / se[i], df) : null), sse, r2: 1 - sse / sst, rmse: Math.sqrt(sse / n), s: Math.sqrt(s2), df, n, res: r, fit: y.map((v, i) => v - r[i])};
  }

  /* Monte Carlo (geometric Brownian motion) */
  function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function gbm(S0, mu, sigma, h, paths) {
    const pct = [0.05, 0.25, 0.5, 0.75, 0.95], bands = pct.map(() => []), finals = [], stepVals = Array.from({length: h}, () => new Float64Array(paths));
    for (let p = 0; p < paths; p++) { let s = S0; for (let t = 0; t < h; t++) { s *= Math.exp(mu - 0.5 * sigma * sigma + sigma * randn()); stepVals[t][p] = s; } finals.push(s); }
    for (let t = 0; t < h; t++) { const a = Array.from(stepVals[t]).sort((x, y) => x - y); pct.forEach((q, j) => bands[j].push(a[Math.floor(q * (paths - 1))])); }
    return {bands, finals, pct};
  }

  /* ---------------- expression language ---------------- */
  const FN_HELP = [
    ['Arithmetic', '+  -  *  /  ^  ( )   comparisons > < >= <= == != give 1 or 0'],
    ['log(x), ln(x), log10(x), exp(x), sqrt(x), abs(x), sign(x), round(x,d)', 'element by element'],
    ['lag(x,k), lead(x,k)', 'value k periods before / after (default 1)'],
    ['diff(x,k), pct(x,k)', 'change and % change over k periods'],
    ['ret(x), logret(x)', 'simple and log return from the previous period'],
    ['sma(x,n), ema(x,n), std(x,n), rmax(x,n), rmin(x,n), zscore(x,n)', 'rolling window statistics'],
    ['rsi(x,n), cumsum(x), cumprod(x), drawdown(x)', 'indicators and running totals'],
    ['mean(x), sd(x), min(x), max(x), sum(x), first(x), last(x), count(x)', 'one number over the sample (min/max with 2 args are element by element)'],
    ['iff(cond, a, b), max2(a,b), min2(a,b), clip(x,lo,hi)', 'conditions and bounds'],
    ['ffill(x), fill(x, v)', 'carry last value forward / replace gaps with v'],
    ['t, n, pi, e', 't = 0,1,2,… period index; n = sample length'],
  ];
  function tokenize(s) {
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|&&|\|\||[-+*/^(),<>~=!]))/y;
    const out = []; let m; re.lastIndex = 0;
    while (re.lastIndex < s.length) { const at = re.lastIndex; m = re.exec(s); if (!m) { if (/^\s*$/.test(s.slice(at))) break; throw new Error(`Could not read "${s.slice(at, at + 12).trim()}" at position ${at + 1}`); }
      if (m[1]) out.push({t: 'num', v: parseFloat(m[1])}); else if (m[2]) out.push({t: 'id', v: m[2]}); else if (m[3]) out.push({t: 'op', v: m[3]}); }
    return out;
  }
  function parse(src) {
    const tk = tokenize(src); let i = 0;
    const peek = () => tk[i], next = () => tk[i++];
    const expect = v => { const t = next(); if (!t || t.v !== v) throw new Error(`Expected "${v}"` + (t ? ` but found "${t.v}"` : ' at the end')); };
    const BP = {'||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '^': 8};
    function nud(t) {
      if (!t) throw new Error('The equation ends too early');
      if (t.t === 'num') return {t: 'num', v: t.v};
      if (t.t === 'id') { if (peek() && peek().v === '(') { next(); const args = []; if (peek() && peek().v !== ')') { do { args.push(expr(0)); } while (peek() && peek().v === ',' && next()); } expect(')'); return {t: 'call', f: t.v, args}; } return {t: 'var', n: t.v}; }
      if (t.v === '(') { const e = expr(0); expect(')'); return e; }
      if (t.v === '-') return {t: 'un', op: '-', a: expr(7)};
      if (t.v === '+') return expr(7);
      if (t.v === '!') return {t: 'un', op: '!', a: expr(7)};
      throw new Error(`Unexpected "${t.v}"`);
    }
    function expr(rbp) { let left = nud(next());
      while (peek() && peek().t === 'op' && BP[peek().v] > rbp) { const op = next().v; left = {t: 'bin', op, a: left, b: expr(op === '^' ? BP[op] - 1 : BP[op])}; } return left; }
    const e = expr(0); if (i < tk.length) throw new Error(`Unexpected "${tk[i].v}" after the end of the expression`); return e;
  }
  const idsIn = (node, set = new Set()) => { if (!node) return set; if (node.t === 'var') set.add(node.n); if (node.t === 'call') node.args.forEach(a => idsIn(a, set)); if (node.a) idsIn(node.a, set); if (node.b) idsIn(node.b, set); return set; };
  const CONSTS = {pi: Math.PI, e: Math.E};
  const FUNCS = new Set(['log', 'ln', 'log10', 'exp', 'sqrt', 'abs', 'sign', 'round', 'floor', 'ceil', 'sin', 'cos', 'lag', 'lead', 'diff', 'pct', 'ret', 'logret', 'sma', 'ema', 'std', 'rmax', 'rmin', 'zscore', 'rsi', 'cumsum', 'cumprod', 'drawdown', 'mean', 'sd', 'min', 'max', 'sum', 'first', 'last', 'count', 'iff', 'max2', 'min2', 'clip', 'ffill', 'fill']);
  function evaluate(node, env) {
    const n = env.n, isA = Array.isArray, vec = x => isA(x) ? x : Array(n).fill(x);
    const map1 = (x, f) => isA(x) ? x.map(v => ok(v) ? (r => ok(r) ? r : null)(f(v)) : null) : (ok(x) ? f(x) : null);
    const map2 = (x, y, f) => { if (!isA(x) && !isA(y)) return ok(x) && ok(y) ? f(x, y) : null; const a = vec(x), b = vec(y); return a.map((v, i) => ok(v) && ok(b[i]) ? (r => ok(r) ? r : null)(f(v, b[i])) : null); };
    const num = (a, d) => { if (a === undefined) return d; const v = ev(a); if (isA(v)) throw new Error('Window sizes and lags must be plain numbers'); return v; };
    function ev(nd) {
      switch (nd.t) {
        case 'num': return nd.v;
        case 'var': if (nd.n === 't') return env.t; if (nd.n === 'n') return n; if (nd.n in env.params) return env.params[nd.n]; if (nd.n in env.vars) return env.vars[nd.n]; if (nd.n in CONSTS) return CONSTS[nd.n];
          throw new Error(`Unknown name "${nd.n}". Define it as a variable above, or check the spelling (names are case-sensitive).`);
        case 'un': { const v = ev(nd.a); return nd.op === '-' ? map1(v, x => -x) : map1(v, x => x ? 0 : 1); }
        case 'bin': { const a = ev(nd.a), b = ev(nd.b);
          const F = {'+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => y === 0 ? null : x / y, '^': (x, y) => Math.pow(x, y), '>': (x, y) => +(x > y), '<': (x, y) => +(x < y), '>=': (x, y) => +(x >= y), '<=': (x, y) => +(x <= y), '==': (x, y) => +(x === y), '!=': (x, y) => +(x !== y), '&&': (x, y) => +(!!x && !!y), '||': (x, y) => +(!!x || !!y)}[nd.op];
          return map2(a, b, F); }
        case 'call': {
          const f = nd.f, A = nd.args, x = () => ev(A[0]);
          const need = k => { if (A.length < k) throw new Error(`${f}() needs ${k} argument${k > 1 ? 's' : ''}`); };
          switch (f) {
            case 'log': case 'ln': need(1); return map1(x(), v => v > 0 ? Math.log(v) : null);
            case 'log10': need(1); return map1(x(), v => v > 0 ? Math.log10(v) : null);
            case 'exp': need(1); return map1(x(), Math.exp); case 'sqrt': need(1); return map1(x(), v => v >= 0 ? Math.sqrt(v) : null);
            case 'abs': need(1); return map1(x(), Math.abs); case 'sign': need(1); return map1(x(), Math.sign);
            case 'floor': return map1(x(), Math.floor); case 'ceil': return map1(x(), Math.ceil); case 'sin': return map1(x(), Math.sin); case 'cos': return map1(x(), Math.cos);
            case 'round': { const d = num(A[1], 0), p = 10 ** d; return map1(x(), v => Math.round(v * p) / p); }
            case 'lag': case 'lead': { need(1); const k = (f === 'lead' ? -1 : 1) * num(A[1], 1), v = vec(x()); return v.map((_, i) => { const j = i - k; return j >= 0 && j < v.length && ok(v[j]) ? v[j] : null; }); }
            case 'diff': { need(1); const k = num(A[1], 1), v = vec(x()); return v.map((y, i) => i >= k && ok(y) && ok(v[i - k]) ? y - v[i - k] : null); }
            case 'pct': { need(1); const k = num(A[1], 1), v = vec(x()); return v.map((y, i) => i >= k && ok(y) && ok(v[i - k]) && v[i - k] !== 0 ? (y / v[i - k] - 1) * 100 : null); }
            case 'ret': need(1); return simpleRet(vec(x())); case 'logret': need(1); return logRet(vec(x()));
            case 'sma': need(2); return sma(vec(x()), num(A[1])); case 'ema': need(2); return ema(vec(x()), num(A[1]));
            case 'std': need(2); return rstd(vec(x()), num(A[1])); case 'rmax': need(2); return rmax(vec(x()), num(A[1])); case 'rmin': need(2); return rmin(vec(x()), num(A[1]));
            case 'zscore': { need(2); const v = vec(x()), w = num(A[1]), m = sma(v, w), s = rstd(v, w); return v.map((y, i) => ok(y) && ok(m[i]) && s[i] ? (y - m[i]) / s[i] : null); }
            case 'rsi': need(1); return rsi(vec(x()), num(A[1], 14));
            case 'ffill': { need(1); let l = null; return vec(x()).map(v => ok(v) ? (l = v) : l); }
            case 'fill': { need(2); const a = vec(x()), f = ev(A[1]); const b = isA(f) ? f : a.map(() => f); return a.map((v, i) => ok(v) ? v : (ok(b[i]) ? b[i] : null)); }
            case 'cumsum': { need(1); let s = 0; return vec(x()).map(v => ok(v) ? (s += v) : null); }
            case 'cumprod': { need(1); let s = 1; return vec(x()).map(v => ok(v) ? (s *= v) : null); }
            case 'drawdown': need(1); return drawdown(vec(x()));
            case 'mean': need(1); return mean(vec(x())); case 'sd': need(1); return sd(vec(x()));
            case 'sum': need(1); return vec(x()).reduce((s, v) => s + (ok(v) ? v : 0), 0);
            case 'count': need(1); return vec(x()).filter(ok).length;
            case 'first': need(1); return vec(x()).find(ok) ?? null; case 'last': need(1); return [...vec(x())].reverse().find(ok) ?? null;
            case 'min': case 'max': { need(1); if (A.length > 1) return map2(x(), ev(A[1]), f === 'min' ? Math.min : Math.max); const v = vec(x()).filter(ok); return v.length ? (f === 'min' ? Math.min(...v) : Math.max(...v)) : null; }
            case 'max2': need(2); return map2(x(), ev(A[1]), Math.max); case 'min2': need(2); return map2(x(), ev(A[1]), Math.min);
            case 'clip': { need(3); const lo = ev(A[1]), hi = ev(A[2]); return map2(map2(x(), lo, Math.max), hi, Math.min); }
            case 'iff': { need(3); const c = vec(ev(A[0])), a = vec(ev(A[1])), b = vec(ev(A[2])); return c.map((v, i) => v == null ? null : (v ? a[i] : b[i])); }
            default: throw new Error(`Unknown function "${f}()". See the function list below the equation box.`);
          }
        }
      }
    }
    return ev(node);
  }
  function splitTop(s, ch) { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ch && d === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(x => x.trim()).filter(x => x !== ''); }
  function splitTerms(s) { // split on top-level + and - (keeping the sign with the term)
    const out = []; let d = 0, cur = '';
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(') d++; if (c === ')') d--;
      if ((c === '+' || c === '-') && d === 0 && cur.trim() !== '' && !/[eE]$/.test(cur.trim()) && !/[*/^(,<>=]$/.test(cur.trim())) { out.push(cur.trim()); cur = c === '-' ? '-' : ''; } else cur += c; }
    if (cur.trim()) out.push(cur.trim()); return out; }

  return {ok, mean, sd, quantile, sma, ema, rstd, rmax, rmin, rsi, macd, bollinger, atr, stoch, obv, simpleRet, logRet, drawdown, corr, beta, pivots,
    tPval, fPval, normInv, tCrit, inv, ols, lm, gbm, parse, evaluate, idsIn, FUNCS, CONSTS, FN_HELP, splitTop, splitTerms};
})();
