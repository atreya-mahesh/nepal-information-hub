/* Stock market hub: Market overview (in app.js renderStock), Technical analysis, Fundamental analysis.
   Loaded before app.js; only defines functions. */
'use strict';

const StkHub = {sub: 'market'};
const STK_SUBS = [['market', 'Market overview'], ['daily', "Today's market"], ['ta', 'Technical'], ['fa', 'Fundamental'], ['val', 'Valuation'], ['rep', 'Annual reports'], ['broker', 'Broker analysis'], ['notice', 'Notices']];
function renderStockHub(fromNav) {
  if (!fromNav) { try { StkHub.sub = localStorage.getItem('nmm-stock-sub') || StkHub.sub; } catch (e) {} }
  if (!STK_SUBS.some(x => x[0] === StkHub.sub)) StkHub.sub = 'market';
  try { localStorage.setItem('nmm-stock-sub', StkHub.sub); } catch (err) {}
  const p = $('#p-stock');
  p.innerHTML = `<div id="stockBody" style="display:grid;gap:18px"></div>`;
  ({market: renderStock, daily: renderMarketDaily, ta: renderTA, fa: renderFA, val: renderValuation, rep: renderReports, broker: renderBroker, notice: renderNoticesUser})[StkHub.sub]();
}
const symbols = () => { const d = ds('stock_ohlc'); if (!d) return []; const c = {}; d.rows.forEach(r => c[r.symbol] = (c[r.symbol] || 0) + 1); return Object.keys(c).sort((a, b) => a === 'NEPSE' ? -1 : b === 'NEPSE' ? 1 : a.localeCompare(b)); };
const INDEX_SYMS = /^(NEPSE|BANKING|SENSITIVE|FLOAT|SENFLOAT|DEVBANK|FINANCE|HOTELS|HYDROPOWER|INVESTMENT|LIFEINSU|MANUFACTURE|MICROFINANCE|MUTUAL|NONLIFEINSU|OTHERS|TRADING|HYDRO)$/;
function priceSeries(sym) {
  const rows = ds('stock_ohlc').rows.filter(r => r.symbol === sym && isNum(r.close));
  return {rows, date: rows.map(r => r.date), o: rows.map(r => r.open ?? r.close), h: rows.map(r => r.high ?? r.close), l: rows.map(r => r.low ?? r.close), c: rows.map(r => r.close), v: rows.map(r => r.volume ?? null)};
}
function periodsPerYear(dates) { if (dates.length < 30) return 240; const a = new Date(dates[0]), b = new Date(last(dates)); const yrs = (b - a) / (365.25 * 864e5); return yrs > 0.25 ? Math.round(dates.length / yrs) : 240; }
const nparse = (s, d) => { const v = parseFloat(s); return isFinite(v) && v > 0 ? v : d; };

/* ============================== TECHNICAL (automated) ==============================
   Every symbol in the published price data is rated with TradingView-style technicals (ta-core.js) right after each
   upload; nothing to set by hand. Each symbol opens the full interactive chart (chart.html) in a new tab. */
const TSC = {act: true, q: '', rating: 'all', sig: '', tf: 'D', sort: 'to', dir: -1, cache: null, key: '', busy: false, page: 0};
const chartUrl = s => 'chart.html#' + encodeURIComponent(s);
const openChart = s => window.open(chartUrl(s), '_blank', 'noopener');
const TS_SIGNALS = [['', 'All signals'], ['gc', 'Golden cross (last 5 bars)'], ['dc', 'Death cross (last 5 bars)'], ['os', 'RSI oversold (< 30)'], ['ob', 'RSI overbought (> 70)'], ['mu', 'MACD crossed up (5 bars)'], ['md', 'MACD crossed down (5 bars)'], ['hi', 'At 52-week high'], ['lo', 'At 52-week low'], ['a200', 'Above SMA 200'], ['b200', 'Below SMA 200'], ['vs', 'Volume spike (> 2× 20-day avg)'], ['bbs', 'Bollinger squeeze'], ['st', 'Supertrend turned up (5 bars)']];
const RT_CLS = l => ({'Strong buy': 'sbuy', 'Buy': 'buy', 'Neutral': 'neu', 'Sell': 'sell', 'Strong sell': 'ssell'})[l] || 'neu';
function tsBarsBySymbol() { const by = new Map(); for (const r of ds('stock_ohlc')?.rows || []) { if (!isNum(r.close) || r.close <= 0) continue; let a = by.get(r.symbol); if (!a) by.set(r.symbol, a = []); a.push(r); }
  for (const [s, a] of by) { a.sort((x, y) => x.date < y.date ? -1 : 1); by.set(s, a.map(r => { const c = r.close, o = r.open > 0 ? r.open : c; return {t: String(r.date).slice(0, 10), o, h: Math.max(r.high > 0 ? r.high : c, o, c), l: Math.min(r.low > 0 ? r.low : c, o, c), c, v: isNum(r.volume) ? r.volume : null, to: isNum(r.turnover) ? r.turnover : null, pc: r.prev_close}; })); } return by; }
function tsRow(sym, all) { const B = TAI.resample(all, TSC.tf), n = B.length; if (n < 2) return null; const S = B.slice(-320), L = S[S.length - 1], P = S[S.length - 2], c = S.map(b => b.c), m = S.length - 1;
  const R = S.length >= 60 ? TAI.rating(S) : null, s50 = TAI.sma(c, 50), s200 = TAI.sma(c, 200), rsi = TAI.rsi(c, 14), sig = [];
  const cross = (a, b, k = 5) => { for (let i = Math.max(1, m - k + 1); i <= m; i++) if (isNum(a[i]) && isNum(b[i]) && isNum(a[i - 1]) && isNum(b[i - 1])) { if (a[i - 1] <= b[i - 1] && a[i] > b[i]) return 1; if (a[i - 1] >= b[i - 1] && a[i] < b[i]) return -1; } return 0; };
  const gx = cross(s50, s200); if (gx > 0) sig.push('gc'); if (gx < 0) sig.push('dc');
  if (rsi[m] < 30) sig.push('os'); if (rsi[m] > 70) sig.push('ob');
  const md = TAI.study('MACD').calc(S, {f: 12, s: 26, g: 9}), mx = cross(md[1].data, md[2].data); if (mx > 0) sig.push('mu'); if (mx < 0) sig.push('md');
  const y1 = S.slice(-(TSC.tf === 'D' ? 245 : TSC.tf === 'W' ? 52 : 12)), hi = Math.max(...y1.map(b => b.h)), lo = Math.min(...y1.map(b => b.l)); if (L.h >= hi) sig.push('hi'); if (L.l <= lo) sig.push('lo');
  if (isNum(s200[m])) sig.push(L.c > s200[m] ? 'a200' : 'b200');
  const v = S.map(b => b.v), va = TAI.sma(v.map(x => x ?? 0), 20)[m - 1]; const vx = va > 0 && isNum(L.v) ? L.v / va : null; if (vx > 2) sig.push('vs');
  const bw = TAI.study('BBW').calc(S, {p: 20, m: 2})[0].data.filter(isNum); if (bw.length > 60 && bw[bw.length - 1] <= Math.min(...bw.slice(-120)) * 1.05) sig.push('bbs');
  const st = TAI.study('ST').calc(S, {p: 10, m: 3})[0].data; for (let i = Math.max(1, m - 4); i <= m; i++) if (isNum(st[i]) && !isNum(st[i - 1])) { sig.push('st'); break; }
  const pc = isNum(L.pc) && L.pc > 0 && TSC.tf === 'D' ? L.pc : P.c;
  return {sym, idx: INDEX_SYMS.test(sym), t: L.t, c: L.c, ch: (L.c / pc - 1) * 100, v: L.v, to: L.to, n, R, score: R ? R.summary.score : null, label: R ? R.summary.label : 'Too little data', ma: R?.ma.label, osc: R?.osc.label,
    rsi: rsi[m], d50: isNum(s50[m]) ? (L.c / s50[m] - 1) * 100 : null, d200: isNum(s200[m]) ? (L.c / s200[m] - 1) * 100 : null, pos: hi > lo ? (L.c - lo) / (hi - lo) * 100 : null, vx, sig}; }
async function tsCompute() { const rows = ds('stock_ohlc')?.rows || [], key = `${rows.length}|${rows.length ? rows[rows.length - 1].date : ''}|${TSC.tf}|${Store.db.updated || ''}|${Market.version || ''}|${Object.keys(Market.data?.days || {}).length}`;
  if (TSC.cache && TSC.key === key) return TSC.cache; if (TSC.busy) return null; TSC.busy = true;
  const by = tsBarsBySymbol(), syms = [...by.keys()], out = []; let k = 0;
  for (const s of syms) { try { const r = tsRow(s, by.get(s)); if (r) out.push(r); } catch (e) { console.warn('TA', s, e); }
    if (++k % 25 === 0) { const el = $('#tsProg'); if (el) el.textContent = `Rating ${k} / ${syms.length} symbols…`; await new Promise(r => setTimeout(r, 0)); if (StkHub.sub !== 'ta') { TSC.busy = false; return null; } } }
  TSC.cache = out; TSC.key = key; TSC.busy = false; return out; }
function renderTA() {
  const b = $('#stockBody');
  b.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Technical analysis</h2><p class="sub">Automated from the price data published in the admin dashboard. Every symbol is rated with TradingView-style technicals (15 moving averages and 11 oscillators) and re-rated after each upload. Click any symbol to open the full interactive chart in a new tab: ${TAI.studies.length} indicators, drawing tools, templates and comparison.</p></div>
      <div class="ctrls"><div class="seg" id="tsTf"><button data-v="D" aria-pressed="${TSC.tf === 'D'}">Daily</button><button data-v="W" aria-pressed="${TSC.tf === 'W'}">Weekly</button><button data-v="M" aria-pressed="${TSC.tf === 'M'}">Monthly</button></div><a class="btn accent" href="${chartUrl('NEPSE')}" target="_blank" rel="noopener">Open full chart ↗</a></div></div>
    <div id="tsKpi"><p class="sub" id="tsProg">Rating symbols…</p></div></div>
    <div class="card wide"><div class="chead"><div><h2>Technical screener</h2><p class="sub" id="tsSub"></p></div>
      <div class="ctrls"><input id="tsQ" type="search" placeholder="Search symbol" value="${esc(TSC.q)}" aria-label="Search symbol" size="12">
      <select id="tsRt" aria-label="Rating">${['all', 'Strong buy', 'Buy', 'Neutral', 'Sell', 'Strong sell'].map(x => `<option value="${x}" ${TSC.rating === x ? 'selected' : ''}>${x === 'all' ? 'All ratings' : x}</option>`).join('')}</select>
      <select id="tsSig" aria-label="Signal">${TS_SIGNALS.map(([k, l]) => `<option value="${k}" ${TSC.sig === k ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="sub" title="Hide symbols with no trade in the last 30 days"><input type="checkbox" id="tsAct" ${TSC.act ? 'checked' : ''}> Active only</label><button class="btn small" id="tsCsv">CSV</button></div></div>
      <div class="tbl" id="tsTbl"></div></div>`;
  seg('tsTf', v => { TSC.tf = v; TSC.page = 0; renderTA(); });
  $('#tsQ').oninput = e => { TSC.q = e.target.value.toUpperCase(); TSC.page = 0; tsDraw(); }; $('#tsRt').onchange = e => { TSC.rating = e.target.value; TSC.page = 0; tsDraw(); }; $('#tsSig').onchange = e => { TSC.sig = e.target.value; TSC.page = 0; tsDraw(); }; $('#tsAct').onchange = e => { TSC.act = e.target.checked; TSC.page = 0; tsDraw(); };
  $('#tsCsv').onclick = () => { const r = tsFiltered(); if (!r) return; const h = ['Symbol', 'Date', 'Close', 'Change %', 'Rating', 'MAs', 'Oscillators', 'RSI 14', 'vs SMA50 %', 'vs SMA200 %', '52W position %', 'Volume x avg', 'Signals'];
    const csv = [h].concat(r.map(x => [x.sym, x.t, x.c, x.ch?.toFixed(2), x.label, x.ma || '', x.osc || '', x.rsi?.toFixed(1), x.d50?.toFixed(2), x.d200?.toFixed(2), x.pos?.toFixed(1), x.vx?.toFixed(2), x.sig.map(s => TS_SIGNALS.find(z => z[0] === s)?.[1]).join('; ')])).map(a => a.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = `technical_screener_${TSC.tf}.csv`; a.click(); };
  tsCompute().then(r => { if (r && $('#tsTbl')) { tsKpis(r); tsDraw(); } });
}
function tsFiltered() { const r = TSC.cache; if (!r) return null; const L = r.reduce((m, x) => x.t > m ? x.t : m, ''), cut = L ? new Date(new Date(L) - 30 * 864e5).toISOString().slice(0, 10) : ''; return r.filter(x => (!TSC.act || x.idx || x.t >= cut) && (!TSC.q || x.sym.includes(TSC.q)) && (TSC.rating === 'all' || x.label === TSC.rating) && (!TSC.sig || x.sig.includes(TSC.sig))); }
function tsKpis(r) { const c = l => r.filter(x => x.label === l).length, tot = r.filter(x => x.R).length, last_ = r.reduce((m, x) => x.t > m ? x.t : m, ''), cur = r.filter(x => x.t === last_ && !x.idx && x.R);
  const br = l => cur.filter(x => x.label === l).length, nep = r.find(x => x.sym === 'NEPSE');
  $('#tsKpi').innerHTML = `<div class="kpis" style="margin:0">${[['Symbols rated', fmt(tot, 0), `latest session ${last_}`], ['NEPSE index', nep ? `<span class="rt ${RT_CLS(nep.label)}">${nep.label}</span>` : '–', nep ? `MAs ${nep.ma || '–'} · Osc ${nep.osc || '–'}` : ''], ['Strong buy / Buy', `${c('Strong buy')} / ${c('Buy')}`, ''], ['Neutral', fmt(c('Neutral'), 0), ''], ['Sell / Strong sell', `${c('Sell')} / ${c('Strong sell')}`, '']].map(([l, v, d]) => `<div class="kpi"><div class="k">${l}</div><div class="v" style="font-size:20px">${v}</div><div class="d">${d}</div></div>`).join('')}</div>
    <div class="rtbar" title="Ratings of stocks that traded on ${last_}">${['Strong sell', 'Sell', 'Neutral', 'Buy', 'Strong buy'].map(l => { const n = br(l); return n ? `<span class="${RT_CLS(l)}" style="flex:${n}">${l} ${n}</span>` : ''; }).join('')}</div>`; }
function tsDraw() { const r = tsFiltered(); if (!r) return; const k = TSC.sort, d = TSC.dir, PER = 100;
  r.sort((a, b) => k === 'sym' ? d * a.sym.localeCompare(b.sym) : d * ((a[k] ?? -1e18) - (b[k] ?? -1e18)));
  const cols = [['sym', 'Symbol'], ['c', 'Last'], ['ch', 'Chg %'], ['score', 'Rating'], ['rsi', 'RSI 14'], ['d50', 'vs SMA 50'], ['d200', 'vs SMA 200'], ['pos', '52W position'], ['vx', 'Vol × avg'], ['to', 'Turnover'], ['sig', 'Signals'], ['', '']];
  const pages = Math.max(1, Math.ceil(r.length / PER)); TSC.page = Math.min(TSC.page, pages - 1); const view = r.slice(TSC.page * PER, TSC.page * PER + PER);
  const pc = v => isNum(v) ? `<span class="${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${fmt(v, 2)}%</span>` : '–';
  $('#tsSub').textContent = `${r.length} of ${TSC.cache.length} symbols · ${({D: 'daily', W: 'weekly', M: 'monthly'})[TSC.tf]} bars · sorted by ${cols.find(c => c[0] === k)?.[1] || k}`;
  $('#tsTbl').innerHTML = `<table><thead><tr>${cols.map(([c, l], i) => `<th class="${c && c !== 'sig' ? 'sortable' : ''} ${i === 0 || c === 'score' || c === 'sig' ? 'txt' : ''}" data-k="${c}">${l}${TSC.sort === c ? (d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${view.map(x => `<tr>
    <td class="txt"><a href="${chartUrl(x.sym)}" target="_blank" rel="noopener" title="Open ${esc(x.sym)} chart in a new tab"><b>${esc(x.sym)}</b></a>${x.idx ? ' <span class="pill">index</span>' : ''}${x.t !== TSC.cache.reduce((m, y) => y.t > m ? y.t : m, '') ? ` <span class="sub" title="last traded">${x.t}</span>` : ''}</td>
    <td class="num">${fmt(x.c, 2)}</td><td class="num">${pc(x.ch)}</td><td class="txt"><span class="rt ${RT_CLS(x.label)}" title="MAs: ${esc(x.ma || '–')} · Oscillators: ${esc(x.osc || '–')}">${x.label}</span></td>
    <td class="num">${isNum(x.rsi) ? fmt(x.rsi, 1) : '–'}</td><td class="num">${pc(x.d50)}</td><td class="num">${pc(x.d200)}</td>
    <td class="num"><span class="pos52"><i style="left:${Math.max(0, Math.min(100, x.pos ?? 50))}%"></i></span> ${isNum(x.pos) ? fmt(x.pos, 0) + '%' : '–'}</td>
    <td class="num">${isNum(x.vx) ? fmt(x.vx, 2) + '×' : '–'}</td><td class="num">${isNum(x.to) ? fmtBig(x.to) : '–'}</td>
    <td class="txt">${x.sig.filter(s => !['a200', 'b200'].includes(s)).map(s => `<span class="sigchip ${['gc', 'os', 'mu', 'hi', 'vs', 'st'].includes(s) ? 'up' : ['dc', 'ob', 'md', 'lo'].includes(s) ? 'dn' : ''}">${esc(TS_SIGNALS.find(z => z[0] === s)[1].replace(/ \(.*\)/, ''))}</span>`).join(' ')}</td>
    <td class="txt"><a class="btn small" href="${chartUrl(x.sym)}" target="_blank" rel="noopener">Chart ↗</a></td></tr>`).join('') || `<tr><td class="txt" colspan="${cols.length}">No symbol matches these filters.</td></tr>`}</tbody></table>
    ${pages > 1 ? `<div class="ctrls" style="margin-top:8px"><button class="btn small" id="tsPrev" ${TSC.page ? '' : 'disabled'}>‹ Prev</button><span class="sub">Page ${TSC.page + 1} / ${pages}</span><button class="btn small" id="tsNext" ${TSC.page < pages - 1 ? '' : 'disabled'}>Next ›</button></div>` : ''}`;
  $('#tsTbl').querySelectorAll('th.sortable').forEach(th => th.onclick = () => { if (TSC.sort === th.dataset.k) TSC.dir *= -1; else { TSC.sort = th.dataset.k; TSC.dir = th.dataset.k === 'sym' ? 1 : -1; } tsDraw(); });
  if ($('#tsPrev')) { $('#tsPrev').onclick = () => { TSC.page--; tsDraw(); }; $('#tsNext').onclick = () => { TSC.page++; tsDraw(); }; } }

/* ============================== FUNDAMENTAL ============================== */
const FA = {sector: '', peMax: '', pbMax: '', roeMin: '', dyMin: '', below: false, q: '', sort: 'score', dir: -1, sym: '', x: 'pb', y: 'roe', r: 12, g: 5, tpe: ''};
const median = a => { const v = a.filter(isNum).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
function faData() {
  const d = ds('stock_fundamentals'); if (!d || !d.rows.length) return null;
  const asof = latestP(d), rows = rowsAt(d, asof).map(r => {
    const eps = isNum(r.eps) ? r.eps : (isNum(r.pe) && r.pe !== 0 && isNum(r.ltp) ? r.ltp / r.pe : null);
    const bvps = isNum(r.bvps) ? r.bvps : (isNum(r.pb) && r.pb !== 0 && isNum(r.ltp) ? r.ltp / r.pb : null);
    const graham = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : null;
    const dps = isNum(r.dps) ? r.dps : (isNum(r.dy) && isNum(r.ltp) ? r.dy * r.ltp : null);
    return {...r, eps, bvps, graham, gUp: graham && r.ltp ? (graham / r.ltp - 1) * 100 : null, dps, ey: r.pe > 0 ? 100 / r.pe : null};
  });
  const sectors = uniq(rows.map(r => r.sector).filter(Boolean)).sort();
  const sec = {}; sectors.forEach(s => { const g = rows.filter(r => r.sector === s); sec[s] = {n: g.length, pe: median(g.map(r => r.pe > 0 ? r.pe : null)), pb: median(g.map(r => r.pb > 0 ? r.pb : null)), roe: median(g.map(r => r.roe)), roa: median(g.map(r => r.roa)), dy: median(g.map(r => r.dy))}; });
  // composite score: percentile ranks inside the universe
  const prank = (key, hi = true) => { const v = rows.map(r => r[key]).filter(isNum).sort((a, b) => a - b); return x => { if (!isNum(x) || !v.length) return null; let k = 0; while (k < v.length && v[k] <= x) k++; const p = k / v.length * 100; return hi ? p : 100 - p; }; };
  const pEY = prank('ey'), pBP = prank('pb', false), pROE = prank('roe'), pROA = prank('roa'), pDY = prank('dy');
  rows.forEach(r => { const val = QC.mean([pEY(r.ey), r.pb > 0 ? pBP(r.pb) : null]), qual = QC.mean([pROE(r.roe), pROA(r.roa)]), inc = pDY(r.dy);
    r.sValue = val; r.sQual = qual; r.sInc = inc; const parts = [[val, .4], [qual, .4], [inc, .2]].filter(p => isNum(p[0])); const w = sum(parts.map(p => p[1]));
    r.score = w ? sum(parts.map(p => p[0] * p[1])) / w : null; r.peRel = r.pe > 0 && sec[r.sector]?.pe ? r.pe / sec[r.sector].pe : null; });
  return {asof, rows, sectors, sec};
}
function renderFA() {
  const b = $('#stockBody'), F = faData();
  if (!F) { b.innerHTML = `<div class="card"><div class="empty">No fundamentals yet. Import a screener export with Symbol, Sector, LTP, PE, PB, ROE columns from <b>Import</b>.${IS_ADMIN ? `<a class="btn accent" href="#sdata">Upload prices</a>` : '<span class="sub">Prices are published from the admin dashboard.</span>'}</div></div>`; return; }
  if (!F.rows.some(r => r.symbol === FA.sym)) FA.sym = (F.rows.find(r => r.symbol === 'NABIL') || F.rows[0]).symbol;
  const pos = F.rows.filter(r => r.pe > 0), under = F.rows.filter(r => isNum(r.gUp) && r.gUp > 0);
  b.innerHTML = `
  <div class="kpis" id="faKpis"></div>
  <div class="card wide">
    <div class="chead"><div><h2>Screener</h2><p class="sub">As of ${esc(F.asof)}. EPS and book value are derived as LTP ÷ P/E and LTP ÷ P/B where not entered. Click a row to open the company card.</p></div>
      <button class="btn small" id="faCsv">Download CSV</button></div>
    <div class="ctrls">
      <select id="faSector" aria-label="Sector"><option value="">All sectors</option>${F.sectors.map(s => `<option ${s === FA.sector ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <label class="sub" for="faPe">P/E ≤</label><input id="faPe" size="5" value="${esc(FA.peMax)}" inputmode="decimal">
      <label class="sub" for="faPb">P/B ≤</label><input id="faPb" size="5" value="${esc(FA.pbMax)}" inputmode="decimal">
      <label class="sub" for="faRoe">ROE ≥ %</label><input id="faRoe" size="5" value="${esc(FA.roeMin)}" inputmode="decimal">
      <label class="sub" for="faDy">Div. yield ≥ %</label><input id="faDy" size="5" value="${esc(FA.dyMin)}" inputmode="decimal">
      <label class="sub"><input type="checkbox" id="faBelow" ${FA.below ? 'checked' : ''}> Priced below Graham number</label>
      <input id="faQ" type="search" placeholder="Symbol" size="8" value="${esc(FA.q)}" aria-label="Search symbol">
    </div>
    <div class="tbl scroll" style="max-height:520px"><table id="faTable"></table></div>
    <p class="src">Score (0–100) = 40% value (earnings yield, low P/B), 40% quality (ROE, ROA), 20% income (dividend yield), ranked within the ${F.rows.length} companies. It is a screening aid, not a recommendation.</p>
  </div>
  <div class="grid2">
    <div class="card" id="faCard"></div>
    <div class="card">
      <div class="chead"><div><h2>Valuation map</h2><p class="sub">Each dot is a company; the chosen sector is highlighted</p></div>
      <div class="ctrls"><select id="faX" aria-label="X axis">${faAxisOpts(FA.x)}</select><span class="sub">vs</span><select id="faY" aria-label="Y axis">${faAxisOpts(FA.y)}</select></div></div>
      <div class="cv tall"><canvas id="cFaScatter"></canvas></div>
      <p class="src">Negative P/E and values beyond the 97th percentile are left out so the cloud stays readable.</p>
    </div>
    <div class="card wide"><h2>Sector medians</h2><div class="tbl"><table id="faSec"></table></div></div>
  </div>`;
  kpis('#faKpis', [
    {k: 'Companies covered', v: String(F.rows.length), chip: F.sectors.length + ' sectors', d: ' as of ' + F.asof},
    {k: 'Median P/E (profitable)', v: fmt(median(pos.map(r => r.pe)), 1), chip: F.rows.length - pos.length + ' loss-making'},
    {k: 'Median P/B', v: fmt(median(F.rows.map(r => r.pb > 0 ? r.pb : null)), 2)},
    {k: 'Median ROE', v: fmt(median(F.rows.map(r => r.roe)) * 100, 1) + '%'},
    {k: 'Below Graham number', v: String(under.length), chip: fmt(under.length / F.rows.length * 100, 0) + '% of list'},
  ]);
  const re = () => { FA.sector = $('#faSector').value; FA.peMax = $('#faPe').value; FA.pbMax = $('#faPb').value; FA.roeMin = $('#faRoe').value; FA.dyMin = $('#faDy').value; FA.below = $('#faBelow').checked; FA.q = $('#faQ').value; drawFaTable(F); drawFaScatter(F); };
  ['#faSector', '#faBelow'].forEach(s => $(s).onchange = re); ['#faPe', '#faPb', '#faRoe', '#faDy', '#faQ'].forEach(s => $(s).oninput = () => { clearTimeout(FA.tm); FA.tm = setTimeout(re, 250); });
  $('#faX').onchange = e => { FA.x = e.target.value; drawFaScatter(F); }; $('#faY').onchange = e => { FA.y = e.target.value; drawFaScatter(F); };
  $('#faCsv').onclick = () => { const rs = faFiltered(F), cols = FA_COLS; download('fundamental-screen.csv', [cols.map(c => csvCell(c[1])).join(','), ...rs.map(r => cols.map(c => csvCell(r[c[0]])).join(','))].join('\n'), 'text/csv'); };
  drawFaTable(F); drawFaScatter(F); drawFaCard(F); drawFaSec(F);
}
const FA_COLS = [['symbol', 'Symbol'], ['sector', 'Sector'], ['ltp', 'LTP'], ['pe', 'P/E'], ['pb', 'P/B'], ['roe', 'ROE %', 100], ['roa', 'ROA %', 100], ['dy', 'Div. yield %', 100], ['payout', 'Payout', 1], ['eps', 'EPS'], ['bvps', 'BVPS'], ['graham', 'Graham no.'], ['gUp', 'Upside to Graham %'], ['peRel', 'P/E ÷ sector'], ['score', 'Score']];
function faAxisOpts(sel) { return [['pe', 'P/E'], ['pb', 'P/B'], ['peg', 'PEG'], ['roe', 'ROE'], ['roa', 'ROA'], ['dy', 'Dividend yield'], ['gUp', 'Upside to Graham'], ['score', 'Score']].map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join(''); }
function faFiltered(F) {
  const n = s => { const v = parseFloat(s); return isFinite(v) ? v : null; }, pe = n(FA.peMax), pb = n(FA.pbMax), roe = n(FA.roeMin), dy = n(FA.dyMin), q = FA.q.trim().toUpperCase();
  let rs = F.rows.filter(r => (!FA.sector || r.sector === FA.sector) && (pe == null || (r.pe > 0 && r.pe <= pe)) && (pb == null || (r.pb > 0 && r.pb <= pb)) && (roe == null || r.roe * 100 >= roe) && (dy == null || r.dy * 100 >= dy) && (!FA.below || r.gUp > 0) && (!q || r.symbol.includes(q)));
  const k = FA.sort; rs.sort((a, b) => { const x = a[k], y = b[k]; if (!isNum(x) && !isNum(y)) return String(a[k] ?? '').localeCompare(String(b[k] ?? '')) * FA.dir; if (!isNum(x)) return 1; if (!isNum(y)) return -1; return (x - y) * FA.dir; });
  return rs;
}
function drawFaTable(F) {
  const rs = faFiltered(F);
  $('#faTable').innerHTML = `<thead><tr>${FA_COLS.map(([k, l]) => `<th class="sortable ${['symbol', 'sector'].includes(k) ? 'txt' : ''}" data-k="${k}">${l}${FA.sort === k ? (FA.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>` +
    rs.map(r => `<tr data-sym="${esc(r.symbol)}" style="cursor:pointer">${FA_COLS.map(([k, l, m]) => { const v = r[k];
      if (k === 'symbol') return `<td><b>${esc(v)}</b></td>`; if (k === 'sector') return `<td class="txt">${esc(v)}</td>`;
      if (k === 'score') return `<td class="num"><span class="bar-inline" style="width:${Math.round((v || 0) * 0.5)}px;background:var(--s1);margin:0 6px 0 0"></span>${fmt(v, 0)}</td>`;
      if (k === 'gUp') return `<td class="num ${v < 0 ? 'neg' : 'pos'}">${isNum(v) ? (v > 0 ? '+' : '') + fmt(v, 0) : '–'}</td>`;
      if (k === 'peRel') return `<td class="num ${v > 1.2 ? 'neg' : v < 0.8 ? 'pos' : ''}">${fmt(v, 2)}</td>`;
      return `<td class="num ${v < 0 ? 'neg' : ''}">${isNum(v) ? fmt(m ? v * m : v, m === 100 ? 1 : 2) : '–'}</td>`; }).join('')}</tr>`).join('') + `</tbody>`;
  $('#faTable').querySelectorAll('th.sortable').forEach(th => th.onclick = () => { if (FA.sort === th.dataset.k) FA.dir *= -1; else { FA.sort = th.dataset.k; FA.dir = ['symbol', 'sector'].includes(th.dataset.k) ? 1 : -1; } drawFaTable(F); });
  $('#faTable').querySelectorAll('tr[data-sym]').forEach(tr => tr.onclick = () => { FA.sym = tr.dataset.sym; drawFaCard(F); $('#faCard').scrollIntoView({behavior: 'smooth', block: 'nearest'}); });
}
function drawFaScatter(F) {
  const t = T(), X = FA.x, Y = FA.y, mul = k => ['roe', 'roa', 'dy'].includes(k) ? 100 : 1, name = k => ({pe: 'P/E', pb: 'P/B', peg: 'PEG', roe: 'ROE %', roa: 'ROA %', dy: 'Dividend yield %', gUp: 'Upside to Graham %', score: 'Score'})[k];
  const vals = k => F.rows.map(r => r[k]).filter(v => isNum(v) && (k !== 'pe' || v > 0)), cap = k => QC.quantile(vals(k), 0.97), cx = cap(X), cy = cap(Y);
  const pts = F.rows.filter(r => isNum(r[X]) && isNum(r[Y]) && (X !== 'pe' || r[X] > 0) && (Y !== 'pe' || r[Y] > 0) && r[X] <= cx && r[Y] <= cy).map(r => ({x: r[X] * mul(X), y: r[Y] * mul(Y), s: r.symbol, sec: r.sector}));
  const hi = FA.sector || (F.rows.find(r => r.symbol === FA.sym) || {}).sector;
  mk('cFaScatter', {type: 'scatter', data: {datasets: [
    {label: 'Other sectors', data: pts.filter(p => p.sec !== hi), backgroundColor: t.neutral + 'cc', borderColor: t.panel, borderWidth: 1, pointRadius: 5, pointHoverRadius: 7},
    {label: hi || 'Sector', data: pts.filter(p => p.sec === hi), backgroundColor: t.s[0], borderColor: t.panel, borderWidth: 1.5, pointRadius: 6, pointHoverRadius: 8},
    {label: FA.sym, data: pts.filter(p => p.s === FA.sym), backgroundColor: t.s[1], borderColor: t.panel, borderWidth: 2, pointRadius: 8, pointStyle: 'rectRot'}]},
    options: {interaction: {mode: 'nearest', intersect: true}, plugins: {tooltip: {callbacks: {label: c => ` ${c.raw.s} (${c.raw.sec}): ${name(X)} ${fmt(c.raw.x, 2)}, ${name(Y)} ${fmt(c.raw.y, 2)}`}}},
      scales: {x: {title: {display: true, text: name(X), color: t.ink3}}, y: {title: {display: true, text: name(Y), color: t.ink3}}}}});
}
function drawFaSec(F) {
  $('#faSec').innerHTML = `<thead><tr><th class="txt">Sector</th><th>Companies</th><th>Median P/E</th><th>Median P/B</th><th>Median ROE</th><th>Median ROA</th><th>Median div. yield</th></tr></thead><tbody>` +
    F.sectors.map(s => { const x = F.sec[s]; return `<tr><td class="txt">${esc(s)}</td><td class="num">${x.n}</td><td class="num">${fmt(x.pe, 1)}</td><td class="num">${fmt(x.pb, 2)}</td><td class="num">${fmt(x.roe * 100, 1)}%</td><td class="num">${fmt(x.roa * 100, 2)}%</td><td class="num">${fmt(x.dy * 100, 2)}%</td></tr>`; }).join('') + '</tbody>';
}
function drawFaCard(F) {
  const r = F.rows.find(x => x.symbol === FA.sym), s = F.sec[r.sector] || {}, hasPx = symbols().includes(r.symbol);
  const tpe = parseFloat(FA.tpe) || s.pe, rq = FA.r / 100, g = FA.g / 100;
  const vPE = r.eps > 0 && tpe ? r.eps * tpe : null, vDDM = r.dps > 0 && rq > g ? r.dps * (1 + g) / (rq - g) : null;
  const jPB = isNum(r.roe) && rq > g ? (r.roe - g) / (rq - g) : null, vPB = jPB > 0 && r.bvps > 0 ? jPB * r.bvps : null;
  const vals = [['Graham number', r.graham, '√(22.5 × EPS × BVPS)'], [`P/E × EPS (P/E ${fmt(tpe, 1)})`, vPE, 'sector median P/E unless you set one'], ['Dividend discount (Gordon)', vDDM, `DPS × (1+g) ÷ (r − g)`], ['Justified P/B × BVPS', vPB, '(ROE − g) ÷ (r − g) × BVPS']];
  const good = vals.map(v => v[1]).filter(v => isNum(v) && v > 0), avgV = good.length ? QC.mean(good) : null;
  const cmp = (v, m, hiGood, mulp = 1, d = 2) => `<td class="num">${isNum(v) ? fmt(v * mulp, d) : '–'}</td><td class="num">${isNum(m) ? fmt(m * mulp, d) : '–'}</td><td>${isNum(v) && isNum(m) ? `<span class="chip ${(v > m) === hiGood ? 'up' : 'dn'}">${(v > m) === hiGood ? 'Better' : 'Weaker'}</span>` : ''}</td>`;
  const hist = ds('stock_fundamentals').rows.filter(x => x.symbol === r.symbol);
  $('#faCard').innerHTML = `<div class="chead"><div><h2>${esc(r.symbol)}</h2><p class="sub">${esc(r.sector)} · LTP Rs ${fmt(r.ltp, 2)} · score ${fmt(r.score, 0)}/100</p></div>
    <div class="ctrls"><select id="faSym" aria-label="Company">${F.rows.map(x => x.symbol).sort().map(x => `<option ${x === r.symbol ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>${hasPx ? '<button class="btn small" id="faTa">Open chart ↗</button>' : ''}</div></div>
    <div class="tbl"><table><thead><tr><th>Metric</th><th>${esc(r.symbol)}</th><th>Sector median</th><th></th></tr></thead><tbody>
      <tr><td>P/E</td>${cmp(r.pe > 0 ? r.pe : null, s.pe, false, 1, 1)}</tr><tr><td>P/B</td>${cmp(r.pb, s.pb, false)}</tr>
      <tr><td>ROE</td>${cmp(r.roe, s.roe, true, 100, 1)}</tr><tr><td>ROA</td>${cmp(r.roa, s.roa, true, 100, 2)}</tr><tr><td>Dividend yield</td>${cmp(r.dy, s.dy, true, 100, 2)}</tr>
      <tr><td>EPS / BVPS / DPS</td><td class="num" colspan="3">${fmt(r.eps, 2)} / ${fmt(r.bvps, 2)} / ${fmt(r.dps, 2)}</td></tr>
      <tr><td>Screener flags</td><td colspan="3" class="txt">${['pe_vs', 'pb_vs', 'roe_vs', 'dy_vs'].map(k => r[k] ? `<span class="pill">${esc(k.split('_')[0].toUpperCase())}: ${esc(r[k])}</span>` : '').join(' ')}</td></tr>
    </tbody></table></div>
    <h3>Intrinsic value estimates</h3>
    <div class="ctrls"><label class="sub" for="faR">Required return r %</label><input id="faR" size="4" value="${FA.r}"><label class="sub" for="faG">Growth g %</label><input id="faG" size="4" value="${FA.g}"><label class="sub" for="faTpe">Target P/E</label><input id="faTpe" size="5" value="${esc(FA.tpe)}" placeholder="${fmt(s.pe, 1)}"></div>
    <div class="tbl"><table><thead><tr><th>Method</th><th>Value (Rs)</th><th>vs LTP</th></tr></thead><tbody>
      ${vals.map(([n, v, h]) => `<tr><td class="txt">${esc(n)}<br><span class="sub">${esc(h)}</span></td><td class="num">${isNum(v) && v > 0 ? fmt(v, 0) : '–'}</td><td class="num ${v > r.ltp ? 'pos' : 'neg'}">${isNum(v) && v > 0 ? (v > r.ltp ? '+' : '') + fmt(pct(v, r.ltp), 0) + '%' : 'n/a'}</td></tr>`).join('')}
      <tr><td class="txt"><b>Average of available methods</b></td><td class="num"><b>${fmt(avgV, 0)}</b></td><td class="num ${avgV > r.ltp ? 'pos' : 'neg'}"><b>${isNum(avgV) ? (avgV > r.ltp ? '+' : '') + fmt(pct(avgV, r.ltp), 0) + '%' : '–'}</b></td></tr>
    </tbody></table></div>
    ${hist.length > 1 ? `<h3>History of this company's ratios</h3><div class="tbl"><table><thead><tr><th>As of</th><th>LTP</th><th>P/E</th><th>P/B</th><th>ROE %</th></tr></thead><tbody>${hist.map(h => `<tr><td>${esc(h.asof)}</td><td class="num">${fmt(h.ltp, 0)}</td><td class="num">${fmt(h.pe, 1)}</td><td class="num">${fmt(h.pb, 2)}</td><td class="num">${fmt(h.roe * 100, 1)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="src">Estimates depend entirely on the inputs; treat them as ranges for study, not price targets.</p>`;
  $('#faSym').onchange = e => { FA.sym = e.target.value; drawFaCard(F); drawFaScatter(F); };
  const upd = () => { FA.r = parseFloat($('#faR').value) || 12; FA.g = parseFloat($('#faG').value) || 0; FA.tpe = $('#faTpe').value; drawFaCard(F); };
  ['#faR', '#faG', '#faTpe'].forEach(s => $(s).onchange = upd);
  if ($('#faTa')) $('#faTa').onclick = () => openChart(r.symbol);
}
