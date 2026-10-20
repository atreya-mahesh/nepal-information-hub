/* Research lab › Fear & Greed: a NEPSE sentiment index from market internals and news tone.
   Each component is scored 0–100 by its percentile over a trailing window; component weights come from the gain
   importance of an XGBoost model (gradient-boosted trees) that predicts the next 20-session NEPSE return from the
   components, so components that carry more information about the market get more weight. */
'use strict';
const FG = {win: 500, horizon: 20, weights: 'xgb', lastCalc: null};
const FG_COMP = [
  ['mom', 'Market momentum', 'NEPSE vs its 125-session average'], ['strength', 'Price strength', 'Position in the 52-week high–low range'], ['rsi', 'RSI (14)', 'Overbought / oversold'],
  ['vol', 'Volatility (inverted)', '20-session volatility vs its 1-year average; calm = greed'], ['activity', 'Turnover surge', '5-session average turnover vs 60-session'], ['dd', 'Drawdown (inverted)', 'Distance below the running peak'],
  ['breadth', 'Breadth', 'Share of tracked symbols above their 50-session average'], ['rates', 'Rates (inverted)', '3-month change in the 91-day T-bill rate; falling rates = greed'], ['news', 'News sentiment', '5-session average lexicon tone of economic news']];
function fgCompute() {
  const S = priceSeries('NEPSE'); if (S.c.length < 300) throw new Error('Fear & Greed needs at least 300 sessions of NEPSE prices.');
  const c = S.c, d = S.date, n = c.length, lr = c.map((x, i) => i ? Math.log(x / c[i - 1]) : null), sma125 = QC.sma(c, 125), hi = QC.rmax(c, 240), lo = QC.rmin(c, 240), rsi = QC.rsi(c, 14), v20 = QC.rstd(lr, 20), v250 = QC.sma(v20, 250), to = S.v, t5 = QC.sma(to, 5), t60 = QC.sma(to, 60), dd = QC.drawdown(c);
  // breadth over all tracked non-index symbols
  const others = symbols().filter(s => !INDEX_SYMS.test(s)), maps = others.map(s => { const P = priceSeries(s), m = new Map(), sm = QC.sma(P.c, 50); P.date.forEach((dt, i) => { if (isNum(sm[i])) m.set(dt, P.c[i] > sm[i] ? 1 : 0); }); return m; });
  const breadth = d.map(dt => { const v = maps.map(m => m.get(dt)).filter(isNum); return v.length >= 3 ? ST.mean(v) : null; });
  // rates: monthly T-bill mapped to dates (forward filled), 3-month change
  const rm = ds('rates_monthly'), rk = new Map((rm?.rows || []).filter(r => isNum(r.tbill91)).map(r => [alignKey(rm, r), r.tbill91])), rkeys = [...rk.keys()].sort();
  const rateAt = dt => { const k = dateToFym(dt); let best = null; for (const x of rkeys) { if (x <= k) best = x; else break; } return best ? rk.get(best) : null; }, rates = d.map(rateAt), rch = rates.map((v, i) => i >= 63 && isNum(v) && isNum(rates[i - 63]) ? v - rates[i - 63] : null);
  const tone = new Map((ds('news_sentiment')?.rows || []).map(r => [r.date, r.tone])), toneArr = d.map(dt => tone.has(dt) ? tone.get(dt) : null), toneE = toneArr.map((_, i) => { const w = toneArr.slice(Math.max(0, i - 4), i + 1).filter(isNum); return w.length ? ST.mean(w) : null; });
  const raw = {mom: c.map((x, i) => isNum(sma125[i]) ? (x / sma125[i] - 1) * 100 : null), strength: c.map((x, i) => isNum(hi[i]) && hi[i] > lo[i] ? (x - lo[i]) / (hi[i] - lo[i]) : null), rsi, vol: v20.map((v, i) => isNum(v) && isNum(v250[i]) && v250[i] ? -(v / v250[i]) : null),
    activity: t5.map((v, i) => isNum(v) && isNum(t60[i]) && v > 0 && t60[i] > 0 ? Math.log(v / t60[i]) : null), dd: dd.map(v => isNum(v) ? v : null), breadth, rates: rch.map(v => isNum(v) ? -v : null), news: toneE};
  // percentile score over trailing window (0 = most fearful, 100 = most greedy)
  const W = FG.win, score = {}; for (const [k] of FG_COMP) { const a = raw[k]; score[k] = a.map((v, i) => { if (!isNum(v)) return null; const w = a.slice(Math.max(0, i - W + 1), i + 1).filter(isNum); if (w.length < (k === 'news' ? 5 : 60)) return null; return w.filter(x => x <= v).length / w.length * 100; }); }
  const avail = FG_COMP.map(([k]) => k).filter(k => score[k].filter(isNum).length > 100);
  // XGBoost weights: predict forward return from component scores
  const H = FG.horizon, fwd = c.map((x, i) => i + H < n ? (c[i + H] / x - 1) * 100 : null), rowsI = []; for (let i = 0; i < n; i++) if (isNum(fwd[i]) && avail.every(k => isNum(score[k][i]))) rowsI.push(i);
  let w = Object.fromEntries(avail.map(k => [k, 1 / avail.length])), imp = null, model = null;
  if (rowsI.length > 200) { const X = rowsI.map(i => avail.map(k => score[k][i])), y = rowsI.map(i => fwd[i]); model = ML.gbtFit(X, y, {rounds: 200, eta: 0.05, maxDepth: 3, subsample: 0.8, colsample: 0.8, lambda: 5, seed: 3}); const g = model.importance.gain, tot = g.reduce((a, b) => a + b, 0) || 1; imp = Object.fromEntries(avail.map((k, j) => [k, g[j] / tot]));
    if (FG.weights === 'xgb') { const floor = 0.04; let s = 0; avail.forEach(k => { w[k] = Math.max(floor, imp[k]); s += w[k]; }); avail.forEach(k => w[k] /= s); } }
  // news only exists for recent days: include it where available and renormalise
  const index = d.map((_, i) => { let s = 0, ws = 0; for (const k of [...avail, ...(avail.includes('news') ? [] : ['news'])]) { const v = score[k]?.[i], wk = k === 'news' && !avail.includes('news') ? 0.08 : w[k]; if (isNum(v) && wk) { s += wk * v; ws += wk; } } return ws > 0.5 ? s / ws : null; });
  const pairs = []; for (let i = 0; i < n; i++) if (isNum(index[i]) && isNum(fwd[i])) pairs.push([index[i], fwd[i]]); const ic = QC.corr(pairs.map(p => p[0]), pairs.map(p => p[1])), buckets = [[0, 25], [25, 45], [45, 55], [55, 75], [75, 101]].map(([a, b]) => { const v = pairs.filter(p => p[0] >= a && p[0] < b).map(p => p[1]); return {a, b, n: v.length, m: v.length ? ST.mean(v) : null}; });
  return {d, c, raw, score, w, imp, index, avail, ic, buckets, H};
}
const fgLabel = v => !isNum(v) ? '–' : v < 25 ? 'Extreme fear' : v < 45 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme greed';
function fgGauge(v) { const ang = Math.PI * (1 - v / 100), cx = 150, cy = 140, R = 110, arc = (a0, a1, col) => { const p = a => [cx + R * Math.cos(Math.PI * (1 - a / 100)), cy - R * Math.sin(Math.PI * (1 - a / 100))], [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}" stroke="${col}" stroke-width="22" fill="none"/>`; };
  return `<svg viewBox="0 0 300 175" width="100%" style="max-width:380px" role="img" aria-label="Fear and greed gauge ${fmt(v, 0)}">${arc(0, 25, '#d03b3b')}${arc(25, 45, '#eb8a4a')}${arc(45, 55, '#b9bec8')}${arc(55, 75, '#7ac47a')}${arc(75, 100, '#0ca30c')}
    <line x1="${cx}" y1="${cy}" x2="${cx + (R - 30) * Math.cos(ang)}" y2="${cy - (R - 30) * Math.sin(ang)}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="7" fill="var(--ink)"/>
    <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-size="30" font-weight="700" fill="var(--ink)" font-family="JetBrains Mono, monospace">${fmt(v, 0)}</text><text x="20" y="${cy + 20}" font-size="11" fill="var(--ink-3)">0</text><text x="272" y="${cy + 20}" font-size="11" fill="var(--ink-3)">100</text></svg>`; }
function renderFG() {
  const p = $('#p-fg');
  p.innerHTML = `<div class="card wide"><div class="chead"><div><h2>NEPSE Fear &amp; Greed index</h2><p class="sub">Nine market and news components, each scored 0–100 against its own last ${FG.win} sessions, combined with weights learned by XGBoost (gain importance for predicting the next ${FG.horizon}-session NEPSE return).</p></div>
    <div class="ctrls"><select id="fgW"><option value="xgb">XGBoost weights</option><option value="equal">Equal weights</option></select><button class="btn small" id="fgRef">↻ Refresh news</button></div></div><div class="readout" id="fgMsg"></div><div id="fgOut"></div></div>`;
  $('#fgW').value = FG.weights; $('#fgW').onchange = e => { FG.weights = e.target.value; fgDraw(); };
  $('#fgRef').onclick = async () => { await newsRefreshUI('#fgMsg'); fgDraw(); };
  fgDraw();
}
function fgDraw() {
  const out = $('#fgOut'); let R; try { R = fgCompute(); } catch (e) { out.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const t = T(), iLast = R.index.length - 1 - R.index.slice().reverse().findIndex(isNum), now = R.index[iLast], wk = R.index[iLast - 5], mo = R.index[iLast - 21], yr = R.index[iLast - 240];
  out.innerHTML = `<div class="grid2"><div class="gauge-wrap">${fgGauge(now)}<h3 style="margin:0">${fgLabel(now)}</h3><p class="sub">as of ${R.d[iLast]}</p>
      <div class="readout"><span>1 week ago <b>${fmt(wk, 0)}</b> ${fgLabel(wk)}</span><span>1 month ago <b>${fmt(mo, 0)}</b> ${fgLabel(mo)}</span><span>1 year ago <b>${fmt(yr, 0)}</b> ${fgLabel(yr)}</span></div></div>
    <div><h3>Components today</h3><div class="tbl"><table><thead><tr><th class="txt">Component</th><th>Score</th><th>Weight</th><th class="txt">Reading</th></tr></thead><tbody>${FG_COMP.map(([k, l, note]) => { const v = R.score[k][iLast], wt = R.avail.includes(k) ? R.w[k] : null; return `<tr><td class="txt" title="${esc(note)}">${esc(l)}</td><td class="num"><b>${isNum(v) ? fmt(v, 0) : '–'}</b></td><td class="num">${isNum(wt) ? fmt(wt * 100, 0) + '%' : k === 'news' && isNum(v) ? 'small (recent only)' : '–'}</td><td class="txt">${isNum(v) ? fgLabel(v) : '<span class="sub">no data</span>'}</td></tr>`; }).join('')}</tbody></table></div></div></div>
  <h3>Index history with NEPSE</h3><div class="cv tall"><canvas id="fgC1"></canvas></div>
  <div class="grid2"><div><h3>XGBoost importance (what moves the market most)</h3><div class="cv short"><canvas id="fgC2"></canvas></div></div>
    <div><h3>Average next-${R.H}-session NEPSE return by zone</h3><div class="cv short"><canvas id="fgC3"></canvas></div><p class="sub">Correlation of the index with the next ${R.H}-session return: ${fmt(R.ic, 3)}. ${R.ic < 0 ? 'Negative: extreme greed has tended to precede weaker returns (contrarian signal).' : 'Positive: sentiment has tended to persist.'} In-sample history, not a guarantee.</p></div></div>`;
  const start = Math.max(0, R.d.length - 750);
  mk('fgC1', {type: 'line', data: {labels: R.d.slice(start), datasets: [line('Fear & Greed', R.index.slice(start), t.s[1], {yAxisID: 'y', borderWidth: 1.5}), line('NEPSE', R.c.slice(start), t.ink3, {yAxisID: 'y2', borderWidth: 1})]}, options: {plugins: {tooltip: tip('', 1)}, scales: {x: xCat(10), y: {min: 0, max: 100}, y2: {position: 'right', grid: {display: false}}}}});
  if (R.imp) { const ks = R.avail.slice().sort((a, b) => R.imp[b] - R.imp[a]); mk('fgC2', {type: 'bar', data: {labels: ks.map(k => FG_COMP.find(x => x[0] === k)[1]), datasets: [bar('Gain share %', ks.map(k => R.imp[k] * 100), t.s[0])]}, options: hbarOpts('%', 1)}); }
  mk('fgC3', {type: 'bar', data: {labels: R.buckets.map(b => `${fgLabel(b.a + 1)} (${b.n})`), datasets: [bar('Avg forward return %', R.buckets.map(b => b.m), R.buckets.map(b => isNum(b.m) && b.m < 0 ? t.crit : t.good))]}, options: {plugins: {legend: {display: false}, tooltip: tip('%', 2)}, scales: {x: {grid: {display: false}}}}});
  FG.lastCalc = {value: now, label: fgLabel(now), date: R.d[iLast]};
}
