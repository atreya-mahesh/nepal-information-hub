/* Nepal Information Hub — Stock market › Quantitative › Other modelling
   A model registry: Hawkes process, limit-order-book simulator & market impact, Hill tail estimator, Ornstein–Uhlenbeck
   pairs trading, Johansen/VECM, and the CQF toolkit (derivatives, rates & credit, machine learning, VaR, SDEs).
   Each model reads inputs, runs numerics from qf-core.js (QF) / stats-core.js (ST) / fin-core.js (FIN) / ml.js (ML)
   and plots every result. */
'use strict';
const OM = {model: 'ou', p: {}, ran: {}};

/* ------------------------------ small helpers ------------------------------ */
const omF = (v, d = 2) => isNum(v) ? fmt(v, d) : '–';
const omP = p => !isNum(p) ? '–' : p < 0.001 ? '<0.001' : fmt(p, 3);
const omC = (n, title, cls = '', note = '') => `<div><h3>${title}</h3>${note ? `<p class="sub" style="margin:-4px 0 6px">${note}</p>` : ''}<div class="cv ${cls}"><canvas id="om${n}"></canvas></div></div>`;
const omS = (n, title, note = '') => `<div><h3>${title}</h3><p class="sub" style="margin:-4px 0 6px">${note || 'Drag to rotate · double-click to reset.'}</p><div class="cv tall omsurf"><canvas id="om${n}"></canvas></div></div>`;
const xy = (xs, ys) => xs.map((x, i) => ({x, y: ys[i]})).filter(p => isNum(p.x) && isNum(p.y));
const sl = (label, data, color, extra = {}) => Object.assign({type: 'scatter', label, data, showLine: true, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 3, tension: 0}, extra);
const sp = (label, data, color, extra = {}) => Object.assign({type: 'scatter', label, data, borderColor: color, backgroundColor: color, pointRadius: 2.5, showLine: false}, extra);
function omXY(id, datasets, {xt = '', yt = '', legend = true, d = 3, ylog = false, xlog = false, ymin, ymax, xmin, xmax, y2 = null} = {}) {
  const t = T(), sc = {x: {type: xlog ? 'logarithmic' : 'linear', title: {display: !!xt, text: xt, color: t.ink3}, ticks: {maxTicksLimit: 8}}, y: {type: ylog ? 'logarithmic' : 'linear', title: {display: !!yt, text: yt, color: t.ink3}}};
  if (isNum(ymin)) sc.y.min = ymin; if (isNum(ymax)) sc.y.max = ymax; if (isNum(xmin)) sc.x.min = xmin; if (isNum(xmax)) sc.x.max = xmax;
  if (y2) sc.y2 = {position: 'right', grid: {display: false}, title: {display: true, text: y2, color: t.ink3}};
  mk(id, {type: 'scatter', data: {datasets}, options: {interaction: {mode: 'nearest', intersect: false}, plugins: {legend: {display: legend}, tooltip: {callbacks: {label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}(${fmt(c.parsed.x, d)}, ${fmt(c.parsed.y, d)})`}}}, scales: sc}});
}
function omHist(vals, bins = 40, lo, hi) { const v = vals.filter(isNum); lo = lo ?? Math.min(...v); hi = hi ?? Math.max(...v); const w = (hi - lo) / bins || 1, c = new Array(bins).fill(0); v.forEach(x => { const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / w))); c[i]++; }); return {x: c.map((_, i) => lo + (i + 0.5) * w), c, w, dens: c.map(k => k / (v.length * w))}; }
const omTbl = (head, rows, cls = '') => `<div class="tbl ${cls}"><table><thead><tr>${head.map((h, i) => `<th${i ? '' : ' class="txt"'}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : 'txt'}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const omStocks = () => { const s = qSymbols(), st = s.filter(x => !INDEX_SYMS.test(x)); return st.length ? st : s; };
const omPair = () => { const s = omStocks(), all = qSymbols(), a = s[0], b = s.find(x => x !== a) || (all.includes('BANKING') && a !== 'BANKING' ? 'BANKING' : all.find(x => x !== a)) || a; return [a, b]; };
function omPx(syms, lastN) { // aligned closing prices
  const maps = syms.map(s => { const S = qSeries(s), m = new Map(); S.date.forEach((dt, i) => { if (S.c[i] > 0) m.set(dt, S.c[i]); }); return m; });
  let D = [...maps[0].keys()].filter(dt => maps.every(m => m.has(dt))).sort(); if (lastN > 0) D = D.slice(-lastN);
  return {D, P: syms.map((_, j) => D.map(dt => maps[j].get(dt)))};
}
const omPct = (a, p) => ST.quantile(a, p);
const npdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
function omGBM(S0, mu, sig, T, steps, paths, seed = 41) { const u = QF.rng(seed), dt = T / steps, out = []; for (let p = 0; p < paths; p++) { let s = S0; const a = [s]; for (let i = 0; i < steps; i++) { s *= Math.exp((mu - sig * sig / 2) * dt + sig * Math.sqrt(dt) * u.n()); a.push(s); } out.push(a); } return out; }

/* ------------------------------ 3-D surface (canvas, drag to rotate) ------------------------------ */
const OM3 = {};
function omSurf(id, xs, ys, Z, {xl = 'x', yl = 'y', zl = 'z', d = 2, zd = null} = {}) {
  const cv = document.getElementById(id); if (!cv) return; if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const st = OM3[id] = OM3[id] || {az: -0.75, el: 0.5}; st.data = {xs, ys, Z, xl, yl, zl, d}; const zfmt = z => { const k = zd ?? d; if (Math.abs(z) < 1e-9) return '0'; return Math.abs(z) > 0 && Math.abs(z) < Math.pow(10, -k) ? z.toExponential(1) : fmt(z, k); };
  const draw = () => {
    const box = cv.parentElement, W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); const t = T(), {az, el} = st;
    const zf = Z.flat().filter(isNum), z0 = Math.min(...zf), z1 = Math.max(...zf), x0 = xs[0], x1 = xs[xs.length - 1], y0 = ys[0], y1 = ys[ys.length - 1];
    const nx = x => (x - x0) / (x1 - x0 || 1) * 2 - 1, ny = y => (y - y0) / (y1 - y0 || 1) * 2 - 1, nz = z => ((z - z0) / (z1 - z0 || 1)) * 1.3 - 0.65;
    const sc = Math.min(W, H) * 0.33, cx = W / 2, cy = H / 2 + 10;
    const P = (x, y, z) => { const X = x * Math.cos(az) - y * Math.sin(az), Y = x * Math.sin(az) + y * Math.cos(az), y2 = Y * Math.cos(el) - z * Math.sin(el), z2 = Y * Math.sin(el) + z * Math.cos(el); return [cx + X * sc, cy - z2 * sc, y2]; };
    const cmap = v => { const st2 = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]], f = Math.min(0.9999, Math.max(0, v)) * 4, i = Math.floor(f), w = f - i, a = st2[i], b = st2[i + 1]; return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * w)).join(',')})`; };
    // floor box
    g.strokeStyle = t.line; g.lineWidth = 1; const fl = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => P(a, b, -0.65)); g.beginPath(); fl.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.stroke();
    const quads = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) { const zz = [Z[j][i], Z[j][i + 1], Z[j + 1][i + 1], Z[j + 1][i]]; if (!zz.every(isNum)) continue;
      const pts = [[xs[i], ys[j], zz[0]], [xs[i + 1], ys[j], zz[1]], [xs[i + 1], ys[j + 1], zz[2]], [xs[i], ys[j + 1], zz[3]]].map(([a, b, c]) => P(nx(a), ny(b), nz(c)));
      quads.push({pts, dep: pts.reduce((s, p) => s + p[2], 0) / 4, v: ((zz[0] + zz[1] + zz[2] + zz[3]) / 4 - z0) / (z1 - z0 || 1)}); }
    quads.sort((a, b) => b.dep - a.dep);
    g.lineWidth = 0.35; g.strokeStyle = 'rgba(0,0,0,.25)';
    for (const q of quads) { g.fillStyle = cmap(q.v); g.beginPath(); q.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); g.stroke(); }
    // axes labels and ticks
    g.fillStyle = t.ink3; g.font = '11px JetBrains Mono, Consolas, monospace'; g.textAlign = 'center';
    const lab = (a, b, c, s) => { const p = P(a, b, c); g.fillText(s, p[0], p[1]); };
    [0, 0.5, 1].forEach(f => { lab(-1 + 2 * f, -1.25, -0.65, fmt(x0 + (x1 - x0) * f, d)); lab(1.3, -1 + 2 * f, -0.65, fmt(y0 + (y1 - y0) * f, d)); lab(-1.15, 1.15, -0.65 + 1.3 * f, zfmt(z0 + (z1 - z0) * f)); });
    g.fillStyle = t.ink2; g.font = '600 12px Instrument Sans, system-ui, sans-serif'; lab(0, -1.55, -0.65, xl); lab(1.65, 0, -0.65, yl); lab(-1.15, 1.15, 0.85, zl);
    // colour bar
    for (let k = 0; k < 100; k++) { g.fillStyle = cmap(k / 100); g.fillRect(W - 22, H - 30 - k * 1.6, 10, 1.7); } g.fillStyle = t.ink3; g.textAlign = 'right'; g.font = '10px JetBrains Mono, monospace'; g.fillText(zfmt(z1), W - 26, H - 30 - 160 + 8); g.fillText(zfmt(z0), W - 26, H - 30);
  };
  st.draw = draw; draw();
  if (!cv._om) { cv._om = true; let drag = null;
    cv.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, az: OM3[id].az, el: OM3[id].el}; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const s = OM3[id]; s.az = drag.az + (e.clientX - drag.x) * 0.01; s.el = Math.max(-0.2, Math.min(1.45, drag.el + (e.clientY - drag.y) * 0.01)); s.draw(); });
    cv.addEventListener('pointerup', () => { drag = null; }); cv.addEventListener('dblclick', () => { const s = OM3[id]; s.az = -0.75; s.el = 0.5; s.draw(); });
    cv.style.cursor = 'grab'; cv.style.touchAction = 'none'; }
}

/* ------------------------------ registry ------------------------------ */
const OM_GROUPS = ['Microstructure & stat-arb', 'Derivatives (CQF M1 & M3)', 'Fixed income & credit (M6)', 'Machine learning (M4 & M5)', 'Risk (M2)'];
const OM_MODELS = [];
const omDef = m => OM_MODELS.push(m);
// field helpers
const fN = (id, label, v) => ({id, label, type: 'n', v});
const fS = (id, label, v) => ({id, label, type: 'sym', v});
const fO = (id, label, v, opts) => ({id, label, type: 'opt', v, opts});
const fT = (id, label, v) => ({id, label, type: 'txt', v});
function omFieldHtml(m) {
  const P = OM.p[m.id] = OM.p[m.id] || {};
  return m.fields.map(f => { const v = P[f.id] ?? (typeof f.v === 'function' ? f.v() : f.v), lab = `<label for="omf_${f.id}">${f.label}</label>`;
    if (f.type === 'sym') { const syms = qSymbols(), sel = syms.includes(v) ? v : syms[0]; return `<div class="f">${lab}<select id="omf_${f.id}">${syms.map(s => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>`; }
    if (f.type === 'opt') return `<div class="f">${lab}<select id="omf_${f.id}">${f.opts.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(String(ov))}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select></div>`;
    if (f.type === 'txt') return `<div class="f" style="grid-column:1/-1">${lab}<textarea id="omf_${f.id}" rows="3" style="width:100%;font-family:JetBrains Mono,monospace;font-size:12px">${esc(String(v ?? ''))}</textarea></div>`;
    return `<div class="f">${lab}<input id="omf_${f.id}" value="${esc(String(v))}" inputmode="decimal"></div>`; }).join('');
}
function omRead(m) { const P = OM.p[m.id] = OM.p[m.id] || {}; m.fields.forEach(f => { const el = document.getElementById('omf_' + f.id); if (!el) return; P[f.id] = f.type === 'n' ? (el.value.trim() === '' ? null : +el.value) : el.value; }); return P; }
function omVals(m) { const P = OM.p[m.id] || {}, o = {}; m.fields.forEach(f => { let v = P[f.id] ?? (typeof f.v === 'function' ? f.v() : f.v); if (f.type === 'n') v = +v; o[f.id] = v; }); return o; }

function renderOtherModels() {
  try { OM.model = localStorage.getItem('nmm-om') || OM.model; } catch (e) {}
  let m = OM_MODELS.find(x => x.id === OM.model) || OM_MODELS[0]; OM.model = m.id;
  const b = $('#sqBody');
  b.innerHTML = `<div class="card wide"><h2>Other modelling: implement &amp; backtest</h2><p class="sub">Models from market microstructure, statistical arbitrage and the CQF syllabus, run on any series — NEPSE prices, your uploaded series or series taken from the datasets (or on inputs you type). Every model plots its results; 3-D charts rotate with the mouse.</p>
    <div class="ompick">${OM_GROUPS.map(g => `<div class="omrow"><span class="omg">${g}</span><div class="subnav">${OM_MODELS.filter(x => x.g === g).map(x => `<button data-m="${x.id}" aria-selected="${x.id === m.id}">${x.name}</button>`).join('')}</div></div>`).join('')}</div></div>
    <div class="card wide"><h2>${m.name}</h2><div class="sub omintro">${m.intro}</div>
    <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${omFieldHtml(m)}</div><div class="actions"><button class="btn primary" id="omRun">Run model</button><span id="sqMsg"></span></div></div>
    <div id="omOut" style="display:grid;gap:18px"></div>`;
  b.querySelector('.ompick').onclick = e => { const x = e.target.closest('button[data-m]'); if (!x) return; OM.model = x.dataset.m; try { localStorage.setItem('nmm-om', OM.model); } catch (er) {} renderOtherModels(); };
  $('#omRun').onclick = () => { omRead(m); sqTry(() => omRun(m)); };
  if (OM.ran[m.id]) sqTry(() => omRun(m));
}
async function omRun(m) {
  const out = $('#omOut'), v = omVals(m); OM.ran[m.id] = true;
  out.innerHTML = '<div class="card wide"><div class="empty">Running…</div></div>'; await new Promise(r => setTimeout(r, 15));
  try { await m.run(v, out); } catch (e) { OM.ran[m.id] = false; out.innerHTML = ''; throw e; }
}

/* ============================== Microstructure & stat-arb ============================== */
omDef({g: OM_GROUPS[0], id: 'ou', name: 'Ornstein–Uhlenbeck pairs',
  intro: `dX = θ(μ − X)dt + σ dW on the spread X = ln P<sub>A</sub> − β ln P<sub>B</sub>. Discretised as an AR(1), ΔX = a + bX + ε, so θ ≈ −b/Δt (exact: θ = −ln(1+b)/Δt), μ = −a/b and half-life = ln 2/θ. Trade when the z-score (X − μ)/σ<sub>eq</sub> crosses ±entry, exit near μ, stop out beyond ±stop. NEPSE has no short selling, so a <b>long-only</b> variant buys whichever leg is cheap instead of shorting the rich one.`,
  fields: [fS('a', 'Stock A', () => omPair()[0]), fS('b', 'Stock B', () => omPair()[1]), fN('n', 'Sample (last N days, 0 = all)', 750), fO('hedge', 'Hedge ratio β', 'ols', [['ols', 'OLS of ln A on ln B'], ['one', '1 : 1 (log price ratio)']]),
    fN('entry', 'Entry |z|', 2), fN('exit', 'Exit |z|', 0.5), fN('stop', 'Stop |z|', 4), fN('cost', 'Round-trip cost % per leg', 0.4), fO('mode', 'Trading mode', 'ls', [['ls', 'Long–short (theoretical)'], ['lo', 'Long-only (NEPSE)']]), fN('cap', 'Capital (Rs)', 1000000), fN('risk', 'Risk per trade %', 2)],
  run(v, out) {
    if (v.a === v.b) throw new Error('Choose two different stocks.');
    const {D, P} = omPx([v.a, v.b], v.n); if (D.length < 60) throw new Error('Fewer than 60 common dates for these two stocks.');
    const la = P[0].map(Math.log), lb = P[1].map(Math.log), f = v.hedge === 'ols' ? ST.ols(la, lb.map(x => [1, x])) : null, beta = f ? f.coef[1] : 1;
    const X = la.map((x, i) => x - beta * lb[i]), o = QF.ouFit(X, 1), eg = ST.adf(X.map(x => x - ST.mean(X)), {reg: 'c', N: 2}), t = T();
    if (!o.mr) throw new Error(`The spread is not mean-reverting (AR(1) coefficient ${omF(o.b, 3)} ≥ 1). Try another pair.`);
    const mu = o.mu, sd = o.sdEq, z = X.map(x => (x - mu) / sd), cost = v.cost / 100, maxHold = Math.max(5, Math.round(3 * o.halfLife));
    // backtest (signals from yesterday's z, P&L from today's move)
    let pos = 0, held = 0, eq = 1; const curve = [1], posA = [0], trades = []; let open = null;
    for (let i = 1; i < X.length; i++) { const zz = z[i - 1]; let np = pos;
      if (pos === 0) { if (zz <= -v.entry) np = 1; else if (zz >= v.entry) np = -1; }
      else { held++; if ((pos === 1 && (zz >= -v.exit || zz <= -v.stop)) || (pos === -1 && (zz <= v.exit || zz >= v.stop)) || held >= maxHold) np = 0; }
      if (np !== pos) { const legs = v.mode === 'ls' ? 2 : 1; eq *= 1 - cost * legs * Math.abs(np - pos) / (v.mode === 'ls' ? 2 : 1); if (pos !== 0 && open) trades.push({...open, exit: D[i - 1], days: held, ret: eq / open.eq0 - 1, why: Math.abs(zz) >= v.stop ? 'stop' : held >= maxHold ? 'time' : 'target'}); if (np !== 0) { open = {entry: D[i - 1], side: np, z: zz, eq0: eq}; held = 0; } else open = null; }
      pos = np; const dA = la[i] - la[i - 1], dB = lb[i] - lb[i - 1];
      const r = v.mode === 'ls' ? pos * (dA - beta * dB) / (1 + Math.abs(beta)) : (pos === 1 ? dA : pos === -1 ? dB : 0);
      eq *= Math.exp(r); curve.push(eq); posA.push(pos); }
    const rets = curve.slice(1).map((c, i) => c / curve[i] - 1), perf = sqPerf(rets), wins = trades.filter(x => x.ret > 0).length;
    const notional = Math.min(v.cap, v.cap * v.risk / 100 / ((v.stop - v.entry) * sd)), pA = last(P[0]), pB = last(P[1]);
    const bhA = P[0].map(x => x / P[0][0]), bhB = P[1].map(x => x / P[1][0]);
    out.innerHTML = `<div class="card wide"><h2>${esc(v.a)} vs ${esc(v.b)} · ${D.length} days (${D[0]} → ${last(D)})</h2><div class="kpis" id="omK"></div>
      ${omTbl(['OU / AR(1) estimate', 'Value', 'Meaning'], [['β (hedge ratio)', omF(beta, 3), v.hedge === 'ols' ? 'ln A = c + β ln B (OLS)' : 'fixed 1:1'], ['AR(1): X<sub>t</sub> = a + b X<sub>t−1</sub>', `a = ${omF(o.a, 4)}, b = ${omF(o.b, 4)}`, `t-stat of (b − 1) = ${omF(o.tB, 2)}`], ['θ (speed, per day)', `${omF(o.theta, 4)} exact · ${omF(o.thetaEuler, 4)} Euler`, 'θ ≈ −b/Δt from ΔX = a + bX'], ['μ (long-run spread)', omF(mu, 4), ''], ['σ (diffusion), σ<sub>eq</sub> = σ/√(2θ)', `${omF(o.sigma, 4)} · ${omF(sd, 4)}`, 'σ<sub>eq</sub> is the stationary s.d. used in the z-score'], ['Half-life ln2/θ', omF(o.halfLife, 1) + ' days', `expected holding ≈ ${omF(o.halfLife, 0)}–${omF(2 * o.halfLife, 0)} days; time stop at ${maxHold} days`], ['Engle–Granger ADF on spread', `${omF(eg?.stat, 2)} (p = ${omP(eg?.p)})`, eg && eg.p < 0.05 ? '<span class="okc">cointegrated at 5%</span>' : '<span class="warnc">not cointegrated at 5% — trade with care</span>']])}
      <h3>Position sizing</h3><p class="sub">Risk budget Rs ${fmt(v.cap * v.risk / 100, 0)} spread over the distance from entry to stop ((${v.stop} − ${v.entry})·σ<sub>eq</sub> = ${omF((v.stop - v.entry) * sd * 100, 2)}% of notional) ⇒ notional per leg ≈ <b>Rs ${fmt(notional, 0)}</b>: ${v.mode === 'ls' ? `${fmt(notional / pA, 0)} shares of ${esc(v.a)} against ${fmt(Math.abs(beta) * notional / pB, 0)} shares of ${esc(v.b)}` : `buy ${fmt(notional / pA, 0)} shares of ${esc(v.a)} (or ${fmt(notional / pB, 0)} of ${esc(v.b)})`}. Today z = <b>${omF(last(z), 2)}</b> ⇒ ${last(z) <= -v.entry ? `<span class="okc">signal: long the spread (buy ${esc(v.a)})</span>` : last(z) >= v.entry ? `<span class="badc">signal: short the spread${v.mode === 'lo' ? ` — long-only: buy ${esc(v.b)}` : ''}</span>` : 'no signal (inside the bands)'}.</p>
      <div class="grid2">${omC(1, 'Prices rebased to 100')}${omC(2, 'Spread with μ ± entry/exit/stop bands')}${omC(3, 'z-score and position')}${omC(4, 'Equity curve (after costs) vs buy & hold')}${omC(5, 'OU transition density p(x, t | x₀ = today)', '', 'Normal with mean μ + (x₀ − μ)e^{−θt} and variance σ²(1 − e^{−2θt})/(2θ)')}${omC(6, 'AR(1) discretisation: ΔX against X', '', 'Slope b̂ < 0 means mean reversion; θ ≈ −b̂')}</div>
      ${omS(7, 'Transition density surface p(x, t) of the fitted OU process')}
      <h3>Trades (${trades.length})</h3>${omTbl(['Entry', 'Exit', 'Side', 'z at entry', 'Days', 'Return', 'Exit reason'], trades.slice(-20).reverse().map(x => [x.entry, x.exit, x.side > 0 ? (v.mode === 'ls' ? 'long spread' : 'buy ' + esc(v.a)) : (v.mode === 'ls' ? 'short spread' : 'buy ' + esc(v.b)), omF(x.z, 2), x.days, `<span class="${x.ret >= 0 ? 'okc' : 'badc'}">${omF(x.ret * 100, 2)}%</span>`, x.why]), 'scroll')}</div>`;
    kpis('#omK', [{k: 'θ (per day)', v: omF(o.theta, 4)}, {k: 'Half-life', v: omF(o.halfLife, 1) + ' d'}, {k: 'z today', v: omF(last(z), 2), chip: Math.abs(last(z)) >= v.entry ? 'signal' : 'inside', dir: Math.abs(last(z)) >= v.entry ? 'up' : 'nt'}, {k: 'Total return', v: omF(perf.total * 100, 1) + '%'}, {k: 'Sharpe', v: omF(perf.sharpe, 2)}, {k: 'Max drawdown', v: omF(perf.mdd * 100, 1) + '%'}, {k: 'Trades / win rate', v: `${trades.length} / ${trades.length ? fmt(wins / trades.length * 100, 0) : '–'}%`}]);
    mk('om1', {type: 'line', data: {labels: D, datasets: [line(v.a, bhA.map(x => x * 100), t.s[0]), line(v.b, bhB.map(x => x * 100), t.s[1])]}, options: {plugins: {tooltip: tip('', 1)}, scales: {x: xCat(6)}}});
    const band = (k, c, dash) => line(`μ ${k >= 0 ? '+' : '−'} ${Math.abs(k)}σ`, X.map(() => mu + k * sd), c, {borderWidth: 1, borderDash: dash});
    mk('om2', {type: 'line', data: {labels: D, datasets: [line('Spread', X, t.s[0], {borderWidth: 1.5}), line('μ', X.map(() => mu), t.ink3, {borderWidth: 1}), band(v.entry, t.crit, [6, 4]), band(-v.entry, t.good, [6, 4]), band(v.exit, t.ink3, [2, 3]), band(-v.exit, t.ink3, [2, 3]), band(v.stop, t.crit, [1, 2]), band(-v.stop, t.good, [1, 2])]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 4)}, scales: {x: xCat(6)}}});
    mk('om3', {type: 'line', data: {labels: D, datasets: [line('z-score', z, t.s[0], {borderWidth: 1.5}), line('Position', posA, t.s[3], {stepped: true, yAxisID: 'y2', borderWidth: 1.5, tension: 0}), line('+entry', z.map(() => v.entry), t.crit, {borderWidth: 1, borderDash: [6, 4]}), line('−entry', z.map(() => -v.entry), t.good, {borderWidth: 1, borderDash: [6, 4]})]}, options: {plugins: {tooltip: tip('', 2)}, scales: {x: xCat(6), y: {}, y2: {position: 'right', min: -1.5, max: 1.5, grid: {display: false}, ticks: {stepSize: 1}}}}});
    mk('om4', {type: 'line', data: {labels: D, datasets: [line('Pairs strategy', curve, t.s[2], {borderWidth: 2.2}), line('Buy & hold ' + v.a, bhA, t.s[0], {borderWidth: 1}), line('Buy & hold ' + v.b, bhB, t.s[1], {borderWidth: 1})]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(6)}}});
    const x0 = last(X), hl = o.halfLife, hs = [1, Math.max(1, Math.round(hl / 2)), Math.round(hl), Math.round(2 * hl), Math.round(5 * hl)], grid = Array.from({length: 161}, (_, i) => mu - 4.5 * sd + i * 9 * sd / 160);
    const dens = tt => { const m2 = mu + (x0 - mu) * Math.exp(-o.theta * tt), s2 = Math.sqrt(o.sigma ** 2 * (1 - Math.exp(-2 * o.theta * tt)) / (2 * o.theta)); return grid.map(x => npdf(x, m2, s2)); };
    omXY('om5', [...hs.map((h, i) => sl(`t = ${h} d`, xy(grid, dens(h)), t.s[i], {borderWidth: 1.8})), sl('stationary', xy(grid, grid.map(x => npdf(x, mu, sd))), t.ink3, {borderDash: [5, 4], borderWidth: 1.5}), sp('x₀ today', [{x: x0, y: 0}], t.crit, {pointRadius: 6, pointStyle: 'triangle'})], {xt: 'spread x', yt: 'density', d: 4});
    const dX = X.slice(1).map((x, i) => x - X[i]), Xl = X.slice(0, -1), fd = ST.ols(dX, Xl.map(x => [1, x])), xr = [Math.min(...Xl), Math.max(...Xl)];
    omXY('om6', [sp('ΔX', xy(Xl, dX), t.s[0], {pointRadius: 1.5}), sl(`fit: ΔX = ${fmt(fd.coef[0], 4)} + (${fmt(fd.coef[1], 4)})X`, xr.map(x => ({x, y: fd.coef[0] + fd.coef[1] * x})), t.crit)], {xt: 'X(t−1)', yt: 'ΔX(t)', d: 4});
    const ts = Array.from({length: 30}, (_, i) => Math.max(1, hl / 6) + i * (3 * hl) / 29), gx = Array.from({length: 41}, (_, i) => mu - 4 * sd + i * 8 * sd / 40);
    omSurf('om7', gx, ts, ts.map(tt => { const m2 = mu + (x0 - mu) * Math.exp(-o.theta * tt), s2 = Math.sqrt(o.sigma ** 2 * (1 - Math.exp(-2 * o.theta * tt)) / (2 * o.theta)); return gx.map(x => npdf(x, m2, s2)); }), {xl: 'spread x', yl: 't (days)', zl: 'density', d: 3, zd: 1});
  }});

omDef({g: OM_GROUPS[0], id: 'hill', name: 'Hill tail estimator',
  intro: `For losses sorted X₍₁₎ ≥ X₍₂₎ ≥ … the Hill estimator of the tail index is α̂ = ( (1/k) Σ<sub>i≤k</sub> ln X₍ᵢ₎/X₍ₖ₎ )<sup>−1</sup>. Smaller α ⇒ fatter tail (moments above α do not exist). Tail quantile: VaR<sub>q</sub> = X₍ₖ₎ (k / (n(1−q)))<sup>1/α̂</sup>, ES = VaR·α̂/(α̂−1). Compared here with the Gaussian VaR that assumes thin tails.`,
  fields: [fS('sym', 'Symbol', 'NEPSE'), fN('n', 'Sample (last N days, 0 = all)', 0), fN('kf', 'Tail fraction k/n', 0.05), fN('pos', 'Position (Rs)', 1000000)],
  run(v, out) {
    const {r, d} = sqRet(v.sym, v.n), n = r.length; if (n < 250) throw new Error('Need at least 250 daily returns.');
    const L = r.map(x => -x), h = QF.hill(L, {kFrac: Math.min(0.2, Math.max(0.01, v.kf)), nTotal: n}), m = ST.mean(r), s = ST.sd(r), t = T(), qs = [0.95, 0.99, 0.995, 0.999];
    const gV = q => -(m + s * ST.normInv(1 - q)), gE = q => -(m - s * ST.normPdf(ST.normInv(1 - q)) / (1 - q)), srt = L.slice().sort((a, b) => a - b), hV = q => ST.quantile(srt, q), hE = q => { const x = hV(q); return ST.mean(srt.filter(y => y >= x)); };
    const rs = x => 'Rs ' + fmt(v.pos * (1 - Math.exp(-x / 100)), 0);
    out.innerHTML = `<div class="card wide"><h2>${esc(v.sym)}: tail index from ${n} daily returns</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Confidence', 'Gaussian VaR', 'Hill VaR', 'Historical VaR', 'Gaussian ES', 'Hill ES', 'Historical ES', 'Hill ÷ Gaussian', 'Hill 1-day VaR (Rs)'], qs.map(q => [(q * 100) + '%', omF(gV(q)) + '%', '<b>' + omF(h.varq(q)) + '%</b>', omF(hV(q)) + '%', omF(gE(q)) + '%', '<b>' + omF(h.esq(q)) + '%</b>', omF(hE(q)) + '%', omF(h.varq(q) / gV(q), 2) + '×', rs(h.varq(q))]))}
      <p class="sub">At 99% the Gaussian model says a 1-day loss of ${omF(gV(0.99))}% (${rs(gV(0.99))}); the Hill tail says ${omF(h.varq(0.99))}% (${rs(h.varq(0.99))}). The gap widens further out in the tail (99.9%: ${omF(h.varq(0.999) / gV(0.999), 2)}×), which is exactly where thin-tailed models fail.</p>
      <div class="grid2">${omC(1, 'Hill plot: α̂ against k (choose k where the curve is flat)')}${omC(2, 'VaR and ES: Gaussian vs Hill vs historical')}${omC(3, 'Log–log tail plot: empirical survival vs Pareto and Gaussian', '', 'A straight line in the tail = power law with slope −α')}${omC(4, 'Histogram of losses with both VaR(99%) lines')}</div>
      ${omS(5, 'Hill VaR surface across k and confidence level')}</div>`;
    kpis('#omK', [{k: 'Tail index α̂', v: omF(h.alpha, 2), chip: h.alpha < 4 ? 'fat tail (kurtosis infinite if α<4)' : 'moderate tail', dir: h.alpha < 4 ? 'dn' : 'nt'}, {k: 'ξ = 1/α', v: omF(h.xi, 3)}, {k: 's.e.(α̂)', v: omF(h.se, 2)}, {k: 'k (tail obs.)', v: String(h.k)}, {k: 'Threshold X₍ₖ₎', v: omF(h.threshold) + '%'}, {k: 'Excess kurtosis', v: omF(ST.kurt(r) - 3, 2)}]);
    const P = h.path; omXY('om1', [sl('α̂(k)', P.map(p => ({x: p.k, y: p.alpha})), t.s[0]), sl('+1.96 s.e.', P.map(p => ({x: p.k, y: p.alpha + 1.96 * p.se})), t.ink3, {borderWidth: 1, borderDash: [4, 3]}), sl('−1.96 s.e.', P.map(p => ({x: p.k, y: p.alpha - 1.96 * p.se})), t.ink3, {borderWidth: 1, borderDash: [4, 3]}), sp('chosen k', [{x: h.k, y: h.alpha}], t.crit, {pointRadius: 6})], {xt: 'k (number of largest losses)', yt: 'α̂', legend: false, d: 2});
    mk('om2', {type: 'bar', data: {labels: qs.map(q => 'VaR ' + q * 100 + '%').concat(qs.map(q => 'ES ' + q * 100 + '%')), datasets: [bar('Gaussian', qs.map(gV).concat(qs.map(gE)), t.s[1]), bar('Hill (power-law tail)', qs.map(q => h.varq(q)).concat(qs.map(q => h.esq(q))), t.crit), bar('Historical', qs.map(hV).concat(qs.map(hE)), t.s[0])]}, options: {plugins: {tooltip: tip('%', 2)}, scales: {x: {grid: {display: false}}, y: {title: {display: true, text: 'loss %', color: t.ink3}}}}});
    const pos = h.sorted, emp = pos.map((x, i) => ({x: Math.log(x), y: Math.log((i + 1) / n)})), lu = Math.log(h.threshold), xs = pos.filter(x => x >= h.threshold * 0.6), lx = [Math.log(Math.min(...xs)), Math.log(pos[0] * 1.3)];
    omXY('om3', [sp('empirical', emp.filter((_, i) => i < Math.min(pos.length, 400)), t.s[0], {pointRadius: 2}), sl(`Pareto, slope −${fmt(h.alpha, 2)}`, lx.map(x => ({x, y: Math.log(h.k / n) - h.alpha * (x - lu)})), t.crit), sl('Gaussian', Array.from({length: 40}, (_, i) => { const x = lx[0] + (lx[1] - lx[0]) * i / 39; return {x, y: Math.log(Math.max(1e-12, 1 - ST.normCdf((Math.exp(x) + m) / s)))}; }), t.s[1], {borderDash: [5, 4]})], {xt: 'ln(loss %)', yt: 'ln P(L > x)', d: 2, ymin: Math.log(0.5 / n) - 1});
    const H = omHist(L, 60), mx = Math.max(...H.c);
    mk('om4', {type: 'bar', data: {labels: H.x.map(x => fmt(x, 2)), datasets: [bar('Days', H.c, t.s[0], {maxBarThickness: 12, categoryPercentage: 1, barPercentage: 1}), line('Gaussian VaR 99%', H.x.map(x => Math.abs(x - gV(0.99)) <= H.w / 2 ? mx : null), t.s[1], {type: 'bar', backgroundColor: t.s[1], maxBarThickness: 3}), line('Hill VaR 99%', H.x.map(x => Math.abs(x - h.varq(0.99)) <= H.w / 2 ? mx : null), t.crit, {type: 'bar', backgroundColor: t.crit, maxBarThickness: 3})]}, options: {plugins: {tooltip: tip('', 0)}, scales: {x: {grid: {display: false}, ticks: {maxTicksLimit: 10}, title: {display: true, text: 'daily loss %', color: t.ink3}}, y: {type: 'logarithmic'}}}});
    const ks = P.filter((_, i) => i % Math.max(1, Math.floor(P.length / 30)) === 0), qg = Array.from({length: 25}, (_, i) => 0.95 + i * 0.049 / 24);
    omSurf('om5', ks.map(p => p.k), qg, qg.map(q => ks.map(p => h.varAt(p, q))), {xl: 'k', yl: 'confidence q', zl: 'VaR %', d: 2});
  }});

omDef({g: OM_GROUPS[0], id: 'lob', name: 'Limit order book & impact',
  intro: `A price-time-priority matching engine: bids and asks sit in sorted queues (best price first, FIFO inside a price). Synthetic order flow (Poisson limit orders, market orders, cancellations) is <b>calibrated to the chosen stock</b>: last price, NEPSE tick of Rs 0.1, its average daily volume and daily volatility. Then a hypothetical market order walks the book. Impact is non-linear in size; the square-root law says ΔP/P ≈ Y·σ·√(Q/V). NEPSE does not publish level-2 data, so the book is a calibrated simulation, not the real queue.`,
  fields: [fS('sym', 'Calibrate to symbol', () => omStocks()[0]), fO('side', 'Your market order', 'buy', [['buy', 'Buy (lifts asks)'], ['sell', 'Sell (hits bids)']]), fN('q', 'Order size (shares, 0 = 5% of ADV)', 0), fN('ev', 'Simulated events', 20000), fN('off', 'Mean limit distance (ticks)', 4), fN('seed', 'Random seed', 5)],
  run(v, out) {
    const S = qSeries(v.sym), px = last(S.c), vols = S.v.slice(-60).filter(x => isNum(x) && x > 0), adv = vols.length ? ST.mean(vols) : 10000, {r} = sqRet(v.sym, 250), sig = (r.length > 20 ? ST.sd(r) : 2) / 100, t = T();
    const tick = 0.1, depthQty = Math.max(5, Math.round(adv / 2200)), mkt = Math.max(5, Math.round(adv / 3000));
    const sim = QF.lobSimulate({mid: Math.round(px / tick) * tick, tick, events: Math.min(100000, Math.max(2000, v.ev)), depthQty, levels: 40, targetOrders: 400, mktSize: mkt, offsetMean: Math.max(1, v.off), seed: v.seed}), B = sim.book, mid = B.mid(), Q = v.q > 0 ? v.q : Math.round(0.05 * adv);
    const c = B.clone(), res = c.market(v.side, Q), byP = new Map(); res.fills.forEach(f => byP.set(f.p, (byP.get(f.p) || 0) + f.q));
    const filled = res.fills.reduce((a, f) => a + f.q, 0), notional = res.fills.reduce((a, f) => a + f.p * f.q, 0), vwap = filled ? notional / filled : null, slip = vwap ? (v.side === 'buy' ? vwap / mid - 1 : 1 - vwap / mid) * 1e4 : null;
    const bids = B.levels('bid', 15), asks = B.levels('ask', 15), sizes = Array.from({length: 22}, (_, i) => Math.round(adv * 0.0005 * Math.pow(1.45, i))), ic = QF.impactCurve(B, v.side, sizes).filter(x => isNum(x.slipBps) && x.unfilled < 1e-6);
    const sq = ic.map(x => sig * 1e4 * Math.sqrt(x.Q / adv)), Y = ic.length ? ic.reduce((a, x, i) => a + x.slipBps * sq[i], 0) / sq.reduce((a, s) => a + s * s, 0) : null;
    const pl = ic.filter(x => x.slipBps > 0), plf = pl.length > 3 ? ST.ols(pl.map(x => Math.log(x.slipBps)), pl.map(x => [1, Math.log(x.Q)])) : null;
    let cb = 0, ca = 0; const dB = bids.map(l => ({x: l.p, y: cb += l.q})), dA = asks.map(l => ({x: l.p, y: ca += l.q}));
    out.innerHTML = `<div class="card wide"><h2>${esc(v.sym)}: simulated book around Rs ${fmt(mid, 2)}</h2><p class="sub">Calibration: average daily volume (60 d) ${fmt(adv, 0)} shares, daily σ ${fmt(sig * 100, 2)}%, typical limit order ${fmt(depthQty * 0.8, 0)} shares, typical market order ${fmt(mkt, 0)} shares, ${fmt(sim.mids.length * 50, 0)} events.</p><div class="kpis" id="omK"></div>
      <div class="grid2"><div><h3>Order book (sorted queues, top 15)</h3>${omTbl(['Bid orders', 'Bid qty', 'Bid', 'Ask', 'Ask qty', 'Ask orders'], Array.from({length: 15}, (_, i) => [bids[i]?.n ?? '', bids[i] ? fmt(bids[i].q, 0) : '', bids[i] ? `<span class="okc">${fmt(bids[i].p, 1)}</span>` : '', asks[i] ? `<span class="badc">${fmt(asks[i].p, 1)}</span>` : '', asks[i] ? fmt(asks[i].q, 0) : '', asks[i]?.n ?? '']), 'scroll')}</div>
      <div><h3>Your ${v.side} market order: ${fmt(Q, 0)} shares (${fmt(Q / adv * 100, 1)}% of ADV)</h3>${omTbl(['Price level', 'Filled', 'Cumulative', 'Value (Rs)'], (() => { let cu = 0; return [...byP].map(([p, q]) => [fmt(p, 1), fmt(q, 0), fmt(cu += q, 0), fmt(p * q, 0)]); })(), 'scroll')}
      <p class="sub">VWAP Rs ${omF(vwap, 2)} vs mid Rs ${fmt(mid, 2)} ⇒ slippage <b>${omF(slip, 1)} bps</b> = Rs ${fmt(Math.abs(notional - mid * filled), 0)} extra cost; ${byP.size} price levels consumed; mid after the order Rs ${omF(c.mid(), 2)}${res.rem > 1e-6 ? `; <span class="badc">${fmt(res.rem, 0)} shares unfilled (book exhausted)</span>` : ''}.</p></div></div>
      <div class="grid2">${omC(1, 'Depth chart (cumulative quantity)')}${omC(2, 'Queues by price level')}${omC(3, 'Market impact vs order size', '', `Square-root law fit: slippage ≈ ${omF(Y, 2)}·σ·√(Q/ADV)${plf ? `; power-law exponent δ = ${omF(plf.coef[1], 2)} (√ ⇒ 0.5)` : ''}`)}${omC(4, 'Simulated mid price and spread')}</div></div>`;
    kpis('#omK', [{k: 'Mid / spread', v: `${fmt(mid, 2)} / ${fmt(B.bestAsk() - B.bestBid(), 1)}`}, {k: 'Resting orders', v: fmt(B.orders.size, 0)}, {k: 'VWAP', v: omF(vwap, 2)}, {k: 'Slippage', v: omF(slip, 1) + ' bps', dir: 'dn', chip: 'Rs ' + fmt(Math.abs(notional - mid * filled), 0)}, {k: 'Levels hit', v: String(byP.size)}, {k: 'Impact coeff. Y', v: omF(Y, 2), chip: 'theory ≈ 1'}]);
    omXY('om1', [sl('Bids', dB, t.good, {stepped: 'after', fill: 'origin', backgroundColor: t.good + '33'}), sl('Asks', dA, t.crit, {stepped: 'before', fill: 'origin', backgroundColor: t.crit + '33'}), sp('mid', [{x: mid, y: 0}], t.ink, {pointRadius: 5, pointStyle: 'triangle'})], {xt: 'price (Rs)', yt: 'cumulative shares', d: 1});
    const lv = [...bids.slice().reverse(), ...asks];
    mk('om2', {type: 'bar', data: {labels: lv.map(l => fmt(l.p, 1)), datasets: [bar('Bid qty', lv.map((l, i) => i < bids.length ? l.q : null), t.good, {maxBarThickness: 14}), bar('Ask qty', lv.map((l, i) => i >= bids.length ? l.q : null), t.crit, {maxBarThickness: 14})]}, options: {plugins: {tooltip: tip('', 0)}, scales: {x: {stacked: true, grid: {display: false}, ticks: {maxTicksLimit: 12}}, y: {stacked: true}}}});
    omXY('om3', [sp('simulated book', ic.map(x => ({x: x.Q, y: x.slipBps})), t.s[0], {pointRadius: 3.5}), sl(`fit Y·σ√(Q/V), Y = ${omF(Y, 2)}`, ic.map((x, i) => ({x: x.Q, y: Y * sq[i]})), t.crit), sl('theory Y = 1', ic.map((x, i) => ({x: x.Q, y: sq[i]})), t.ink3, {borderDash: [5, 4], borderWidth: 1.5}), sp('your order', isNum(slip) ? [{x: Q, y: slip}] : [], t.s[3], {pointRadius: 7, pointStyle: 'rectRot'})], {xt: 'order size Q (shares, log scale)', yt: 'slippage (bps)', xlog: true, d: 1});
    mk('om4', {type: 'line', data: {labels: sim.mids.map((_, i) => (i + 1) * 50), datasets: [line('Mid', sim.mids, t.s[0], {borderWidth: 1.5, tension: 0}), line('Spread', sim.spreads, t.s[2], {yAxisID: 'y2', borderWidth: 1, stepped: true})]}, options: {plugins: {tooltip: tip('', 2)}, scales: {x: {...xCat(8), title: {display: true, text: 'event', color: t.ink3}}, y: {}, y2: {position: 'right', grid: {display: false}}}}});
  }});

omDef({g: OM_GROUPS[0], id: 'hawkes', name: 'Hawkes process',
  intro: `A self-exciting point process: λ(t) = μ + Σ<sub>tᵢ&lt;t</sub> α e<sup>−β(t − tᵢ)</sup>. Every event lifts the probability of the next one; the excitation decays at rate β. Branching ratio n = α/β is the fraction of events triggered by earlier events (n &lt; 1 for stationarity). The log-likelihood uses the O(N) recursion A<sub>i</sub> = e<sup>−β(tᵢ − tᵢ₋₁)</sup>(1 + A<sub>i−1</sub>). NEPSE has no public tick data, so the default events are <b>large-move days</b>; paste your own trade timestamps for intraday use.`,
  fields: [fO('src', 'Events', 'days', [['days', 'Large-move days of a symbol'], ['paste', 'Paste timestamps'], ['sim', 'Simulate (μ, α, β)']]), fS('sym', 'Symbol', 'NEPSE'), fN('n', 'Sample (last N days, 0 = all)', 0), fN('k', 'Large move = |r| > k·σ', 2), fO('dir', 'Direction', 'both', [['both', 'Both'], ['down', 'Down moves (crashes)'], ['up', 'Up moves']]),
    fN('mu', 'Simulate: μ', 0.5), fN('al', 'Simulate: α', 0.8), fN('be', 'Simulate: β', 1.6), fN('T', 'Simulate: horizon T', 1000), fT('ts', 'Timestamps (one per line: seconds, or date-time like 2025-01-05 11:02:31)', '')],
  run(v, out) {
    let ev = [], T0 = 0, unit = 'days', dates = null; const t = T();
    if (v.src === 'days') { const {r, d} = sqRet(v.sym, v.n), s = ST.sd(r), m = ST.mean(r); r.forEach((x, i) => { const z = (x - m) / s; if ((v.dir !== 'up' && z < -v.k) || (v.dir !== 'down' && z > v.k)) ev.push(i + 1); }); T0 = r.length + 1; dates = d; }
    else if (v.src === 'sim') { ev = QF.hawkesSim(v.mu, v.al, v.be, v.T, 3); T0 = v.T; unit = 'time units'; }
    else { const raw = String(v.ts || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean).map(x => isFinite(+x) ? +x : Date.parse(x.replace(' ', 'T')) / 1000).filter(isNum).sort((a, b) => a - b); if (raw.length < 10) throw new Error('Paste at least 10 timestamps.'); ev = raw.map(x => x - raw[0] + 1e-6); T0 = last(ev) * 1.001 + 1e-6; unit = 'seconds'; }
    if (ev.length < 10) throw new Error(`Only ${ev.length} events — lower k or use more data.`);
    // ties (same day / same second) are spread uniformly inside the unit so the likelihood is defined
    const cnt = new Map(); ev.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1)); const ev2 = []; for (const [x, c] of [...cnt].sort((a, b) => a[0] - b[0])) for (let j = 0; j < c; j++) ev2.push(x + (c > 1 ? (j + 0.5) / c - 0.5 : 0) * (unit === 'time units' ? 0 : 1)); ev = ev2.sort((a, b) => a - b);
    const h = QF.hawkesFit(ev, T0), G = 600, grid = Array.from({length: G}, (_, i) => (i + 0.5) * T0 / G), lam = QF.hawkesIntensity(h.times, h.mu, h.alpha, h.beta, grid);
    const comp = grid.map(g => { let s = h.mu * g; for (const ti of h.times) { if (ti >= g) break; s += h.alpha / h.beta * (1 - Math.exp(-h.beta * (g - ti))); } return s; }), Ncount = grid.map(g => h.times.filter(x => x < g).length);
    const res = h.res.slice().sort((a, b) => a - b), qq = res.map((x, i) => ({x: -Math.log(1 - (i + 0.5) / res.length), y: x}));
    const W = 50, w = T0 / W, cReal = new Array(W).fill(0); h.times.forEach(x => cReal[Math.min(W - 1, Math.floor(x / w))]++);
    const sims = [], nSim = 20; for (let s = 0; s < nSim; s++) { const e = QF.hawkesSim(h.mu, h.alpha, h.beta, T0, 100 + s), c = new Array(W).fill(0); e.forEach(x => c[Math.min(W - 1, Math.floor(x / w))]++); sims.push(c); }
    const mxC = Math.max(...cReal, ...sims.flat()), bins = Array.from({length: mxC + 1}, (_, k) => k), hr = bins.map(k => cReal.filter(c => c === k).length / W), hs = bins.map(k => sims.flat().filter(c => c === k).length / (W * nSim)), lamP = h.events / T0 * w, pois = bins.map(k => Math.exp(-lamP + k * Math.log(lamP) - ST.lgamma(k + 1)));
    const simPath = QF.hawkesSim(h.mu, h.alpha, h.beta, T0, 7), lamS = QF.hawkesIntensity(simPath, h.mu, h.alpha, h.beta, grid);
    out.innerHTML = `<div class="card wide"><h2>Hawkes fit: ${h.events} events over T = ${fmt(T0, 0)} ${unit}${v.src === 'days' ? ` (${esc(v.sym)}, |r| > ${v.k}σ)` : ''}</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Parameter', 'Estimate', 'Std. error', 'Meaning'], [['μ (baseline)', omF(h.mu, 4), omF(h.se[0], 4), 'exogenous event rate per ' + unit.replace(/s$/, '')], ['α (jump in λ per event)', omF(h.alpha, 4), omF(h.se[1], 4), ''], ['β (decay)', omF(h.beta, 4), omF(h.se[2], 4), `excitation half-life ln2/β = ${omF(h.halfLife, 2)} ${unit}`], ['n = α/β (branching ratio)', '<b>' + omF(h.n, 3) + '</b>', '', `${fmt(h.n * 100, 0)}% of events are triggered by earlier events`], ['Stationary rate μ/(1−n)', omF(h.baseline, 4), '', `observed ${omF(h.events / T0, 4)}`], ['LR test vs Poisson', omF(h.lrPois, 2), '', `p = ${omP(h.lrP)} ${h.lrP < 0.05 ? '<span class="okc">clustering is significant</span>' : '<span class="warnc">no evidence of self-excitation</span>'}`], ['KS test of rescaled times ~ Exp(1)', omF(h.ks, 3), '', `p = ${omP(h.ksp)} ${h.ksp > 0.05 ? '<span class="okc">model fits</span>' : '<span class="badc">misfit</span>'}`], ['Log-likelihood / AIC', `${omF(h.ll, 2)} / ${omF(h.aic, 2)}`, '', '']])}
      <div class="grid2">${omC(1, 'Conditional intensity λ(t) with events')}${omC(2, 'Residual Q–Q: rescaled inter-event times vs Exp(1)', '', 'Time-rescaling theorem: points on the 45° line ⇒ the fitted λ(t) explains the clustering')}${omC(3, 'Counting process N(t) vs compensator Λ(t) vs Poisson')}${omC(4, 'Events per window: real vs Hawkes simulation vs Poisson', '', 'Hawkes reproduces the over-dispersion (bursts) that a Poisson process misses')}${omC(5, 'Excitation kernel φ(τ) = α e^{−βτ}')}${omC(6, 'One simulated path with the fitted parameters')}</div></div>`;
    kpis('#omK', [{k: 'μ', v: omF(h.mu, 4)}, {k: 'α', v: omF(h.alpha, 3)}, {k: 'β', v: omF(h.beta, 3)}, {k: 'Branching n = α/β', v: omF(h.n, 3), chip: h.n > 0.5 ? 'strongly self-exciting' : 'mild', dir: h.n > 0.5 ? 'dn' : 'nt'}, {k: 'Half-life', v: omF(h.halfLife, 2) + ' ' + unit}, {k: 'LR vs Poisson p', v: omP(h.lrP)}]);
    const lbl = x => dates ? dates[Math.min(dates.length - 1, Math.max(0, Math.round(x) - 1))] : fmt(x, 1);
    omXY('om1', [sl('λ(t)', xy(grid, lam), t.s[0], {borderWidth: 1.5}), sp('event', h.times.map(x => ({x, y: 0})), t.crit, {pointRadius: 3, pointStyle: 'line', rotation: 90, borderWidth: 1.5}), sl('μ', [{x: 0, y: h.mu}, {x: T0, y: h.mu}], t.ink3, {borderDash: [4, 3], borderWidth: 1})], {xt: dates ? 'trading day index' : 'time', yt: 'intensity', d: 3});
    if (dates) charts.om1.options.plugins.tooltip.callbacks.title = c => c.length ? lbl(c[0].parsed.x) : '';
    const qm = Math.max(...qq.map(p => Math.max(p.x, p.y)));
    omXY('om2', [sp('rescaled times', qq, t.s[0]), sl('45°', [{x: 0, y: 0}, {x: qm, y: qm}], t.ink3, {borderWidth: 1})], {xt: 'Exp(1) quantile', yt: 'empirical', legend: false, d: 2});
    omXY('om3', [sl('N(t) observed', xy(grid, Ncount), t.s[0], {stepped: true}), sl('Λ(t) Hawkes compensator', xy(grid, comp), t.crit), sl('Poisson rate × t', xy(grid, grid.map(g => g * h.events / T0)), t.ink3, {borderDash: [5, 4], borderWidth: 1.5})], {xt: 'time', yt: 'cumulative events', d: 1});
    mk('om4', {type: 'bar', data: {labels: bins, datasets: [bar('Real', hr, t.s[0]), bar('Hawkes simulation', hs, t.crit), line('Poisson', pois, t.ink3, {type: 'line', borderDash: [4, 3], pointRadius: 2})]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: {grid: {display: false}, title: {display: true, text: 'events per window', color: t.ink3}}, y: {title: {display: true, text: 'share of windows', color: t.ink3}}}}});
    const tau = Array.from({length: 100}, (_, i) => i * 5 / h.beta / 99); omXY('om5', [sl('φ(τ)', xy(tau, tau.map(x => h.alpha * Math.exp(-h.beta * x))), t.s[2])], {xt: 'τ since event (' + unit + ')', yt: 'added intensity', legend: false, d: 3});
    omXY('om6', [sl('simulated λ(t)', xy(grid, lamS), t.s[4], {borderWidth: 1.4}), sp('simulated event', simPath.map(x => ({x, y: 0})), t.s[3], {pointRadius: 3, pointStyle: 'line', rotation: 90, borderWidth: 1.5})], {xt: 'time', yt: 'intensity', d: 3});
  }});

omDef({g: OM_GROUPS[0], id: 'joh', name: 'Johansen & VECM',
  intro: `Johansen's reduced-rank test of ΔY<sub>t</sub> = ΠY<sub>t−1</sub> + Σ Γ<sub>i</sub>ΔY<sub>t−i</sub> + ε on log prices: the rank of Π = αβ′ is the number of cointegrating relations. Trace and maximum-eigenvalue statistics are compared with Osterwald-Lenum critical values (results match <code>statsmodels coint_johansen</code>). The first cointegrating vector gives a stationary basket that can be traded like the OU spread; α shows which stocks do the error-correcting.`,
  fields: [fT('syms', 'Symbols (2–6, comma separated)', () => [...new Set([...omStocks(), ...qSymbols()])].slice(0, 3).join(', ')), fN('n', 'Sample (last N days, 0 = all)', 750), fN('k', 'Lagged differences k', 1)],
  run(v, out) {
    const syms = String(v.syms).split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean), have = qSymbols(); const bad = syms.filter(s => !have.includes(s)); if (bad.length) throw new Error('Unknown symbol(s): ' + bad.join(', ')); if (syms.length < 2 || syms.length > 6) throw new Error('Give 2 to 6 symbols.');
    const {D, P} = omPx(syms, v.n); if (D.length < 100) throw new Error('Fewer than 100 common dates.');
    const Y = D.map((_, i) => syms.map((_, j) => Math.log(P[j][i]))), k = Math.max(1, Math.round(v.k)), J = QF.johansen(Y, k), m = syms.length, t = T();
    const b0 = J.beta[0], bn = b0.map(x => x / b0[0]), basket = Y.map(row => S_dot(bn, row)), o = QF.ouFit(basket, 1), r = Math.max(1, J.rank), V = QF.vecm(Y, J.beta.slice(0, r).map(b => b.map(x => x / b[0])), k);
    out.innerHTML = `<div class="card wide"><h2>Johansen test: ${syms.join(', ')} · ${J.nobs} obs.</h2><div class="kpis" id="omK"></div>
      ${omTbl(['H₀: rank ≤ r', 'Eigenvalue', 'Trace', '90%', '95%', '99%', 'Max-eig', '95%', 'Decision (trace, 5%)'], J.lam.map((l, i) => [`r ≤ ${i}`, omF(l, 4), omF(J.trace[i], 2), omF(J.cvT[i][0], 2), omF(J.cvT[i][1], 2), omF(J.cvT[i][2], 2), omF(J.maxEig[i], 2), omF(J.cvM[i][1], 2), J.trace[i] > J.cvT[i][1] ? '<span class="okc">reject</span>' : 'do not reject']))}
      <h3>Cointegrating vector(s) β (normalised on ${esc(syms[0])}) and adjustment speeds α</h3>${omTbl(['Stock', ...J.beta.slice(0, r).map((_, i) => 'β' + (i + 1)), ...Array.from({length: r}, (_, i) => 'α' + (i + 1) + ' (t)')], syms.map((s, j) => [esc(s), ...J.beta.slice(0, r).map(b => omF(b[j] / b[0], 4)), ...Array.from({length: r}, (_, i) => `${omF(V.alpha[j][i], 4)} (${omF(V.alphaT[j][i], 2)})`)]))}
      <p class="sub">Basket = ${syms.map((s, j) => `${j ? (bn[j] >= 0 ? '+ ' : '− ') : ''}${fmt(Math.abs(bn[j]), 3)}·ln ${esc(s)}`).join(' ')}. ${o.mr ? `OU half-life of the basket ≈ <b>${omF(o.halfLife, 1)} days</b>.` : 'The basket is not mean-reverting in this sample.'}</p>
      <div class="grid2">${omC(1, 'Log prices (rebased)')}${omC(2, 'Cointegrating basket β′Y with ±2σ bands')}${omC(3, 'Eigenvalues vs critical-value thresholds')}${omC(4, 'Error-correction speeds α (first relation)')}</div></div>`;
    kpis('#omK', [{k: 'Cointegration rank', v: String(J.rank), chip: J.rank ? 'cointegrated' : 'none', dir: J.rank ? 'up' : 'nt'}, {k: 'λ₁', v: omF(J.lam[0], 4)}, {k: 'Trace (r=0)', v: omF(J.trace[0], 2), d: ' vs ' + omF(J.cvT[0][1], 2)}, {k: 'Basket half-life', v: o.mr ? omF(o.halfLife, 1) + ' d' : '–'}]);
    mk('om1', {type: 'line', data: {labels: D, datasets: syms.map((s, j) => line(s, Y.map(r2 => r2[j] - Y[0][j]), t.s[j]))}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(6)}}});
    const bm = ST.mean(basket), bs2 = ST.sd(basket); mk('om2', {type: 'line', data: {labels: D, datasets: [line('β′Y', basket, t.s[0], {borderWidth: 1.5}), line('mean', basket.map(() => bm), t.ink3, {borderWidth: 1}), line('+2σ', basket.map(() => bm + 2 * bs2), t.crit, {borderWidth: 1, borderDash: [6, 4]}), line('−2σ', basket.map(() => bm - 2 * bs2), t.good, {borderWidth: 1, borderDash: [6, 4]})]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 4)}, scales: {x: xCat(6)}}});
    mk('om3', {type: 'bar', data: {labels: J.lam.map((_, i) => 'r = ' + i), datasets: [bar('Trace statistic', J.trace, t.s[0]), bar('95% critical value', J.cvT.map(c => c[1]), t.ink3)]}, options: {plugins: {tooltip: tip('', 2)}, scales: {x: {grid: {display: false}}}}});
    mk('om4', {type: 'bar', data: {labels: syms, datasets: [bar('α₁', V.alpha.map(a => a[0]), syms.map((_, j) => Math.abs(V.alphaT[j][0]) > 1.96 ? t.s[2] : t.ink3))]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 4)}, scales: {x: {grid: {display: false}}}}});
  }});
const S_dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/* ============================== Derivatives (CQF modules 1 and 3) ============================== */
const omOpt = (extra = []) => [fN('S', 'Spot S', () => { try { return +fmt(last(qSeries('NEPSE').c) || 100, 2).replace(/,/g, ''); } catch (e) { return 100; } }), fN('K', 'Strike K (blank = at the money)', null), fN('T', 'Maturity T (years)', 1), fN('r', 'Risk-free r % (NRB T-bill)', () => +fmt(sqRf(), 2)), fN('q', 'Dividend / foreign rate q %', 0), fN('sig', 'Volatility σ % (blank = historical)', null), fO('type', 'Option', 'call', [['call', 'Call'], ['put', 'Put']]), ...extra];
function omOptIn(v) { const S = v.S > 0 ? v.S : 100, K = isNum(v.K) && v.K > 0 ? v.K : S; let sig = isNum(v.sig) && v.sig > 0 ? v.sig / 100 : null; if (!sig) { try { const {r} = sqRet('NEPSE', 250); sig = ST.sd(r) / 100 * Math.sqrt(240); } catch (e) {} } return {S, K, T: Math.max(1 / 365, v.T || 1), r: (v.r || 0) / 100, q: (v.q || 0) / 100, sigma: sig || 0.2, type: v.type}; }

omDef({g: OM_GROUPS[1], id: 'bsm', name: 'Black–Scholes–Merton & Greeks',
  intro: `V = S e<sup>−qT</sup>N(d₁) − K e<sup>−rT</sup>N(d₂) for a call, d₁ = [ln(S/K) + (r − q + σ²/2)T]/(σ√T), d₂ = d₁ − σ√T. With q = foreign interest rate this is the Garman–Kohlhagen FX option. Greeks Δ, Γ, Θ (per day), ν and ρ (per 1%), the cash-or-nothing digital, implied volatility from a market price, and a Monte Carlo test of <b>discrete delta hedging</b> (the replication argument behind the BSM PDE). Nepal has no listed options, so inputs are yours; defaults use the NEPSE index level and its historical volatility.`,
  fields: omOpt([fN('mkt', 'Market price (for implied vol)', null), fN('hd', 'Hedge rebalances per year', 52)]),
  run(v, out) {
    const o = omOptIn(v), b = QF.bs(o), dg = QF.digital ? QF.digital(o) : null, t = T(), iv = isNum(v.mkt) && v.mkt > 0 ? QF.impliedVol(v.mkt, o) : null;
    const Sg = Array.from({length: 121}, (_, i) => o.S * (0.5 + i / 120)), G = Sg.map(s => QF.bs({...o, S: s})), pay = Sg.map(s => o.type === 'call' ? Math.max(s - o.K, 0) : Math.max(o.K - s, 0));
    // delta-hedging simulation under the real-world drift = r (P&L of short option + delta hedge)
    const steps = Math.max(4, Math.round(o.T * v.hd)), dt = o.T / steps, u = QF.rng(51), errs = [];
    for (let p = 0; p < 2000; p++) { let s = o.S, d = QF.bs(o).delta, cash = b.price - d * s; for (let i = 1; i <= steps; i++) { s *= Math.exp((o.r - o.q - o.sigma ** 2 / 2) * dt + o.sigma * Math.sqrt(dt) * u.n()); cash = cash * Math.exp(o.r * dt) + d * s * (Math.exp(o.q * dt) - 1); const tl = o.T - i * dt, nd = i < steps ? QF.bs({...o, S: s, T: tl}).delta : (o.type === 'call' ? +(s > o.K) : -(s < o.K)); cash -= (nd - d) * s; d = nd; } const pv = o.type === 'call' ? Math.max(s - o.K, 0) : Math.max(o.K - s, 0); errs.push((cash + d * s - pv) * Math.exp(-o.r * o.T)); }
    const he = omHist(errs, 40);
    out.innerHTML = `<div class="card wide"><h2>${o.type === 'call' ? 'Call' : 'Put'}: S = ${fmt(o.S, 2)}, K = ${fmt(o.K, 2)}, T = ${o.T}y, r = ${fmt(o.r * 100, 2)}%, q = ${fmt(o.q * 100, 2)}%, σ = ${fmt(o.sigma * 100, 2)}%</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Quantity', 'Value', 'Note'], [['Price', '<b>' + omF(b.price, 4) + '</b>', `d₁ = ${omF(b.d1, 4)}, d₂ = ${omF(b.d2, 4)}`], ['Δ delta', omF(b.delta, 4), 'shares to hold per option'], ['Γ gamma', omF(b.gamma, 5), 'change in Δ per 1 unit of S'], ['ν vega', omF(b.vega, 4), 'per 1 vol-point'], ['Θ theta', omF(b.theta, 4), 'per calendar day'], ['ρ rho', omF(b.rho, 4), 'per 1% rate'], ['Digital (cash-or-nothing, pays 1)', omF(dg?.price ?? dg, 4), 'e^{−rT}N(±d₂)'], ['Put–call parity check', omF(QF.bs({...o, type: 'call'}).price - QF.bs({...o, type: 'put'}).price - (o.S * Math.exp(-o.q * o.T) - o.K * Math.exp(-o.r * o.T)), 8), 'C − P − (Se^{−qT} − Ke^{−rT}) = 0'], ['Implied volatility', iv ? omF(iv * 100, 2) + '%' : '–', isNum(v.mkt) ? 'from market price ' + fmt(v.mkt, 2) : 'enter a market price'], ['Delta-hedge error (s.d., ' + steps + ' rebalances)', omF(ST.sd(errs), 4), `mean ${omF(ST.mean(errs), 4)}; halves when rebalancing 4× more often`]])}
      <div class="grid2">${omC(1, 'Value today vs payoff at expiry')}${omC(2, 'Delta and gamma vs spot')}${omC(3, 'Vega and theta vs spot')}${omC(4, 'Discrete delta-hedging P&L (2,000 paths)', '', 'Replication error shrinks like 1/√(rebalances)')}</div>
      ${omS(5, 'Option value surface V(S, time to expiry)')}</div>`;
    kpis('#omK', [{k: 'Price', v: omF(b.price, 3)}, {k: 'Delta', v: omF(b.delta, 3)}, {k: 'Gamma', v: omF(b.gamma, 4)}, {k: 'Vega', v: omF(b.vega, 3)}, {k: 'Theta/day', v: omF(b.theta, 3)}, {k: 'Implied vol', v: iv ? omF(iv * 100, 2) + '%' : '–'}]);
    omXY('om1', [sl('value today', xy(Sg, G.map(g => g.price)), t.s[0]), sl('payoff at T', xy(Sg, pay), t.ink3, {borderDash: [5, 4]}), sp('S, K', [{x: o.S, y: b.price}], t.crit, {pointRadius: 5})], {xt: 'spot S', yt: 'value', d: 2});
    omXY('om2', [sl('Δ', xy(Sg, G.map(g => g.delta)), t.s[0]), sl('Γ', xy(Sg, G.map(g => g.gamma)), t.s[1], {yAxisID: 'y2'})], {xt: 'spot S', yt: 'delta', y2: 'gamma', d: 4});
    omXY('om3', [sl('ν (per 1%)', xy(Sg, G.map(g => g.vega)), t.s[2]), sl('Θ (per day)', xy(Sg, G.map(g => g.theta)), t.crit, {yAxisID: 'y2'})], {xt: 'spot S', yt: 'vega', y2: 'theta', d: 4});
    mk('om4', {type: 'bar', data: {labels: he.x.map(x => fmt(x, 2)), datasets: [bar('paths', he.c, t.s[3], {categoryPercentage: 1, barPercentage: 1})]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 0)}, scales: {x: {grid: {display: false}, ticks: {maxTicksLimit: 8}, title: {display: true, text: 'hedged P&L at expiry', color: t.ink3}}}}});
    const sx = Array.from({length: 31}, (_, i) => o.S * (0.6 + 0.8 * i / 30)), ty = Array.from({length: 21}, (_, i) => o.T * (0.02 + 0.98 * i / 20));
    omSurf('om5', sx, ty, ty.map(tt => sx.map(s => QF.bs({...o, S: s, T: tt}).price)), {xl: 'spot S', yl: 'time to expiry', zl: 'value', d: 1});
  }});

omDef({g: OM_GROUPS[1], id: 'num', name: 'Binomial trees & finite differences',
  intro: `Cox–Ross–Rubinstein binomial tree (u = e<sup>σ√Δt</sup>, risk-neutral p = (e<sup>(r−q)Δt</sup> − d)/(u − d)) and the three finite-difference schemes for the BSM PDE: explicit (stable only if Δt ≤ 1/(σ²N²)), fully implicit, and Crank–Nicolson (θ = ½, second-order in time). American early exercise is applied as V = max(V, payoff) at each step.`,
  fields: omOpt([fO('am', 'Exercise', 'eu', [['eu', 'European'], ['am', 'American']]), fN('NS', 'FD space steps', 200), fN('NT', 'FD time steps', 400)]),
  run(v, out) {
    const o = omOptIn(v), am = v.am === 'am', t = T(), bs = QF.bs(o).price, steps = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500], conv = steps.map(n => QF.binomial({...o, american: am, steps: n}));
    const sch = ['explicit', 'implicit', 'cn'].map(s => { const t0 = performance.now(), r = QF.finiteDiff({...o, american: am, scheme: s, NS: Math.round(v.NS) || 200, NT: Math.round(v.NT) || 400}); return {s, ...r, ms: performance.now() - t0}; });
    const bin = QF.binomial({...o, american: am, steps: 1000}), euro = QF.binomial({...o, american: false, steps: 1000});
    out.innerHTML = `<div class="card wide"><h2>${am ? 'American' : 'European'} ${o.type}: numerical prices</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Method', 'Price', 'Error vs reference', 'Time (ms)', 'Note'], [['Black–Scholes closed form', omF(bs, 5), '', '', am ? 'European only (lower bound for an American put)' : 'reference'], ['Binomial CRR, 1000 steps', omF(bin, 5), omF(bin - (am ? bin : bs), 5), '', am ? 'reference for American' : ''], ...sch.map(x => [{explicit: 'FD explicit', implicit: 'FD implicit', cn: 'FD Crank–Nicolson'}[x.s], omF(x.price, 5), omF(x.price - (am ? bin : bs), 5), fmt(x.ms, 1), x.s === 'explicit' ? 'time steps raised automatically to satisfy stability' : x.s === 'cn' ? 'second-order accurate' : 'unconditionally stable'])])}
      ${am ? `<p class="sub">Early-exercise premium = ${omF(bin - euro, 4)} (American − European by the tree).</p>` : ''}
      <div class="grid2">${omC(1, 'Binomial convergence to Black–Scholes', '', 'The CRR price oscillates as the strike moves between nodes')}${omC(2, 'Finite-difference value V(S) at t = 0')}${omC(3, 'Pricing error across S by scheme')}${omC(4, am ? 'Early-exercise region: V − payoff' : 'Time value: V − payoff')}</div></div>`;
    kpis('#omK', [{k: 'Black–Scholes', v: omF(bs, 4)}, {k: 'Tree (1000)', v: omF(bin, 4)}, ...sch.map(x => ({k: 'FD ' + x.s, v: omF(x.price, 4)}))]);
    omXY('om1', [sl('binomial', steps.map((n, i) => ({x: n, y: conv[i]})), t.s[0], {pointRadius: 3}), sl(am ? 'tree 1000 steps' : 'Black–Scholes', [{x: 5, y: am ? bin : bs}, {x: 500, y: am ? bin : bs}], t.crit, {borderDash: [5, 4]})], {xt: 'steps', yt: 'price', xlog: true, d: 4});
    const keep = i => sch[0].grid[i] <= o.S * 2.2 && sch[0].grid[i] >= o.S * 0.3;
    omXY('om2', sch.map((x, k) => sl(x.s, x.grid.map((s, i) => ({x: s, y: x.V[i]})).filter((_, i) => keep(i)), t.s[k], {borderWidth: k === 2 ? 2.5 : 1.5})).concat([sl('payoff', sch[0].grid.filter((_, i) => keep(i)).map(s => ({x: s, y: o.type === 'call' ? Math.max(s - o.K, 0) : Math.max(o.K - s, 0)})), t.ink3, {borderDash: [5, 4]})]), {xt: 'S', yt: 'V', d: 3});
    omXY('om3', sch.map((x, k) => sl(x.s, x.grid.map((s, i) => ({x: s, y: x.V[i] - (am ? QF.binomial({...o, S: s, american: true, steps: 200}) : QF.bs({...o, S: s}).price)})).filter((p, i) => keep(i) && i % 3 === 0 && p.x > 0), t.s[k])), {xt: 'S', yt: 'FD − reference', d: 5});
    omXY('om4', [sl('V − payoff', sch[2].grid.map((s, i) => ({x: s, y: sch[2].V[i] - (o.type === 'call' ? Math.max(s - o.K, 0) : Math.max(o.K - s, 0))})).filter((_, i) => keep(i)), t.s[4], {fill: 'origin', backgroundColor: t.s[4] + '33'})], {xt: 'S', yt: 'time value', legend: false, d: 4});
  }});

omDef({g: OM_GROUPS[1], id: 'exo', name: 'Monte Carlo exotics',
  intro: `Risk-neutral Monte Carlo with antithetic variates on GBM paths: Asian (arithmetic average), knock-out barrier, digital, floating-strike lookback and plain European. Price = e<sup>−rT</sup>·E<sup>Q</sup>[payoff], standard error from antithetic pairs. Convergence and price-vs-strike are compared with the vanilla Black–Scholes value.`,
  fields: omOpt([fO('kind', 'Exotic', 'asian', [['asian', 'Asian (average price)'], ['barrier', 'Barrier knock-out'], ['digital', 'Digital'], ['lookback', 'Lookback (floating strike)'], ['european', 'European (check)']]), fN('bar', 'Barrier level (blank = 120% / 80% of S)', null), fN('paths', 'Paths', 20000), fN('steps', 'Monitoring steps', 250)]),
  run(v, out) {
    const o = omOptIn(v), t = T(), barrier = v.kind === 'barrier' ? (isNum(v.bar) && v.bar > 0 ? v.bar : o.S * (o.type === 'call' ? 1.2 : 0.8)) : null, P = Math.min(200000, Math.max(1000, v.paths)), st = Math.max(10, Math.min(1000, v.steps));
    const res = QF.mcExotic({...o, kind: v.kind, barrier, paths: P, steps: st}), van = QF.bs(o).price;
    const Ns = [500, 1000, 2000, 5000, 10000, 20000].filter(n => n <= P), conv = Ns.map(n => QF.mcExotic({...o, kind: v.kind, barrier, paths: n, steps: Math.min(st, 100), seed: 7}));
    const Ks = Array.from({length: 9}, (_, i) => o.S * (0.8 + i * 0.05)), byK = Ks.map(K => QF.mcExotic({...o, K, kind: v.kind, barrier, paths: 4000, steps: Math.min(st, 100), seed: 9}).price), vanK = Ks.map(K => QF.bs({...o, K}).price);
    const paths = omGBM(o.S, o.r - o.q, o.sigma, o.T, 100, 40, 61), tt = paths[0].map((_, i) => i * o.T / 100);
    out.innerHTML = `<div class="card wide"><h2>${{asian: 'Asian', barrier: 'Barrier knock-out', digital: 'Digital', lookback: 'Lookback', european: 'European'}[v.kind]} ${o.type}${barrier ? ` (barrier ${fmt(barrier, 2)})` : ''}</h2><div class="kpis" id="omK"></div>
      <div class="grid2">${omC(1, 'Sample risk-neutral paths')}${omC(2, 'Monte Carlo convergence (±2 s.e.)')}${omC(3, 'Price vs strike: exotic vs vanilla')}${omC(4, 'Distribution of the terminal price S(T)')}</div></div>`;
    kpis('#omK', [{k: 'MC price', v: omF(res.price, 4)}, {k: 'Std. error', v: omF(res.se, 4)}, {k: '95% CI', v: `${omF(res.price - 1.96 * res.se, 3)} – ${omF(res.price + 1.96 * res.se, 3)}`}, {k: 'Vanilla BS', v: omF(van, 4)}, {k: 'Ratio to vanilla', v: omF(res.price / van, 3)}]);
    mk('om1', {type: 'line', data: {labels: tt.map(x => fmt(x, 2)), datasets: [...paths.map((p, i) => line('', p, t.s[i % 8] + '88', {borderWidth: 1, tension: 0})), line('K', tt.map(() => o.K), t.ink, {borderDash: [5, 4], borderWidth: 1.5}), ...(barrier ? [line('Barrier', tt.map(() => barrier), t.crit, {borderWidth: 2})] : [])]}, options: {plugins: {legend: {display: false}, tooltip: {enabled: false}}, scales: {x: {...xCat(6), title: {display: true, text: 'years', color: t.ink3}}}}});
    omXY('om2', [sl('estimate', Ns.map((n, i) => ({x: n, y: conv[i].price})), t.s[0], {pointRadius: 3}), sl('+2 s.e.', Ns.map((n, i) => ({x: n, y: conv[i].price + 2 * conv[i].se})), t.ink3, {borderDash: [4, 3], borderWidth: 1}), sl('−2 s.e.', Ns.map((n, i) => ({x: n, y: conv[i].price - 2 * conv[i].se})), t.ink3, {borderDash: [4, 3], borderWidth: 1})], {xt: 'paths', yt: 'price', xlog: true, legend: false, d: 4});
    omXY('om3', [sl('exotic (MC)', xy(Ks, byK), t.s[2], {pointRadius: 3}), sl('vanilla (BS)', xy(Ks, vanK), t.s[0], {borderDash: [5, 4]})], {xt: 'strike K', yt: 'price', d: 3});
    const fin = omGBM(o.S, o.r - o.q, o.sigma, o.T, 1, 6000, 63).map(p => p[1]), H = omHist(fin, 50), m2 = Math.log(o.S) + (o.r - o.q - o.sigma ** 2 / 2) * o.T, s2 = o.sigma * Math.sqrt(o.T);
    omXY('om4', [sl('simulated', xy(H.x, H.dens), t.s[0], {stepped: 'middle', fill: 'origin', backgroundColor: t.s[0] + '22'}), sl('lognormal density', xy(H.x, H.x.map(x => npdf(Math.log(x), m2, s2) / x)), t.crit)], {xt: 'S(T)', yt: 'density', d: 4});
  }});

omDef({g: OM_GROUPS[1], id: 'sv', name: 'Heston & jump smiles',
  intro: `Stochastic volatility (Heston): dv = κ(θ − v)dt + ξ√v dW₂, corr(dW₁, dW₂) = ρ — negative ρ produces the equity skew. Merton jump-diffusion adds Poisson jumps (intensity λ, log-jump N(μ<sub>J</sub>, σ<sub>J</sub>²)) that steepen short-dated smiles. Prices by Monte Carlo, then inverted through Black–Scholes to implied volatility — the volatility smile and surface.`,
  fields: [fN('S', 'Spot S', 100), fN('T', 'Maturity T (years)', 0.5), fN('r', 'r %', () => +fmt(sqRf(), 2)), fN('v0', 'Heston v₀ (variance)', 0.04), fN('kap', 'κ', 2), fN('th', 'θ (long-run var.)', 0.04), fN('xi', 'ξ (vol of vol)', 0.5), fN('rho', 'ρ', -0.7), fN('sig', 'Merton diffusion σ %', 15), fN('lam', 'Jump intensity λ / yr', 0.5), fN('muJ', 'Mean log-jump μ_J', -0.1), fN('sJ', 'Jump vol σ_J', 0.15), fN('paths', 'Paths', 20000)],
  run(v, out) {
    const t = T(), S = v.S, r = v.r / 100, P = Math.max(2000, Math.min(60000, v.paths)), Ks = Array.from({length: 13}, (_, i) => S * (0.7 + i * 0.05));
    const hp = QF.hestonMC({S, K: S, T: v.T, r, v0: v.v0, kappa: v.kap, theta: v.th, xi: v.xi, rho: v.rho, strikes: Ks, paths: P, steps: 100}), mp = QF.mertonJumpMC({S, K: S, T: v.T, r, sigma: v.sig / 100, lam: v.lam, muJ: v.muJ, sigJ: v.sJ, strikes: Ks, paths: P});
    const ivOf = (p, K, TT) => { const intr = Math.max(S - K * Math.exp(-r * TT), 0); return p > intr + 1e-6 ? QF.impliedVol(p, {S, K, T: TT, r, type: 'call'}) * 100 : null; };
    const ivH = hp.map(x => ivOf(x.price, x.K, v.T)), ivM = mp.map(x => ivOf(x.price, x.K, v.T)), Ts = [0.1, 0.25, 0.5, 1, 2];
    const surf = Ts.map(TT => QF.hestonMC({S, K: S, T: TT, r, v0: v.v0, kappa: v.kap, theta: v.th, xi: v.xi, rho: v.rho, strikes: Ks, paths: 6000, steps: Math.max(20, Math.round(TT * 100))}).map(x => ivOf(x.price, x.K, TT)));
    out.innerHTML = `<div class="card wide"><h2>Implied-volatility smiles, T = ${v.T}y</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Strike', 'K/S', 'Heston price', 'Heston IV', 'Merton price', 'Merton IV'], Ks.map((K, i) => [fmt(K, 1), fmt(K / S, 2), omF(hp[i].price, 3), omF(ivH[i], 2) + '%', omF(mp[i].price, 3), omF(ivM[i], 2) + '%']), 'scroll')}
      <div class="grid2">${omC(1, 'Volatility smile: Heston vs Merton jumps vs flat BS')}${omC(2, 'Heston smile term structure')}</div>${omS(3, 'Heston implied-volatility surface (strike × maturity)')}</div>`;
    kpis('#omK', [{k: 'Heston ATM IV', v: omF(ivH[6], 2) + '%'}, {k: 'Heston skew (90−110)', v: omF(ivH[4] - ivH[8], 2) + ' pts'}, {k: 'Merton ATM IV', v: omF(ivM[6], 2) + '%'}, {k: 'Merton skew (90−110)', v: omF(ivM[4] - ivM[8], 2) + ' pts'}, {k: 'Feller 2κθ > ξ²', v: 2 * v.kap * v.th > v.xi ** 2 ? 'yes' : 'no'}]);
    omXY('om1', [sl('Heston', xy(Ks, ivH), t.s[0], {pointRadius: 3}), sl('Merton jump-diffusion', xy(Ks, ivM), t.s[1], {pointRadius: 3}), sl('BS √θ', Ks.map(K => ({x: K, y: Math.sqrt(v.th) * 100})), t.ink3, {borderDash: [5, 4]})], {xt: 'strike', yt: 'implied vol %', d: 2});
    omXY('om2', Ts.map((TT, i) => sl('T = ' + TT, xy(Ks, surf[i]), t.s[i])), {xt: 'strike', yt: 'implied vol %', d: 2});
    const ok2 = surf.map(row => row.map(x => isNum(x) ? x : null)); omSurf('om3', Ks, Ts, ok2, {xl: 'strike', yl: 'maturity', zl: 'IV %', d: 1});
  }});

omDef({g: OM_GROUPS[1], id: 'sde', name: 'Random walks, Itô & GBM',
  intro: `Module 1 building blocks on real data: the lognormal random walk dS = μS dt + σS dW fitted to a NEPSE series (μ, σ from log returns), Brownian motion and its quadratic variation Σ(ΔW)² → t (the heart of Itô's lemma, (dW)² = dt), simulated price fan, and the Fokker–Planck transition density p(S′, t′ | S, t) — lognormal with mean ln S + (μ − σ²/2)t.`,
  fields: [fS('sym', 'Symbol', 'NEPSE'), fN('n', 'Estimation window (days)', 750), fN('H', 'Horizon (trading days)', 120), fN('paths', 'Paths', 1000)],
  run(v, out) {
    const {r, px} = sqRet(v.sym, v.n), t = T(), ppy = 240, mu = ST.mean(r) / 100 * ppy + (ST.sd(r) / 100) ** 2 * ppy / 2, sig = ST.sd(r) / 100 * Math.sqrt(ppy), S0 = last(px), H = Math.max(5, Math.round(v.H)), TT = H / ppy;
    const paths = omGBM(S0, mu, sig, TT, H, Math.max(100, Math.min(5000, v.paths)), 71), q = p => paths[0].map((_, i) => omPct(paths.map(x => x[i]), p)), days = paths[0].map((_, i) => i);
    const u = QF.rng(73), N = 2000, dW = Array.from({length: N}, () => Math.sqrt(1 / N) * u.n()); let W = 0, QV = 0; const Wp = [0], QVp = [0]; dW.forEach(d => { W += d; QV += d * d; Wp.push(W); QVp.push(QV); });
    const fin = paths.map(p => last(p)), Hh = omHist(fin, 50), m2 = Math.log(S0) + (mu - sig * sig / 2) * TT, s2 = sig * Math.sqrt(TT);
    const EST = S0 * Math.exp(mu * TT), mcE = ST.mean(fin), sw = Array.from({length: 41}, (_, i) => S0 * Math.exp(-3.2 * s2 + i * 6.4 * s2 / 40)), tw = Array.from({length: 25}, (_, i) => (i + 1) * TT / 25);
    out.innerHTML = `<div class="card wide"><h2>${esc(v.sym)}: GBM fitted on ${r.length} days</h2><div class="kpis" id="omK"></div>
      <p class="sub">Itô check: E[S(T)] = S₀e<sup>μT</sup> = ${omF(EST, 2)}; Monte Carlo mean ${omF(mcE, 2)}. Median S₀e<sup>(μ−σ²/2)T</sup> = ${omF(S0 * Math.exp((mu - sig * sig / 2) * TT), 2)} — lower than the mean because of the −σ²/2 Itô correction.</p>
      <div class="grid2">${omC(1, `Simulated price fan, ${H} days (5–95% band)`)}${omC(2, 'Brownian motion W(t) and quadratic variation Σ(ΔW)²', '', 'Σ(ΔW)² tracks the 45° line t: (dW)² = dt')}${omC(3, 'Terminal distribution vs lognormal transition density')}${omC(4, 'Historical log returns vs normal')}</div>
      ${omS(5, 'Transition density p(S′, t′) of the fitted GBM (Fokker–Planck solution)')}</div>`;
    kpis('#omK', [{k: 'Last price', v: fmt(S0, 2)}, {k: 'Drift μ (ann.)', v: omF(mu * 100, 2) + '%'}, {k: 'Volatility σ (ann.)', v: omF(sig * 100, 2) + '%'}, {k: 'P(S_T < S₀)', v: omF(ST.normCdf((Math.log(S0) - m2) / s2) * 100, 1) + '%'}, {k: '90% range at T', v: `${fmt(Math.exp(m2 - 1.645 * s2), 0)} – ${fmt(Math.exp(m2 + 1.645 * s2), 0)}`}]);
    mk('om1', {type: 'line', data: {labels: days, datasets: [...paths.slice(0, 25).map((p, i) => line('', p, t.s[i % 8] + '55', {borderWidth: 1, tension: 0})), line('5%', q(0.05), t.crit, {borderWidth: 2}), line('median', q(0.5), t.ink, {borderWidth: 2}), line('95%', q(0.95), t.good, {borderWidth: 2})]}, options: {plugins: {legend: {display: false}, tooltip: {filter: c => !!c.dataset.label}}, scales: {x: {...xCat(8), title: {display: true, text: 'trading days ahead', color: t.ink3}}}}});
    const tg = Wp.map((_, i) => i / N), ev = (a) => a.filter((_, i) => i % 4 === 0);
    omXY('om2', [sl('W(t)', ev(xy(tg, Wp)), t.s[0], {borderWidth: 1.2}), sl('Σ(ΔW)²', ev(xy(tg, QVp)), t.crit), sl('t', [{x: 0, y: 0}, {x: 1, y: 1}], t.ink3, {borderDash: [5, 4], borderWidth: 1})], {xt: 't', yt: 'value', d: 3});
    omXY('om3', [sl('simulated S(T)', xy(Hh.x, Hh.dens), t.s[0], {stepped: 'middle', fill: 'origin', backgroundColor: t.s[0] + '22'}), sl('lognormal p(S′,T)', xy(Hh.x, Hh.x.map(x => npdf(Math.log(x), m2, s2) / x)), t.crit)], {xt: 'price at horizon', yt: 'density', d: 5});
    const hr = omHist(r, 60), m3 = ST.mean(r), s3 = ST.sd(r); omXY('om4', [sl('empirical', xy(hr.x, hr.dens), t.s[0], {stepped: 'middle'}), sl('normal', xy(hr.x, hr.x.map(x => npdf(x, m3, s3))), t.crit)], {xt: 'daily log return %', yt: 'density', d: 3});
    omSurf('om5', sw, tw.map(x => x * ppy), tw.map(tt => sw.map(s => npdf(Math.log(s), Math.log(S0) + (mu - sig * sig / 2) * tt, sig * Math.sqrt(tt)) / s)), {xl: 'price S′', yl: 'days ahead', zl: 'density', d: 0, zd: 5});
  }});

/* ============================== Fixed income & credit (CQF module 6) ============================== */
omDef({g: OM_GROUPS[2], id: 'bond', name: 'Bond analytics',
  intro: `Price = Σ c/(1+y/f)<sup>i</sup> + F/(1+y/f)<sup>n</sup>. Macaulay duration (PV-weighted average time), modified duration D* = D/(1 + y/f), convexity, DV01. The price–yield curve is convex: the duration line underestimates the price after any rate move, and adding ½·C·Δy² closes most of the gap. Useful for NRB development bonds and corporate debentures.`,
  fields: [fN('face', 'Face value', 1000), fN('cpn', 'Coupon % p.a.', 8.5), fN('yrs', 'Years to maturity', 7), fO('freq', 'Coupons per year', 2, [[1, 'Annual'], [2, 'Semi-annual'], [4, 'Quarterly']]), fN('ytm', 'Yield to maturity %', 7.5), fN('price', 'or market price (overrides yield)', null)],
  run(v, out) {
    const t = T(), args = {face: v.face, coupon: v.cpn / 100, years: v.yrs, freq: +v.freq}, b = QF.bond(isNum(v.price) && v.price > 0 ? {...args, price: v.price} : {...args, ytm: v.ytm / 100});
    const ys = Array.from({length: 81}, (_, i) => Math.max(0.0005, b.ytm - 0.04 + i * 0.001)), pr = ys.map(y => QF.bond({...args, ytm: y}).price), dy = ys.map(y => y - b.ytm);
    const pvs = b.cf.map((c, i) => c / Math.pow(1 + b.ytm / +v.freq, i + 1));
    out.innerHTML = `<div class="card wide"><h2>${fmt(v.cpn, 2)}% ${v.yrs}-year bond</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Rate shock', 'Exact price', 'Duration approx.', 'Duration + convexity', 'Exact % change'], [-200, -100, -50, 50, 100, 200].map(bp => { const p1 = QF.bond({...args, ytm: b.ytm + bp / 1e4}).price, a1 = b.price * (1 - b.modified * bp / 1e4), a2 = a1 + b.price * 0.5 * b.convexity * (bp / 1e4) ** 2; return [`${bp > 0 ? '+' : ''}${bp} bp`, omF(p1, 2), omF(a1, 2), omF(a2, 2), omF((p1 / b.price - 1) * 100, 2) + '%']; }))}
      <div class="grid2">${omC(1, 'Price–yield curve with duration and convexity approximations')}${omC(2, 'Cash flows and their present values')}</div></div>`;
    kpis('#omK', [{k: 'Price', v: omF(b.price, 3)}, {k: 'YTM', v: omF(b.ytm * 100, 3) + '%'}, {k: 'Macaulay duration', v: omF(b.macaulay, 3) + ' y'}, {k: 'Modified duration', v: omF(b.modified, 3)}, {k: 'Convexity', v: omF(b.convexity, 2)}, {k: 'DV01', v: omF(b.dv01, 4)}]);
    omXY('om1', [sl('exact price', xy(ys.map(y => y * 100), pr), t.s[0]), sl('duration', xy(ys.map(y => y * 100), dy.map(d => b.price * (1 - b.modified * d))), t.crit, {borderDash: [5, 4]}), sl('duration + convexity', xy(ys.map(y => y * 100), dy.map(d => b.price * (1 - b.modified * d + 0.5 * b.convexity * d * d))), t.s[2], {borderDash: [2, 3]}), sp('today', [{x: b.ytm * 100, y: b.price}], t.ink, {pointRadius: 5})], {xt: 'yield %', yt: 'price', d: 2});
    mk('om2', {type: 'bar', data: {labels: b.t.map(x => fmt(x, 2) + 'y'), datasets: [bar('Cash flow', b.cf, t.s[0] + '66'), bar('Present value', pvs, t.s[0])]}, options: {plugins: {tooltip: tip('', 2)}, scales: {x: {grid: {display: false}}, y: {type: 'logarithmic'}}}});
  }});

omDef({g: OM_GROUPS[2], id: 'rate', name: 'Vasicek & CIR short rate',
  intro: `One-factor short-rate models calibrated to Nepal's 91-day T-bill (NRB monthly data, Δt = 1/12): Vasicek dr = κ(θ − r)dt + σ dW (exact AR(1) fit) and CIR dr = κ(θ − r)dt + σ√r dW (weighted least squares; Feller 2κθ &gt; σ² keeps rates positive). Shows simulated rate fans and the model-implied zero-coupon yield curve from the affine bond price P(t,T) = A e<sup>−B r</sup>.`,
  fields: [fO('model', 'Model', 'vasicek', [['vasicek', 'Vasicek'], ['cir', 'Cox–Ingersoll–Ross']]), fO('col', 'Rate series', 'tbill91', [['tbill91', '91-day T-bill'], ['interbank', 'Interbank rate'], ['deposit', 'Average deposit rate'], ['lending', 'Average lending rate'], ['base', 'Base rate']]), fN('yrs', 'Simulation horizon (years)', 5), fN('paths', 'Paths', 500)],
  run(v, out) {
    const d = ds('rates_monthly'); if (!d) throw new Error('No rates_monthly dataset.'); const rows = d.rows.filter(x => isNum(x[v.col]) && x[v.col] > 0); if (rows.length < 36) throw new Error(`Only ${rows.length} monthly observations of ${v.col}.`);
    const t = T(), r = rows.map(x => x[v.col] / 100), lab = rows.map(x => plabel(d, x)), p = QF.shortRateFit(r, 1 / 12, v.model), steps = Math.round(v.yrs * 12), sims = QF.shortRateSim(p, v.yrs, steps, Math.max(50, Math.min(3000, v.paths)), 13);
    const q = pp => sims[0].map((_, i) => omPct(sims.map(s => s[i]), pp) * 100), Tm = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20], yc = Tm.map(TT => -Math.log(QF.zcb(p, TT)) / TT * 100);
    const r0s = Array.from({length: 21}, (_, i) => Math.max(0.002, p.theta * (0.2 + i * 0.1))), tg = Array.from({length: 20}, (_, i) => 0.25 + i * 0.75);
    out.innerHTML = `<div class="card wide"><h2>${v.model === 'cir' ? 'CIR' : 'Vasicek'} fit to ${v.col} (${rows.length} months, ${lab[0]} → ${last(lab)})</h2><div class="kpis" id="omK"></div>
      <div class="grid2">${omC(1, 'History, long-run mean θ and simulated fan')}${omC(2, 'Model zero-coupon yield curve')}${omC(3, 'Distribution of r in ' + v.yrs + ' years')}${omC(4, 'Zero-coupon bond prices P(0,T)')}</div>${omS(5, 'Yield surface: today\'s rate r₀ × maturity')}</div>`;
    kpis('#omK', [{k: 'κ (speed)', v: omF(p.kappa, 3), d: ' half-life ' + omF(Math.log(2) / p.kappa * 12, 1) + ' m'}, {k: 'θ (long-run)', v: omF(p.theta * 100, 2) + '%'}, {k: 'σ', v: omF(p.sigma * (v.model === 'cir' ? 1 : 100), 3) + (v.model === 'cir' ? '' : '%')}, {k: 'r₀ (latest)', v: omF(p.r0 * 100, 2) + '%'}, ...(v.model === 'cir' ? [{k: 'Feller condition', v: p.feller ? 'satisfied' : 'violated', dir: p.feller ? 'up' : 'dn', chip: p.feller ? 'r stays > 0' : 'r can hit 0'}] : [{k: 'P(r < 0) in horizon', v: omF(sims.filter(s => last(s) < 0).length / sims.length * 100, 1) + '%'}])]);
    const fl = sims[0].map((_, i) => 'm+' + i), L2 = [...lab, ...fl.slice(1)], pad = a => [...new Array(lab.length - 1).fill(null), ...a];
    mk('om1', {type: 'line', data: {labels: L2, datasets: [line('history', [...r.map(x => x * 100), ...new Array(steps).fill(null)], t.s[0]), line('θ', L2.map(() => p.theta * 100), t.ink3, {borderDash: [5, 4], borderWidth: 1}), line('5%', pad(q(0.05)), t.crit, {borderWidth: 1.5}), line('median', pad(q(0.5)), t.ink, {borderWidth: 1.5}), line('95%', pad(q(0.95)), t.good, {borderWidth: 1.5}), ...sims.slice(0, 8).map((s, i) => line('', pad(s.map(x => x * 100)), t.s[(i + 2) % 8] + '66', {borderWidth: 1}))]}, options: {plugins: {legend: {display: false}, tooltip: {filter: c => !!c.dataset.label}}, scales: {x: xCat(8), y: {title: {display: true, text: '%', color: t.ink3}}}}});
    omXY('om2', [sl('model yield', xy(Tm, yc), t.s[0], {pointRadius: 3}), sl('θ', [{x: 0.25, y: p.theta * 100}, {x: 20, y: p.theta * 100}], t.ink3, {borderDash: [5, 4]})], {xt: 'maturity (years)', yt: 'yield %', d: 2});
    const H = omHist(sims.map(s => last(s) * 100), 40); mk('om3', {type: 'bar', data: {labels: H.x.map(x => fmt(x, 2)), datasets: [bar('paths', H.c, t.s[2], {categoryPercentage: 1, barPercentage: 1})]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 0)}, scales: {x: {grid: {display: false}, ticks: {maxTicksLimit: 8}, title: {display: true, text: 'rate %', color: t.ink3}}}}});
    omXY('om4', [sl('P(0,T)', xy(Tm, Tm.map(TT => QF.zcb(p, TT))), t.s[4], {pointRadius: 3})], {xt: 'maturity', yt: 'price of 1', legend: false, d: 4});
    omSurf('om5', r0s.map(x => x * 100), tg, tg.map(TT => r0s.map(r0 => -Math.log(QF.zcb({...p, r0}, TT)) / TT * 100)), {xl: 'r₀ %', yl: 'maturity (y)', zl: 'yield %', d: 1});
  }});

omDef({g: OM_GROUPS[2], id: 'merton', name: 'Merton structural credit',
  intro: `Equity is a call on the firm's assets: E = V N(d₁) − D e<sup>−rT</sup>N(d₂) and σ<sub>E</sub>E = N(d₁)σ<sub>V</sub>V, solved jointly for asset value V and asset volatility σ<sub>V</sub>. Distance to default DD = [ln(V/D) + (r − σ<sub>V</sub>²/2)T]/(σ<sub>V</sub>√T), PD = N(−DD), and the credit spread implied by risky debt V − E. Use market cap and equity volatility of a NEPSE company and its total liabilities from the annual report.`,
  fields: [fS('sym', 'Equity volatility from symbol', () => omStocks()[0]), fN('E', 'Market capitalisation E (Rs million)', 20000), fN('sigE', 'Equity volatility % (blank = from symbol)', null), fN('D', 'Debt / liabilities D (Rs million)', 60000), fN('r', 'Risk-free r %', () => +fmt(sqRf(), 2)), fN('T', 'Horizon T (years)', 1)],
  run(v, out) {
    let sE = isNum(v.sigE) && v.sigE > 0 ? v.sigE / 100 : null; if (!sE) { const {r} = sqRet(v.sym, 250); sE = ST.sd(r) / 100 * Math.sqrt(240); }
    const t = T(), r = v.r / 100, m = QF.mertonCredit({E: v.E, sigE: sE, D: v.D, r, T: v.T}), Ds = Array.from({length: 30}, (_, i) => v.D * (0.2 + i * 0.1)), pd = Ds.map(D => QF.mertonCredit({E: v.E, sigE: sE, D, r, T: v.T}));
    const mV = Math.log(m.V) + (r - m.sigV ** 2 / 2) * v.T, sV = m.sigV * Math.sqrt(v.T), Vs = Array.from({length: 121}, (_, i) => Math.exp(mV - 4 * sV + i * 8 * sV / 120));
    out.innerHTML = `<div class="card wide"><h2>Merton model: E = Rs ${fmt(v.E, 0)} m, D = Rs ${fmt(v.D, 0)} m, σ<sub>E</sub> = ${fmt(sE * 100, 1)}%</h2><div class="kpis" id="omK"></div>
      <div class="grid2">${omC(1, 'Asset value distribution at T and the default point D')}${omC(2, 'PD and spread vs leverage (debt level)')}${omC(3, 'Equity = call on assets: E(V) at T')}${omC(4, 'Distance to default vs equity volatility')}</div></div>`;
    kpis('#omK', [{k: 'Asset value V', v: 'Rs ' + fmt(m.V, 0) + ' m'}, {k: 'Asset vol σV', v: omF(m.sigV * 100, 2) + '%'}, {k: 'Distance to default', v: omF(m.DD, 2) + ' σ'}, {k: 'PD (risk-neutral)', v: omF(m.PD * 100, 3) + '%', dir: m.PD > 0.02 ? 'dn' : 'up', chip: m.PD > 0.02 ? 'elevated' : 'low'}, {k: 'Credit spread', v: omF(m.spread * 1e4, 1) + ' bp'}, {k: 'Leverage D/V', v: omF(m.lev * 100, 1) + '%'}]);
    omXY('om1', [sl('density of V(T)', xy(Vs, Vs.map(x => npdf(Math.log(x), mV, sV) / x)), t.s[0], {fill: 'origin', backgroundColor: t.s[0] + '22'}), sl('default region V < D', xy(Vs.filter(x => x <= v.D), Vs.filter(x => x <= v.D).map(x => npdf(Math.log(x), mV, sV) / x)), t.crit, {fill: 'origin', backgroundColor: t.crit + '55'}), sl('D', [{x: v.D, y: 0}, {x: v.D, y: Math.max(...Vs.map(x => npdf(Math.log(x), mV, sV) / x))}], t.ink, {borderDash: [5, 4]})], {xt: 'asset value (Rs m)', yt: 'density', d: 6});
    omXY('om2', [sl('PD %', xy(Ds.map((D, i) => D / pd[i].V * 100), pd.map(x => x.PD * 100)), t.crit), sl('spread (bp)', xy(Ds.map((D, i) => D / pd[i].V * 100), pd.map(x => isNum(x.spread) ? x.spread * 1e4 : null)), t.s[0], {yAxisID: 'y2'}), sp('this firm', [{x: m.lev * 100, y: m.PD * 100}], t.ink, {pointRadius: 6})], {xt: 'leverage D/V %', yt: 'PD %', y2: 'spread bp', d: 2});
    omXY('om3', [sl('equity payoff max(V − D, 0)', xy(Vs, Vs.map(x => Math.max(x - v.D, 0))), t.s[2]), sl('debt payoff min(V, D)', xy(Vs, Vs.map(x => Math.min(x, v.D))), t.s[1])], {xt: 'asset value V(T)', yt: 'payoff (Rs m)', d: 0});
    const sg = Array.from({length: 25}, (_, i) => 0.1 + i * 0.03); omXY('om4', [sl('DD', xy(sg.map(x => x * 100), sg.map(s => QF.mertonCredit({E: v.E, sigE: s, D: v.D, r, T: v.T}).DD)), t.s[3]), sp('this firm', [{x: sE * 100, y: m.DD}], t.ink, {pointRadius: 6})], {xt: 'equity volatility %', yt: 'distance to default', d: 2});
  }});

omDef({g: OM_GROUPS[2], id: 'cds', name: 'CDS hazard & CVA',
  intro: `Reduced-form credit: default arrives as a Poisson jump with hazard λ. The credit triangle λ ≈ s/(1 − R) turns a CDS spread s and recovery R into survival Q(t) = e<sup>−λt</sup>. CVA of a forward contract = (1 − R) Σ EE(tᵢ)·DF(tᵢ)·PD(tᵢ₋₁, tᵢ), with expected positive exposure EE simulated by Monte Carlo — the counterparty-risk charge of XVA.`,
  fields: [fN('s', 'CDS / credit spread (bp)', 250), fN('R', 'Recovery rate %', 40), fN('S', 'Forward: spot', 100), fN('K', 'Forward: delivery price', 100), fN('T', 'Maturity (years)', 3), fN('sig', 'Volatility %', 20), fN('r', 'r %', () => +fmt(sqRf(), 2)), fN('N', 'Notional (units)', 10000)],
  run(v, out) {
    const t = T(), R = v.R / 100, h = QF.cdsHazard({spreadBps: v.s, R, years: [0.5, 1, 2, 3, 4, 5, 7, 10]}), cva = QF.cvaForward({S: v.S, K: v.K, T: v.T, r: v.r / 100, sigma: v.sig / 100, notional: v.N, lam: h.lam, R, steps: 24, paths: 5000});
    out.innerHTML = `<div class="card wide"><h2>Hazard λ = ${fmt(h.lam * 100, 3)}% per year · CVA = Rs ${fmt(cva.cva, 0)}</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Horizon', 'Survival Q(t)', 'Cumulative PD', 'PD in that year'], h.rows.map(x => [x.t + 'y', omF(x.surv * 100, 2) + '%', omF(x.pd * 100, 2) + '%', omF(x.pdYear * 100, 2) + '%']))}
      <div class="grid2">${omC(1, 'Survival and default probability curves')}${omC(2, 'Expected positive exposure EE(t) and marginal PD')}${omC(3, 'CVA contribution by period')}${omC(4, 'CVA sensitivity to the credit spread')}</div></div>`;
    const sens = [50, 100, 200, 300, 500, 800, 1200].map(s => ({s, c: QF.cvaForward({S: v.S, K: v.K, T: v.T, r: v.r / 100, sigma: v.sig / 100, notional: v.N, lam: s / 1e4 / (1 - R), R, steps: 12, paths: 2000}).cva}));
    kpis('#omK', [{k: 'Hazard λ', v: omF(h.lam * 100, 3) + '%'}, {k: '5-year PD', v: omF(h.rows.find(x => x.t === 5).pd * 100, 2) + '%'}, {k: 'CVA', v: 'Rs ' + fmt(cva.cva, 0)}, {k: 'CVA / notional value', v: omF(cva.cva / (v.N * v.S) * 1e4, 1) + ' bp'}, {k: 'Peak EE', v: 'Rs ' + fmt(Math.max(...cva.rows.map(x => x.EE)), 0)}]);
    const tg = Array.from({length: 41}, (_, i) => i * 10 / 40);
    omXY('om1', [sl('survival Q(t)', xy(tg, tg.map(x => Math.exp(-h.lam * x) * 100)), t.good), sl('cumulative PD', xy(tg, tg.map(x => (1 - Math.exp(-h.lam * x)) * 100)), t.crit)], {xt: 'years', yt: '%', d: 2});
    omXY('om2', [sl('EE(t)', cva.rows.map(x => ({x: x.t, y: x.EE})), t.s[0], {pointRadius: 2}), sl('marginal PD', cva.rows.map(x => ({x: x.t, y: x.dPD * 100})), t.crit, {yAxisID: 'y2'})], {xt: 'years', yt: 'EE (Rs)', y2: 'PD %', d: 2});
    mk('om3', {type: 'bar', data: {labels: cva.rows.map(x => fmt(x.t, 2)), datasets: [bar('CVA contribution', cva.rows.map(x => x.contrib), t.s[3])]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 0)}, scales: {x: {grid: {display: false}, title: {display: true, text: 'years', color: t.ink3}}}}});
    omXY('om4', [sl('CVA', sens.map(x => ({x: x.s, y: x.c})), t.s[4], {pointRadius: 3})], {xt: 'spread (bp)', yt: 'CVA (Rs)', legend: false, d: 0});
  }});

omDef({g: OM_GROUPS[2], id: 'copula', name: 'Copula portfolio credit (CDO)',
  intro: `One-factor copula for a portfolio of loans: name i defaults when √ρ·M + √(1−ρ)·εᵢ &lt; N⁻¹(PD). Gaussian copula, or Student-t for tail dependence (joint crashes). The simulated loss distribution gives expected loss, credit VaR and expected losses of CDO tranches (equity 0–3%, mezzanine, senior …). Raising ρ fattens the tail — safer for equity, riskier for senior tranches (the correlation smile). Think of a bank's loan book or a microfinance portfolio.`,
  fields: [fN('names', 'Number of names', 100), fN('pd', 'PD per name %', 2), fN('lgd', 'LGD %', 60), fN('rho', 'Asset correlation ρ', 0.2), fO('cop', 'Copula', 'gaussian', [['gaussian', 'Gaussian'], ['t', 'Student t']]), fN('nu', 't degrees of freedom', 5), fN('sims', 'Simulations', 20000)],
  run(v, out) {
    const t = T(), base = {names: Math.max(10, Math.min(500, Math.round(v.names))), pd: v.pd / 100, lgd: v.lgd / 100, copula: v.cop, nu: v.nu}, c = QF.copulaLoss({...base, rho: v.rho, sims: Math.max(2000, Math.min(100000, v.sims))});
    const rhos = [0.01, 0.1, 0.2, 0.3, 0.45, 0.6], sm = rhos.map(rho => QF.copulaLoss({...base, rho, sims: 5000, seed: 21})), H = omHist(c.losses.map(x => x * 100), 50, 0);
    const other = QF.copulaLoss({...base, rho: v.rho, copula: v.cop === 't' ? 'gaussian' : 't', sims: 10000}), H2 = omHist(other.losses.map(x => x * 100), 50, 0, H.x[H.x.length - 1] + H.w / 2);
    out.innerHTML = `<div class="card wide"><h2>${base.names} names, PD ${v.pd}%, LGD ${v.lgd}%, ρ = ${v.rho}, ${v.cop === 't' ? 't(' + v.nu + ')' : 'Gaussian'} copula</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Tranche', 'Attach – detach', 'Expected loss of tranche'], c.tranches.map((x, i) => [['Equity', 'Junior mezz.', 'Senior mezz.', 'Senior', 'Super senior', 'Super senior 2'][i] || 'T' + i, `${fmt(x.a * 100, 0)}% – ${fmt(x.b * 100, 0)}%`, omF(x.el * 100, 3) + '%']))}
      <div class="grid2">${omC(1, 'Portfolio loss distribution (Gaussian vs t copula)')}${omC(2, 'Tranche expected loss')}${omC(3, 'Correlation smile: tranche EL vs ρ')}${omC(4, 'Tail: P(loss > x) on a log scale')}</div></div>`;
    kpis('#omK', [{k: 'Expected loss', v: omF(c.EL * 100, 3) + '%'}, {k: 'Credit VaR 99%', v: omF(c.VaR99 * 100, 2) + '%'}, {k: 'VaR 99.9%', v: omF(c.VaR999 * 100, 2) + '%'}, {k: 'ES 99%', v: omF(c.ES99 * 100, 2) + '%'}, {k: 'Unexpected loss (99.9% − EL)', v: omF((c.VaR999 - c.EL) * 100, 2) + '%', chip: 'Basel IRB-style capital'}]);
    const gs = v.cop === 't' ? [H2, H] : [H, H2];
    omXY('om1', [sl('Gaussian', xy(gs[0].x, gs[0].c.map(x => x / (v.cop === 't' ? 10000 : c.losses.length))), t.s[0], {stepped: 'middle'}), sl('t copula', xy(gs[1].x, gs[1].c.map(x => x / (v.cop === 't' ? c.losses.length : 10000))), t.crit, {stepped: 'middle'})], {xt: 'portfolio loss %', yt: 'probability', d: 4});
    mk('om2', {type: 'bar', data: {labels: c.tranches.map(x => `${fmt(x.a * 100, 0)}–${fmt(x.b * 100, 0)}%`), datasets: [bar('Tranche EL %', c.tranches.map(x => x.el * 100), t.s[3])]}, options: {plugins: {legend: {display: false}, tooltip: tip('%', 3)}, scales: {x: {grid: {display: false}}, y: {type: 'logarithmic'}}}});
    omXY('om3', c.tranches.slice(0, 4).map((tr, k) => sl(`${fmt(tr.a * 100, 0)}–${fmt(tr.b * 100, 0)}%`, rhos.map((rho, i) => ({x: rho, y: sm[i].tranches[k].el * 100})), t.s[k], {pointRadius: 3})), {xt: 'correlation ρ', yt: 'tranche EL %', d: 3});
    const srt = c.losses.slice().sort((a, b) => a - b), xs = Array.from({length: 60}, (_, i) => i * Math.max(...srt) / 59);
    omXY('om4', [sl('P(L > x)', xs.map(x => ({x: x * 100, y: srt.filter(l => l > x).length / srt.length})).filter(p => p.y > 0), t.s[0])], {xt: 'loss %', yt: 'exceedance probability', ylog: true, legend: false, d: 4});
  }});

/* ============================== Machine learning (CQF modules 4 and 5) ============================== */
const OM_CLS = [['logit', 'Logistic regression'], ['knn', 'k-nearest neighbours'], ['nb', 'Gaussian naive Bayes'], ['svm', 'Linear SVM'], ['cart', 'Decision tree (CART, Gini)'], ['rf', 'Random forest (bagging)'], ['ada', 'AdaBoost (stumps)'], ['xgb', 'Gradient boosting (XGBoost)']];
function omSplit(sym, frac) {
  const F = sqFeatures(sym), n = F.rows.length; if (n < 300) throw new Error('Need at least 300 days with complete features (60-day look-back).');
  const ntr = Math.floor(n * Math.min(0.9, Math.max(0.5, frac))), mu = F.names.map((_, j) => ST.mean(F.rows.slice(0, ntr).map(r => r[j]))), sd = F.names.map((_, j) => ST.sd(F.rows.slice(0, ntr).map(r => r[j])) || 1);
  const Z = F.rows.map(r => r.map((x, j) => (x - mu[j]) / sd[j])); return {F, n, ntr, Z, y: F.next.map(x => x > 0 ? 1 : 0), live: F.lastF ? F.lastF.map((x, j) => (x - mu[j]) / sd[j]) : null};
}
function omFitCls(kind, X, y) {
  if (kind === 'logit') return QF.logistic(X, y); if (kind === 'knn') return QF.knn(X, y, 25); if (kind === 'nb') return QF.gaussNB(X, y); if (kind === 'svm') return QF.linearSVM(X, y);
  if (kind === 'cart') return QF.cart(X, y, {maxDepth: 4, minLeaf: 30}); if (kind === 'rf') return QF.randomForest(X, y, {trees: 60, maxDepth: 5, minLeaf: 20}); if (kind === 'ada') return QF.adaboost(X, y, {rounds: 60});
  return ML.gbtFit(X, y, {objective: 'logistic', rounds: 150, eta: 0.05, maxDepth: 3, subsample: 0.8, colsample: 0.8, lambda: 5, seed: 3});
}
function omRoc(p, y) { const o = p.map((v, i) => [v, y[i]]).sort((a, b) => b[0] - a[0]), P = y.filter(Boolean).length, N = y.length - P; let tp = 0, fp = 0; const pts = [{x: 0, y: 0}]; o.forEach(([, yy]) => { if (yy) tp++; else fp++; pts.push({x: fp / N, y: tp / P}); }); return pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 200)) === 0 || i === pts.length - 1); }
function omBT(p, next, thr, cost) { let pos = 0; const r = p.map((pp, i) => { const np = pp > thr ? 1 : 0, c = np !== pos ? cost : 0; pos = np; return np * next[i] - c; }); return sqPerf(r); }

omDef({g: OM_GROUPS[3], id: 'cls', name: 'Supervised classifiers',
  intro: `Predict whether tomorrow's close is up (1) or down (0) from 12 engineered features (returns over 1/5/20/60 days, volatility, RSI, distance to the 50-day average, volume z-score, order-flow proxies, high–low range). Chronological split, features standardised on the training part only, evaluated out of sample by AUC (0.5 = coin toss) and a long/flat backtest after costs. Includes logistic, k-NN, naive Bayes, linear SVM, CART, random forest, AdaBoost and XGBoost.`,
  fields: [fS('sym', 'Symbol', 'NEPSE'), fO('m', 'Model', 'all', [['all', 'Compare all eight'], ...OM_CLS]), fN('tr', 'Training share', 0.7), fN('thr', 'Go long if P(up) >', 0.5), fN('cost', 'Cost per switch %', 0.4)],
  run(v, out) {
    const t = T(), D = omSplit(v.sym, v.tr), Xtr = D.Z.slice(0, D.ntr), ytr = D.y.slice(0, D.ntr), Xte = D.Z.slice(D.ntr), yte = D.y.slice(D.ntr), nx = D.F.next.slice(D.ntr), dates = D.F.dates.slice(D.ntr), kinds = v.m === 'all' ? OM_CLS.map(x => x[0]) : [v.m];
    const res = kinds.map(k => { const t0 = performance.now(), m = omFitCls(k, Xtr, ytr), p = m.predict(Xte), acc = p.filter((pp, i) => (pp > 0.5 ? 1 : 0) === yte[i]).length / p.length; return {k, name: OM_CLS.find(x => x[0] === k)[1], m, p, auc: QF.auc(p, yte), acc, bt: omBT(p, nx, v.thr, v.cost / 100), live: D.live ? m.predict([D.live])[0] : null, ms: performance.now() - t0}; });
    const best = res.slice().sort((a, b) => (b.auc ?? 0) - (a.auc ?? 0))[0], bh = sqPerf(nx), base = yte.filter(Boolean).length / yte.length;
    const cm = (() => { const c = [[0, 0], [0, 0]]; best.p.forEach((pp, i) => c[yte[i]][pp > 0.5 ? 1 : 0]++); return c; })();
    out.innerHTML = `<div class="card wide"><h2>${esc(v.sym)}: ${D.ntr} training days, ${D.n - D.ntr} test days (${dates[0]} → ${last(dates)})</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Model', 'AUC', 'Accuracy', 'Strategy return', 'Sharpe', 'Max DD', 'P(up) tomorrow', 'Fit time'], res.map(r => [r.name + (r === best && res.length > 1 ? ' <span class="okc">best</span>' : ''), omF(r.auc, 3), omF(r.acc * 100, 1) + '%', omF(r.bt.total * 100, 1) + '%', omF(r.bt.sharpe, 2), omF(r.bt.mdd * 100, 1) + '%', omF(r.live, 3), fmt(r.ms, 0) + ' ms']).concat([['Buy & hold (test period)', '', `base rate ${fmt(base * 100, 1)}% up`, omF(bh.total * 100, 1) + '%', omF(bh.sharpe, 2), omF(bh.mdd * 100, 1) + '%', '', '']]))}
      <p class="sub">Confusion matrix of ${esc(best.name)} (rows = actual down/up, columns = predicted down/up): [[${cm[0].join(', ')}], [${cm[1].join(', ')}]]. An AUC near 0.5 is normal for daily returns — markets are close to efficient; an edge must survive costs out of sample.</p>
      <div class="grid2">${omC(1, 'ROC curves (out of sample)')}${omC(2, 'Equity curves: long when P(up) > ' + v.thr)}${omC(3, 'Predicted P(up) over the test period (' + esc(best.name) + ')')}${omC(4, res.some(r => r.m.importance) ? 'Feature importance' : 'Calibration: predicted vs realised up-share')}</div></div>`;
    kpis('#omK', [{k: 'Best model', v: best.name}, {k: 'AUC', v: omF(best.auc, 3), chip: best.auc > 0.55 ? 'some signal' : 'near random', dir: best.auc > 0.55 ? 'up' : 'nt'}, {k: 'Strategy Sharpe', v: omF(best.bt.sharpe, 2), d: ' vs ' + omF(bh.sharpe, 2) + ' B&H'}, {k: 'P(up) tomorrow', v: omF(best.live, 3)}]);
    omXY('om1', [...res.map((r, i) => sl(`${r.name} (${fmt(r.auc, 3)})`, omRoc(r.p, yte), t.s[i % 8], {borderWidth: 1.6})), sl('random', [{x: 0, y: 0}, {x: 1, y: 1}], t.ink3, {borderDash: [5, 4], borderWidth: 1})], {xt: 'false positive rate', yt: 'true positive rate', d: 3, xmin: 0, xmax: 1, ymin: 0, ymax: 1});
    mk('om2', {type: 'line', data: {labels: dates, datasets: [...res.map((r, i) => line(r.name, r.bt.curve, t.s[i % 8], {borderWidth: r === best ? 2.4 : 1.2})), line('Buy & hold', bh.curve, t.ink, {borderDash: [5, 4], borderWidth: 1.5})]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(6)}}});
    mk('om3', {type: 'line', data: {labels: dates, datasets: [line('P(up)', best.p, t.s[0], {borderWidth: 1.2}), line('threshold', dates.map(() => v.thr), t.crit, {borderDash: [5, 4], borderWidth: 1})]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 3)}, scales: {x: xCat(6)}}});
    const withImp = res.find(r => r.m.importance);
    if (withImp) { const g = Array.isArray(withImp.m.importance) ? withImp.m.importance : withImp.m.importance.gain, tot = g.reduce((a, b) => a + b, 0) || 1, it = D.F.names.map((nm, j) => ({nm, g: g[j] / tot * 100})).sort((a, b) => b.g - a.g); mk('om4', {type: 'bar', data: {labels: it.map(x => x.nm), datasets: [bar(withImp.name, it.map(x => x.g), t.s[2])]}, options: hbarOpts('%', 1)}); }
    else { const bins = 10, b = Array.from({length: bins}, () => ({p: 0, y: 0, n: 0})); best.p.forEach((pp, i) => { const k = Math.min(bins - 1, Math.floor(pp * bins)); b[k].p += pp; b[k].y += yte[i]; b[k].n++; }); omXY('om4', [sp('bins', b.filter(x => x.n > 5).map(x => ({x: x.p / x.n, y: x.y / x.n})), t.s[0], {pointRadius: 5}), sl('perfect', [{x: 0, y: 0}, {x: 1, y: 1}], t.ink3, {borderDash: [5, 4], borderWidth: 1})], {xt: 'predicted P(up)', yt: 'realised up share', legend: false, d: 3}); }
  }});

omDef({g: OM_GROUPS[3], id: 'reg', name: 'Ridge, lasso & elastic net',
  intro: `Penalised regression of next-day return on the 12 features: minimise ½n⁻¹‖y − Xw‖² + λ[α‖w‖₁ + ½(1−α)‖w‖²] by coordinate descent. α = 0 is ridge (shrinks), α = 1 is lasso (sets weak coefficients exactly to zero), in between elastic net. λ is chosen on a validation block inside the training period (no look-ahead), then judged on the untouched test block — the bias–variance trade-off in practice.`,
  fields: [fS('sym', 'Symbol', 'NEPSE'), fN('a', 'Mix α (0 = ridge, 1 = lasso)', 1), fN('tr', 'Training share', 0.7)],
  run(v, out) {
    const t = T(), D = omSplit(v.sym, v.tr), y = D.F.next.map(x => x * 100), nv = Math.floor(D.ntr * 0.75), lams = Array.from({length: 24}, (_, i) => Math.pow(10, -3.5 + i * 0.16)), a = Math.min(1, Math.max(0, v.a));
    const r2 = (yt, p) => { const m = ST.mean(yt); return 1 - yt.reduce((s, x, i) => s + (x - p[i]) ** 2, 0) / yt.reduce((s, x) => s + (x - m) ** 2, 0); };
    const path = lams.map(lam => { const m = QF.elasticNet(D.Z.slice(0, nv), y.slice(0, nv), {lambda: lam, l1: a}); return {lam, w: m.w, val: r2(y.slice(nv, D.ntr), m.predict(D.Z.slice(nv, D.ntr)))}; });
    const best = path.reduce((b, p) => p.val > b.val ? p : b, path[0]), fin = QF.elasticNet(D.Z.slice(0, D.ntr), y.slice(0, D.ntr), {lambda: best.lam, l1: a}), pte = fin.predict(D.Z.slice(D.ntr)), yte = y.slice(D.ntr), ols = QF.elasticNet(D.Z.slice(0, D.ntr), y.slice(0, D.ntr), {lambda: 1e-8, l1: 0}), pOls = ols.predict(D.Z.slice(D.ntr));
    const hit = pte.filter((p, i) => Math.sign(p) === Math.sign(yte[i])).length / pte.length, bt = sqPerf(pte.map((p, i) => (p > 0 ? 1 : 0) * D.F.next[D.ntr + i])), dates = D.F.dates.slice(D.ntr);
    out.innerHTML = `<div class="card wide"><h2>${esc(v.sym)}: ${a === 0 ? 'ridge' : a === 1 ? 'lasso' : 'elastic net (α = ' + a + ')'}; λ* = ${fmt(best.lam, 4)}</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Feature', 'Coefficient at λ*', 'OLS (λ → 0)'], D.F.names.map((nm, j) => [nm, Math.abs(fin.w[j]) < 1e-10 ? '<span class="warnc">0 (dropped)</span>' : omF(fin.w[j], 5), omF(ols.w[j], 5)]))}
      <div class="grid2">${omC(1, 'Coefficient paths vs λ')}${omC(2, 'Validation R² vs λ (bias–variance)')}${omC(3, 'Out-of-sample: predicted vs actual return')}${omC(4, 'Long when the forecast is positive vs buy & hold')}</div></div>`;
    kpis('#omK', [{k: 'λ*', v: fmt(best.lam, 4)}, {k: 'Non-zero coefficients', v: `${fin.w.filter(w => Math.abs(w) > 1e-10).length} / ${fin.w.length}`}, {k: 'Test R²', v: omF(r2(yte, pte) * 100, 2) + '%', d: ' OLS ' + omF(r2(yte, pOls) * 100, 2) + '%'}, {k: 'Direction hit rate', v: omF(hit * 100, 1) + '%'}, {k: 'Strategy Sharpe', v: omF(bt.sharpe, 2)}]);
    omXY('om1', D.F.names.map((nm, j) => sl(nm, path.map(p => ({x: p.lam, y: p.w[j]})), t.s[j % 8], {borderWidth: 1.4})), {xt: 'λ (log scale)', yt: 'coefficient', xlog: true, d: 4});
    omXY('om2', [sl('validation R²', path.map(p => ({x: p.lam, y: p.val * 100})), t.s[0], {pointRadius: 2}), sp('λ*', [{x: best.lam, y: best.val * 100}], t.crit, {pointRadius: 6})], {xt: 'λ', yt: 'R² %', xlog: true, legend: false, d: 3});
    omXY('om3', [sp('test day', xy(pte, yte), t.s[0], {pointRadius: 2}), sl('45°', [{x: Math.min(...pte), y: Math.min(...pte)}, {x: Math.max(...pte), y: Math.max(...pte)}], t.crit, {borderWidth: 1})], {xt: 'forecast %', yt: 'actual %', legend: false, d: 3});
    mk('om4', {type: 'line', data: {labels: dates, datasets: [line('Model', bt.curve, t.s[2]), line('Buy & hold', sqPerf(D.F.next.slice(D.ntr)).curve, t.ink, {borderDash: [5, 4], borderWidth: 1.5})]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(6)}}});
  }});

omDef({g: OM_GROUPS[3], id: 'regime', name: 'Market regimes (k-means / GMM)',
  intro: `Unsupervised learning: each day is described by its trailing 20-day return and 20-day volatility; k-means (Lloyd with k-means++ seeding) or a Gaussian mixture fitted by EM groups days into regimes such as calm bull, choppy and crisis. Regimes are ordered by volatility. Shows the regime map, the price coloured by regime, per-regime statistics and the regime transition matrix.`,
  fields: [fS('sym', 'Symbol', 'NEPSE'), fN('k', 'Number of regimes', 3), fO('m', 'Method', 'gmm', [['gmm', 'Gaussian mixture (EM)'], ['km', 'k-means']]), fN('w', 'Window (days)', 20), fN('n', 'Sample (last N days, 0 = all)', 0)],
  run(v, out) {
    const {r, d, px} = sqRet(v.sym, v.n), w = Math.max(5, Math.round(v.w)), k = Math.max(2, Math.min(5, Math.round(v.k))), t = T(), F = [], idx = [];
    for (let i = w; i < r.length; i++) { const s = r.slice(i - w, i); F.push([s.reduce((a, b) => a + b, 0), ST.sd(s) * Math.sqrt(240)]); idx.push(i); }
    if (F.length < 100) throw new Error('Not enough data.'); const mu = [0, 1].map(j => ST.mean(F.map(x => x[j]))), sd = [0, 1].map(j => ST.sd(F.map(x => x[j]))), Z = F.map(x => x.map((v2, j) => (v2 - mu[j]) / sd[j]));
    const fit = v.m === 'km' ? QF.kmeans(Z, k) : QF.gmm(Z, k), lab0 = fit.labels, volBy = Array.from({length: k}, (_, c) => ST.mean(F.filter((_, i) => lab0[i] === c).map(x => x[1]))), order = volBy.map((vv, c) => [vv, c]).sort((a, b) => a[0] - b[0]).map(x => x[1]), lab = lab0.map(c => order.indexOf(c));
    const names = k === 2 ? ['Calm', 'Turbulent'] : k === 3 ? ['Calm', 'Normal', 'Turbulent'] : Array.from({length: k}, (_, i) => 'Regime ' + (i + 1)), cols = [t.good, t.s[0], t.s[3], t.crit, t.s[6]];
    const st = names.map((nm, c) => { const ii = idx.filter((_, j) => lab[j] === c), rr = ii.map(i => r[i]); return {nm, n: rr.length, share: rr.length / idx.length, mean: ST.mean(rr) * 240, vol: ST.sd(rr) * Math.sqrt(240), sharpe: ST.mean(rr) / ST.sd(rr) * Math.sqrt(240)}; });
    const TM = names.map(() => new Array(k).fill(0)); for (let i = 1; i < lab.length; i++) TM[lab[i - 1]][lab[i]]++; TM.forEach(row => { const s = row.reduce((a, b) => a + b, 0) || 1; row.forEach((_, j) => row[j] /= s); });
    out.innerHTML = `<div class="card wide"><h2>${esc(v.sym)}: ${k} regimes by ${v.m === 'km' ? 'k-means' : 'Gaussian mixture'} (${F.length} days)</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Regime', 'Days', 'Share', 'Ann. return (next-day)', 'Ann. volatility', 'Sharpe', 'Expected duration (days)'], st.map((s, c) => [`<span style="color:${cols[c]}">●</span> ${s.nm}`, s.n, omF(s.share * 100, 1) + '%', omF(s.mean, 1) + '%', omF(s.vol, 1) + '%', omF(s.sharpe, 2), omF(1 / (1 - TM[c][c] + 1e-9), 1)]))}
      <h3>Transition matrix P(regime tomorrow | today)</h3>${omTbl(['From \\ to', ...names], names.map((nm, i) => [nm, ...TM[i].map(x => omF(x * 100, 1) + '%')]))}
      <div class="grid2">${omC(1, 'Regime map: trailing return vs volatility')}${omC(2, 'Price coloured by regime')}</div></div>`;
    kpis('#omK', [{k: 'Today\'s regime', v: names[last(lab)], dir: last(lab) === k - 1 ? 'dn' : 'up', chip: 'vol ' + fmt(last(F)[1], 1) + '%'}, ...(fit.bic ? [{k: 'BIC', v: fmt(fit.bic, 1)}] : [{k: 'Inertia', v: fmt(fit.inertia, 1)}]), {k: 'Stay probability', v: omF(TM[last(lab)][last(lab)] * 100, 1) + '%'}]);
    omXY('om1', names.map((nm, c) => sp(nm, F.map((x, i) => lab[i] === c ? {x: x[1], y: x[0]} : null).filter(Boolean), cols[c], {pointRadius: 2})), {xt: `${w}-day volatility (ann. %)`, yt: `${w}-day return %`, d: 2});
    const D2 = idx.map(i => d[i]), P2 = idx.map(i => px[i]); mk('om2', {type: 'line', data: {labels: D2, datasets: [line('price', P2, t.ink3, {borderWidth: 1}), ...names.map((nm, c) => line(nm, P2.map((p, i) => lab[i] === c ? p : null), cols[c], {showLine: false, pointRadius: 1.8, spanGaps: false}))]}, options: {plugins: {tooltip: tip('', 1)}, scales: {x: xCat(6)}}});
  }});

/* ============================== Risk (CQF module 2) ============================== */
omDef({g: OM_GROUPS[4], id: 'var', name: 'VaR & ES suite (FRTB)',
  intro: `Value at Risk and Expected Shortfall by historical simulation, parametric (variance–covariance), Monte Carlo with normal and Student-t shocks, and stressed VaR (the worst 250-day window in the sample, Basel 2.5). FRTB replaces 99% VaR with 97.5% ES scaled to liquidity horizons (10–120 days). A rolling backtest counts breaches (Kupiec test; Basel traffic light: 0–4 green, 5–9 amber, 10+ red per 250 days).`,
  fields: [fS('sym', 'Symbol', 'NEPSE'), fN('n', 'Sample (last N days, 0 = all)', 0), fO('q', 'Confidence', 0.99, [[0.95, '95%'], [0.975, '97.5%'], [0.99, '99%'], [0.995, '99.5%']]), fN('h', 'Horizon (days)', 1), fN('pos', 'Position (Rs)', 1000000)],
  run(v, out) {
    const {r, d} = sqRet(v.sym, v.n); if (r.length < 300) throw new Error('Need at least 300 returns.'); const q = +v.q, t = T(), V = QF.varSuite(r, {q, horizon: Math.max(1, v.h)}), rs = x => 'Rs ' + fmt(v.pos * (1 - Math.exp(-x / 100)), 0);
    const M = [['Historical', V.hist], ['Parametric normal', V.normal], ['MC normal', V.mcNormal], [`MC Student-t (ν ≈ ${fmt(V.mcT.nu, 1)})`, V.mcT], ['Stressed (worst 250 d)', V.stressed]].filter(x => x[1]);
    const W = 250, roll = [], brH = [], brN = []; for (let i = W; i < r.length; i++) { const win = r.slice(i - W, i).map(x => -x), hv = ST.quantile(win, q), nv = -ST.mean(r.slice(i - W, i)) + ST.sd(r.slice(i - W, i)) * ST.normInv(q); roll.push({d: d[i], r: r[i], hv, nv}); if (-r[i] > hv) brH.push(i); if (-r[i] > nv) brN.push(i); }
    const nB = roll.length, kH = FIN.kupiec(brH.length, nB, 1 - q), kN = FIN.kupiec(brN.length, nB, 1 - q), last250 = roll.slice(-250), b250 = last250.filter(x => -x.r > x.hv).length, light = b250 <= 4 ? ['green', 'okc'] : b250 <= 9 ? ['amber', 'warnc'] : ['red', 'badc'];
    const LH = [10, 20, 40, 60, 120];
    out.innerHTML = `<div class="card wide"><h2>${esc(v.sym)}: ${q * 100}% ${v.h}-day risk on Rs ${fmt(v.pos, 0)}</h2><div class="kpis" id="omK"></div>
      ${omTbl(['Method', 'VaR %', 'ES %', 'VaR (Rs)', 'ES (Rs)'], M.map(([nm, x]) => [nm, omF(x.VaR), omF(x.ES), rs(x.VaR), rs(x.ES)]).concat([['FRTB ES 97.5% (1 day)', '', omF(V.frtb.ES975), '', rs(V.frtb.ES975)], ['FRTB ES 97.5% (10-day liquidity horizon)', '', omF(V.frtb.ES975_10d), '', rs(V.frtb.ES975_10d)]]))}
      <p class="sub">Rolling 250-day backtest (${nB} days): historical VaR breached ${brH.length} times (expected ${fmt(nB * (1 - q), 1)}, Kupiec p = ${omP(kH.p)}); normal VaR ${brN.length} times (p = ${omP(kN.p)}). Last 250 days: ${b250} breaches ⇒ Basel traffic light <span class="${light[1]}">${light[0]}</span>.${V.stressed ? ` Stressed window: ${d[V.stressed.from]} → ${d[V.stressed.to]}.` : ''}</p>
      <div class="grid2">${omC(1, 'VaR and ES by method')}${omC(2, 'Return distribution with VaR and ES')}${omC(3, 'Rolling 1-day VaR backtest (breaches in red)')}${omC(4, 'FRTB: ES 97.5% scaled to liquidity horizons')}</div></div>`;
    kpis('#omK', [{k: 'Historical VaR', v: omF(V.hist.VaR) + '%', d: ' ' + rs(V.hist.VaR)}, {k: 'Historical ES', v: omF(V.hist.ES) + '%'}, {k: 'Stressed VaR', v: V.stressed ? omF(V.stressed.VaR) + '%' : '–'}, {k: 'FRTB ES 97.5% 10d', v: omF(V.frtb.ES975_10d) + '%'}, {k: 'Traffic light', v: light[0], dir: light[0] === 'green' ? 'up' : 'dn', chip: b250 + ' breaches / 250 d'}]);
    mk('om1', {type: 'bar', data: {labels: M.map(x => x[0]), datasets: [bar('VaR', M.map(x => x[1].VaR), t.s[0]), bar('ES', M.map(x => x[1].ES), t.crit)]}, options: {plugins: {tooltip: tip('%', 2)}, scales: {x: {grid: {display: false}, ticks: {autoSkip: false, maxRotation: 30}}}}});
    const H = omHist(r, 70), m = ST.mean(r), s = ST.sd(r), mx = Math.max(...H.dens);
    omXY('om2', [sl('empirical', xy(H.x, H.dens), t.s[0], {stepped: 'middle', fill: 'origin', backgroundColor: t.s[0] + '22'}), sl('normal', xy(H.x, H.x.map(x => npdf(x, m, s))), t.ink3, {borderDash: [5, 4], borderWidth: 1.5}), sl('−VaR (hist.)', [{x: -V.hist.VaR / Math.sqrt(v.h), y: 0}, {x: -V.hist.VaR / Math.sqrt(v.h), y: mx}], t.s[3]), sl('−ES (hist.)', [{x: -V.hist.ES / Math.sqrt(v.h), y: 0}, {x: -V.hist.ES / Math.sqrt(v.h), y: mx}], t.crit)], {xt: 'daily return %', yt: 'density', d: 3});
    mk('om3', {type: 'bar', data: {labels: roll.map(x => x.d), datasets: [bar('return', roll.map(x => x.r), roll.map(x => -x.r > x.hv ? t.crit : t.s[0] + '88'), {maxBarThickness: 3, order: 2}), line('−VaR historical', roll.map(x => -x.hv), t.s[3], {type: 'line', borderWidth: 1.4, order: 1}), line('−VaR normal', roll.map(x => -x.nv), t.ink3, {type: 'line', borderWidth: 1, borderDash: [4, 3], order: 1})]}, options: {plugins: {tooltip: tip('%', 2)}, scales: {x: xCat(8)}}});
    mk('om4', {type: 'bar', data: {labels: LH.map(x => x + ' d'), datasets: [bar('ES 97.5%', LH.map(h => V.frtb.ES975 * Math.sqrt(h)), t.s[4])]}, options: {plugins: {legend: {display: false}, tooltip: tip('%', 2)}, scales: {x: {grid: {display: false}, title: {display: true, text: 'liquidity horizon', color: t.ink3}}}}});
  }});
