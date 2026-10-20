/* Nepal Information Hub — quantitative finance models II ("Other modelling")
   Market microstructure (Hawkes process, limit-order-book matching engine, market impact), Hill tail estimator,
   Ornstein–Uhlenbeck / pairs trading, Johansen cointegration and VECM, derivatives (Black–Scholes–Merton and Greeks,
   Garman–Kohlhagen, binomial trees, finite differences, Monte Carlo exotics, Heston, Merton jump-diffusion),
   fixed income (bond analytics, Vasicek, CIR), credit (Merton structural model, CDS hazard rates, Gaussian/t copula,
   CVA), machine learning (logistic, kNN, naive Bayes, CART, random forest, AdaBoost, linear SVM, ridge/lasso,
   k-means, Gaussian mixtures) and a VaR/ES suite. Depends on ST (stats-core.js). */
'use strict';
const QF = (() => {
  const S = typeof ST !== 'undefined' ? ST : require('./stats-core.js');
  const ok = S.ok, N = S.normCdf, n = S.normPdf;
  function rng(seed = 1) { let s = seed >>> 0; const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    u.n = () => { let a = 0; while (!a) a = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); };
    u.gam = k => { if (k < 1) return u.gam(1 + k) * Math.pow(u() || 1e-12, 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = u.n(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const w = u(); if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
    u.pois = lam => { let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= u(); } while (p > L); return k - 1; }; return u; }

  /* ===================== Hawkes process (exponential kernel) ===================== */
  // lambda(t) = mu + sum_{ti<t} alpha * exp(-beta (t - ti)); branching ratio n = alpha / beta
  function hawkesLL(t, T, mu, a, b) { let A = 0, ll = 0, prev = null; for (let i = 0; i < t.length; i++) { if (prev !== null) A = Math.exp(-b * (t[i] - prev)) * (1 + A); const lam = mu + a * A; if (!(lam > 0)) return -Infinity; ll += Math.log(lam); prev = t[i]; }
    let comp = mu * T; for (const ti of t) comp += a / b * (1 - Math.exp(-b * (T - ti))); return ll - comp; }
  function hawkesFit(t0, T) {
    const t = t0.slice().sort((x, y) => x - y), nEv = t.length; if (nEv < 10) throw new Error('Need at least 10 events.'); T = T ?? t[nEv - 1];
    const f = p => { const mu = Math.exp(p[0]), b = Math.exp(p[2]), a = b / (1 + Math.exp(-p[1])) * 0.999; const v = -hawkesLL(t, T, mu, a, b); return ok(v) ? v : 1e12; };
    const rate = nEv / T; let best = null;
    for (const nb of [0.2, 0.5, 0.8]) for (const bb of [0.1, 1, 5].map(x => x * rate * 5)) { const p0 = [Math.log(rate * (1 - nb)), Math.log(nb / (1 - nb)), Math.log(bb)], r = S.nelderMead(f, p0, {maxIter: 3000, tol: 1e-12}); if (!best || r.f < best.f) best = r; }
    const bf = S.bfgs(f, best.x); if (bf.f < best.f) best = bf;
    const mu = Math.exp(best.x[0]), b = Math.exp(best.x[2]), a = b / (1 + Math.exp(-best.x[1])) * 0.999, ll = -best.f;
    let se = [null, null, null]; try { const g = th => -hawkesLL(t, T, th[0], th[1], th[2]), Hi = S.inv(S.hessian(g, [mu, a, b])); if (Hi) se = Hi.map((r, i) => r[i] > 0 ? Math.sqrt(r[i]) : null); } catch (e) {}
    // time-rescaling residuals (should be Exp(1) if the model fits)
    const res = []; let A = 0; for (let i = 1; i < nEv; i++) { const d = t[i] - t[i - 1]; res.push(mu * d + a / b * (1 - Math.exp(-b * d)) * (1 + A)); A = Math.exp(-b * d) * (1 + A); }
    const sorted = res.slice().sort((x, y) => x - y); let D = 0; sorted.forEach((v, i) => { const F = 1 - Math.exp(-v); D = Math.max(D, Math.abs(F - (i + 1) / sorted.length), Math.abs(F - i / sorted.length)); });
    const llPois = nEv * Math.log(nEv / T) - nEv, lr = 2 * (ll - llPois);
    return {mu, alpha: a, beta: b, se, n: a / b, ll, aic: -2 * ll + 6, T, events: nEv, ks: D, ksp: S.ksP(D, sorted.length), lrPois: lr, lrP: S.chi2P(lr, 2), halfLife: Math.log(2) / b, endoShare: a / b, baseline: mu / (1 - a / b), res, times: t};
  }
  function hawkesIntensity(t, mu, a, b, grid) { const out = []; let j = 0, A = 0, last = null; for (const g of grid) { while (j < t.length && t[j] < g) { A = (last === null ? 0 : A * Math.exp(-b * (t[j] - last))) + 1; last = t[j]; j++; } out.push(mu + (last === null ? 0 : a * A * Math.exp(-b * (g - last)))); } return out; }
  function hawkesSim(mu, a, b, T, seed = 3) { const u = rng(seed), ev = []; let t = 0, A = 0, lastT = 0;
    while (t < T) { const lamBar = mu + a * A * Math.exp(-b * (t - lastT)); t += -Math.log(u() || 1e-12) / lamBar; if (t >= T) break; const lam = mu + a * A * Math.exp(-b * (t - lastT)); if (u() * lamBar <= lam) { A = A * Math.exp(-b * (t - lastT)) + 1; lastT = t; ev.push(t); } } return ev; }

  /* ===================== limit order book: price-time priority matching engine ===================== */
  class Book {
    constructor(tick = 0.1) { this.tick = tick; this.bids = new Map(); this.asks = new Map(); this.seq = 0; this.trades = []; this.orders = new Map(); }
    rp(p) { return Math.round(p / this.tick) * this.tick; }
    bestBid() { let b = -Infinity; for (const [p, q] of this.bids) if (q.length && p > b) b = p; return b === -Infinity ? null : b; }
    bestAsk() { let a = Infinity; for (const [p, q] of this.asks) if (q.length && p < a) a = p; return a === Infinity ? null : a; }
    mid() { const b = this.bestBid(), a = this.bestAsk(); return b !== null && a !== null ? (a + b) / 2 : b ?? a; }
    levels(side, k = 10) { const isB = side === 'bid' || side === 'buy', m = isB ? this.bids : this.asks, ps = [...m.keys()].filter(p => m.get(p).length).sort((x, y) => isB ? y - x : x - y).slice(0, k); return ps.map(p => ({p: +p.toFixed(4), q: m.get(p).reduce((s, o) => s + o.q, 0), n: m.get(p).length})); }
    // match an incoming order against the opposite side (FIFO within each price level)
    match(side, qty, limit, ts) { const book = side === 'buy' ? this.asks : this.bids, fills = []; let rem = qty;
      while (rem > 1e-9) { const best = side === 'buy' ? this.bestAsk() : this.bestBid(); if (best === null) break; if (limit !== null && (side === 'buy' ? best > limit + 1e-9 : best < limit - 1e-9)) break;
        const q = book.get(best); while (rem > 1e-9 && q.length) { const o = q[0], x = Math.min(rem, o.q); o.q -= x; rem -= x; fills.push({p: best, q: x, maker: o.id}); this.trades.push({ts, p: best, q: x, side}); if (o.q <= 1e-9) { q.shift(); this.orders.delete(o.id); } } if (!q.length) book.delete(best); }
      return {fills, rem}; }
    limit(side, price, qty, ts = 0) { price = this.rp(price); const {fills, rem} = this.match(side, qty, price, ts); let id = null; if (rem > 1e-9) { id = ++this.seq; const m = side === 'buy' ? this.bids : this.asks; if (!m.has(price)) m.set(price, []); const o = {id, side, p: price, q: rem, ts}; m.get(price).push(o); this.orders.set(id, o); } return {id, fills}; }
    market(side, qty, ts = 0) { return this.match(side, qty, null, ts); }
    cancel(id) { const o = this.orders.get(id); if (!o) return false; const m = o.side === 'buy' ? this.bids : this.asks, q = m.get(o.p); const i = q.indexOf(o); if (i >= 0) q.splice(i, 1); if (!q.length) m.delete(o.p); this.orders.delete(id); return true; }
    clone() { const b = new Book(this.tick); for (const [side, src, dst] of [['buy', this.bids, b.bids], ['sell', this.asks, b.asks]]) for (const [p, q] of src) dst.set(p, q.map(o => { const c = {...o}; b.orders.set(c.id, c); return c; })); b.seq = this.seq; return b; }
  }
  // simulate a zero-intelligence order flow (Poisson limit / market / cancel) around a reference price
  // simulate a zero-intelligence (Santa Fe / Smith–Farmer) order flow: Poisson limit orders, market orders and
  // cancellations proportional to resting orders; the book settles at about targetOrders resting orders
  function lobSimulate({mid = 500, tick = 0.1, events = 20000, depthQty = 200, levels = 30, pLimit = 0.55, pMarket = 0.1, mktSize = 150, offsetMean = 4, targetOrders = 240, seed = 5} = {}) {
    const u = rng(seed), B = new Book(tick); for (let i = 1; i <= levels; i++) { B.limit('buy', mid - i * tick, depthQty * (0.6 + 0.8 * u()), 0); B.limit('sell', mid + i * tick, depthQty * (0.6 + 0.8 * u()), 0); }
    const mids = [], spreads = [], delta = pLimit / targetOrders;
    for (let e = 1; e <= events; e++) { const nO = B.orders.size, tot = pLimit + pMarket + delta * nO, r = u() * tot, side = u() < 0.5 ? 'buy' : 'sell', m = B.mid() ?? mid;
      if (r < pLimit) { const k = Math.floor(-Math.log(u() || 1e-9) * offsetMean) + 1, ref = side === 'buy' ? (B.bestAsk() ?? m) - k * tick : (B.bestBid() ?? m) + k * tick; B.limit(side, ref, depthQty * (0.3 + u()), e); }
      else if (r < pLimit + pMarket) B.market(side, mktSize * Math.exp(0.8 * u.n() - 0.32), e);
      else { const ids = [...B.orders.keys()]; B.cancel(ids[Math.floor(u() * ids.length)]); }
      if (B.bestBid() === null) B.limit('buy', m - tick, depthQty, e); if (B.bestAsk() === null) B.limit('sell', m + tick, depthQty, e);
      if (e % 50 === 0) { mids.push(B.mid()); spreads.push(B.bestAsk() - B.bestBid()); } }
    return {book: B, mids, spreads};
  }
  // walk the book with market orders of increasing size: execution price, slippage and the square-root law fit
  function impactCurve(B, side, sizes) { const mid = B.mid(); return sizes.map(Q => { const c = B.clone(), r = c.market(side, Q), filled = r.fills.reduce((s, f) => s + f.q, 0), vwap = filled ? r.fills.reduce((s, f) => s + f.p * f.q, 0) / filled : null, worst = r.fills.length ? r.fills[r.fills.length - 1].p : null;
    return {Q, filled, vwap, worst, slipBps: vwap ? (side === 'buy' ? vwap / mid - 1 : 1 - vwap / mid) * 1e4 : null, levels: new Set(r.fills.map(f => f.p)).size, unfilled: r.rem, newMid: c.mid()}; }); }

  /* ===================== Hill tail-index estimator ===================== */
  function hill(losses0, {kFrac = 0.05, nTotal = null} = {}) { const x = losses0.filter(v => ok(v) && v > 0).sort((a, b) => b - a), n = x.length; if (n < 50) throw new Error('Need at least 50 positive losses.');
    const path = []; for (let k = 5; k < Math.min(n - 1, Math.floor(n * 0.3)); k++) { let s = 0; for (let i = 0; i < k; i++) s += Math.log(x[i] / x[k]); const xi = s / k; path.push({k, alpha: 1 / xi, xi, se: (1 / xi) / Math.sqrt(k)}); }
    const k = Math.max(10, Math.round(n * kFrac)), pt = path.find(p => p.k === k) || path[path.length - 1], u = x[pt.k];
    const NN = nTotal || n, varAt = (p, q) => x[p.k] * Math.pow(p.k / (NN * (1 - q)), 1 / p.alpha), varq = q => varAt(pt, q), esq = q => pt.alpha > 1 ? varq(q) * pt.alpha / (pt.alpha - 1) : Infinity;
    return {n, nTotal: NN, k: pt.k, alpha: pt.alpha, xi: pt.xi, se: pt.se, threshold: u, path, varq, esq, varAt, sorted: x}; }

  /* ===================== Ornstein–Uhlenbeck, pairs trading ===================== */
  function ouFit(x, dt = 1) { const y = x.slice(1), X = x.slice(0, -1).map(v => [1, v]), f = S.ols(y, X), a = f.coef[0], b = f.coef[1];
    if (!(b > 0 && b < 1)) return {a, b, theta: null, mu: null, sigma: null, halfLife: null, f, mr: false};
    const theta = -Math.log(b) / dt, mu = a / (1 - b), sigma = f.s * Math.sqrt(2 * theta / (1 - b * b)), sdEq = sigma / Math.sqrt(2 * theta);
    // the simple Euler mapping ΔX = a + bX : theta ≈ -b/Δt
    const d = S.ols(x.slice(1).map((v, i) => v - x[i]), X), thetaEuler = -d.coef[1] / dt;
    return {a, b, theta, thetaEuler, mu, sigma, sdEq, halfLife: Math.log(2) / theta, halfLifeEuler: Math.log(2) / thetaEuler, f, mr: true, tB: d.t[1], pB: d.p[1]}; }
  function pairsBacktest(spread, {mu, sd, entry = 2, exit = 0.5, stop = 4, maxHold = Infinity, cost = 0.004, longOnly = false} = {}) {
    let pos = 0, held = 0, eq = 1; const curve = [], posArr = [], trades = []; let open = null;
    for (let t = 1; t < spread.length; t++) { const z = (spread[t - 1] - mu) / sd; let np = pos;
      if (pos === 0) { if (z <= -entry) np = 1; else if (z >= entry && !longOnly) np = -1; }
      else { held++; if ((pos === 1 && (z >= -exit || z <= -stop)) || (pos === -1 && (z <= exit || z >= stop)) || held >= maxHold) np = 0; }
      if (np !== pos) { eq *= 1 - cost * Math.abs(np - pos); if (pos !== 0 && open) trades.push({...open, exitT: t - 1, ret: eq / open.eq0 - 1}); if (np !== 0) { open = {entryT: t - 1, side: np, eq0: eq}; held = 0; } else open = null; }
      pos = np; eq *= 1 + pos * (spread[t] - spread[t - 1]); curve.push(eq); posArr.push(pos); }
    return {curve, pos: posArr, trades}; }

  /* ===================== Johansen cointegration and VECM ===================== */
  const JCV = {trace: [[2.7055, 3.8415, 6.6349], [13.4294, 15.4943, 19.9349], [27.0669, 29.7961, 35.4628], [44.4929, 47.8545, 54.6815], [65.8202, 69.8189, 77.8202], [91.109, 95.7542, 104.9637]], max: [[2.7055, 3.8415, 6.6349], [12.2971, 14.2639, 18.52], [18.8928, 21.1314, 25.865], [25.1236, 27.5858, 32.7172], [31.2379, 33.8777, 39.3693], [37.2786, 40.0763, 45.8662]]};
  function johansen(Y, kDiff = 1) {
    const T0 = Y.length, m = Y[0].length; if (m > 6) throw new Error('Up to 6 series.'); const demean = M => { const mu = M[0].map((_, j) => S.mean(M.map(r => r[j]))); return M.map(r => r.map((v, j) => v - mu[j])); };
    const Yd = demean(Y), dY = Yd.slice(1).map((r, t) => r.map((v, j) => v - Yd[t][j]));
    const Z = []; for (let t = kDiff; t < dY.length; t++) { const z = []; for (let l = 1; l <= kDiff; l++) z.push(...dY[t - l]); Z.push(z); }
    const resid = (A, Zm) => { if (!Zm.length || !Zm[0].length) return A; const Zt = S.T(Zm), P = S.inv(S.mul(Zt, Zm)); const B = S.mul(P, S.mul(Zt, A)), F = S.mul(Zm, B); return A.map((r, i) => r.map((v, j) => v - F[i][j])); };
    const Zd = Z.length && Z[0].length ? demean(Z) : Z, R0 = resid(demean(dY.slice(kDiff)), Zd), Rk = resid(demean(Yd.slice(1, Yd.length - kDiff)), Zd), nT = R0.length;
    const Skk = S.mul(S.T(Rk), Rk).map(r => r.map(v => v / nT)), Sk0 = S.mul(S.T(Rk), R0).map(r => r.map(v => v / nT)), S00 = S.mul(S.T(R0), R0).map(r => r.map(v => v / nT));
    const L = S.chol(Skk), Li = S.inv(L), M = S.mul(S.mul(Li, S.mul(S.mul(Sk0, S.inv(S00)), S.T(Sk0))), S.T(Li)), e = S.eigSym(M);
    const lam = e.values.map(v => Math.min(Math.max(v, 0), 0.999999)), beta = S.mul(S.T(Li), e.vectors);  // columns = cointegrating vectors
    const trace = lam.map((_, r) => -nT * lam.slice(r).reduce((s, v) => s + Math.log(1 - v), 0)), maxEig = lam.map(v => -nT * Math.log(1 - v));
    const cvT = lam.map((_, r) => JCV.trace[m - r - 1]), cvM = lam.map((_, r) => JCV.max[m - r - 1]); let rank = 0; while (rank < m && trace[rank] > cvT[rank][1]) rank++;
    return {lam, trace, maxEig, cvT, cvM, rank, beta: beta[0].map((_, j) => beta.map(r => r[j])), nobs: nT};
  }
  function vecm(Y, beta, kDiff = 1) { // ΔY_t = c + α β'Y_{t-1} + Σ Γ ΔY_{t-l} + e  (β given, α and Γ by OLS)
    const m = Y[0].length, r = beta.length, dY = Y.slice(1).map((row, t) => row.map((v, j) => v - Y[t][j])), rows = [], tg = [];
    for (let t = kDiff; t < dY.length; t++) { const ect = beta.map(b => S.dot(b, Y[t])), z = [1, ...ect]; for (let l = 1; l <= kDiff; l++) z.push(...dY[t - l]); rows.push(z); tg.push(dY[t]); }
    const fits = Array.from({length: m}, (_, j) => S.ols(tg.map(x => x[j]), rows)); return {alpha: fits.map(f => f.coef.slice(1, 1 + r)), alphaT: fits.map(f => f.t.slice(1, 1 + r)), alphaP: fits.map(f => f.p.slice(1, 1 + r)), r2: fits.map(f => f.r2), fits}; }

  /* ===================== derivatives ===================== */
  function bs({S: S0, K, T, r, q = 0, sigma, type = 'call'}) { if (T <= 0) { const iv = type === 'call' ? Math.max(S0 - K, 0) : Math.max(K - S0, 0); return {price: iv, delta: type === 'call' ? +(S0 > K) : -(S0 < K), gamma: 0, vega: 0, theta: 0, rho: 0}; }
    const sq = sigma * Math.sqrt(T), d1 = (Math.log(S0 / K) + (r - q + sigma * sigma / 2) * T) / sq, d2 = d1 - sq, dq = Math.exp(-q * T), dr = Math.exp(-r * T);
    if (type === 'call') return {price: S0 * dq * N(d1) - K * dr * N(d2), delta: dq * N(d1), gamma: dq * n(d1) / (S0 * sq), vega: S0 * dq * n(d1) * Math.sqrt(T) / 100, theta: (-S0 * dq * n(d1) * sigma / (2 * Math.sqrt(T)) - r * K * dr * N(d2) + q * S0 * dq * N(d1)) / 365, rho: K * T * dr * N(d2) / 100, d1, d2};
    return {price: K * dr * N(-d2) - S0 * dq * N(-d1), delta: -dq * N(-d1), gamma: dq * n(d1) / (S0 * sq), vega: S0 * dq * n(d1) * Math.sqrt(T) / 100, theta: (-S0 * dq * n(d1) * sigma / (2 * Math.sqrt(T)) + r * K * dr * N(-d2) - q * S0 * dq * N(-d1)) / 365, rho: -K * T * dr * N(-d2) / 100, d1, d2}; }
  const digital = ({S: S0, K, T, r, q = 0, sigma, type = 'call'}) => { const d2 = (Math.log(S0 / K) + (r - q - sigma * sigma / 2) * T) / (sigma * Math.sqrt(T)); return Math.exp(-r * T) * (type === 'call' ? N(d2) : N(-d2)); };
  function impliedVol(price, o) { let lo = 1e-4, hi = 5; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (bs({...o, sigma: m}).price > price) hi = m; else lo = m; } return (lo + hi) / 2; }
  function binomial({S: S0, K, T, r, q = 0, sigma, type = 'call', american = false, steps = 200}) { const dt = T / steps, u = Math.exp(sigma * Math.sqrt(dt)), d = 1 / u, p = (Math.exp((r - q) * dt) - d) / (u - d), df = Math.exp(-r * dt), pay = s => type === 'call' ? Math.max(s - K, 0) : Math.max(K - s, 0);
    let v = Array.from({length: steps + 1}, (_, j) => pay(S0 * u ** j * d ** (steps - j))); for (let i = steps - 1; i >= 0; i--) { const nv = new Array(i + 1); for (let j = 0; j <= i; j++) { const c = df * (p * v[j + 1] + (1 - p) * v[j]); nv[j] = american ? Math.max(c, pay(S0 * u ** j * d ** (i - j))) : c; } v = nv; } return v[0]; }
  function finiteDiff({S: S0, K, T, r, q = 0, sigma, type = 'put', american = false, scheme = 'cn', NS = 200, NT = 400}) {
    if (scheme === 'explicit') { NT = Math.max(NT, Math.ceil(T * (sigma * sigma * NS * NS + r) * 1.1)); }
    const Smax = Math.max(2 * Math.max(K, S0), Math.max(K, S0) * Math.exp(5 * sigma * Math.sqrt(T))), dS = Smax / NS, dt = T / NT, Sg = Array.from({length: NS + 1}, (_, i) => i * dS), pay = Sg.map(s => type === 'call' ? Math.max(s - K, 0) : Math.max(K - s, 0));
    const th = scheme === 'explicit' ? 0 : scheme === 'implicit' ? 1 : 0.5, a = [], b = [], c = [];
    for (let i = 0; i <= NS; i++) { const s2 = sigma * sigma * i * i, rr = (r - q) * i; a[i] = 0.5 * (s2 - rr); b[i] = -(s2 + r); c[i] = 0.5 * (s2 + rr); }
    const stable = scheme !== 'explicit' || dt <= 1 / (sigma * sigma * NS * NS + r + 1e-12); let V = pay.slice();
    for (let n2 = 1; n2 <= NT; n2++) { const tau = n2 * dt, lo = type === 'call' ? 0 : K * Math.exp(-r * tau), hi = type === 'call' ? Smax * Math.exp(-q * tau) - K * Math.exp(-r * tau) : 0;
      const rhs = new Array(NS + 1); for (let i = 1; i < NS; i++) rhs[i] = V[i] + (1 - th) * dt * (a[i] * V[i - 1] + b[i] * V[i] + c[i] * V[i + 1]);
      const Vn = new Array(NS + 1); Vn[0] = american && type === 'put' ? K : lo; Vn[NS] = hi;
      if (th === 0) for (let i = 1; i < NS; i++) Vn[i] = rhs[i];
      else { const A = [], Bd = [], C = [], D = []; for (let i = 1; i < NS; i++) { A.push(-th * dt * a[i]); Bd.push(1 - th * dt * b[i]); C.push(-th * dt * c[i]); D.push(rhs[i]); } D[0] -= A[0] * Vn[0]; D[D.length - 1] -= C[C.length - 1] * Vn[NS];
        for (let i = 1; i < D.length; i++) { const w = A[i] / Bd[i - 1]; Bd[i] -= w * C[i - 1]; D[i] -= w * D[i - 1]; } const x = new Array(D.length); x[D.length - 1] = D[D.length - 1] / Bd[D.length - 1]; for (let i = D.length - 2; i >= 0; i--) x[i] = (D[i] - C[i] * x[i + 1]) / Bd[i]; for (let i = 1; i < NS; i++) Vn[i] = x[i - 1]; }
      if (american) for (let i = 0; i <= NS; i++) Vn[i] = Math.max(Vn[i], pay[i]); V = Vn; }
    const i = Math.min(NS - 1, Math.floor(S0 / dS)), w = (S0 - Sg[i]) / dS; return {price: V[i] * (1 - w) + V[i + 1] * w, grid: Sg, V, stable}; }
  function mcExotic({S: S0, K, T, r, q = 0, sigma, kind = 'asian', type = 'call', barrier = null, steps = 250, paths = 20000, seed = 7}) {
    const u = rng(seed), dt = T / steps, drift = (r - q - sigma * sigma / 2) * dt, vol = sigma * Math.sqrt(dt), df = Math.exp(-r * T), pays = [];
    for (let p = 0; p < paths / 2; p++) { const z = Array.from({length: steps}, () => u.n()); for (const sgn of [1, -1]) { let s = S0, sum = 0, mx = S0, mn = S0, hit = false;
        for (let t = 0; t < steps; t++) { s *= Math.exp(drift + vol * sgn * z[t]); sum += s; mx = Math.max(mx, s); mn = Math.min(mn, s); if (barrier && ((barrier > S0 && s >= barrier) || (barrier < S0 && s <= barrier))) hit = true; }
        const avg = sum / steps; let pay;
        if (kind === 'asian') pay = type === 'call' ? Math.max(avg - K, 0) : Math.max(K - avg, 0);
        else if (kind === 'barrier') pay = hit ? 0 : (type === 'call' ? Math.max(s - K, 0) : Math.max(K - s, 0));
        else if (kind === 'digital') pay = type === 'call' ? +(s > K) : +(s < K);
        else if (kind === 'lookback') pay = type === 'call' ? s - mn : mx - s;
        else pay = type === 'call' ? Math.max(s - K, 0) : Math.max(K - s, 0);
        pays.push(df * pay); } }
    const pairs = []; for (let i = 0; i < pays.length; i += 2) pairs.push((pays[i] + pays[i + 1]) / 2); return {price: S.mean(pays), se: S.sd(pairs) / Math.sqrt(pairs.length)}; }
  function hestonMC({S: S0, K, T, r, q = 0, v0, kappa, theta, xi, rho, type = 'call', steps = 200, paths = 20000, seed = 9, strikes = null}) { const u = rng(seed), dt = T / steps, Ks = strikes || [K], acc = Ks.map(() => 0), sT = [];
    for (let p = 0; p < paths; p++) { let x = Math.log(S0), v = v0; for (let t = 0; t < steps; t++) { const z1 = u.n(), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * u.n(), vp = Math.max(v, 0); x += (r - q - vp / 2) * dt + Math.sqrt(vp * dt) * z1; v += kappa * (theta - vp) * dt + xi * Math.sqrt(vp * dt) * z2; } const s = Math.exp(x); sT.push(s); Ks.forEach((k, i) => acc[i] += type === 'call' ? Math.max(s - k, 0) : Math.max(k - s, 0)); }
    return Ks.map((k, i) => ({K: k, price: Math.exp(-r * T) * acc[i] / paths})); }
  function mertonJumpMC({S: S0, K, T, r, q = 0, sigma, lam, muJ, sigJ, type = 'call', paths = 40000, seed = 11, strikes = null}) { const u = rng(seed), Ks = strikes || [K], kbar = Math.exp(muJ + sigJ * sigJ / 2) - 1, acc = Ks.map(() => 0);
    for (let p = 0; p < paths; p++) { const nJ = u.pois(lam * T); let x = Math.log(S0) + (r - q - lam * kbar - sigma * sigma / 2) * T + sigma * Math.sqrt(T) * u.n(); for (let j = 0; j < nJ; j++) x += muJ + sigJ * u.n(); const s = Math.exp(x); Ks.forEach((k, i) => acc[i] += type === 'call' ? Math.max(s - k, 0) : Math.max(k - s, 0)); }
    return Ks.map((k, i) => ({K: k, price: Math.exp(-r * T) * acc[i] / paths})); }

  /* ===================== fixed income ===================== */
  function bond({face = 100, coupon = 0.1, years = 5, freq = 1, ytm = null, price = null}) { const nP = Math.round(years * freq), c = face * coupon / freq, cf = Array.from({length: nP}, (_, i) => c + (i === nP - 1 ? face : 0)), t = cf.map((_, i) => (i + 1) / freq);
    const pv = y => cf.reduce((s, x, i) => s + x / (1 + y / freq) ** (i + 1), 0);
    if (ytm === null) { let lo = -0.99, hi = 2; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (pv(m) > price) lo = m; else hi = m; } ytm = (lo + hi) / 2; } price = pv(ytm);
    const w = cf.map((x, i) => x / (1 + ytm / freq) ** (i + 1) / price), mac = w.reduce((s, x, i) => s + x * t[i], 0), mod = mac / (1 + ytm / freq), conv = cf.reduce((s, x, i) => s + x * (i + 1) * (i + 2) / (1 + ytm / freq) ** (i + 3), 0) / (price * freq * freq);
    return {price, ytm, macaulay: mac, modified: mod, convexity: conv, dv01: mod * price * 1e-4, cf, t}; }
  function shortRateFit(r, dt, model = 'vasicek') { // r in decimals
    if (model === 'vasicek') { const f = S.ols(r.slice(1), r.slice(0, -1).map(v => [1, v])), a = f.coef[0], b = f.coef[1]; const kappa = -Math.log(b) / dt, theta = a / (1 - b), sigma = f.s * Math.sqrt(2 * kappa / (1 - b * b)); return {model, kappa, theta, sigma, r0: r[r.length - 1], fit: f}; }
    const y = [], X = []; for (let t = 1; t < r.length; t++) { const s = Math.sqrt(Math.max(r[t - 1], 1e-6)); y.push((r[t] - r[t - 1]) / s); X.push([dt / s, -dt * s]); }
    const f = S.ols(y, X), kappa = f.coef[1], theta = f.coef[0] / kappa, sigma = f.s / Math.sqrt(dt); return {model, kappa, theta, sigma, r0: r[r.length - 1], fit: f, feller: 2 * kappa * theta > sigma * sigma}; }
  function zcb(p, T) { const {kappa: k, theta: th, sigma: s, r0} = p; if (p.model === 'vasicek') { const B = (1 - Math.exp(-k * T)) / k, A = (th - s * s / (2 * k * k)) * (B - T) - s * s * B * B / (4 * k); return Math.exp(A - B * r0); }
    const g = Math.sqrt(k * k + 2 * s * s), den = (g + k) * (Math.exp(g * T) - 1) + 2 * g, B = 2 * (Math.exp(g * T) - 1) / den, A = Math.pow(2 * g * Math.exp((k + g) * T / 2) / den, 2 * k * th / (s * s)); return A * Math.exp(-B * r0); }
  function shortRateSim(p, T, steps, paths, seed = 13) { const u = rng(seed), dt = T / steps, out = []; for (let k = 0; k < paths; k++) { let r = p.r0; const path = [r]; for (let i = 0; i < steps; i++) { const dw = Math.sqrt(dt) * u.n(); r += p.kappa * (p.theta - r) * dt + p.sigma * (p.model === 'cir' ? Math.sqrt(Math.max(r, 0)) : 1) * dw; if (p.model === 'cir') r = Math.max(r, 0); path.push(r); } out.push(path); } return out; }

  /* ===================== credit ===================== */
  function mertonCredit({E, sigE, D, r, T = 1}) { // solve asset value V and asset volatility sigV
    const f = ([lv, ls]) => { const V = Math.exp(lv), sV = Math.exp(ls), d1 = (Math.log(V / D) + (r + sV * sV / 2) * T) / (sV * Math.sqrt(T)), d2 = d1 - sV * Math.sqrt(T), e1 = V * N(d1) - D * Math.exp(-r * T) * N(d2) - E, e2 = N(d1) * sV * V - sigE * E; return (e1 / E) ** 2 + (e2 / E) ** 2; };
    const res = S.nelderMead(f, [Math.log(E + D), Math.log(sigE * E / (E + D))], {maxIter: 5000, tol: 1e-16}), V = Math.exp(res.x[0]), sV = Math.exp(res.x[1]), DD = (Math.log(V / D) + (r - sV * sV / 2) * T) / (sV * Math.sqrt(T));
    const Drisky = V - E, Dfree = D * Math.exp(-r * T), spread = Drisky > 0 ? -Math.log(Drisky / Dfree) / T : null;
    return {V, sigV: sV, DD, PD: N(-DD), lev: D / V, debtValue: Drisky, spread, err: res.f}; }
  function cdsHazard({spreadBps, R = 0.4, years = [1, 2, 3, 5, 7, 10]}) { const lam = spreadBps / 1e4 / (1 - R); return {lam, rows: years.map(t => ({t, surv: Math.exp(-lam * t), pd: 1 - Math.exp(-lam * t), pdYear: Math.exp(-lam * (t - 1)) - Math.exp(-lam * t)}))}; }
  function copulaLoss({names = 100, pd = 0.02, lgd = 0.6, rho = 0.2, copula = 'gaussian', nu = 5, sims = 20000, seed = 17, tranches = [[0, 0.03], [0.03, 0.07], [0.07, 0.1], [0.1, 0.15], [0.15, 0.3], [0.3, 1]]}) {
    const u = rng(seed), thr = copula === 'gaussian' ? S.normInv(pd) : (() => { let lo = -50, hi = 50; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (S.tCdf(m, nu) < pd) lo = m; else hi = m; } return (lo + hi) / 2; })(), losses = [];
    for (let s = 0; s < sims; s++) { const M = u.n(), w = copula === 't' ? Math.sqrt(nu / u.gam(nu / 2) / 2) : 1; let d = 0; for (let i = 0; i < names; i++) { const x = (Math.sqrt(rho) * M + Math.sqrt(1 - rho) * u.n()) * w; if (x < thr) d++; } losses.push(d / names * lgd); }
    const sorted = losses.slice().sort((a, b) => a - b), q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return {losses, EL: S.mean(losses), VaR99: q(0.99), VaR999: q(0.999), ES99: S.mean(sorted.filter(l => l >= q(0.99))), tranches: tranches.map(([a, b]) => ({a, b, el: S.mean(losses.map(l => Math.min(Math.max(l - a, 0), b - a) / (b - a)))}))}; }
  function cvaForward({S: S0, K, T, r, sigma, notional = 1, lam, R = 0.4, steps = 20, paths = 5000, seed = 19}) { const u = rng(seed), dt = T / steps, EE = new Array(steps).fill(0);
    for (let p = 0; p < paths; p++) { let s = S0; for (let i = 0; i < steps; i++) { s *= Math.exp((r - sigma * sigma / 2) * dt + sigma * Math.sqrt(dt) * u.n()); const tau = T - (i + 1) * dt, val = notional * (s - K * Math.exp(-r * tau)); EE[i] += Math.max(val, 0) / paths; } }
    let cva = 0; const rows = EE.map((e, i) => { const t = (i + 1) * dt, dPD = Math.exp(-lam * (t - dt)) - Math.exp(-lam * t), c = (1 - R) * e * Math.exp(-r * t) * dPD; cva += c; return {t, EE: e, dPD, contrib: c}; }); return {cva, rows}; }

  /* ===================== machine learning ===================== */
  function logistic(X, y, {l2 = 1e-3, iters = 400} = {}) { const k = X[0].length + 1; let w = new Array(k).fill(0); // Newton / IRLS
    for (let it = 0; it < iters; it++) { const H = Array.from({length: k}, () => new Array(k).fill(0)), g = new Array(k).fill(0); X.forEach((x, i) => { const z = [1, ...x], p = 1 / (1 + Math.exp(-S.dot(w, z))), wt = p * (1 - p); for (let a = 0; a < k; a++) { g[a] += (p - y[i]) * z[a]; for (let b = 0; b < k; b++) H[a][b] += wt * z[a] * z[b]; } });
      for (let a = 1; a < k; a++) { g[a] += l2 * w[a] * X.length; H[a][a] += l2 * X.length; } const step = S.mv(S.inv(H) || S.eye(k), g); w = w.map((v, a) => v - step[a]); if (Math.max(...step.map(Math.abs)) < 1e-8) break; }
    return {w, predict: Xn => Xn.map(x => 1 / (1 + Math.exp(-S.dot(w, [1, ...x]))))}; }
  function knn(X, y, k = 15) { return {predict: Xn => Xn.map(x => { const d = X.map((z, i) => [z.reduce((s, v, j) => s + (v - x[j]) ** 2, 0), y[i]]).sort((a, b) => a[0] - b[0]).slice(0, k); return d.reduce((s, v) => s + v[1], 0) / k; })}; }
  function gaussNB(X, y) { const cls = [0, 1].map(c => { const R = X.filter((_, i) => y[i] === c); return {prior: R.length / X.length, mu: X[0].map((_, j) => S.mean(R.map(r => r[j]))), v: X[0].map((_, j) => S.variance(R.map(r => r[j])) + 1e-9)}; });
    return {predict: Xn => Xn.map(x => { const lp = cls.map(c => Math.log(c.prior) + x.reduce((s, v, j) => s - 0.5 * Math.log(2 * Math.PI * c.v[j]) - (v - c.mu[j]) ** 2 / (2 * c.v[j]), 0)); const m = Math.max(...lp); const e = lp.map(v => Math.exp(v - m)); return e[1] / (e[0] + e[1]); })}; }
  function cart(X, y, {maxDepth = 4, minLeaf = 20, feats = null, u = Math.random, w = null} = {}) { const F = X[0].length; w = w || X.map(() => 1);
    const gini = (s, t) => { if (!t) return 0; const p = s / t; return 1 - p * p - (1 - p) * (1 - p); };
    const build = (idx, d) => { const tw = idx.reduce((s, i) => s + w[i], 0), sw = idx.reduce((s, i) => s + w[i] * y[i], 0), leaf = {p: tw ? sw / tw : 0.5}; if (d >= maxDepth || idx.length < 2 * minLeaf) return leaf;
      let best = null; const fs = feats ? Array.from({length: F}, (_, j) => j).sort(() => u() - 0.5).slice(0, feats) : Array.from({length: F}, (_, j) => j);
      for (const f of fs) { const o = idx.slice().sort((a, b) => X[a][f] - X[b][f]); let lw = 0, ls = 0; for (let k = 0; k < o.length - 1; k++) { const i = o[k]; lw += w[i]; ls += w[i] * y[i]; if (k + 1 < minLeaf || o.length - k - 1 < minLeaf || X[o[k]][f] === X[o[k + 1]][f]) continue; const imp = lw * gini(ls, lw) + (tw - lw) * gini(sw - ls, tw - lw); if (!best || imp < best.imp) best = {imp, f, thr: (X[o[k]][f] + X[o[k + 1]][f]) / 2}; } }
      if (!best || best.imp >= tw * gini(sw, tw) - 1e-12) return leaf; return {f: best.f, thr: best.thr, l: build(idx.filter(i => X[i][best.f] < best.thr), d + 1), r: build(idx.filter(i => X[i][best.f] >= best.thr), d + 1)}; };
    const root = build(X.map((_, i) => i), 0), pr = x => { let nd = root; while (nd.f !== undefined) nd = x[nd.f] < nd.thr ? nd.l : nd.r; return nd.p; }; return {root, predict: Xn => Xn.map(pr), one: pr}; }
  function randomForest(X, y, {trees = 100, maxDepth = 6, minLeaf = 10, seed = 21} = {}) { const u = rng(seed), F = X[0].length, ts = [], imp = new Array(F).fill(0);
    for (let t = 0; t < trees; t++) { const idx = X.map(() => Math.floor(u() * X.length)); const tr = cart(idx.map(i => X[i]), idx.map(i => y[i]), {maxDepth, minLeaf, feats: Math.max(1, Math.round(Math.sqrt(F))), u}); ts.push(tr); const walk = nd => { if (nd.f !== undefined) { imp[nd.f]++; walk(nd.l); walk(nd.r); } }; walk(tr.root); }
    return {predict: Xn => Xn.map(x => S.mean(ts.map(t => t.one(x)))), importance: imp}; }
  function adaboost(X, y, {rounds = 100} = {}) { let w = X.map(() => 1 / X.length); const ys = y.map(v => v ? 1 : -1), H = [];
    for (let r = 0; r < rounds; r++) { const st = cart(X, y, {maxDepth: 1, minLeaf: 5, w}); const pred = X.map(x => st.one(x) >= 0.5 ? 1 : -1); const err = pred.reduce((s, p, i) => s + (p !== ys[i] ? w[i] : 0), 0); if (err >= 0.5 || err <= 0) break; const a = 0.5 * Math.log((1 - err) / err); H.push({st, a}); w = w.map((wi, i) => wi * Math.exp(-a * ys[i] * pred[i])); const s = w.reduce((x, z) => x + z, 0); w = w.map(v => v / s); }
    return {predict: Xn => Xn.map(x => { const f = H.reduce((s, h) => s + h.a * (h.st.one(x) >= 0.5 ? 1 : -1), 0); return 1 / (1 + Math.exp(-2 * f)); })}; }
  function linearSVM(X, y, {lambda = 0.01, epochs = 30, seed = 23} = {}) { const u = rng(seed), k = X[0].length; let w = new Array(k).fill(0), b = 0, t = 0; const ys = y.map(v => v ? 1 : -1);
    for (let e = 0; e < epochs; e++) for (let i = 0; i < X.length; i++) { const j = Math.floor(u() * X.length); t++; const eta = 1 / (lambda * t), m = ys[j] * (S.dot(w, X[j]) + b); w = w.map(v => v * (1 - eta * lambda)); if (m < 1) { w = w.map((v, a) => v + eta * ys[j] * X[j][a]); b += eta * ys[j] * 0.1; } }
    return {w, b, predict: Xn => Xn.map(x => 1 / (1 + Math.exp(-2 * (S.dot(w, x) + b))))}; }
  function elasticNet(X, y, {lambda = 0.01, l1 = 1, iters = 500} = {}) { const n2 = X.length, k = X[0].length, ym = S.mean(y), yc = y.map(v => v - ym); let w = new Array(k).fill(0); const col = Array.from({length: k}, (_, j) => X.map(r => r[j])), cn = col.map(c => S.dot(c, c) / n2), res = yc.slice();
    for (let it = 0; it < iters; it++) { let mx = 0; for (let j = 0; j < k; j++) { const old = w[j]; let rho = 0; for (let i = 0; i < n2; i++) rho += col[j][i] * (res[i] + col[j][i] * old); rho /= n2; const z = Math.sign(rho) * Math.max(Math.abs(rho) - lambda * l1, 0) / (cn[j] + lambda * (1 - l1)); if (z !== old) { for (let i = 0; i < n2; i++) res[i] -= col[j][i] * (z - old); w[j] = z; mx = Math.max(mx, Math.abs(z - old)); } } if (mx < 1e-9) break; }
    return {w, b: ym, predict: Xn => Xn.map(x => ym + S.dot(w, x))}; }
  function kmeans(X, k, {iters = 100, seed = 29} = {}) { const u = rng(seed); let C = [X[Math.floor(u() * X.length)]]; while (C.length < k) { const d = X.map(x => Math.min(...C.map(c => c.reduce((s, v, j) => s + (v - x[j]) ** 2, 0)))), tot = d.reduce((a, b) => a + b, 0); let r = u() * tot, i = 0; while (r > d[i]) { r -= d[i]; i++; } C.push(X[Math.min(i, X.length - 1)]); }
    let lab = []; for (let it = 0; it < iters; it++) { const nl = X.map(x => { let b = 0, bd = Infinity; C.forEach((c, j) => { const dd = c.reduce((s, v, a) => s + (v - x[a]) ** 2, 0); if (dd < bd) { bd = dd; b = j; } }); return b; }); if (nl.every((v, i) => v === lab[i])) break; lab = nl; C = C.map((c, j) => { const m = X.filter((_, i) => lab[i] === j); return m.length ? c.map((_, a) => S.mean(m.map(r => r[a]))) : c; }); }
    const inertia = X.reduce((s, x, i) => s + C[lab[i]].reduce((a, v, j) => a + (v - x[j]) ** 2, 0), 0); return {labels: lab, centers: C, inertia}; }
  function gmm(X, k, {iters = 200, seed = 31} = {}) { const d = X[0].length, km = kmeans(X, k, {seed}); let pi = new Array(k).fill(1 / k), mu = km.centers.map(c => c.slice()), cov = Array.from({length: k}, () => S.eye(d).map((r, i) => r.map((v, j) => v * S.variance(X.map(x => x[i])) * (i === j ? 1 : 0)))), ll = -Infinity, R = [];
    const dens = (x, m, C) => { const Ci = S.inv(C), det = Math.exp(S.logdet(C)), z = x.map((v, i) => v - m[i]); return Math.exp(-0.5 * S.dot(z, S.mv(Ci, z))) / Math.sqrt((2 * Math.PI) ** d * det); };
    for (let it = 0; it < iters; it++) { let nll = 0; R = X.map(x => { const p = pi.map((w, j) => w * dens(x, mu[j], cov[j]) + 1e-300), s = p.reduce((a, b) => a + b, 0); nll += Math.log(s); return p.map(v => v / s); });
      const Nk = Array.from({length: k}, (_, j) => R.reduce((s, r) => s + r[j], 0)); pi = Nk.map(v => v / X.length); mu = Array.from({length: k}, (_, j) => Array.from({length: d}, (_, a) => X.reduce((s, x, i) => s + R[i][j] * x[a], 0) / Nk[j]));
      cov = Array.from({length: k}, (_, j) => Array.from({length: d}, (_, a) => Array.from({length: d}, (_, b) => X.reduce((s, x, i) => s + R[i][j] * (x[a] - mu[j][a]) * (x[b] - mu[j][b]), 0) / Nk[j] + (a === b ? 1e-6 : 0))));
      if (Math.abs(nll - ll) < 1e-8) { ll = nll; break; } ll = nll; }
    const params = k * (d + d * (d + 1) / 2) + k - 1; return {pi, mu, cov, resp: R, labels: R.map(r => r.indexOf(Math.max(...r))), ll, bic: -2 * ll + params * Math.log(X.length)}; }
  function auc(p, y) { const pos = p.map((v, i) => [v, y[i]]).sort((a, b) => a[0] - b[0]); let rank = 0, sumPos = 0, nPos = 0; pos.forEach(([, yy], i) => { rank = i + 1; if (yy) { sumPos += rank; nPos++; } }); const nNeg = p.length - nPos; return nPos && nNeg ? (sumPos - nPos * (nPos + 1) / 2) / (nPos * nNeg) : null; }

  /* ===================== VaR / ES suite ===================== */
  function varSuite(r0, {q = 0.99, horizon = 1, sims = 20000, window = 250, seed = 37} = {}) { const r = r0.filter(ok), L = r.map(v => -v), m = S.mean(r), s = S.sd(r), u = rng(seed), sorted = L.slice().sort((a, b) => a - b), qq = (a, p) => S.quantile(a, p), es = (a, p) => { const v = qq(a, p); return S.mean(a.filter(x => x >= v)); };
    const z = S.normInv(q), h = Math.sqrt(horizon), nu = Math.max(2.5, 6 / Math.max(0.01, S.kurt(r) - 3) + 4), tsc = s * Math.sqrt((nu - 2) / nu);
    const mcN = Array.from({length: sims}, () => -(m * horizon + s * h * u.n())), mcT = Array.from({length: sims}, () => { let c = 0; for (let i = 0; i < Math.round(nu); i++) { const g = u.n(); c += g * g; } return -(m * horizon + tsc * h * u.n() / Math.sqrt(c / Math.round(nu))); });
    let worst = null; for (let i = window; i <= r.length; i += 5) { const w = r.slice(i - window, i), v = qq(w.map(x => -x), q); if (!worst || v > worst.v) worst = {v, from: i - window, to: i - 1, es: es(w.map(x => -x), q)}; }
    return {q, horizon, hist: {VaR: qq(L, q) * h, ES: es(L, q) * h}, normal: {VaR: (-m + s * z) * h, ES: (-m + s * n(z) / (1 - q)) * h}, mcNormal: {VaR: qq(mcN, q), ES: es(mcN, q)}, mcT: {VaR: qq(mcT, q), ES: es(mcT, q), nu}, stressed: worst ? {VaR: worst.v * h, ES: worst.es * h, from: worst.from, to: worst.to} : null,
      frtb: {ES975: es(L, 0.975), ES975_10d: es(L, 0.975) * Math.sqrt(10)}}; }

  return {rng, hawkesLL, hawkesFit, hawkesIntensity, hawkesSim, Book, lobSimulate, impactCurve, hill, ouFit, pairsBacktest, johansen, vecm, bs, digital, impliedVol, binomial, finiteDiff, mcExotic, hestonMC, mertonJumpMC,
    bond, shortRateFit, zcb, shortRateSim, mertonCredit, cdsHazard, copulaLoss, cvaForward, logistic, knn, gaussNB, cart, randomForest, adaboost, linearSVM, elasticNet, kmeans, gmm, auc, varSuite};
})();
if (typeof module !== 'undefined') module.exports = QF;
