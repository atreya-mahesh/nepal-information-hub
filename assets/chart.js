/* Nepal Information Hub — full-screen interactive chart (chart.html#SYMBOL).
   Data: whatever the admin dashboard has published (server: api/db + api/market; file mode: browser storage).
   Rendering: TradingView Lightweight Charts (Apache 2.0). Indicators and the technical rating: ta-core.js (TAI). */
'use strict';
(() => {
const LC = window.LightweightCharts, $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const isN = x => typeof x === 'number' && isFinite(x);
const INDEX_RE = /^(NEPSE|BANKING|SENSITIVE|FLOAT|SENFLOAT|DEVBANK|FINANCE|HOTELS|HYDROPOWER|INVESTMENT|LIFEINSU|MANUFACTURE|MICROFINANCE|MUTUAL|NONLIFEINSU|OTHERS|TRADING|HYDRO)$/;
const LS = {get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};
const fmtP = v => isN(v) ? v.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '–';
const fmtN = (v, d = 2) => isN(v) ? (Math.abs(v) >= 1e5 ? Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 2}).format(v) : v.toLocaleString('en-IN', {maximumFractionDigits: d})) : '–';
const fmtV = v => isN(v) ? Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 2}).format(v) : '–';
const toast = (m, ms = 2600) => { const t = $('#cxToast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, ms); };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || undefined;
const UP = '#089981', DN = '#f23645';

/* ------------------------------ data ------------------------------ */
const D = {mode: 'file', bars: new Map(), syms: [], ver: '', snap: []};
function idbGet(k) { return new Promise(res => { try { const r = indexedDB.open('nih-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onerror = () => res(null); r.onsuccess = () => { try { const q = r.result.transaction('f').objectStore('f').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }; } catch (e) { res(null); } }); }
async function loadData() {
  let db = null, mkt = null, ver = '';
  try { const r = await fetch('api/db', {cache: 'no-store'}); if (r.ok) { const j = await r.json(); if (j && j.ok) { D.mode = 'server'; db = j.db; ver += j.version; } } } catch (e) {}
  if (D.mode === 'server') { try { const j = await (await fetch('api/market', {cache: 'no-store'})).json(); if (j.ok) { mkt = j.market; ver += '|' + j.version; } } catch (e) {} }
  else if (location.protocol !== 'file:' && await fetch('data/site.json', {cache: 'no-cache'}).then(async r => { if (!r.ok) return false; db = await r.json(); D.mode = 'static'; return true; }).catch(() => false)) {
    const ix = await fetch('data/market/index.json', {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null);
    if (ix && ix.months) { const parts = await Promise.all(ix.months.map(k => fetch(`data/market/${k}.json`, {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null))); mkt = {fields: ix.fields, days: {}}; parts.forEach(p => p && Object.assign(mkt.days, p.days)); }
    else mkt = await fetch('data/market.json', {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null); }
  else { try { const t = localStorage.getItem('nmm-db-v1'); if (t) db = JSON.parse(t); } catch (e) {} mkt = await idbGet('market:store'); }
  if (!db || !db.datasets?.stock_ohlc) db = window.SEED_DB || {datasets: {}};
  D.ver = ver; const by = new Map(), put = (s, b) => { if (!s || !b.t || !isN(b.c) || b.c <= 0) return; let m = by.get(s); if (!m) by.set(s, m = new Map()); m.set(b.t, b); };
  for (const r of db.datasets?.stock_ohlc?.rows || []) { if (r._m) continue; put(r.symbol, {t: String(r.date).slice(0, 10), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume, to: r.turnover, pc: r.prev_close, vw: r.vwap, tr: r.trans}); }
  if (mkt && mkt.days) { const F = Object.fromEntries((mkt.fields || ['sym', 'o', 'h', 'l', 'c', 'v', 't', 'vw', 'pc', 'tr', 'pct', 'hi52', 'lo52', 'a120', 'a180', 'ltp']).map((f, i) => [f, i]));
    for (const [d, rows] of Object.entries(mkt.days)) for (const r of rows) put(r[F.sym], {t: d, o: r[F.o], h: r[F.h], l: r[F.l], c: r[F.c], v: r[F.v], to: r[F.t], vw: r[F.vw], pc: r[F.pc], tr: r[F.tr], hi52: r[F.hi52], lo52: r[F.lo52]}); }
  D.bars = new Map(); D.snap = [];
  for (const [s, m] of by) { const a = [...m.values()].sort((x, y) => x.t < y.t ? -1 : 1);
    a.forEach(b => { if (!isN(b.o) || b.o <= 0) b.o = b.c; if (!isN(b.h) || b.h <= 0) b.h = Math.max(b.o, b.c); if (!isN(b.l) || b.l <= 0) b.l = Math.min(b.o, b.c); b.h = Math.max(b.h, b.o, b.c); b.l = Math.min(b.l, b.o, b.c); if (!isN(b.v)) b.v = null; });
    D.bars.set(s, a); const L = a[a.length - 1], pc = isN(L.pc) && L.pc > 0 ? L.pc : a.length > 1 ? a[a.length - 2].c : null;
    D.snap.push({s, c: L.c, ch: pc ? (L.c / pc - 1) * 100 : null, t: L.t, v: L.v, to: L.to, idx: INDEX_RE.test(s), n: a.length}); }
  D.syms = [...D.bars.keys()].sort((a, b) => a === 'NEPSE' ? -1 : b === 'NEPSE' ? 1 : (INDEX_RE.test(b) - INDEX_RE.test(a)) || a.localeCompare(b));
  D.last = D.snap.reduce((m, x) => x.t > m ? x.t : m, '');
}

/* ------------------------------ state ------------------------------ */
const DEF_INDS = [{id: 'VOL'}, {id: 'EMA', q: {p: 20}}, {id: 'SMA', q: {p: 50}}, {id: 'SMA', q: {p: 200}, colors: {}}, {id: 'RSI'}];
const ST = Object.assign({tf: 'D', type: 'candle', inds: DEF_INDS, scale: 'auto', range: '1Y', magnet: true, side: 'info', cmp: [], tpls: {}}, LS.get('nih-chart', {}));
ST.inds = (ST.inds || []).filter(x => TAI.study(x.id)).map((x, i) => ({uid: x.uid || 'i' + Date.now().toString(36) + i, id: x.id, q: {...defaults(x.id), ...(x.q || {})}, colors: x.colors || {}, hidden: !!x.hidden}));
ST.inds.forEach(x => { if (x.id === 'SMA' && x.q.p === 200 && !Object.keys(x.colors).length) x.colors = {[`SMA 200`]: '#f23645'}; });
let SYM = null;
const save = () => LS.set('nih-chart', {tf: ST.tf, type: ST.type, inds: ST.inds, scale: ST.scale, range: ST.range, magnet: ST.magnet, side: ST.side, cmp: ST.cmp, tpls: ST.tpls});
function defaults(id) { const s = TAI.study(id); return s ? Object.fromEntries(s.params.map(p => [p.k, p.v])) : {}; }

/* ------------------------------ chart ------------------------------ */
let chart = null, main = null, bars = [], disp = [], plots = [], cmpSeries = [], panesOf = [], futureN = 0;
function themeOpts() {
  const bg = css('--panel') || '#fff', ink = css('--ink-2') || '#333', grid = css('--grid') || '#eee', line = css('--line') || '#ddd';
  return {layout: {background: {type: 'solid', color: bg}, textColor: ink, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12, panes: {separatorColor: line, separatorHoverColor: css('--accent-soft'), enableResize: true}},
    grid: {vertLines: {color: grid}, horzLines: {color: grid}}, rightPriceScale: {borderColor: line}, timeScale: {borderColor: line}, crosshair: {mode: LC.CrosshairMode.Normal}};
}
function futureDates(last, n, tf) { const out = []; let d = new Date(last + 'T00:00:00Z');
  while (out.length < n) { if (tf === 'M') d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0)); else if (tf === 'W') d = new Date(+d + 7 * 864e5); else { d = new Date(+d + 864e5); const w = d.getUTCDay(); if (w === 5 || w === 6) continue; } out.push(d.toISOString().slice(0, 10)); }
  return out; }
function build(keepView = true) {
  const box = $('#cxChart'); let view = null;
  if (chart && keepView) { try { view = chart.timeScale().getVisibleLogicalRange(); } catch (e) {} }
  if (chart) { chart.remove(); chart = null; }
  const raw = D.bars.get(SYM) || []; $('#cxEmpty').hidden = raw.length > 1;
  if (raw.length < 2) { $('#cxEmpty').innerHTML = `<div><h2>No price history for ${esc(SYM || 'this symbol')}</h2><p>Upload the daily "Today's price" workbook in the admin dashboard (Data › Stock market data). The chart, every indicator and the technical rating update automatically.</p></div>`; }
  bars = TAI.resample(raw, ST.tf).map(b => ({...b})); disp = ST.type === 'ha' ? TAI.heikin(bars) : bars;
  chart = LC.createChart(box, {...themeOpts(), autoSize: true, localization: {priceFormatter: p => fmtP(p)}});
  const T = ST.type, base = {priceLineVisible: true, lastValueVisible: true};
  if (['candle', 'hollow', 'ha'].includes(T)) main = chart.addSeries(LC.CandlestickSeries, {...base, upColor: T === 'hollow' ? 'rgba(0,0,0,0)' : UP, downColor: DN, borderUpColor: UP, borderDownColor: DN, wickUpColor: UP, wickDownColor: DN, borderVisible: true});
  else if (T === 'bar') main = chart.addSeries(LC.BarSeries, {...base, upColor: UP, downColor: DN, thinBars: false});
  else if (T === 'area') main = chart.addSeries(LC.AreaSeries, {...base, lineColor: '#2962ff', topColor: 'rgba(41,98,255,.28)', bottomColor: 'rgba(41,98,255,.02)', lineWidth: 2});
  else if (T === 'baseline') { const avg = disp.reduce((s, b) => s + b.c, 0) / Math.max(1, disp.length); main = chart.addSeries(LC.BaselineSeries, {...base, baseValue: {type: 'price', price: +avg.toFixed(2)}, topLineColor: UP, bottomLineColor: DN, topFillColor1: 'rgba(8,153,129,.25)', topFillColor2: 'rgba(8,153,129,.03)', bottomFillColor1: 'rgba(242,54,69,.03)', bottomFillColor2: 'rgba(242,54,69,.25)'}); }
  else main = chart.addSeries(LC.LineSeries, {...base, color: '#2962ff', lineWidth: 2, lineType: T === 'step' ? 1 : 0});
  const ohlc = ['candle', 'hollow', 'ha', 'bar'].includes(T);
  futureN = Math.max(0, ...ST.inds.map(x => TAI.study(x.id).future ? x.q.d || 26 : 0));
  const fut = bars.length && futureN ? futureDates(bars[bars.length - 1].t, futureN - 1, ST.tf).map(t => ({time: t})) : [];
  main.setData(disp.map(b => ohlc ? {time: b.t, open: b.o, high: b.h, low: b.l, close: b.c} : {time: b.t, value: b.c}).concat(fut));
  const times = bars.map(b => b.t).concat(fut.map(x => x.time));
  /* indicators */
  plots = []; panesOf = [{kind: 'main'}]; const markers = []; let pane = 1;
  for (const ind of ST.inds) { const S = TAI.study(ind.id); let res; try { res = S.calc(bars, ind.q); } catch (e) { console.warn(ind.id, e); continue; }
    const isVol = ind.id === 'VOL', pi = S.overlay || isVol ? 0 : pane++; if (!S.overlay && !isVol) panesOf.push({kind: 'ind', ind});
    const sid = isVol ? 'vol' : undefined; const series = [];
    res.forEach((pl, k) => { if (pl.markers) { if (!ind.hidden) pl.markers.forEach(m => markers.push({time: bars[m.i].t, position: m.up ? 'belowBar' : 'aboveBar', color: m.up ? UP : DN, shape: m.up ? 'arrowUp' : 'arrowDown', text: m.text})); return; }
      const color = ind.colors[pl.name] || pl.color || '#2962ff', vis = !ind.hidden; let s;
      const opts = {priceLineVisible: false, lastValueVisible: !S.overlay || isVol ? vis : false, visible: vis, title: '', crosshairMarkerVisible: pl.type !== 'hist', ...(sid ? {priceScaleId: sid} : {})};
      if (pl.type === 'hist') { s = chart.addSeries(LC.HistogramSeries, {...opts, color, priceFormat: isVol || ind.id === 'TO' ? {type: 'volume'} : {type: 'price', precision: 2, minMove: 0.01}}, pi);
        s.setData(pl.data.map((v, i) => { if (!isN(v)) return {time: times[i]}; let c = color; if (pl.updownBars) c = bars[i].c >= bars[i].o ? 'rgba(8,153,129,.45)' : 'rgba(242,54,69,.45)'; else if (pl.updown || !pl.color) c = v >= 0 ? (i && v >= pl.data[i - 1] ? '#26a69a' : '#b2dfdb') : (i && v <= pl.data[i - 1] ? '#ff5252' : '#ffcdd2'); return {time: times[i], value: v, color: c}; }).filter(x => x.time)); }
      else { s = chart.addSeries(LC.LineSeries, {...opts, color, lineWidth: pl.type === 'dots' ? 1 : 1.5, lineType: pl.type === 'step' ? 1 : 0, lineVisible: pl.type !== 'dots', pointMarkersVisible: pl.type === 'dots', pointMarkersRadius: 1.6}, pi);
        s.setData(pl.data.map((v, i) => isN(v) ? {time: times[i], value: v} : {time: times[i]}).filter(x => x.time)); }
      if (k === 0 && S.levels && !S.overlay) S.levels.forEach(l => s.createPriceLine({price: l, color: css('--ink-3') || '#999', lineWidth: 1, lineStyle: 2, axisLabelVisible: false}));
      if (S.range) s.applyOptions({autoscaleInfoProvider: () => ({priceRange: {minValue: S.range[0], maxValue: S.range[1]}})});
      series.push(s); plots.push({ind, pl, s, pi, color}); });
    if (isVol) chart.priceScale('vol').applyOptions({scaleMargins: {top: 0.82, bottom: 0}, visible: false}); }
  if (markers.length) LC.createSeriesMarkers(main, markers.sort((a, b) => a.time < b.time ? -1 : 1));
  /* compare */
  cmpSeries = ST.cmp.filter(s => D.bars.has(s) && s !== SYM).map((s, k) => { const c = ['#ff6d00', '#ab47bc', '#00897b', '#fbc02d'][k % 4], ser = chart.addSeries(LC.LineSeries, {color: c, lineWidth: 1.5, priceLineVisible: false, title: s});
    const m = new Map(TAI.resample(D.bars.get(s), ST.tf).map(b => [b.t, b.c])); ser.setData(bars.filter(b => m.has(b.t)).map(b => ({time: b.t, value: m.get(b.t)}))); return {s, ser, c}; });
  const ps = chart.panes(); ps.forEach((p, i) => p.setStretchFactor(i ? 1 : Math.max(2.4, ps.length * 0.9)));
  scaleMode();
  chart.subscribeCrosshairMove(p => { CH = isN(p.logical) ? Math.round(p.logical) : null; legends(); });
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => { queue(); rangeInfo(); });
  if (view && keepView) chart.timeScale().setVisibleLogicalRange(view); else applyRange(ST.range);
  setTimeout(() => { layoutLegends(); queue(); }, 30);
}
let CH = null;
function scaleMode() { chart.panes().forEach((p, i) => chart.priceScale('right', i).applyOptions({mode: i ? 0 : {auto: 0, log: 1, pct: 2}[ST.cmp.length ? 'pct' : ST.scale] ?? 0, autoScale: true})); }
function applyRange(r) { ST.range = r; save(); if (!chart || !bars.length) return; const n = bars.length; if (r === 'All') { chart.timeScale().setVisibleLogicalRange({from: -2, to: n + Math.max(4, futureN)}); return; }
  const L = new Date(bars[n - 1].t + 'T00:00:00Z'), m = {'1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36}[r]; let from = r === 'YTD' ? new Date(Date.UTC(L.getUTCFullYear(), 0, 1)) : new Date(Date.UTC(L.getUTCFullYear(), L.getUTCMonth() - m, L.getUTCDate()));
  const f = from.toISOString().slice(0, 10); let i = bars.findIndex(b => b.t >= f); if (i < 0) i = 0; if (n - i < 8) i = Math.max(0, n - 8);
  chart.timeScale().setVisibleLogicalRange({from: i - 0.5, to: n - 1 + Math.max(3, Math.round((n - i) * 0.04), futureN)}); segPress('#cxRange', r); }
function rangeInfo() { const r = chart?.timeScale().getVisibleLogicalRange(); if (!r || !bars.length) return; const a = bars[Math.max(0, Math.ceil(r.from))], b = bars[Math.min(bars.length - 1, Math.floor(r.to))]; $('#cxRangeInfo').textContent = a && b ? `${a.t} → ${b.t} · ${bars.length} ${({D: 'sessions', W: 'weeks', M: 'months'})[ST.tf]} · ${D.mode === 'server' ? 'live from the admin dashboard' : D.mode === 'static' ? 'published data' : 'from this browser'}` : ''; }

/* ------------------------------ legends ------------------------------ */
function paneBoxes() { const host = $('#cxChart').getBoundingClientRect(); return chart.panes().map(p => { const el = p.getHTMLElement(); const r = el ? el.getBoundingClientRect() : {top: host.top, left: host.left, width: host.width, height: p.getHeight()}; return {top: r.top - host.top, left: r.left - host.left, width: r.width, height: r.height}; }); }
function layoutLegends() { if (!chart) return; const B = paneBoxes(), L = $('#cxLegends');
  L.innerHTML = B.map((b, i) => `<div class="cx-leg" data-p="${i}" style="top:${b.top + 4}px"></div>`).join(''); legends(); placeDraw(B); }
function val(v, d) { return isN(v) ? (Math.abs(v) >= 1e6 ? fmtV(v) : v.toLocaleString('en-IN', {maximumFractionDigits: d ?? (Math.abs(v) < 10 ? 3 : 2)})) : '∅'; }
function legends() { if (!chart) return; const n = bars.length, i = CH === null || CH >= n ? n - 1 : Math.max(0, CH), b = disp[i], p = i ? disp[i - 1] : null;
  const el0 = $('.cx-leg[data-p="0"]'); if (!el0) return;
  const ch = b && p ? b.c - p.c : null, cls = ch >= 0 ? 'up' : 'dn';
  let h = `<div class="row"><span class="main">${esc(SYM)}</span><span class="nm">· ${({D: '1D', W: '1W', M: '1M'})[ST.tf]} · NEPSE</span>${b ? `<span class="nm">${b.t}</span> <span>O <b class="${cls}">${fmtP(b.o)}</b></span><span>H <b class="${cls}">${fmtP(b.h)}</b></span><span>L <b class="${cls}">${fmtP(b.l)}</b></span><span>C <b class="${cls}">${fmtP(b.c)}</b></span>${ch !== null ? `<b class="${cls}">${ch >= 0 ? '+' : ''}${fmtP(ch)} (${ch >= 0 ? '+' : ''}${(ch / p.c * 100).toFixed(2)}%)</b>` : ''}${isN(bars[i]?.v) ? `<span>Vol <b>${fmtV(bars[i].v)}</b></span>` : ''}` : ''}</div>`;
  cmpSeries.forEach(c => { h += `<div class="row" data-cmp="${esc(c.s)}"><span style="color:${c.c}">● ${esc(c.s)}</span><span class="act"><button data-a="cmpx" title="Remove">×</button></span></div>`; });
  const byInd = new Map(); plots.forEach(x => { if (!byInd.has(x.ind.uid)) byInd.set(x.ind.uid, []); byInd.get(x.ind.uid).push(x); });
  ST.inds.forEach(ind => { const S = TAI.study(ind.id), ps = byInd.get(ind.uid) || [], pi = S.overlay || ind.id === 'VOL' ? 0 : panesOf.findIndex(x => x.ind === ind); if (pi < 0) return;
    const args = S.params.map(p => ind.q[p.k]).join(', ');
    const row = `<div class="row ${ind.hidden ? 'off' : ''}" data-uid="${ind.uid}"><span class="nm">${esc(S.id === 'VOL' ? 'Vol' : S.id)}${args ? ' ' + esc(args) : ''}</span>${ps.map(x => `<b style="color:${x.color}">${val(x.pl.data[i])}</b>`).join(' ')}<span class="act"><button data-a="eye" title="Show / hide">${ind.hidden ? '◌' : '◉'}</button><button data-a="cfg" title="Settings">⚙</button><button data-a="del" title="Remove">×</button></span></div>`;
    if (pi === 0) h += row; else { const el = $(`.cx-leg[data-p="${pi}"]`); if (el) el.innerHTML = row; } });
  el0.innerHTML = h;
}
$('#cxLegends').addEventListener('click', e => { const btn = e.target.closest('button[data-a]'); if (!btn) return; const row = btn.closest('.row'), a = btn.dataset.a;
  if (a === 'cmpx') { ST.cmp = ST.cmp.filter(s => s !== row.dataset.cmp); save(); build(); return; }
  const ind = ST.inds.find(x => x.uid === row.dataset.uid); if (!ind) return;
  if (a === 'del') { ST.inds = ST.inds.filter(x => x !== ind); save(); build(); } else if (a === 'eye') { ind.hidden = !ind.hidden; save(); build(); } else if (a === 'cfg') settingsDlg(ind); });

/* ------------------------------ dialogs ------------------------------ */
function dlg(title, html, onOpen) { $('#cxDlgTitle').textContent = title; $('#cxDlgBody').innerHTML = html; $('#cxModal').hidden = false; onOpen && onOpen($('#cxDlgBody')); }
const closeDlg = () => { $('#cxModal').hidden = true; };
$('#cxDlgX').onclick = closeDlg; $('#cxModal').addEventListener('mousedown', e => { if (e.target.id === 'cxModal') closeDlg(); });
function listPicker(input, list, items, pick) { let hi = 0; const draw = () => { const q = input.value.trim().toUpperCase(); const f = items(q); hi = Math.min(hi, Math.max(0, f.length - 1)); list.innerHTML = f.html(hi); list.querySelectorAll('button[data-k]').forEach((b, k) => b.onclick = () => pick(b.dataset.k)); };
  input.oninput = () => { hi = 0; draw(); }; input.onkeydown = e => { const bs = list.querySelectorAll('button[data-k]'); if (e.key === 'ArrowDown') { hi = Math.min(bs.length - 1, hi + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && bs[hi]) pick(bs[hi].dataset.k); }; draw(); input.focus(); }
function symDlg(title, initial, pick) {
  dlg(title, `<input type="search" id="cxQ" placeholder="Search ${D.syms.length} symbols and indices…" autocomplete="off"><div class="cx-list" id="cxL"></div>`, b => { const inp = b.querySelector('#cxQ'); inp.value = initial || '';
    listPicker(inp, b.querySelector('#cxL'), q => { const snap = new Map(D.snap.map(x => [x.s, x])); let f = D.syms.filter(s => !q || s.includes(q)); f.sort((a, c) => (c.startsWith(q) - a.startsWith(q)) || 0); f = f.slice(0, 120);
      const r = f.map(s => snap.get(s)); r.html = hi => r.map((x, k) => `<button data-k="${esc(x.s)}" class="${k === hi ? 'hi' : ''}"><span><b>${esc(x.s)}</b> <small>${x.idx ? 'Index' : 'NEPSE'} · ${x.n} sessions</small></span><span>${fmtP(x.c)} <small class="${x.ch >= 0 ? 'buy' : 'sell'}">${isN(x.ch) ? (x.ch >= 0 ? '+' : '') + x.ch.toFixed(2) + '%' : ''}</small></span></button>`).join('') || '<p class="cx-dim">No match.</p>'; return r; }, k => { closeDlg(); pick(k); }); }); }
function indDlg() {
  dlg(`Indicators (${TAI.studies.length})`, `<input type="search" id="cxQ" placeholder="Search: RSI, MACD, Bollinger, Ichimoku, Supertrend…" autocomplete="off"><div class="cx-list" id="cxL"></div>`, b => {
    listPicker(b.querySelector('#cxQ'), b.querySelector('#cxL'), q => { const f = TAI.studies.filter(s => !q || (s.id + ' ' + s.name + ' ' + s.cat).toUpperCase().includes(q)); f.html = hi => { let cat = '', out = ''; f.forEach((s, k) => { if (s.cat !== cat) { cat = s.cat; out += `<div class="cat">${esc(cat)}</div>`; } const n = ST.inds.filter(x => x.id === s.id).length; out += `<button data-k="${s.id}" class="${k === hi ? 'hi' : ''}"><span>${esc(s.name)} <small>${esc(s.id)}</small></span><small>${n ? n + ' on chart · ' : ''}${s.overlay ? 'on price' : 'new pane'}</small></button>`; }); return out; }; return f; },
      id => { ST.inds.push({uid: 'i' + Date.now().toString(36), id, q: defaults(id), colors: {}, hidden: false}); save(); build(); toast(`${TAI.study(id).name} added`); b.querySelector('#cxQ').focus(); }); }); }
function settingsDlg(ind) { const S = TAI.study(ind.id), demo = S.calc(bars.slice(-300), ind.q).filter(p => p.data);
  dlg(S.name, `<div class="cx-form">${S.params.map(p => `<label for="pp-${p.k}">${esc(p.label)}</label><input id="pp-${p.k}" type="number" step="any" value="${ind.q[p.k]}">`).join('')}
    ${demo.map((p, k) => `<label>${esc(p.name)} colour</label><input type="color" data-c="${esc(p.name)}" value="${(ind.colors[p.name] || p.color || '#2962ff').slice(0, 7)}">`).join('')}</div>
    <div class="cx-dlgfoot"><button id="ppDef">Defaults</button><button id="ppNo">Cancel</button><button class="pri" id="ppOk">Apply</button></div>`, b => {
    b.querySelector('#ppNo').onclick = closeDlg; b.querySelector('#ppDef').onclick = () => { ind.q = defaults(ind.id); ind.colors = {}; save(); closeDlg(); build(); };
    b.querySelector('#ppOk').onclick = () => { S.params.forEach(p => { const v = parseFloat(b.querySelector('#pp-' + p.k).value); if (isFinite(v)) ind.q[p.k] = v; }); b.querySelectorAll('[data-c]').forEach(c => ind.colors[c.dataset.c] = c.value); save(); closeDlg(); build(); }; }); }
const TPL = {
  'Default: Volume, EMA 20, SMA 50 / 200, RSI': [{id: 'VOL'}, {id: 'EMA', q: {p: 20}}, {id: 'SMA', q: {p: 50}}, {id: 'SMA', q: {p: 200}, colors: {'SMA 200': '#f23645'}}, {id: 'RSI'}],
  'Trend: Ichimoku, Supertrend, ADX': [{id: 'VOL'}, {id: 'ICHI'}, {id: 'ST'}, {id: 'ADX'}],
  'Momentum: MACD, RSI, Stochastic': [{id: 'VOL'}, {id: 'EMA', q: {p: 20}}, {id: 'MACD'}, {id: 'RSI'}, {id: 'STOCH'}],
  'Volatility: Bollinger, Keltner, ATR, BandWidth': [{id: 'VOL'}, {id: 'BB'}, {id: 'KC'}, {id: 'ATR'}, {id: 'BBW'}],
  'Volume: VWAP, OBV, CMF, MFI': [{id: 'VOL'}, {id: 'VWAP'}, {id: 'OBV'}, {id: 'CMF'}, {id: 'MFI'}],
  'Swing: EMA 9 / 21 cross, Parabolic SAR, Stoch RSI': [{id: 'VOL'}, {id: 'MACROSS', q: {f: 9, s: 21}}, {id: 'PSAR'}, {id: 'SRSI'}],
  'Support & resistance: Pivots, Donchian, ZigZag': [{id: 'VOL'}, {id: 'PIV'}, {id: 'DC'}, {id: 'ZZ'}],
  'Clean chart (price only)': []};
function tplDlg() { const all = {...TPL, ...ST.tpls};
  dlg('Indicator templates', `<div class="cx-list">${Object.keys(all).map(k => `<button data-k="${esc(k)}"><span>${esc(k)}</span><small>${ST.tpls[k] ? 'saved · ' : ''}${all[k].length} studies</small></button>`).join('')}</div>
    <div class="cx-dlgfoot"><input type="text" id="tplName" placeholder="Name for the current set"><button class="pri" id="tplSave">Save current</button></div>`, b => {
    b.querySelectorAll('button[data-k]').forEach(x => x.onclick = () => { ST.inds = all[x.dataset.k].map((y, i) => ({uid: 'i' + Date.now().toString(36) + i, id: y.id, q: {...defaults(y.id), ...(y.q || {})}, colors: {...(y.colors || {})}, hidden: false})); save(); closeDlg(); build(); toast(x.dataset.k.split(':')[0] + ' template applied'); });
    b.querySelector('#tplSave').onclick = () => { const n = b.querySelector('#tplName').value.trim(); if (!n) return; ST.tpls[n] = ST.inds.map(x => ({id: x.id, q: x.q, colors: x.colors})); save(); tplDlg(); toast('Template saved'); }; }); }

/* ------------------------------ drawings ------------------------------ */
const DR = {tool: 'cursor', list: [], draft: null, svg: $('#cxDraw'), box: null, raf: 0};
const dKey = () => 'nih-chart-draw:' + SYM;
const dSave = () => LS.set(dKey(), DR.list);
const queue = () => { if (!DR.raf) DR.raf = requestAnimationFrame(() => { DR.raf = 0; drawAll(); }); };
function placeDraw(B) { const b = (B || paneBoxes())[0]; if (!b) return; DR.box = b; Object.assign(DR.svg.style, {left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px'}); DR.svg.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`); }
function bIdx(t) { let lo = 0, hi = bars.length - 1; if (!bars.length) return 0; if (t > bars[hi].t) return hi; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].t < t) lo = m + 1; else hi = m; } return lo; }
const X = pt => chart.timeScale().logicalToCoordinate(bIdx(pt.t) + (pt.d || 0)), Y = pt => main.priceToCoordinate(pt.p);
function fromXY(x, y, snap) { const ts = chart.timeScale(); let l = ts.coordinateToLogical(x); if (l === null) return null; const n = bars.length; let i = Math.round(l); i = Math.max(0, Math.min(n - 1, i)); let d = l - i, p = main.coordinateToPrice(y);
  if (p === null) return null; if (snap && ST.magnet && Math.abs(d) < 0.5) { const b = disp[i]; const c = [b.o, b.h, b.l, b.c]; let best = p, bd = Infinity; c.forEach(v => { const dy = Math.abs(main.priceToCoordinate(v) - y); if (dy < bd) { bd = dy; best = v; } }); if (bd < 30) p = best; d = 0; }
  return {t: bars[i].t, d: Math.round(d * 100) / 100, p: +p.toFixed(4)}; }
const NS = 'http://www.w3.org/2000/svg';
function el(tag, at, parent) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); parent.appendChild(e); return e; }
function drawAll() { const svg = DR.svg; svg.innerHTML = ''; if (!chart || !bars.length || !DR.box) return; const W = DR.box.width, H = DR.box.height, ink = css('--ink') || '#111';
  /* indicator fills (bands, cloud) */
  const vr = chart.timeScale().getVisibleLogicalRange(); if (vr) { const i0 = Math.max(0, Math.floor(vr.from) - 1), i1 = Math.min(bars.length - 1 + futureN, Math.ceil(vr.to) + 1);
    plots.filter(x => x.pl.fill && !x.ind.hidden && x.pi === 0).forEach(x => { const other = plots.find(y => y.ind === x.ind && y.pl.name === x.pl.fill); if (!other) return; const A = x.pl.data, Bd = other.pl.data, cloud = x.ind.id === 'ICHI';
      let seg = [], sign = null; const flush = () => { if (seg.length > 1) { const pts = seg.map(s => `${s[0]},${s[1]}`).concat(seg.slice().reverse().map(s => `${s[0]},${s[2]}`)).join(' '); el('polygon', {points: pts, fill: cloud ? (sign ? 'rgba(8,153,129,.16)' : 'rgba(242,54,69,.16)') : hexA(x.color, .08), stroke: 'none'}, svg); } seg = []; };
      for (let i = i0; i <= i1; i++) { const a = A[i], c = Bd[i]; if (!isN(a) || !isN(c)) { flush(); continue; } const s = a >= c; if (cloud && sign !== null && s !== sign) { const xx = chart.timeScale().logicalToCoordinate(i); seg.push([xx, main.priceToCoordinate(a), main.priceToCoordinate(c)]); flush(); }
        sign = s; const xx = chart.timeScale().logicalToCoordinate(i); if (xx === null) continue; seg.push([xx, main.priceToCoordinate(a), main.priceToCoordinate(c)]); } flush(); }); }
  const all = DR.draft ? DR.list.concat([DR.draft]) : DR.list;
  all.forEach((d, k) => { const g = el('g', {'data-i': k}, svg), col = d.color || '#2962ff', P = d.pts.map(p => [X(p), Y(p)]); if (P.some(p => p[0] === null || p[1] === null)) return;
    const ln = (a, b, at = {}) => { el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'transparent', 'stroke-width': 10}, g); return el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, 'stroke-width': 1.6, ...at}, g); };
    const tx = (x, y, s, at = {}) => { const t = el('text', {x, y, fill: at.fill || col, 'text-anchor': at.anchor || 'start', 'font-weight': at.bold ? 600 : 400}, g); t.textContent = s; return t; };
    const [a, b = a, c] = P;
    if (d.type === 'trend') ln(a, b);
    else if (d.type === 'ray') { const dx = b[0] - a[0], dy = b[1] - a[1], k_ = dx ? (W - a[0]) / dx : 0; ln(a, dx > 0 ? [W, a[1] + dy * k_] : dx < 0 ? [0, a[1] - dy * (a[0] / -dx)] : [a[0], dy > 0 ? H : 0]); }
    else if (d.type === 'hline') { ln([0, a[1]], [W, a[1]]); tx(W - 4, a[1] - 4, fmtP(d.pts[0].p), {anchor: 'end'}); }
    else if (d.type === 'vline') { ln([a[0], 0], [a[0], H]); tx(a[0] + 4, 14, d.pts[0].t); }
    else if (d.type === 'rect') { el('rect', {x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), fill: hexA(col, .12), stroke: col, 'stroke-width': 1.2}, g); }
    else if (d.type === 'channel') { ln(a, b); if (c) { const t_ = b[0] !== a[0] ? (c[0] - a[0]) / (b[0] - a[0]) : 0, yl = a[1] + (b[1] - a[1]) * t_, off = c[1] - yl; ln([a[0], a[1] + off], [b[0], b[1] + off]); el('polygon', {points: `${a[0]},${a[1]} ${b[0]},${b[1]} ${b[0]},${b[1] + off} ${a[0]},${a[1] + off}`, fill: hexA(col, .08)}, g); } }
    else if (d.type === 'fib') { const p0 = d.pts[0].p, p1 = (d.pts[1] || d.pts[0]).p, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]); const lv = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'], [1, '#787b86'], [1.618, '#2962ff']];
      lv.forEach(([f, fc], j) => { const pr = p1 + (p0 - p1) * f, y = main.priceToCoordinate(pr); if (y === null) return; if (j < lv.length - 1) { const pn = p1 + (p0 - p1) * lv[j + 1][0], yn = main.priceToCoordinate(pn); if (yn !== null) el('rect', {x: x0, y: Math.min(y, yn), width: Math.max(1, x1 - x0), height: Math.abs(yn - y), fill: hexA(fc, .07)}, g); } el('line', {x1: x0, y1: y, x2: x1, y2: y, stroke: fc, 'stroke-width': 1}, g); tx(x0 - 4, y + 4, `${f} (${fmtP(pr)})`, {anchor: 'end', fill: fc}); }); ln(a, b, {'stroke-dasharray': '4 4', stroke: '#787b86', 'stroke-width': 1}); }
    else if (d.type === 'measure') { const p0 = d.pts[0].p, p1 = (d.pts[1] || d.pts[0]).p, up = p1 >= p0, n = bIdx(d.pts[1]?.t || d.pts[0].t) - bIdx(d.pts[0].t), fc = up ? '#2962ff' : '#f23645'; el('rect', {x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), fill: hexA(fc, .15)}, g);
      const bx = (a[0] + b[0]) / 2, by = up ? Math.min(a[1], b[1]) - 26 : Math.max(a[1], b[1]) + 8; el('rect', {x: bx - 80, y: by, width: 160, height: 20, rx: 4, fill: fc}, g); tx(bx, by + 14, `${up ? '+' : ''}${fmtP(p1 - p0)} (${((p1 / p0 - 1) * 100).toFixed(2)}%) · ${n} bars`, {anchor: 'middle', fill: '#fff'}); }
    else if (d.type === 'long' || d.type === 'short') { const e = d.pts[0].p, tg = (d.pts[1] || d.pts[0]).p, sl = e - (tg - e) / 2, ys = main.priceToCoordinate(sl), x0 = a[0], x1 = Math.max(b[0], a[0] + 60); if (ys === null) return;
      el('rect', {x: x0, y: Math.min(a[1], b[1]), width: x1 - x0, height: Math.abs(b[1] - a[1]), fill: 'rgba(8,153,129,.18)'}, g); el('rect', {x: x0, y: Math.min(a[1], ys), width: x1 - x0, height: Math.abs(ys - a[1]), fill: 'rgba(242,54,69,.18)'}, g); el('line', {x1: x0, y1: a[1], x2: x1, y2: a[1], stroke: '#787b86'}, g);
      tx(x0 + 4, b[1] + (b[1] < a[1] ? 14 : -4), `Target ${fmtP(tg)} (${((tg / e - 1) * 100).toFixed(2)}%)`, {fill: UP}); tx(x0 + 4, ys + (ys > a[1] ? -4 : 14), `Stop ${fmtP(sl)} (${((sl / e - 1) * 100).toFixed(2)}%)`, {fill: DN}); tx(x0 + 4, a[1] - 4, `${d.type === 'long' ? 'Long' : 'Short'} @ ${fmtP(e)} · R:R 2.0`, {fill: ink}); }
    else if (d.type === 'text') { tx(a[0], a[1], d.text || '', {fill: d.color || ink, bold: true}); }
    if (d === DR.draft || DR.tool === 'erase') P.forEach(p => el('circle', {cx: p[0], cy: p[1], r: 3.5, fill: css('--panel') || '#fff', stroke: col}, g)); });
}
function hexA(h, a) { if (!h || h[0] !== '#') return h; const n = h.length === 4 ? h.slice(1).split('').map(x => x + x).join('') : h.slice(1, 7); const v = parseInt(n, 16); return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`; }
const NEED = {trend: 2, ray: 2, hline: 1, vline: 1, rect: 2, channel: 3, fib: 2, measure: 2, long: 2, short: 2, text: 1};
function setTool(t) { DR.tool = t; DR.draft = null; document.querySelectorAll('#cxTools [data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === t)); DR.svg.classList.toggle('active', t !== 'cursor'); DR.svg.classList.toggle('erase', t === 'erase'); queue(); }
$('#cxTools').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.t) setTool(b.dataset.t);
  else if (b.id === 'cxClear') { if (DR.list.length) { DR.undo = DR.list; DR.list = []; dSave(); queue(); toast('Drawings removed (Ctrl+Z restores)'); } }
  else if (b.id === 'cxMagnet') { ST.magnet = !ST.magnet; save(); b.setAttribute('aria-pressed', ST.magnet); toast(ST.magnet ? 'Magnet on' : 'Magnet off'); } });
const evXY = e => { const r = DR.svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
DR.svg.addEventListener('mousedown', e => { if (DR.tool === 'cursor') return; e.preventDefault(); const [x, y] = evXY(e);
  if (DR.tool === 'erase') { const g = e.target.closest('g[data-i]'); if (g) { const i = +g.dataset.i; if (i < DR.list.length) { DR.list.splice(i, 1); dSave(); queue(); } } return; }
  const pt = fromXY(x, y, true); if (!pt) return;
  if (DR.tool === 'text') { textInput(x, y, pt); return; }
  if (!DR.draft) DR.draft = {type: DR.tool, pts: [pt], color: {fib: '#787b86', long: UP, short: DN, measure: '#2962ff'}[DR.tool] || '#2962ff'};
  else DR.draft.pts[DR.draft.pts.length - 1] = pt;
  if (DR.draft.pts.length >= NEED[DR.tool]) { DR.list.push(DR.draft); DR.draft = null; dSave(); if (!e.shiftKey) setTool('cursor'); } else DR.draft.pts.push({...pt});
  queue(); });
DR.svg.addEventListener('mousemove', e => { if (!DR.draft) return; const [x, y] = evXY(e), pt = fromXY(x, y, true); if (pt) { DR.draft.pts[DR.draft.pts.length - 1] = pt; queue(); } });
DR.svg.addEventListener('wheel', e => { /* let the chart zoom while a tool is active */ DR.svg.style.pointerEvents = 'none'; clearTimeout(DR.wt); DR.wt = setTimeout(() => DR.svg.style.pointerEvents = '', 250); }, {passive: true});
function textInput(x, y, pt) { const inp = document.createElement('input'); inp.className = 'cx-textin'; inp.placeholder = 'Note, then Enter'; const r = DR.svg.getBoundingClientRect(), w = $('.cx-chartwrap').getBoundingClientRect(); Object.assign(inp.style, {left: (r.left - w.left + x) + 'px', top: (r.top - w.top + y - 12) + 'px'}); $('.cx-chartwrap').appendChild(inp); inp.focus();
  const done = ok => { if (ok && inp.value.trim()) { DR.list.push({type: 'text', pts: [pt], text: inp.value.trim()}); dSave(); } inp.remove(); setTool('cursor'); queue(); };
  inp.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); }; inp.onblur = () => done(true); }
$('#cxUndo').onclick = undo;
function undo() { if (DR.draft) DR.draft = null; else if (DR.undo) { DR.list = DR.undo; DR.undo = null; } else DR.list.pop(); dSave(); queue(); }
['mousemove', 'mouseup', 'wheel', 'touchmove'].forEach(ev => $('#cxChart').addEventListener(ev, queue, {passive: true}));
new ResizeObserver(() => { layoutLegends(); queue(); }).observe($('#cxChart'));

/* ------------------------------ side panels ------------------------------ */
function side() { document.querySelectorAll('.cx-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.p === ST.side)); ['info', 'tech', 'watch'].forEach(p => $('#sp-' + p).hidden = p !== ST.side); ({info: sideInfo, tech: sideTech, watch: sideWatch})[ST.side](); }
document.querySelector('.cx-tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.side = b.dataset.p; save(); side(); };
function perf(a, days) { const n = a.length; if (n < 2) return null; const L = a[n - 1], d = new Date(new Date(L.t + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10); const b = a.find(x => x.t >= d); return b && b !== L ? (L.c / b.c - 1) * 100 : null; }
function sideInfo() { const a = D.bars.get(SYM) || [], n = a.length, L = a[n - 1]; if (!L) { $('#sp-info').innerHTML = '<p class="cx-dim">No data.</p>'; return; }
  const P = n > 1 ? a[n - 2] : null, pc = isN(L.pc) && L.pc > 0 ? L.pc : P?.c, ch = pc ? L.c - pc : null, y1 = a.filter(x => x.t >= new Date(new Date(L.t) - 365 * 864e5).toISOString().slice(0, 10));
  const hi = isN(L.hi52) && L.hi52 > 0 ? L.hi52 : Math.max(...y1.map(x => x.h)), lo = isN(L.lo52) && L.lo52 > 0 ? L.lo52 : Math.min(...y1.map(x => x.l)), pos = hi > lo ? (L.c - lo) / (hi - lo) * 100 : 50;
  const rsi = TAI.rsi(a.map(x => x.c), 14), atr = TAI.atr(a, 14), v20 = a.slice(-20).filter(x => isN(x.v)), av = v20.length ? v20.reduce((s, x) => s + x.v, 0) / v20.length : null;
  const ytdS = a.find(x => x.t >= L.t.slice(0, 4) + '-01-01'), ytd = ytdS && ytdS !== L ? (L.c / ytdS.c - 1) * 100 : null;
  const pf = [['1W', perf(a, 7)], ['1M', perf(a, 30)], ['3M', perf(a, 91)], ['6M', perf(a, 182)], ['YTD', ytd], ['1Y', perf(a, 365)]];
  $('#sp-info').innerHTML = `<div class="cx-dim">${INDEX_RE.test(SYM) ? 'Index' : 'Listed security'} · NEPSE · last session ${L.t}</div><div style="font-size:18px;font-weight:700;margin:2px 0">${esc(SYM)}</div>
    <div class="cx-big">${fmtP(L.c)} <span style="font-size:15px" class="${ch >= 0 ? 'buy' : 'sell'}">${isN(ch) ? `${ch >= 0 ? '+' : ''}${fmtP(ch)} (${(ch / pc * 100).toFixed(2)}%)` : ''}</span></div>
    <h3>Session</h3><div class="cx-kv"><span>Open</span><span>${fmtP(L.o)}</span><span>High</span><span>${fmtP(L.h)}</span><span>Low</span><span>${fmtP(L.l)}</span><span>Previous close</span><span>${fmtP(pc)}</span>${isN(L.vw) ? `<span>VWAP</span><span>${fmtP(L.vw)}</span>` : ''}<span>Volume</span><span>${fmtN(L.v, 0)}</span>${isN(L.to) ? `<span>Turnover (Rs)</span><span>${fmtN(L.to, 0)}</span>` : ''}${isN(L.tr) ? `<span>Transactions</span><span>${fmtN(L.tr, 0)}</span>` : ''}</div>
    <h3>52-week range</h3><div class="cx-bar52"><i style="left:${Math.max(0, Math.min(100, pos))}%"></i></div><div class="cx-kv"><span>Low ${fmtP(lo)}</span><span>High ${fmtP(hi)}</span></div>
    <h3>Performance</h3><div class="cx-kv">${pf.map(([k, v]) => `<span>${k}</span><span class="${v >= 0 ? 'buy' : 'sell'}">${isN(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '–'}</span>`).join('')}</div>
    <h3>Key statistics</h3><div class="cx-kv"><span>RSI (14)</span><span>${fmtN(rsi[n - 1], 1)}</span><span>ATR (14)</span><span>${fmtP(atr[n - 1])}</span><span>Avg volume (20)</span><span>${fmtN(av, 0)}</span><span>History</span><span>${n} sessions</span><span>From</span><span>${a[0].t}</span></div>
    <p class="cx-dim" style="margin-top:14px">Computed from the price data published in the admin dashboard. Not investment advice.</p>`; }
function gauge(score, label, size = 200) { const ang = Math.PI * (1 - (score + 1) / 2), cx = size / 2, cy = size / 2, r = size / 2 - 14, col = score > 0.1 ? UP : score < -0.1 ? DN : '#787b86';
  const arc = (a0, a1, c) => { const p = a => [cx + r * Math.cos(a), cy - r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${c}" stroke-width="9" fill="none"/>`; };
  const seg = [[DN, Math.PI, Math.PI * .8], ['#f7a1a8', Math.PI * .79, Math.PI * .56], ['#b2b5be', Math.PI * .55, Math.PI * .45], ['#8fd1c4', Math.PI * .44, Math.PI * .21], [UP, Math.PI * .2, 0]];
  return `<div class="cx-gauge"><svg width="${size}" height="${size / 2 + 12}" viewBox="0 0 ${size} ${size / 2 + 12}">${seg.map(([c, a, b]) => arc(a, b, c)).join('')}<line x1="${cx}" y1="${cy}" x2="${cx + (r - 18) * Math.cos(ang)}" y2="${cy - (r - 18) * Math.sin(ang)}" stroke="${css('--ink') || '#111'}" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="5" fill="${css('--ink') || '#111'}"/></svg><div class="lbl" style="color:${col}">${label}</div></div>`; }
function sideTech() { const R = TAI.rating(bars); if (!R) { $('#sp-tech').innerHTML = `<p class="cx-dim">At least 60 ${({D: 'daily', W: 'weekly', M: 'monthly'})[ST.tf]} bars are needed for the rating.</p>`; return; }
  const cnt = it => ({b: it.filter(x => x.v > 0).length, n: it.filter(x => x.v === 0).length, s: it.filter(x => x.v < 0).length}), all = R.ma.items.concat(R.osc.items), c = cnt(all), cm = cnt(R.ma.items), co = cnt(R.osc.items);
  const tbl = it => `<table class="cx-sig">${it.map(x => `<tr><td>${esc(x.name)}</td><td>${val(x.val)}</td><td class="${x.v > 0 ? 'buy' : x.v < 0 ? 'sell' : 'neu'}">${x.v > 0 ? 'Buy' : x.v < 0 ? 'Sell' : 'Neutral'}</td></tr>`).join('')}</table>`;
  const cn = k => `<div class="cx-cnt"><div>Sell<b class="sell">${k.s}</b></div><div>Neutral<b>${k.n}</b></div><div>Buy<b class="buy">${k.b}</b></div></div>`;
  $('#sp-tech').innerHTML = `<div class="cx-dim">${esc(SYM)} · ${({D: 'daily', W: 'weekly', M: 'monthly'})[ST.tf]} bars · as of ${bars[bars.length - 1].t}</div><h3>Summary</h3>${gauge(R.summary.score, R.summary.label, 230)}${cn(c)}
    <h3>Oscillators</h3>${gauge(R.osc.score, R.osc.label, 170)}${cn(co)}${tbl(R.osc.items)}<h3>Moving averages</h3>${gauge(R.ma.score, R.ma.label, 170)}${cn(cm)}${tbl(R.ma.items)}
    <p class="cx-dim" style="margin-top:12px">Same rules as TradingView's Technicals: each moving average votes Buy when price is above it; oscillators vote from overbought/oversold and direction. The summary averages both groups. A screening aid, not advice.</p>`; }
const WL = {q: '', sort: 'to', dir: -1, f: 'all'};
function sideWatch() { const p = $('#sp-watch'); if (!p.querySelector('.cx-wl')) { p.innerHTML = `<div class="cx-wl"><input type="search" id="wlQ" placeholder="Filter symbols"><div class="cx-seg" id="wlF" style="margin-top:6px"><button data-v="all">All</button><button data-v="stk">Stocks</button><button data-v="idx">Indices</button><button data-v="up">Gainers</button><button data-v="dn">Losers</button></div><div id="wlT"></div></div>`;
    p.querySelector('#wlQ').oninput = e => { WL.q = e.target.value.toUpperCase(); wl(); }; p.querySelector('#wlF').onclick = e => { const b = e.target.closest('button'); if (b) { WL.f = b.dataset.v; wl(); } }; }
  wl(); }
function wl() { segPress('#wlF', WL.f); let r = D.snap.filter(x => (!WL.q || x.s.includes(WL.q)) && x.t === D.last || x.idx && (!WL.q || x.s.includes(WL.q)));
  r = r.filter(x => WL.f === 'all' || (WL.f === 'idx' ? x.idx : WL.f === 'stk' ? !x.idx : WL.f === 'up' ? x.ch > 0 && !x.idx : x.ch < 0 && !x.idx));
  const k = WL.sort; r.sort((a, b) => k === 's' ? WL.dir * a.s.localeCompare(b.s) : WL.dir * ((a[k] ?? -1e18) - (b[k] ?? -1e18)));
  const th = (k_, l) => `<th data-k="${k_}">${l}${WL.sort === k_ ? (WL.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  $('#wlT').innerHTML = `<table><thead><tr>${th('s', 'Symbol')}${th('c', 'Last')}${th('ch', 'Chg%')}${th('to', 'Turnover')}</tr></thead><tbody>${r.slice(0, 600).map(x => `<tr data-s="${esc(x.s)}" class="${x.s === SYM ? 'cur' : ''}"><td>${esc(x.s)}</td><td>${fmtP(x.c)}</td><td class="${x.ch >= 0 ? 'buy' : 'sell'}">${isN(x.ch) ? x.ch.toFixed(2) : '–'}</td><td>${fmtV(x.to)}</td></tr>`).join('')}</tbody></table><p class="cx-dim">${r.length} symbols · session ${D.last}</p>`;
  $('#wlT').querySelectorAll('th').forEach(t => t.onclick = () => { if (WL.sort === t.dataset.k) WL.dir *= -1; else { WL.sort = t.dataset.k; WL.dir = t.dataset.k === 's' ? 1 : -1; } wl(); });
  $('#wlT').querySelectorAll('tr[data-s]').forEach(t => t.onclick = () => setSym(t.dataset.s)); }

/* ------------------------------ toolbar ------------------------------ */
function segPress(sel, v) { document.querySelectorAll(sel + ' button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); }
function setSym(s, fresh = true) { if (!s) return; SYM = s; $('#cxSymTxt').textContent = s; document.title = `${s} · Chart · Nepal Information Hub`; if (decodeURIComponent(location.hash.slice(1)) !== s) history.replaceState(null, '', '#' + encodeURIComponent(s));
  LS.set('nih-chart-sym', s); DR.list = LS.get(dKey(), []); DR.draft = null; DR.undo = null; build(!fresh); side(); }
$('#cxSym').onclick = () => symDlg('Symbol search', '', setSym);
$('#cxTf').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.tf = b.dataset.v; save(); segPress('#cxTf', ST.tf); build(false); side(); };
$('#cxType').onchange = e => { ST.type = e.target.value; save(); build(); };
$('#cxInd').onclick = indDlg; $('#cxTpl').onclick = tplDlg;
$('#cxCmp').onclick = () => symDlg('Compare with…', '', s => { if (s !== SYM && !ST.cmp.includes(s)) { ST.cmp.push(s); save(); build(); toast('Percent scale on while comparing'); } });
$('#cxRange').onclick = e => { const b = e.target.closest('button'); if (b) applyRange(b.dataset.v); };
$('#cxScale').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.scale = ST.scale === b.dataset.v ? 'auto' : b.dataset.v; save(); segPress('#cxScale', ST.scale); scaleMode(); queue(); };
$('#cxTheme').onclick = () => { const de = document.documentElement, dark = de.getAttribute('data-theme') === 'dark' || (!de.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches); const m = dark ? 'light' : 'dark'; de.setAttribute('data-theme', m); try { localStorage.setItem('nmm-theme', m); } catch (e) {} chart.applyOptions(themeOpts()); queue(); side(); };
$('#cxFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
$('#cxShot').onclick = async () => { const cv = chart.takeScreenshot(true), sc = cv.width / $('#cxChart').clientWidth, out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height + 34 * sc; const g = out.getContext('2d');
  g.fillStyle = css('--panel') || '#fff'; g.fillRect(0, 0, out.width, out.height); g.drawImage(cv, 0, 34 * sc); g.fillStyle = css('--ink') || '#111'; g.font = `${600} ${15 * sc}px sans-serif`; const b = bars[bars.length - 1]; g.fillText(`${SYM} · ${({D: 'Daily', W: 'Weekly', M: 'Monthly'})[ST.tf]} · ${b ? b.t + ' close ' + fmtP(b.c) : ''} · Nepal Information Hub`, 10 * sc, 22 * sc);
  try { const s = new XMLSerializer().serializeToString(DR.svg).replace('<svg', `<svg xmlns="${NS}"`), img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); }); g.drawImage(img, DR.box.left * sc, (DR.box.top + 34) * sc, DR.box.width * sc, DR.box.height * sc); } catch (e) {}
  const a = document.createElement('a'); a.download = `${SYM}_${ST.tf}_${b ? b.t : ''}.png`; a.href = out.toDataURL('image/png'); a.click(); toast('Snapshot saved'); };
document.addEventListener('keydown', e => { const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (!$('#cxModal').hidden) closeDlg(); else setTool('cursor'); return; }
  if (typing || !$('#cxModal').hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.key === '/') { e.preventDefault(); indDlg(); return; }
  if (e.altKey && e.key.toLowerCase() === 't') { setTool('trend'); return; } if (e.altKey && e.key.toLowerCase() === 'h') { setTool('hline'); return; } if (e.altKey && e.key.toLowerCase() === 'f') { setTool('fib'); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); symDlg('Symbol search', e.key.toUpperCase(), setSym); } });
window.addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)).toUpperCase(); if (h && h !== SYM && D.bars.has(h)) setSym(h); });

/* ------------------------------ boot + live refresh ------------------------------ */
(async () => {
  await loadData(); segPress('#cxTf', ST.tf); segPress('#cxScale', ST.scale); $('#cxType').value = ST.type; $('#cxMagnet').setAttribute('aria-pressed', ST.magnet);
  if (!D.syms.length) { $('#cxEmpty').hidden = false; $('#cxEmpty').innerHTML = '<div><h2>No market data yet</h2><p>Publish price data from the admin dashboard (Data › Stock market data), then reload this tab.</p></div>'; return; }
  const h = decodeURIComponent(location.hash.slice(1)).toUpperCase(), s = D.bars.has(h) ? h : D.bars.has(LS.get('nih-chart-sym', '')) ? LS.get('nih-chart-sym', '') : D.syms[0];
  setSym(s); if (h && !D.bars.has(h)) toast(`${h} not found in the published data; showing ${s}`, 4000);
  if (D.mode === 'server') setInterval(async () => { try { const [a, b] = await Promise.all([fetch('api/db/version', {cache: 'no-store'}).then(r => r.json()), fetch('api/market/version', {cache: 'no-store'}).then(r => r.json())]);
    if (`${a.version}|${b.version}` !== D.ver) { await loadData(); build(true); side(); toast('New data published; chart updated'); } } catch (e) {} }, 60000);
})();
window.NIHChart = {get chart() { return chart; }, get sym() { return SYM; }, setSym, ST, D, DR, build};
})();
