/* Nepal Information Hub — local edition
   All data lives in one database object (db.datasets). Dashboards, the data browser,
   data entry and the compare tool all read from it. */
'use strict';

/* ============================== basics ============================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const clone = o => JSON.parse(JSON.stringify(o));
const isNum = v => typeof v === 'number' && isFinite(v);
const fmt = (v, d = 1) => !isNum(v) ? '–' : Number(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const fmtAuto = v => !isNum(v) ? '–' : Math.abs(v) >= 1000 ? fmt(v, 0) : Math.abs(v) >= 100 ? fmt(v, 1) : fmt(v, 2);
const pct = (a, b) => (isNum(a) && isNum(b) && b !== 0) ? (a / b - 1) * 100 : null;
const bn = v => isNum(v) ? v / 1000 : null;
const sum = a => a.reduce((s, x) => s + (isNum(x) ? x : 0), 0);
const avg = a => { const v = a.filter(isNum); return v.length ? sum(v) / v.length : null; };
const last = a => a[a.length - 1];
const uniq = a => [...new Set(a)];
const parseNum = s => { if (s === '' || s == null) return null; const v = Number(String(s).replace(/,/g, '').trim()); return isFinite(v) ? v : NaN; };

const MON_AUG = ['Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul'];
const MON_CAL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EPM = ['Jul-Aug','Aug-Sep','Sep-Oct','Oct-Nov','Nov-Dec','Dec-Jan','Jan-Feb','Feb-Mar','Mar-Apr','Apr-May','May-Jun','Jun-Jul'];
const PERIOD_TYPES = {
  'fy':        {label: 'Fiscal year', freq: 'fy'},
  'fy-cat':    {label: 'Fiscal year + category', freq: 'fy'},
  'fy-month':  {label: 'Fiscal year + month', freq: 'fym'},
  'fy-month2': {label: 'Fiscal year + month (mid to mid)', freq: 'fym'},
  'year':      {label: 'Calendar year', freq: 'year'},
  'year-cat':  {label: 'Calendar year + category', freq: 'year'},
  'year-month':{label: 'Calendar year + month', freq: 'ym'},
  'quarter':   {label: 'Quarter', freq: 'q'},
  'date':      {label: 'Date', freq: 'day'},
  'date-cat':  {label: 'Date + category', freq: 'day'},
  'snapshot':  {label: 'Period snapshot', freq: null},
};
const FREQS = [['fy','Fiscal year'],['fym','Month (fiscal year)'],['year','Calendar year'],['ym','Calendar month'],['q','Quarter'],['day','Day']];

/* ============================== storage ============================== */
const Store = {mode: 'browser', db: null, saving: false, pending: false, lastSaved: null, version: 0};
const LS_KEY = 'nmm-db-v1';

async function loadDb() {
  let db = null;
  try {
    const r = await fetch('api/db', {cache: 'no-store'});
    if (r.ok) { const j = await r.json(); if (j && j.ok) { Store.mode = 'server'; db = j.db; Store.firstRun = !j.db; Store.version = j.version || 0; } }
  } catch (e) { /* no server: file:// or static host */ }
  if (Store.mode === 'github') { try { db = await GH.json('data/site.json'); } catch (e) { toast('Could not read data from GitHub: ' + e.message); } }
  // public website (Vercel / any static host): the data the admin published with "Publish website"
  if (Store.mode !== 'server' && location.protocol !== 'file:' && !IS_ADMIN) {
    try { const r = await fetch('data/site.json', {cache: 'no-cache'}); if (r.ok) { const j = await r.json(); if (j && j.datasets) { Store.mode = 'static'; db = j; } } } catch (e) {}
  }
  if (Store.mode === 'browser') {
    try { const t = localStorage.getItem(LS_KEY); if (t) db = JSON.parse(t); } catch (e) {}
  }
  if (!db) db = clone(window.SEED_DB);
  // bring in any dataset added to the seed later, never overwrite user data
  for (const [id, d] of Object.entries(window.SEED_DB.datasets)) if (!db.datasets[id]) db.datasets[id] = clone(d);
  db.log = db.log || [];
  if (db.datasets.stock_prices) {   // older versions kept watchlist prices separately
    const old = db.datasets.stock_prices.rows || [], o = db.datasets.stock_ohlc;
    old.forEach(r => { const i = o.rows.findIndex(x => x.date === r.date && x.symbol === r.symbol); const row = {date: r.date, symbol: r.symbol, open: r.open ?? null, high: r.high ?? null, low: r.low ?? null, close: r.close, volume: r.volume ?? null, turnover: r.turnover ?? null}; if (i >= 0) Object.assign(o.rows[i], row); else o.rows.push(row); });
    delete db.datasets.stock_prices;
  }
  // v6 fix: the salary & wage index y-o-y by industry was read from the wrong column in earlier versions
  db.fixes = db.fixes || {}; if (!db.fixes.swiYoy && db.datasets.wage_sector) { const sd = window.SEED_DB.datasets.wage_sector; db.datasets.wage_sector.rows.forEach(r => { const o = sd.rows.find(x => x.period === r.period && x.industry === r.industry); if (o) r.yoy = o.yoy; }); db.fixes.swiYoy = true; }
  { const f = db.datasets.stock_fundamentals; if (f && !f.cols.some(c => c.k === 'mcap')) f.cols.push({k: 'mcap', label: 'Market capitalisation (Rs)', t: 'num'}); }
  Store.db = db;
  for (const d of Object.values(db.datasets)) sortRows(d);
  if (typeof siteDb === 'function') siteDb();
  showStore();
}
/* the database without the daily-price rows (those live in data/market.json / IndexedDB) */
const dbJson = db => JSON.stringify(db, (k, v) => k === 'rows' && Array.isArray(v) && v.length && v[v.length - 1] && v.some(r => r && r._m) ? v.filter(r => !r._m) : v);
async function persist(silent) {
  if (!IS_ADMIN) { if (!silent) toast('This is the public dashboard — changes are not saved. Data and files are managed in the admin dashboard.'); return; }
  const db = Store.db; db.updated = new Date().toISOString();
  if (Store.mode === 'github') { GH.queue(); if (!silent) toast('Saved. Publishing to the website in 20 seconds…'); return; }
  if (Store.mode === 'server') {
    if (Store.saving) { Store.pending = true; return; }
    Store.saving = true; showStore('Saving…');
    try {
      const r = await fetch('api/db', {method: 'PUT', headers: authHeaders({'Content-Type': 'application/json'}), body: dbJson(db)});
      const j = await r.json();
      if (r.status === 401) { Store.saving = false; showStore('err', 'Signed out — sign in again to save'); await adminGate(true); return persist(silent); }
      if (j.version) Store.version = j.version;
      if (!j.ok) throw new Error(j.error || 'Save failed');
      Store.lastSaved = new Date(); showStore();
      if (!silent) toast('Saved to data/db.json');
    } catch (e) { showStore('err', 'Not saved: ' + e.message); toast('Could not save to the server. ' + e.message); }
    Store.saving = false;
    if (Store.pending) { Store.pending = false; persist(true); }
  } else {
    try { localStorage.setItem(LS_KEY, dbJson(db)); Store.lastSaved = new Date(); showStore(); if (!silent) toast('Saved in this browser'); }
    catch (e) { showStore('err', 'Browser storage is full or blocked'); toast('Could not save in this browser. Download a backup from Settings.'); }
  }
}
function showStore(state, text) {
  const dot = $('#storeDot'), t = $('#storeText');
  if (state === 'err') { dot.className = 'dot err'; t.textContent = text; return; }
  if (state) { dot.className = 'dot warn'; t.textContent = state; return; }
  const when = Store.lastSaved ? ' · saved ' + Store.lastSaved.toLocaleTimeString() : '';
  if (!IS_ADMIN) { dot.className = 'dot ok'; const u = Store.db?.updated; t.textContent = 'Published data' + (u ? ' · updated ' + String(u).slice(0, 10) : ''); $('#banner').innerHTML = ''; return; }
  if (Store.mode === 'github') { const pend = GH.pending(); dot.className = 'dot ' + (pend ? 'warn' : 'ok'); t.innerHTML = (pend ? 'Unpublished changes · <a href="#" id="ghPubNow">publish now</a>' : 'Saved to GitHub') + (GH.lastCommit ? ' · last push ' + GH.lastCommit.toLocaleTimeString() : ''); $('#banner').innerHTML = ''; const a = $('#ghPubNow'); if (a) a.onclick = e => { e.preventDefault(); GH.flush(); }; }
  else if (Store.mode === 'server') { dot.className = 'dot ok'; t.textContent = 'Saving to data/db.json' + when; $('#banner').innerHTML = ''; }
  else {
    dot.className = 'dot warn'; t.textContent = 'Saving in this browser only' + when;
    $('#banner').innerHTML = `<div class="banner">This page was opened without the local server, so your entries are kept only in this browser. To save them to a file you can back up and share, close this tab and run <code>start-windows.bat</code> (or <code>python server.py</code>), then open <code>http://localhost:8080</code>.</div>`;
  }
}
function logChange(action, dsId, detail) {
  Store.db.log.unshift({t: new Date().toISOString(), action, ds: dsId, detail});
  Store.db.log = Store.db.log.slice(0, 300);
}

/* ============================== datasets ============================== */
const ds = id => Store.db.datasets[id];
const allDs = () => Object.values(Store.db.datasets);
const numCols = d => d.cols.filter(c => c.t === 'num');
const colBy = (d, prefix) => d.cols.find(c => c.label.startsWith(prefix)) || d.cols.find(c => c.label.toLowerCase().includes(prefix.toLowerCase()));
function periodKeys(d) {
  switch (d.period) {
    case 'fy': case 'fy-cat': return ['fy'];
    case 'fy-month': case 'fy-month2': return ['fy', 'month'];
    case 'year': case 'year-cat': return ['year'];
    case 'year-month': return ['year', 'month'];
    case 'quarter': return ['quarter'];
    case 'date': case 'date-cat': return [d.cols.find(c => c.t === 'date')?.k || 'date'];
    case 'snapshot': return ['period'];
    default: return [d.keys[0]];
  }
}
const catKeys = d => d.keys.filter(k => !periodKeys(d).includes(k));
function sortKey(d, r) {
  const pad = i => String(i < 0 ? 99 : i).padStart(2, '0');
  switch (d.period) {
    case 'fy-month': return (r.fy || '') + '|' + pad(MON_AUG.indexOf(r.month));
    case 'fy-month2': return (r.fy || '') + '|' + pad(EPM.indexOf(r.month));
    case 'year-month': return (r.year || '') + '|' + pad(MON_CAL.indexOf(r.month));
    default: return String(r[periodKeys(d)[0]] ?? '');
  }
}
function sortRows(d) {
  if (d.period === 'snapshot') {  // keep period order of first appearance; stable
    const order = uniq(d.rows.map(r => r.period));
    d.rows.sort((a, b) => order.indexOf(a.period) - order.indexOf(b.period));
    return;
  }
  const idx = new Map(d.rows.map((r, i) => [r, i]));
  d.rows.sort((a, b) => { const x = sortKey(d, a), y = sortKey(d, b); return x < y ? -1 : x > y ? 1 : idx.get(a) - idx.get(b); });
}
const plabel = (d, r) => periodKeys(d).map(k => r[k]).join(' ');
function periods(d) { return uniq(d.rows.map(r => plabel(d, r))); }
const latestP = d => last(periods(d));
const rowsAt = (d, p) => d.rows.filter(r => plabel(d, r) === p);
const catLabel = (d, r) => { const ks = catKeys(d); let s = ks.map(k => r[k]).join(' · ');
  const extra = d.cat && !ks.includes(d.cat) ? d.cat : d.cols.find(c => c.t === 'text' && !d.keys.includes(c.k) && !/date|section/.test(c.k))?.k;
  if (extra && r[extra] != null) s += ' · ' + r[extra]; return s; };
function alignKey(d, r) {   // common time key for comparing datasets of the same frequency
  switch (d.period) {
    case 'fy-month': return r.fy + '|' + String(MON_AUG.indexOf(r.month)).padStart(2, '0');
    case 'fy-month2': return r.fy + '|' + String(MON_AUG.indexOf((r.month || '').split('-')[1])).padStart(2, '0');
    case 'year-month': return r.year + '|' + String(MON_CAL.indexOf(r.month)).padStart(2, '0');
    default: return String(r[periodKeys(d)[0]]);
  }
}
function alignLabel(freq, k) {
  if (freq === 'fym') { const [fy, i] = k.split('|'); return MON_AUG[+i] + ' ' + fy; }
  if (freq === 'ym') { const [y, i] = k.split('|'); return MON_CAL[+i] + ' ' + y; }
  return k;
}
function nextPeriod(d) {
  const r = last(d.rows); if (!r) return {};
  const nfy = fy => { const m = /^(\d{4})\/(\d{2})$/.exec(fy || ''); if (!m) return fy; const a = +m[1] + 1; return a + '/' + String((a + 1) % 100).padStart(2, '0'); };
  switch (d.period) {
    case 'fy': return {fy: nfy(r.fy)};
    case 'fy-month': { const i = MON_AUG.indexOf(r.month); return i === 11 ? {fy: nfy(r.fy), month: 'Aug'} : {fy: r.fy, month: MON_AUG[i + 1]}; }
    case 'fy-month2': { const i = EPM.indexOf(r.month); return i === 11 ? {fy: nfy(r.fy), month: EPM[0]} : {fy: r.fy, month: EPM[i + 1]}; }
    case 'year-month': { const i = MON_CAL.indexOf(r.month); return i === 11 ? {year: String(+r.year + 1), month: 'Jan'} : {year: r.year, month: MON_CAL[i + 1]}; }
    case 'year': return {year: String(+r.year + 1)};
    case 'fy-cat': return {fy: r.fy};
    case 'year-cat': return {year: r.year};
    case 'date': case 'date-cat': return {[periodKeys(d)[0]]: new Date().toISOString().slice(0, 10)};
    case 'snapshot': return {period: r.period};
    default: return {};
  }
}
const series = (d, key, filter) => { const rs = d.rows.filter(filter || (() => true)); return {labels: rs.map(r => plabel(d, r)), values: rs.map(r => r[key] ?? null), rows: rs}; };

/* ============================== charts ============================== */
const T = () => ({ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), grid: css('--grid'), line: css('--line'), panel: css('--panel'),
  s: [1,2,3,4,5,6,7,8].map(i => css('--s' + i)), good: css('--good'), crit: css('--crit'), neutral: css('--neutral'), accent: css('--accent')});
const charts = {};
function mk(id, cfg) {
  const el = document.getElementById(id); if (!el) return;
  if (charts[id]) charts[id].destroy();
  const t = T();
  cfg.options = Object.assign({responsive: true, maintainAspectRatio: false, animation: {duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300},
    interaction: {mode: 'index', intersect: false}}, cfg.options || {});
  const o = cfg.options; o.plugins = o.plugins || {};
  o.plugins.legend = Object.assign({labels: {color: t.ink2, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: {size: 12}}}, o.plugins.legend || {});
  o.plugins.tooltip = Object.assign({backgroundColor: t.panel, titleColor: t.ink, bodyColor: t.ink2, borderColor: t.line, borderWidth: 1, padding: 10,
    titleFont: {weight: '600'}, bodyFont: {family: 'JetBrains Mono, Consolas, monospace', size: 12}, boxPadding: 4, usePointStyle: true}, o.plugins.tooltip || {});
  o.scales = o.scales || {};
  for (const k of Object.keys(o.scales)) {
    const sc = o.scales[k];
    sc.grid = Object.assign({color: t.grid, drawTicks: false}, sc.grid || {});
    sc.border = {display: false};
    sc.ticks = Object.assign({color: t.ink3, font: {family: 'JetBrains Mono, Consolas, monospace', size: 11}, padding: 6}, sc.ticks || {});
  }
  charts[id] = new Chart(el, cfg);
}
const line = (label, data, color, extra = {}) => Object.assign({label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25, spanGaps: true}, extra);
const bar = (label, data, color, extra = {}) => Object.assign({label, data, backgroundColor: color, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28, categoryPercentage: .8, barPercentage: .9}, extra);
const tip = (unit, d = 1, h) => ({callbacks: {label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${fmt(h ? c.parsed.x : c.parsed.y, d)}${unit}`}});
const hbarOpts = (unit, d, extra = {}) => Object.assign({indexAxis: 'y', interaction: {mode: 'nearest', axis: 'y', intersect: false},
  plugins: {legend: {display: false}, tooltip: tip(unit, d, true)}, scales: {x: {}, y: {grid: {display: false}, ticks: {autoSkip: false, color: T().ink2, font: {family: 'Instrument Sans, system-ui, sans-serif', size: 11.5}}}}}, extra);
const xCat = (max = 8) => ({grid: {display: false}, ticks: {maxTicksLimit: max, autoSkip: true, maxRotation: 0}});
function seg(id, cb) {
  const el = $(id); if (!el) return () => null;
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); cb(b.dataset.v); });
  return () => el.querySelector('[aria-pressed="true"]').dataset.v;
}
function kpis(sel, items) {
  $(sel).innerHTML = items.map(k => `<div class="kpi"><span class="k">${esc(k.k)}</span><span class="v">${esc(k.v)}</span><span class="d">${k.chip ? `<span class="chip ${k.dir || 'nt'}">${esc(k.chip)}</span>` : ''}${esc(k.d || '')}</span></div>`).join('');
}
const arrow = (a, b) => a > b ? '▲' : a < b ? '▼' : '■';
const dirc = (a, b, goodUp = true) => (!isNum(a) || !isNum(b) || a === b) ? 'nt' : ((a > b) === goodUp ? 'up' : 'dn');
function fillSelect(sel, opts, keep) {
  const el = $(sel), cur = el.value;
  el.innerHTML = opts.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}">${esc(o[1])}</option>` : `<option>${esc(o)}</option>`).join('');
  const vals = opts.map(o => Array.isArray(o) ? String(o[0]) : String(o));
  if (keep && vals.includes(cur)) el.value = cur; else if (keep && vals.includes(String(keep))) el.value = keep;
}
function emptyChart(id, msg) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const el = document.getElementById(id); const ctx = el.getContext('2d'); ctx.clearRect(0, 0, el.width, el.height);
  const p = el.parentElement; let m = p.querySelector('.empty'); if (!m) { m = document.createElement('div'); m.className = 'empty'; m.style.position = 'absolute'; m.style.inset = '0'; p.appendChild(m); }
  m.innerHTML = esc(msg);
}
function clearEmpty(id) { const m = document.getElementById(id)?.parentElement.querySelector('.empty'); if (m) m.remove(); }

/* ============================== OVERVIEW ============================== */
function smiVal(prefix, back = 0) { const d = ds('smi'), c = colBy(d, prefix); if (!c) return null; const r = d.rows[d.rows.length - 1 - back]; return r ? r[c.k] : null; }
function renderOv() {
  const d = ds('smi');
  const g = [smiVal("Real GDP at purchasers"), smiVal("Real GDP at purchasers", 1)], cpi = [smiVal('CPI (y-o-y)'), smiVal('CPI (y-o-y)', 1)];
  const bop = ds('bop_annual').rows, b = last(bop), res = last(ds('reserves_monthly').rows), debt = ds('debt').rows, npl = last(ds('npl_quarterly').rows);
  const nd = nepseDaily(), nepse = nd.length ? [last(nd).nepse, nd.length > 1 ? nd[nd.length - 2].nepse : null, 'on ' + last(nd).date] : [smiVal('NEPSE'), smiVal('NEPSE', 1), 'over the year'];
  const ly = last(d.rows)?.fy, py = d.rows[d.rows.length - 2]?.fy;
  $('#latestFy').innerHTML = `Latest annual data <b>FY ${esc(ly)}</b>`;
  kpis('#kpis', [
    {k: `Real GDP growth, ${ly}`, v: fmt(g[0], 2) + '%', chip: arrow(g[0], g[1]) + ' ' + fmt(g[1], 2) + '%', dir: dirc(g[0], g[1]), d: ' in ' + py},
    {k: 'CPI inflation, mid-July', v: fmt(cpi[0], 2) + '%', chip: arrow(cpi[0], cpi[1]) + ' ' + fmt(cpi[1], 2) + '%', dir: dirc(cpi[0], cpi[1], false), d: ' a year earlier'},
    {k: "Workers' remittances", v: 'Rs ' + fmt(smiVal("Workers' Remittances"), 0) + ' bn', chip: fmt(b?.remit_gdp, 1) + '% of GDP', d: ' ' + (b?.fy || '')},
    {k: 'Current account', v: fmt(b?.ca_gdp, 1) + '% GDP', chip: 'Rs ' + fmt(bn(b?.ca), 0) + ' bn', dir: (b?.ca || 0) >= 0 ? 'up' : 'dn', d: (b?.ca || 0) >= 0 ? ' surplus' : ' deficit'},
    {k: 'Gross FX reserves', v: '$' + fmt((res?.usd_mn || 0) / 1000, 1) + ' bn', chip: fmt(res?.m_gs, 1) + ' months', d: ` of imports, ${res?.month} ${res?.fy}`},
    {k: 'Public debt', v: fmt(last(debt)?.tot_gdp, 1) + '% GDP', chip: arrow(last(debt)?.tot_gdp, debt[debt.length - 2]?.tot_gdp) + ' ' + fmt(debt[debt.length - 2]?.tot_gdp, 1) + '%', dir: dirc(last(debt)?.tot_gdp, debt[debt.length - 2]?.tot_gdp, false), d: ' a year earlier'},
    {k: 'Banking NPL ratio', v: fmt(npl?.all, 2) + '%', chip: 'Q ' + (npl?.quarter || ''), d: ' all BFIs'},
    {k: 'NEPSE index', v: fmt(nepse[0], 1), chip: isNum(nepse[1]) ? arrow(nepse[0], nepse[1]) + ' ' + fmt(pct(nepse[0], nepse[1]), 1) + '%' : 'no earlier entry', dir: dirc(nepse[0], nepse[1]), d: ' ' + nepse[2]},
  ]);
  const opts = []; let grp = '';
  let html = ''; numCols(d).forEach(c => { if (c.group !== grp) { if (grp) html += '</optgroup>'; grp = c.group || 'Other'; html += `<optgroup label="${esc(grp)}">`; } html += `<option value="${c.k}">${esc(c.label)}</option>`; });
  const cur = $('#smiSel').value; $('#smiSel').innerHTML = html + '</optgroup>';
  $('#smiSel').value = cur || colBy(d, "Workers' Remittances").k;
  drawSmi(); drawRemCa(); drawDaily();
}
const smiType = seg('#smiType', () => drawSmi());
$('#smiSel').onchange = () => drawSmi();
function drawSmi() {
  const d = ds('smi'), key = $('#smiSel').value, c = d.cols.find(x => x.k === key); if (!c) return;
  const t = T(), s = series(d, key), v = s.values, tp = smiType();
  const unit = /Rs\.|USD|Index \(Closing\)|billion/i.test(c.label) ? '' : '%';
  const ds_ = tp === 'bar' ? bar(c.label, v, v.map(x => x < 0 ? t.crit : t.s[0])) : line(c.label, v, t.s[0], {pointRadius: 3});
  mk('cSmi', {type: tp, data: {labels: s.labels, datasets: [ds_]}, options: {plugins: {legend: {display: false}, tooltip: tip(unit, 2)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: tp === 'bar'}}}});
  const vv = v.filter(isNum); if (!vv.length) { $('#smiRead').innerHTML = ''; return; }
  const mx = Math.max(...vv), mi = Math.min(...vv);
  $('#smiRead').innerHTML = `<span>${esc(last(s.labels))} <b>${fmt(last(v), 2)}${unit}</b></span><span>Previous <b>${fmt(v[v.length - 2], 2)}${unit}</b></span><span>High <b>${fmt(mx, 2)}${unit}</b> (${esc(s.labels[v.indexOf(mx)])})</span><span>Low <b>${fmt(mi, 2)}${unit}</b> (${esc(s.labels[v.indexOf(mi)])})</span><span>Average <b>${fmt(avg(v), 2)}${unit}</b></span>`;
}
function drawRemCa() {
  const t = T(), rows = ds('bop_annual').rows.filter(r => +String(r.fy).slice(0, 4) >= 2000);
  mk('cRemCa', {type: 'line', data: {labels: rows.map(r => r.fy), datasets: [
    line('Remittances', rows.map(r => r.remit_gdp), t.s[0], {fill: {target: 'origin', above: t.s[0] + '22'}}), line('Current account', rows.map(r => r.ca_gdp), t.s[1])]},
    options: {plugins: {tooltip: tip('% of GDP')}, scales: {x: xCat(9), y: {ticks: {callback: v => v + '%'}}}}});
}
function drawDaily() {
  const d = ds('nrb_daily'), rs = d.rows.slice(-5), items = numCols(d);
  if (!rs.length) { $('#tDaily').innerHTML = '<tbody><tr><td>No daily entries yet.</td></tr></tbody>'; return; }
  $('#tDaily').innerHTML = `<thead><tr><th>Rs billion</th>${rs.map(x => `<th>${esc(x.date_bs || '')}<br><span style="font-weight:400">${esc(x.date_ad)}</span></th>`).join('')}</tr></thead><tbody>` +
    items.map(c => `<tr><td>${esc(c.label)}</td>${rs.map(x => `<td class="num">${fmt(bn(x[c.k]), 1)}</td>`).join('')}</tr>`).join('') + '</tbody>';
}

/* ============================== GROWTH ============================== */
const gdpLongMode = seg('#gdpLongMode', () => drawGdpLong());
const secMode = seg('#secMode', () => drawSec());
$('#secYear').onchange = () => drawSec(); $('#secPick').onchange = () => drawSecTs();
function renderReal() {
  drawGdpLong();
  const d = ds('gdp_nominal');
  fillSelect('#secYear', periods(d).slice().reverse(), latestP(d));
  fillSelect('#secPick', d.cols.filter(c => c.t === 'num' && c.k !== 'gdp').map(c => [c.k, c.label]), 's3');
  drawSec(); drawSecTs(); drawPc();
}
function drawGdpLong() {
  const t = T(), k = gdpLongMode(), rows = ds('gdp_long').rows.filter(r => isNum(r[k]));
  const v = rows.map(r => r[k]);
  mk('cGdpLong', {type: 'bar', data: {labels: rows.map(r => r.fy), datasets: [bar(k === 'real_g' ? 'Real GDP growth' : 'Nominal GDP growth', v, v.map(x => x < 0 ? t.crit : t.s[0]), {maxBarThickness: 14, borderRadius: 2})]},
    options: {plugins: {legend: {display: false}, tooltip: tip('%', 2)}, scales: {x: xCat(12), y: {ticks: {callback: v => v + '%'}}}}});
}
function drawSec() {
  const t = T(), y = $('#secYear').value, m = secMode(), n = ds('gdp_nominal'), g = ds('gdp_real_growth');
  const rn = n.rows.find(r => r.fy === y), rg = g.rows.find(r => r.fy === y); if (!rn) return;
  const sc = n.cols.filter(c => c.t === 'num' && c.k !== 'gdp'), gva = sum(sc.map(c => rn[c.k]));
  const rows = sc.map(c => ({n: c.label, v: m === 'share' ? (isNum(rn[c.k]) ? rn[c.k] / gva * 100 : null) : rg?.[c.k]})).filter(r => isNum(r.v)).sort((a, b) => b.v - a.v);
  $('#secSub').textContent = m === 'share' ? `Share of gross value added at basic prices, ${y}` : `Real growth by industry, ${y}, %`;
  mk('cSec', {type: 'bar', data: {labels: rows.map(r => r.n), datasets: [bar('', rows.map(r => r.v), rows.map(r => r.v < 0 ? t.crit : t.s[0]), {maxBarThickness: 16})]},
    options: hbarOpts('%', 2, {scales: {x: {ticks: {callback: v => v + '%'}}, y: {grid: {display: false}, ticks: {autoSkip: false, color: t.ink2, font: {size: 11.5}}}}})});
}
function drawSecTs() {
  const t = T(), k = $('#secPick').value, n = ds('gdp_nominal'), g = ds('gdp_real_growth'), c = n.cols.find(x => x.k === k); if (!c) return;
  const s = series(n, k);
  mk('cSecTs', {type: 'bar', data: {labels: s.labels, datasets: [bar(c.label, s.values.map(bn), t.s[0], {maxBarThickness: 18})]},
    options: {plugins: {legend: {display: false}, tooltip: {callbacks: {label: x => ` Rs ${fmt(x.parsed.y, 1)} bn · real growth ${fmt(g.rows.find(r => r.fy === s.labels[x.dataIndex])?.[k], 2)}%`}}}, scales: {x: xCat(8), y: {beginAtZero: true}}}});
  const lr = last(n.rows), sc = n.cols.filter(x => x.t === 'num' && x.k !== 'gdp'), gva = sum(sc.map(x => lr[x.k]));
  const v = s.values.filter(isNum), cagr = v.length > 1 ? (Math.pow(last(v) / v[0], 1 / (v.length - 1)) - 1) * 100 : null;
  $('#secRead').innerHTML = `<span>${esc(lr.fy)} <b>Rs ${fmt(bn(lr[k]), 0)} bn</b></span><span>Share <b>${fmt(lr[k] / gva * 100, 1)}%</b></span><span>Real growth <b>${fmt(last(g.rows)?.[k], 2)}%</b></span><span>Nominal CAGR since ${esc(s.labels[0])} <b>${fmt(cagr, 1)}%</b></span>`;
}
function drawPc() {
  const t = T(), d = ds('macro_summary');
  const pick = [['Nominal Percapita GDP (US$)', 'GDP'], ['Nominal Percapita GNI (US$)', 'GNI'], ['Nominal Percapita GNDI (US$)', 'GNDI']];
  mk('cPc', {type: 'line', data: {labels: periods(d), datasets: pick.map(([p, l], i) => { const c = colBy(d, p); return line(l, c ? d.rows.map(r => r[c.k]) : [], t.s[i]); })},
    options: {plugins: {tooltip: tip(' US$', 0)}, scales: {x: xCat(8), y: {ticks: {callback: v => '$' + v}}}}});
}

/* ============================== PRICES ============================== */
const pxIdx = seg('#pxIdx', () => drawPxM()), grpFilt = seg('#grpFilt', () => drawGrp()), grpArea = seg('#grpArea', () => drawGrp()), provMode = seg('#provMode', () => drawProv());
function renderPx() {
  const im = ds('inflation_monthly'), lr = last(im.rows), fyRows = im.rows.filter(r => r.fy === lr.fy);
  const prevSame = im.rows.find(r => r.month === lr.month && r.fy === uniq(im.rows.map(x => x.fy)).slice(-2)[0]);
  const cg = ds('cpi_groups'), lp = latestP(cg), g = rowsAt(cg, lp), A = g.find(r => r.code === 'A'), B = g.find(r => r.code === 'B');
  const swi = smiVal('Salary and Wage Rate Index (y-o-y)');
  kpis('#kpisPx', [
    {k: `CPI y-o-y, ${lr.month} ${lr.fy}`, v: fmt(lr.cpi, 2) + '%', chip: 'FY avg ' + fmt(avg(fyRows.map(r => r.cpi)), 2) + '%', d: ' so far'},
    {k: 'Food & beverages', v: fmt(A?.national, 2) + '%', chip: 'weight ' + fmt(A?.weight, 1) + '%', d: ' ' + lp},
    {k: 'Non-food & services', v: fmt(B?.national, 2) + '%', chip: 'weight ' + fmt(B?.weight, 1) + '%', d: ' ' + lp},
    {k: `WPI y-o-y, ${lr.month} ${lr.fy}`, v: fmt(lr.wpi, 2) + '%', chip: arrow(lr.wpi, prevSame?.wpi) + ' ' + fmt(prevSame?.wpi, 2) + '%', dir: dirc(lr.wpi, prevSame?.wpi, false), d: ' a year earlier'},
    {k: 'Wage index y-o-y (annual)', v: fmt(swi, 2) + '%', chip: 'real ≈ ' + fmt(swi - smiVal('CPI (y-o-y)'), 1) + ' pts', dir: swi > smiVal('CPI (y-o-y)') ? 'up' : 'dn', d: ' above CPI'},
  ]);
  drawPxM(); drawGrp(); drawProv(); drawSwi();
}
function drawPxM() {
  const t = T(), k = pxIdx(), d = ds('inflation_monthly'), fys = uniq(d.rows.map(r => r.fy)).slice(-4), cols = [t.neutral, t.s[2], t.s[1], t.s[0]].slice(-fys.length);
  mk('cPxM', {type: 'line', data: {labels: MON_AUG, datasets: fys.map((y, i) => line(y, MON_AUG.map(m => d.rows.find(r => r.fy === y && r.month === m)?.[k] ?? null), cols[i], {borderWidth: i === fys.length - 1 ? 2.5 : 2, pointRadius: i === fys.length - 1 ? 2.5 : 0}))},
    options: {plugins: {tooltip: tip('%', 2)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: true, ticks: {callback: v => v + '%'}}}}});
}
function drawGrp() {
  const t = T(), f = grpFilt(), a = grpArea(), d = ds('cpi_groups'), lp = latestP(d);
  $('#grpSub').textContent = `Year-on-year % change, ${lp}`;
  const g = rowsAt(d, lp).filter(x => String(x.code).includes('.') && (f === 'all' || String(x.code).startsWith(f)) && isNum(x[a])).sort((x, y) => y[a] - x[a]);
  mk('cGrp', {type: 'bar', data: {labels: g.map(x => String(x.group).replace(' and ', ' & ')), datasets: [bar('y-o-y', g.map(x => x[a]), g.map(x => x[a] < 0 ? t.crit : String(x.code)[0] === 'A' ? t.s[1] : t.s[0]), {maxBarThickness: 14})]},
    options: hbarOpts('%', 2, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` ${fmt(c.parsed.x, 2)}% y-o-y · weight ${fmt(g[c.dataIndex].weight, 2)}%`}}}})});
}
function drawProv() {
  const t = T(), m = provMode(), d = ds('cpi_province'), lp = latestP(d), p = rowsAt(d, lp);
  $('#provSub').textContent = `CPI y-o-y, ${lp}`;
  mk('cProv', {type: 'bar', data: {labels: p.map(x => x.province), datasets: [bar('y-o-y', p.map(x => x[m]), p.map(x => x.province === 'National' ? t.neutral : t.s[0]))]},
    options: {plugins: {legend: {display: false}, tooltip: tip('%', 2)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: true, ticks: {callback: v => v + '%'}}}}});
}
function drawSwi() {
  const t = T(), d = ds('wage_sector'), lp = latestP(d), s = rowsAt(d, lp).filter(x => isNum(x.yoy)).sort((a, b) => b.yoy - a.yoy);
  $('#swiSub').textContent = `Salary and Wage Index y-o-y, ${lp}`;
  mk('cSwi', {type: 'bar', data: {labels: s.map(x => String(x.industry).replace(' and ', ' & ').replace(' Activities', '')), datasets: [bar('y-o-y', s.map(x => x.yoy), t.s[2], {maxBarThickness: 14})]},
    options: hbarOpts('%', 2, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` ${fmt(c.parsed.x, 2)}% · weight ${fmt(s[c.dataIndex].weight, 1)}%`}}}})});
}

/* ============================== EXTERNAL ============================== */
const resMode = seg('#resMode', () => drawRes()), trMode = seg('#trMode', () => drawTrade()), topMode = seg('#topMode', () => drawTop()), migType = seg('#migType', () => drawMig());
$('#topYear').onchange = () => drawTop(); $('#migYear').onchange = () => drawMig(); $('#tourYears').onchange = () => drawTour();
function renderExt() {
  const ta = ds('trade_annual').rows, t1 = last(ta), t0 = ta[ta.length - 2], b = last(ds('bop_annual').rows);
  const fx = ds('fx_monthly'), fys = uniq(fx.rows.map(r => r.fy)), fxA = y => avg(fx.rows.filter(r => r.fy === y).map(r => r.npr_usd));
  const mg = ds('migrants'), mfy = uniq(mg.rows.map(r => r.fy)), mt = y => sum(mg.rows.filter(r => r.fy === y).map(r => r.new));
  kpis('#kpisExt', [
    {k: `Exports, ${t1.fy}`, v: 'Rs ' + fmt(bn(t1.exports), 0) + ' bn', chip: arrow(t1.exports, t0.exports) + ' ' + fmt(pct(t1.exports, t0.exports), 1) + '%', dir: dirc(t1.exports, t0.exports)},
    {k: `Imports, ${t1.fy}`, v: 'Rs ' + fmt(bn(t1.imports), 0) + ' bn', chip: arrow(t1.imports, t0.imports) + ' ' + fmt(pct(t1.imports, t0.imports), 1) + '%'},
    {k: 'Export / import ratio', v: fmt(t1.exports / t1.imports * 100, 1) + '%', chip: 'deficit ' + fmt(-t1.balance / 1000, 0) + ' bn'},
    {k: `BoP, ${b.fy}`, v: 'Rs ' + fmt(bn(b.bop), 0) + ' bn', chip: fmt(b.bop_gdp, 1) + '% of GDP', dir: b.bop >= 0 ? 'up' : 'dn'},
    {k: `NPR per US$, ${last(fys)} avg`, v: fmt(fxA(last(fys)), 2), chip: arrow(fxA(last(fys)), fxA(fys[fys.length - 2])) + ' ' + fmt(pct(fxA(last(fys)), fxA(fys[fys.length - 2])), 1) + '%', dir: 'nt', d: ' vs previous year'},
    {k: `New labour permits, ${last(mfy)}`, v: fmt(mt(last(mfy)), 0), chip: arrow(mt(last(mfy)), mt(mfy[mfy.length - 2])) + ' ' + fmt(pct(mt(last(mfy)), mt(mfy[mfy.length - 2])), 1) + '%'},
  ]);
  const tc = ds('trade_commodity'); fillSelect('#topYear', uniq(tc.rows.map(r => r.fy)).reverse(), latestP(tc));
  fillSelect('#migYear', mfy.slice().reverse(), last(mfy));
  const ty = uniq(ds('tourism').rows.map(r => r.year)); fillSelect('#tourYears', ty.slice(0, -2).reverse(), '2019');
  drawRes(); drawFx(); drawTrade(); drawTop(); drawPartner(); drawBop(); drawMig(); drawTour();
}
function drawRes() {
  const t = T(), m = resMode(), r = ds('reserves_monthly').rows;
  $('#resSub').textContent = m === 'usd' ? 'Gross reserves, US$ million' : 'Months of imports covered';
  const dsets = m === 'usd' ? [line('Gross reserves', r.map(x => x.usd_mn), t.s[0], {fill: {target: 'origin', above: t.s[0] + '1f'}})] : [line('Goods', r.map(x => x.m_goods), t.s[0]), line('Goods & services', r.map(x => x.m_gs), t.s[1])];
  mk('cRes', {type: 'line', data: {labels: r.map(x => x.month + ' ' + x.fy), datasets: dsets}, options: {plugins: {legend: {display: m !== 'usd'}, tooltip: tip(m === 'usd' ? ' US$ mn' : ' months', m === 'usd' ? 0 : 1)}, scales: {x: xCat(6), y: {beginAtZero: m !== 'usd'}}}});
}
function drawFx() {
  const t = T(), r = ds('fx_monthly').rows;
  mk('cFx', {type: 'line', data: {labels: r.map(x => x.month + ' ' + x.fy), datasets: [line('NPR/USD', r.map(x => x.npr_usd), t.s[0])]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 2)}, scales: {x: xCat(7)}}});
}
function drawTrade() {
  const t = T(), m = trMode(), r = ds('trade_annual').rows;
  $('#trSub').textContent = m === 'gdp' ? 'Exports and imports, % of GDP' : 'Exports and imports, Rs billion (log scale)';
  mk('cTrade', {type: 'line', data: {labels: r.map(x => x.fy), datasets: [line('Imports', r.map(x => m === 'gdp' ? x.imp_gdp : bn(x.imports)), t.s[1]), line('Exports', r.map(x => m === 'gdp' ? x.exp_gdp : bn(x.exports)), t.s[0])]},
    options: {plugins: {tooltip: tip(m === 'gdp' ? '% of GDP' : ' bn', 1)}, scales: {x: xCat(9), y: m === 'gdp' ? {beginAtZero: true, ticks: {callback: v => v + '%'}} : {type: 'logarithmic', ticks: {callback: v => [1, 10, 100, 1000, 10000].includes(v) ? v : ''}}}}});
}
function drawTop() {
  const t = T(), fl = topMode(), y = $('#topYear').value, d = ds('trade_commodity'), fys = uniq(d.rows.map(r => r.fy)), py = fys[fys.indexOf(y) - 1];
  const cur = d.rows.filter(r => r.fy === y && r.flow === fl && isNum(r.value)).sort((a, b) => b.value - a.value).slice(0, 15);
  const prev = c => d.rows.find(r => r.fy === py && r.flow === fl && r.commodity === c)?.value;
  $('#topSub').textContent = `Top ${cur.length} ${fl === 'Export' ? 'exports' : 'imports'}, ${y}` + (py ? `; grey bar is ${py}` : '');
  const short = s => String(s).replace('Transport Equip, Vehicle & Other Vehicle', 'Vehicles & transport equip.').replace('Ferrous products obtained by direct reduction', 'Ferrous products (DRI)').replace('Telecommunication Equipments and Parts', 'Telecom equipment');
  mk('cTop', {type: 'bar', data: {labels: cur.map(r => short(r.commodity)), datasets: [bar(y, cur.map(r => bn(r.value)), fl === 'Export' ? t.s[0] : t.s[1], {maxBarThickness: 12}), ...(py ? [bar(py, cur.map(r => bn(prev(r.commodity))), t.neutral, {maxBarThickness: 12})] : [])]},
    options: hbarOpts(' bn', 1, {plugins: {legend: {display: true}, tooltip: {callbacks: {label: c => ` ${c.dataset.label}: Rs ${fmt(c.parsed.x, 1)} bn`}}}})});
}
function drawPartner() {
  const t = T(), d = ds('trade_partner'), rs = d.rows.slice(-3), cols = numCols(d);
  mk('cPartner', {type: 'bar', data: {labels: cols.map(c => c.label), datasets: rs.map((r, i) => bar(r.fy, cols.map(c => bn(r[c.k])), [t.neutral, t.s[2], t.s[0]].slice(-rs.length)[i], {maxBarThickness: 16}))},
    options: {plugins: {tooltip: tip(' bn', 1)}, scales: {x: {grid: {display: false}, ticks: {color: t.ink2, font: {size: 11}}}, y: {beginAtZero: true}}}});
}
function drawBop() {
  const d = ds('bop_summary'), fys = uniq(d.rows.map(r => r.fy)).slice(-3), codes = uniq(d.rows.map(r => r.code));
  const ind = c => c === 'ΔR' ? 0 : (String(c).split('.').length - 1);
  $('#tBop').innerHTML = `<thead><tr><th>Rs billion</th>${fys.map(y => `<th>${esc(y)}</th>`).join('')}</tr></thead><tbody>` + codes.map(c => {
    const any = d.rows.find(r => r.code === c);
    return `<tr><td class="txt" style="padding-left:${10 + ind(c) * 12}px;${ind(c) === 0 ? 'font-weight:600' : ''}">${esc(any.item)}</td>${fys.map(y => { const v = d.rows.find(r => r.fy === y && r.code === c)?.net; return `<td class="num ${v < 0 ? 'neg' : ''}">${fmt(bn(v), 1)}</td>`; }).join('')}</tr>`; }).join('') + '</tbody>';
}
function drawMig() {
  const t = T(), k = migType(), y = $('#migYear').value, d = ds('migrants'), rs = d.rows.filter(r => r.fy === y), tot = sum(rs.map(r => r[k]));
  const top = rs.filter(r => r.country !== 'Other' && isNum(r[k])).sort((a, b) => b[k] - a[k]).slice(0, 12);
  const gcc = sum(rs.filter(r => ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Oman', 'Bahrain', 'Malaysia'].includes(r.country)).map(r => r[k]));
  $('#migRead').innerHTML = `<span>Total <b>${fmt(tot, 0)}</b></span><span>Top <b>${esc(top[0]?.country || '–')}</b> (${fmt(top[0] ? top[0][k] / tot * 100 : null, 1)}%)</span><span>GCC + Malaysia <b>${fmt(gcc / tot * 100, 1)}%</b></span>`;
  mk('cMig', {type: 'bar', data: {labels: top.map(r => r.country), datasets: [bar(y, top.map(r => r[k]), t.s[0], {maxBarThickness: 14})]},
    options: hbarOpts('', 0, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` ${fmt(c.parsed.x, 0)} workers · ${fmt(c.parsed.x / tot * 100, 1)}%`}}}})});
}
function drawTour() {
  const t = T(), d = ds('tourism'), ys = uniq(d.rows.map(r => r.year)), pick = uniq([$('#tourYears').value, ...ys.slice(-2)]);
  const col = y => y === last(ys) ? t.s[0] : y === ys[ys.length - 2] ? t.s[1] : t.neutral;
  mk('cTour', {type: 'line', data: {labels: MON_CAL, datasets: pick.map(y => line(y, MON_CAL.map(m => d.rows.find(r => r.year === y && r.month === m)?.arrivals ?? null), col(y), {pointRadius: 2, borderDash: col(y) === t.neutral ? [5, 4] : []}))},
    options: {plugins: {tooltip: tip('', 0)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: true, ticks: {callback: v => v / 1000 + 'k'}}}}});
}

/* ============================== FISCAL ============================== */
const debtMode = seg('#debtMode', () => drawDebt());
const fk = prefix => { const d = ds('fiscal_key'), c = colBy(d, prefix); return c ? d.rows.map(r => r[c.k]) : []; };
function renderFis() {
  const d = ds('fiscal_key'), fy = periods(d), rev = fk('General Government Revenue'), fb = fk('Fiscal Balance/GDP'), cap = fk('Capital Expenditure'), exp = fk('Expenditure'), intr = fk('Interest Payment'), debt = ds('debt').rows;
  kpis('#kpisFis', [
    {k: `Total revenue, ${last(fy)}`, v: 'Rs ' + fmt(bn(last(rev)), 0) + ' bn', chip: arrow(last(rev), rev[rev.length - 2]) + ' ' + fmt(pct(last(rev), rev[rev.length - 2]), 1) + '%', dir: dirc(last(rev), rev[rev.length - 2])},
    {k: 'Fiscal balance / GDP', v: fmt(last(fb), 2) + '%', chip: fmt(fb[fb.length - 2], 2) + '%', dir: dirc(last(fb), fb[fb.length - 2]), d: ' a year earlier'},
    {k: 'Capital share of spending', v: fmt(last(cap) / last(exp) * 100, 1) + '%', chip: fmt(cap[0] / exp[0] * 100, 1) + '%', d: ' in ' + fy[0]},
    {k: 'Interest / revenue', v: fmt(last(intr) / last(rev) * 100, 1) + '%', chip: 'Rs ' + fmt(bn(last(intr)), 1) + ' bn'},
    {k: `Public debt, ${last(debt).fy}`, v: fmt(last(debt).tot_gdp, 1) + '% GDP', chip: 'external ' + fmt(last(debt).ext_gdp, 1) + '%'},
  ]);
  drawDebt(); drawBal(); drawRev(); drawExp();
}
function drawDebt() {
  const t = T(), m = debtMode(), r = ds('debt').rows.filter(x => +String(x.fy).slice(0, 4) >= 1990);
  $('#debtSub').textContent = m === 'gdp' ? 'Outstanding debt of GoN, % of GDP' : 'Outstanding debt of GoN, Rs billion';
  const g = m === 'gdp' ? [r.map(x => x.dom_gdp), r.map(x => x.ext_gdp)] : [r.map(x => bn(x.domestic)), r.map(x => bn(x.external))];
  mk('cDebt', {type: 'line', data: {labels: r.map(x => x.fy), datasets: [line('Domestic', g[0], t.s[0], {fill: 'origin', backgroundColor: t.s[0] + '55'}), line('External', g[1], t.s[1], {fill: '-1', backgroundColor: t.s[1] + '55'})]},
    options: {plugins: {tooltip: {callbacks: {label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y, 1)}${m === 'gdp' ? '%' : ' bn'}`, footer: c => 'Total: ' + fmt(c.reduce((s, x) => s + x.parsed.y, 0), 1)}}}, scales: {x: xCat(9), y: {stacked: true, beginAtZero: true}}}});
}
function drawBal() {
  const t = T(), fy = periods(ds('fiscal_key'));
  mk('cBal', {type: 'bar', data: {labels: fy, datasets: [bar('Revenue balance', fk('Revenue Balance/GDP'), t.s[2]), bar('Primary balance', fk('Primary Balance/GDP'), t.s[0]), bar('Fiscal balance', fk('Fiscal Balance/GDP'), t.s[1])]},
    options: {plugins: {tooltip: tip('% of GDP', 2)}, scales: {x: {grid: {display: false}}, y: {ticks: {callback: v => v + '%'}}}}});
}
function drawRev() {
  const t = T(), d = ds('revenue'), fys = uniq(d.rows.map(r => r.fy)).slice(-3), src = uniq(d.rows.map(r => r.source)).filter(s => s !== 'Other Receipts');
  mk('cRev', {type: 'bar', data: {labels: src.map(s => s.replace('Value Added Tax', 'VAT').replace('Educational Service Tax', 'Education tax')), datasets: fys.map((y, i) => bar(y, src.map(s => bn(d.rows.find(r => r.fy === y && r.source === s)?.amount)), [t.neutral, t.s[2], t.s[0]].slice(-fys.length)[i], {maxBarThickness: 18}))},
    options: {plugins: {tooltip: tip(' bn', 1)}, scales: {x: {grid: {display: false}, ticks: {color: t.ink2, font: {size: 11.5}}}, y: {beginAtZero: true}}}});
}
function drawExp() {
  const t = T(), fy = periods(ds('fiscal_key')), rec = fk('Recurrent Expenditure'), intr = fk('Interest Payment');
  mk('cExp', {type: 'bar', data: {labels: fy, datasets: [bar('Recurrent (ex-interest)', rec.map((v, i) => bn(v - intr[i])), t.s[0], {stack: 'e', borderRadius: 0}), bar('Interest', intr.map(bn), t.s[1], {stack: 'e', borderRadius: 0}), bar('Capital', fk('Capital Expenditure').map(bn), t.s[2], {stack: 'e'}), bar('Financing', fk('Financing').map(bn), t.neutral, {stack: 'f'})]},
    options: {plugins: {tooltip: tip(' bn', 1)}, scales: {x: {stacked: true, grid: {display: false}}, y: {stacked: true, beginAtZero: true}}}});
}

/* ============================== BANKING ============================== */
const nplMode = seg('#nplMode', () => drawNpl()), scMode = seg('#scMode', () => drawSc());
$('#rateRange').onchange = () => drawRates(); $('#ratioSel').onchange = () => drawRatio();
function renderBank() {
  const bi = ds('bank_indicators'), lp = latestP(bi), m = n => rowsAt(bi, lp).find(r => String(r.indicator).startsWith(n))?.all;
  const r = last(ds('rates_monthly').rows), dep = [smiVal('Total Deposits'), smiVal('Total Deposits', 1)], cr = [smiVal('BFIs Credit'), smiVal('BFIs Credit', 1)];
  kpis('#kpisBank', [
    {k: 'Total deposits', v: 'Rs ' + fmt(dep[0] / 1000, 2) + ' tn', chip: '▲ ' + fmt(pct(dep[0], dep[1]), 1) + '%', dir: 'up', d: ' y-o-y'},
    {k: 'Private-sector credit', v: 'Rs ' + fmt(cr[0] / 1000, 2) + ' tn', chip: arrow(cr[0], cr[1]) + ' ' + fmt(pct(cr[0], cr[1]), 1) + '%', d: ' y-o-y'},
    {k: 'Credit / deposit', v: fmt(m('Total Credit/ Total Deposit'), 1) + '%', chip: 'CD ratio ' + fmt(m('CD Ratio'), 1) + '%', d: ' ' + lp},
    {k: `Avg lending rate, ${r.month} ${r.fy}`, v: fmt(r.lending, 2) + '%', chip: 'deposit ' + fmt(r.deposit, 2) + '%'},
    {k: 'NPL / total loans', v: fmt(m('NPL/ Total Loan'), 2) + '%', chip: 'LLP ' + fmt(m('Total LLP'), 2) + '%', dir: 'dn'},
    {k: 'Capital adequacy', v: fmt(m('Total Capital/RWA'), 2) + '%', chip: 'core ' + fmt(m('Core Capital/RWA'), 2) + '%'},
  ]);
  fillSelect('#ratioSel', numCols(ds('bank_monthly')).map(c => [c.k, c.label]), 'npl');
  drawRates(); drawNpl(); drawSc(); drawRatio(); drawMfi();
}
function drawRates() {
  const t = T(), n = +$('#rateRange').value, r = ds('rates_monthly').rows.slice(-n), cs = numCols(ds('rates_monthly')), cols = [t.s[3], t.s[4], t.s[2], t.s[1], t.s[0], t.s[5], t.s[6]];
  mk('cRates', {type: 'line', data: {labels: r.map(x => x.month + ' ' + x.fy), datasets: cs.map((c, i) => line(c.label, r.map(x => x[c.k]), cols[i % cols.length], {borderWidth: i >= 3 ? 2.5 : 1.75}))},
    options: {plugins: {tooltip: tip('%', 2)}, scales: {x: xCat(6), y: {beginAtZero: true, ticks: {callback: v => v + '%'}}}}});
}
function drawNpl() {
  const t = T(), m = nplMode(), r = ds('npl_quarterly').rows;
  const sets = m === 'agg' ? [line('All BFIs', r.map(x => x.all), t.s[0], {fill: {target: 'origin', above: t.s[0] + '1f'}})] : [line('Class A', r.map(x => x.a), t.s[0]), line('Class B', r.map(x => x.b), t.s[1]), line('Class C', r.map(x => x.c), t.s[2])];
  mk('cNpl', {type: 'line', data: {labels: r.map(x => x.quarter), datasets: sets}, options: {plugins: {legend: {display: m !== 'agg'}, tooltip: tip('%', 2)}, scales: {x: xCat(8), y: {beginAtZero: true, ticks: {callback: v => v + '%'}}}}});
}
function drawSc() {
  const t = T(), m = scMode(), d = ds('sector_credit'), ys = uniq(d.rows.map(r => r.year)), y = last(ys), py = ys[ys.length - 2];
  const short = s => String(s).replace('Metal Productions, Machinary, and Electrical Tools and fitting', 'Metal products & machinery').replace('Transportation Equipment Production and Fitting', 'Transport equipment').replace('Transportation, Communications and Public Services', 'Transport, comms & utilities').replace('Finance, Insurance, and Fixed Assets', 'Finance, insurance & real estate').replace('Wholesaler and Retailers', 'Wholesale & retail').replace('Consumable Loan', 'Consumption loans').replace('Productions', 'Manufacturing');
  const rows = d.rows.filter(r => r.year === y).map(r => { const p = d.rows.find(x => x.year === py && x.sector === r.sector)?.amount; return {n: short(r.sector), v: m === 'lvl' ? bn(r.amount) : pct(r.amount, p)}; }).filter(r => isNum(r.v)).sort((a, b) => b.v - a.v);
  $('#scSub').textContent = m === 'lvl' ? `Outstanding credit, mid-July ${y}, Rs billion` : `Change mid-July ${py} to ${y}, %`;
  mk('cSc', {type: 'bar', data: {labels: rows.map(r => r.n), datasets: [bar('', rows.map(r => r.v), rows.map(r => r.v < 0 ? t.crit : t.s[0]), {maxBarThickness: 16})]}, options: hbarOpts(m === 'lvl' ? ' bn' : '%', 1)});
}
function drawRatio() {
  const t = T(), k = $('#ratioSel').value, d = ds('bank_monthly'), c = d.cols.find(x => x.k === k); if (!c) return;
  mk('cRatio', {type: 'line', data: {labels: d.rows.map(x => x.month + ' ' + x.fy), datasets: [line(c.label, d.rows.map(x => x[k]), t.s[0], {fill: {target: 'origin', above: t.s[0] + '1a'}})]},
    options: {plugins: {legend: {display: false}, tooltip: tip('', 2)}, scales: {x: xCat(6)}}});
}
function drawMfi() {
  const d = ds('bank_indicators'), lp = latestP(d); $('#mfiSub').textContent = `${lp} · Class A commercial banks, B development banks, C finance companies`;
  let html = '<thead><tr><th>Indicator</th><th>Class A</th><th>Class B</th><th>Class C</th><th>All BFIs</th></tr></thead><tbody>', sec = null;
  rowsAt(d, lp).forEach(x => { if (x.section !== sec) { sec = x.section; html += `<tr class="grp"><td colspan="5">${esc(sec)}</td></tr>`; }
    const f = v => !isNum(v) ? '–' : Math.abs(x.all) > 1000 ? fmt(v, 0) : fmt(v, 2);
    html += `<tr><td class="txt">${esc(x.indicator)}</td><td class="num">${f(x.a)}</td><td class="num">${f(x.b)}</td><td class="num">${f(x.c)}</td><td class="num">${f(x.all)}</td></tr>`; });
  $('#tMfi').innerHTML = html + '</tbody>';
}

/* ============================== PAYMENTS ============================== */
const epMeas = seg('#epMeas', () => drawEp()), mixMeas = seg('#mixMeas', () => drawMix());
$('#epSet').onchange = () => drawEp(); $('#mixFy').onchange = () => drawMix();
const EPSETS = {retail: ['wallet', 'qr', 'mobile', 'fps'], cards: ['debit', 'credit', 'prepaid', 'pos', 'ecom'], inter: ['rtgs', 'ips', 'ecc', 'atm']};
const epName = k => (ds('epay_monthly').cols.find(c => c.k === k + '_n')?.label || k).replace(' (count)', '');
const epFy = (k, fy) => sum(ds('epay_monthly').rows.filter(r => r.fy === fy).map(r => r[k]));
function renderPay() {
  const d = ds('epay_monthly'), fys = uniq(d.rows.map(r => r.fy)), counts = fys.map(y => d.rows.filter(r => r.fy === y).length);
  const full = fys.filter((y, i) => counts[i] >= 12), y1 = last(full), y0 = full[full.length - 2];
  const w = [epFy('wallet_n', y1), epFy('wallet_n', y0)], wv = [epFy('wallet_v', y1), epFy('wallet_v', y0)], q = [epFy('qr_n', y1), epFy('qr_n', y0)];
  const acc = last(ds('bank_monthly').rows);
  kpis('#kpisPay', [
    {k: `Wallet transactions, ${y1}`, v: fmt(w[0] / 1e6, 0) + ' mn', chip: arrow(w[0], w[1]) + ' ' + fmt(pct(w[0], w[1]), 1) + '%', dir: dirc(w[0], w[1])},
    {k: `Wallet value, ${y1}`, v: 'Rs ' + fmt(wv[0] / 1000, 0) + ' bn', chip: arrow(wv[0], wv[1]) + ' ' + fmt(pct(wv[0], wv[1]), 1) + '%', dir: dirc(wv[0], wv[1])},
    {k: `QR payments, ${y1}`, v: fmt(q[0] / 1e6, 0) + ' mn', chip: arrow(q[0], q[1]) + ' ' + fmt(pct(q[0], q[1]), 1) + '%', dir: dirc(q[0], q[1])},
    {k: 'Avg wallet ticket', v: 'Rs ' + fmt(wv[0] * 1e6 / w[0], 0), chip: 'was Rs ' + fmt(wv[1] * 1e6 / w[1], 0), d: ' in ' + y0},
    {k: 'Mobile banking users', v: fmt(acc.mobile / 1e6, 1) + ' mn', chip: acc.month + ' ' + acc.fy},
  ]);
  fillSelect('#mixFy', fys.slice().reverse(), y1);
  drawEp(); drawMix(); drawAccess();
}
function drawEp() {
  const t = T(), m = epMeas(), set = EPSETS[$('#epSet').value], d = ds('epay_monthly'), div = m === 'n' ? 1e6 : 1e3;
  $('#epSub').textContent = m === 'n' ? 'Number of transactions per month, million' : 'Value per month, Rs billion';
  mk('cEp', {type: 'line', data: {labels: d.rows.map(r => r.month + ' ' + r.fy), datasets: set.map((k, i) => line(epName(k), d.rows.map(r => isNum(r[k + '_' + m]) ? r[k + '_' + m] / div : null), t.s[i]))},
    options: {plugins: {tooltip: tip(m === 'n' ? ' mn' : ' bn', m === 'n' ? 2 : 1)}, scales: {x: xCat(7), y: {beginAtZero: true}}}});
}
function drawMix() {
  const t = T(), m = mixMeas(), fy = $('#mixFy').value, d = ds('epay_monthly');
  const ks = uniq(d.cols.filter(c => c.k.endsWith('_' + m)).map(c => c.k.slice(0, -2)));
  let r = ks.map(k => ({n: epName(k), v: epFy(k + '_' + m, fy)})); const tot = sum(r.map(x => x.v));
  r = r.map(x => ({...x, s: x.v / tot * 100})).sort((a, b) => b.s - a.s);
  mk('cMix', {type: 'bar', data: {labels: r.map(x => x.n), datasets: [bar('Share', r.map(x => x.s), r.map(x => ['Wallet', 'QR payments'].includes(x.n) ? t.s[1] : t.s[0]), {maxBarThickness: 14})]},
    options: hbarOpts('%', 2, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` ${fmt(c.parsed.x, 2)}% · ${m === 'n' ? fmt(r[c.dataIndex].v / 1e6, 1) + ' mn txns' : 'Rs ' + fmt(r[c.dataIndex].v / 1000, 0) + ' bn'}`}}}})});
}
function drawAccess() {
  const t = T(), rs = ds('bank_monthly').rows, r = rs.filter((x, i) => x.month === 'Jul' || i === rs.length - 1);
  mk('cAccess', {type: 'bar', data: {labels: r.map(x => x.month === 'Jul' ? x.fy : x.month + ' ' + x.fy), datasets: [bar('Deposit accounts', r.map(x => x.dep_acc / 1e6), t.neutral, {maxBarThickness: 16}), bar('Mobile banking customers', r.map(x => x.mobile / 1e6), t.s[0], {maxBarThickness: 16}), bar('Debit cards', r.map(x => x.debit / 1e6), t.s[2], {maxBarThickness: 16})]},
    options: {plugins: {tooltip: tip(' mn', 1)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: true}}}});
}

/* ============================== DATASET LIST (shared) ============================== */
function dsListHTML(prefix, current) {
  const groups = uniq(allDs().map(d => d.group));
  return `<input id="${prefix}Search" type="search" placeholder="Search datasets" aria-label="Search datasets">` + groups.map(g =>
    `<div class="g">${esc(g)}</div>` + allDs().filter(d => d.group === g).map(d =>
      `<button class="ds" data-id="${esc(d.id)}" aria-current="${d.id === current}" data-q="${esc((d.title + ' ' + d.group + ' ' + d.source).toLowerCase())}"><span>${esc(d.title)}</span><span class="n">${d.rows.length}</span></button>`).join('')).join('');
}
function wireDsList(el, prefix, onPick) {
  el.addEventListener('click', e => { const b = e.target.closest('button.ds'); if (b) onPick(b.dataset.id); });
  const s = el.querySelector('#' + prefix + 'Search');
  s.addEventListener('input', () => { const q = s.value.toLowerCase().trim();
    el.querySelectorAll('button.ds').forEach(b => b.hidden = q && !b.dataset.q.includes(q));
    el.querySelectorAll('.g').forEach(g => { let n = g.nextElementSibling, any = false; while (n && n.classList.contains('ds')) { if (!n.hidden) any = true; n = n.nextElementSibling; } g.hidden = !any; }); });
}
function dsMeta(d) {
  return `<div class="meta"><span>Period: <b>${esc(PERIOD_TYPES[d.period]?.label || d.period)}</b></span><span>Rows: <b>${d.rows.length}</b></span><span>Columns: <b>${d.cols.length}</b></span>${periods(d).length ? `<span>Covers: <b>${esc(periods(d)[0])} → ${esc(latestP(d))}</b></span>` : ''}<span>Unit: <b>${esc(d.unit || '–')}</b></span><span>Source: <b>${esc(d.source || '–')}</b></span>${d.custom ? '<span class="pill custom">Your dataset</span>' : ''}</div>${d.note ? `<p class="sub">${esc(d.note)}</p>` : ''}`;
}
function download(name, text, type) {
  const blob = new Blob([text], {type}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csvCell = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const toCSV = d => [d.cols.map(c => csvCell(c.label)).join(','), ...d.rows.map(r => d.cols.map(c => csvCell(r[c.k])).join(','))].join('\n');

/* ============================== ALL DATA (view only) ============================== */
const View = {id: 'smi', sort: null, dir: 1, page: 0, q: '', per: 100};
function renderData() {
  const p = $('#p-data');
  p.innerHTML = `<div class="split"><aside class="dslist" id="dataList">${dsListHTML('data', View.id)}</aside><div class="card" id="dataMain"></div></div>`;
  wireDsList($('#dataList'), 'data', id => { View.id = id; View.sort = null; View.page = 0; View.q = ''; renderData(); });
  drawDataTable();
}
function drawDataTable() {
  const d = ds(View.id); if (!d) { View.id = 'smi'; return renderData(); }
  const m = $('#dataMain');
  let rows = d.rows.slice();
  const pf = View.pf || '';
  if (pf) rows = rows.filter(r => plabel(d, r) === pf);
  if (View.q) { const q = View.q.toLowerCase(); rows = rows.filter(r => d.cols.some(c => String(r[c.k] ?? '').toLowerCase().includes(q))); }
  if (View.sort) { const c = d.cols.find(x => x.k === View.sort); rows.sort((a, b) => { const x = a[View.sort], y = b[View.sort]; if (x == null) return 1; if (y == null) return -1; return (c.t === 'num' ? x - y : String(x).localeCompare(String(y))) * View.dir; }); }
  const pages = Math.max(1, Math.ceil(rows.length / View.per)); View.page = Math.min(View.page, pages - 1);
  const pr = rows.slice(View.page * View.per, (View.page + 1) * View.per);
  const ps = periods(d);
  m.innerHTML = `<div class="chead"><div><h2>${esc(d.title)}</h2></div><div class="ctrls">
      <button class="btn small" id="dlCsv">Download CSV</button><button class="btn small" id="dlJson">Download JSON</button>
      <button class="btn small accent" id="goEntry">Edit in Data entry</button></div></div>
    ${dsMeta(d)}
    <div class="ctrls"><input id="dataQ" type="search" placeholder="Filter rows (any column)" value="${esc(View.q)}" aria-label="Filter rows" style="min-width:240px">
      ${ps.length > 1 && ps.length < 400 ? `<select id="dataP" aria-label="Period"><option value="">All periods</option>${ps.slice().reverse().map(x => `<option ${x === pf ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
      <span class="sub">${rows.length} of ${d.rows.length} rows · click a column heading to sort</span></div>
    <div class="tbl scroll"><table><thead><tr>${d.cols.map(c => `<th class="sortable ${c.t !== 'num' ? 'txt' : ''}" data-k="${esc(c.k)}">${esc(c.label)}${View.sort === c.k ? (View.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${pr.map(r => `<tr>${d.cols.map(c => c.t === 'num' ? `<td class="num ${r[c.k] < 0 ? 'neg' : ''}">${fmtAuto(r[c.k])}</td>` : `<td class="txt"${c.t === 'longtext' ? ` title="${esc(String(r[c.k] ?? '').slice(0, 600))}"` : ''}>${esc(c.t === 'longtext' ? trunc(r[c.k], 90) : r[c.k])}</td>`).join('')}</tr>`).join('') || `<tr><td class="txt" colspan="${d.cols.length}">No rows${d.rows.length ? ' match this filter' : ' yet. Add some in Data entry.'}</td></tr>`}</tbody></table></div>
    ${pages > 1 ? `<div class="pager"><button class="btn small" id="pgPrev" ${View.page ? '' : 'disabled'}>Previous</button><span>Page ${View.page + 1} of ${pages}</span><button class="btn small" id="pgNext" ${View.page < pages - 1 ? '' : 'disabled'}>Next</button></div>` : ''}`;
  m.querySelectorAll('th.sortable').forEach(th => th.onclick = () => { if (View.sort === th.dataset.k) View.dir *= -1; else { View.sort = th.dataset.k; View.dir = 1; } drawDataTable(); });
  const q = $('#dataQ'); q.oninput = () => { View.q = q.value; View.page = 0; clearTimeout(View.t); View.t = setTimeout(() => { drawDataTable(); const n = $('#dataQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  if ($('#dataP')) $('#dataP').onchange = e => { View.pf = e.target.value; View.page = 0; drawDataTable(); };
  if ($('#pgPrev')) { $('#pgPrev').onclick = () => { View.page--; drawDataTable(); }; $('#pgNext').onclick = () => { View.page++; drawDataTable(); }; }
  $('#dlCsv').onclick = () => download(d.id + '.csv', toCSV(d), 'text/csv');
  $('#dlJson').onclick = () => download(d.id + '.json', JSON.stringify(d, null, 1), 'application/json');
  $('#goEntry').onclick = () => { Entry.id = d.id; show('entry'); };
}

/* ============================== DATA ENTRY ============================== */
const Entry = {id: 'nepse_daily', editing: null};
function renderEntry() {
  const p = $('#p-entry');
  p.innerHTML = `<div class="split"><aside class="dslist" id="entryList"><button class="btn accent" id="newDs">+ New dataset</button>${dsListHTML('entry', Entry.id)}</aside><div style="display:grid;gap:18px;min-width:0" id="entryMain"></div></div>`;
  wireDsList($('#entryList'), 'entry', id => { Entry.id = id; Entry.editing = null; renderEntry(); });
  $('#newDs').onclick = () => newDatasetForm();
  drawEntry();
}
const trunc = (v, n) => { const t = String(v ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function fieldHTML(c, val, isKey) {
  const id = 'f_' + c.k, req = isKey ? ' <span class="req" title="Required">*</span>' : '';
  let input;
  if (c.t === 'select') input = `<select id="${id}" name="${esc(c.k)}"><option value=""></option>${(c.opts || []).map(o => `<option ${String(val) === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (c.t === 'longtext') { input = `<textarea id="${id}" name="${esc(c.k)}" rows="6" style="width:100%;font:inherit">${esc(val ?? '')}</textarea>`; return `<div class="f" style="grid-column:1/-1"><label for="${id}">${esc(c.label)}${req}</label>${input}</div>`; }
  else if (c.t === 'date') input = `<input id="${id}" name="${esc(c.k)}" type="date" value="${esc(val ?? '')}">`;
  else if (c.t === 'num') input = `<input id="${id}" name="${esc(c.k)}" type="text" inputmode="decimal" autocomplete="off" value="${isNum(val) ? val : ''}" placeholder="number">`;
  else input = `<input id="${id}" name="${esc(c.k)}" type="text" autocomplete="off" value="${esc(val ?? '')}" ${c.ph ? `placeholder="e.g. ${esc(c.ph)}"` : ''} list="dl_${esc(c.k)}">`;
  return `<div class="f"><label for="${id}">${esc(c.label)}${req}</label>${input}</div>`;
}
function drawEntry() {
  const d = ds(Entry.id); if (!d) { const f = ds('smi') ? 'smi' : Object.keys(Store.db.datasets)[0]; if (!f || f === Entry.id) return; Entry.id = f; return renderEntry(); }
  const m = $('#entryMain'), ed = Entry.editing != null ? d.rows[Entry.editing] : null;
  const init = ed || nextPeriod(d);
  let grp = null, fields = '';
  d.cols.forEach(c => { if (c.group && c.group !== grp) { grp = c.group; fields += `<div class="grouphead">${esc(grp)}</div>`; } fields += fieldHTML(c, init[c.k], d.keys.includes(c.k)); });
  const lists = d.cols.filter(c => c.t === 'text').map(c => `<datalist id="dl_${esc(c.k)}">${uniq(d.rows.map(r => r[c.k]).filter(v => v != null && v !== '')).slice(-200).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`).join('');
  const recent = d.rows.map((r, i) => ({r, i})).slice(-15).reverse();
  const showCols = d.cols.slice(0, 7);
  m.innerHTML = `
  <div class="card">
    <div class="chead"><div><h2>${esc(d.title)}</h2></div><div class="ctrls"><span class="pill ${d.custom ? 'custom' : ''}">${esc(d.group)}</span></div></div>
    ${dsMeta(d)}
  </div>
  <div class="card" id="formCard">
    <div class="chead"><div><h2>${ed ? 'Edit row' : 'Add a new row'}</h2><p class="sub">${ed ? 'Change the values and save. ' : 'The next period is filled in for you. '}Fields marked <span style="color:var(--accent);font-weight:700">*</span> identify the row; saving a row with the same identifiers updates it.</p></div>
    <div class="ctrls">${!ed && d.rows.length ? '<button class="btn small" id="copyLast">Copy values from latest row</button>' : ''}</div></div>
    <form id="rowForm" class="form" autocomplete="off">${fields}</form>${lists}
    <div class="actions"><button class="btn primary" id="saveRow">${ed ? 'Save changes' : 'Add row'}</button><button class="btn" id="clearRow">${ed ? 'Cancel edit' : 'Clear form'}</button><span id="formMsg"></span></div>
  </div>
  <div class="card">
    <div class="chead"><div><h2>Latest rows</h2><p class="sub">Showing the last ${recent.length} of ${d.rows.length}. Use <b>All data</b> to browse everything.</p></div></div>
    <div class="tbl"><table><thead><tr>${showCols.map(c => `<th class="${c.t !== 'num' ? 'txt' : ''}">${esc(c.label)}</th>`).join('')}${d.cols.length > 7 ? '<th>…</th>' : ''}<th>Actions</th></tr></thead><tbody>
    ${recent.map(({r, i}) => `<tr>${showCols.map(c => c.t === 'num' ? `<td class="num">${fmtAuto(r[c.k])}</td>` : `<td class="txt">${esc(c.t === 'longtext' ? trunc(r[c.k], 70) : r[c.k])}</td>`).join('')}${d.cols.length > 7 ? `<td class="sub">+${d.cols.length - 7}</td>` : ''}<td><button class="btn small" data-edit="${i}">Edit</button> <button class="btn small danger" data-del="${i}">Delete</button></td></tr>`).join('') || `<tr><td class="txt" colspan="${showCols.length + 2}">No rows yet. Fill in the form above to add the first one.</td></tr>`}
    </tbody></table></div>
  </div>
  <details class="panel"><summary>Paste many rows at once (CSV or from Excel)</summary><div>
    <p class="sub">Copy a block from Excel (with a header row) or paste CSV. Headers must match column names or keys. Columns: <code>${esc(d.cols.map(c => c.label).join(' | '))}</code></p>
    <div class="actions"><button class="btn small" id="tmplCsv">Download an empty template</button></div>
    <textarea id="bulkText" placeholder="${esc(d.cols.map(c => c.label).join('\t'))}"></textarea>
    <div class="actions"><button class="btn primary" id="bulkGo">Import rows</button><span id="bulkMsg"></span></div>
  </div></details>
  <details class="panel"><summary>Add a new column to this dataset</summary><div>
    <p class="sub">For a new indicator NRB starts publishing, or anything you want to track alongside this data.</p>
    <div class="form"><div class="f"><label for="ncLabel">Column name</label><input id="ncLabel" type="text" placeholder="e.g. Remittance inflow via wallets (Rs mn)"></div>
    <div class="f"><label for="ncType">Type</label><select id="ncType"><option value="num">Number</option><option value="text">Text</option><option value="date">Date</option></select></div></div>
    <div class="actions"><button class="btn" id="ncGo">Add column</button><span id="ncMsg"></span></div>
  </div></details>
  <details class="panel" id="dropPanel" ${Entry.dropOpen ? 'open' : ''}><summary>Drop rows, columns or datasets</summary><div id="dropBody"></div></details>
  <details class="panel"><summary>Backup, restore and reset</summary><div>
    <div class="actions">
      <button class="btn" id="bkAll">Download full backup (JSON)</button>
      <label class="btn" for="bkFile">Restore from a backup…</label><input id="bkFile" type="file" accept=".json,application/json" hidden>
      ${window.SEED_DB.datasets[d.id] ? '<button class="btn danger" id="resetDs">Reset this dataset to NRB original</button>' : ''}
      ${d.custom ? '<button class="btn danger" id="delDs">Delete this dataset</button>' : ''}
      <button class="btn danger" id="resetAll">Reset everything to NRB original</button>
    </div>
    <p class="sub">${Store.mode === 'server' ? 'Every save also keeps a dated copy in <code>data/backups/</code> (last 30).' : 'Browser-only mode: download a backup regularly.'}</p>
    <h3>Recent changes</h3>
    <div class="log">${Store.db.log.slice(0, 40).map(l => `<div><time>${esc(l.t.replace('T', ' ').slice(0, 16))}</time><span>${esc(l.action)} · ${esc(ds(l.ds)?.title || l.ds)}${l.detail ? ' · ' + esc(l.detail) : ''}</span></div>`).join('') || '<div>No changes yet.</div>'}</div>
  </div></details>`;

  $('#saveRow').onclick = e => { e.preventDefault(); saveRow(d); };
  $('#rowForm').onsubmit = e => { e.preventDefault(); saveRow(d); };
  $('#clearRow').onclick = e => { e.preventDefault(); Entry.editing = null; drawEntry(); };
  if ($('#copyLast')) $('#copyLast').onclick = () => { const lr = last(d.rows), np = nextPeriod(d); d.cols.forEach(c => { const el = $('#f_' + c.k); if (!el) return; const v = d.keys.includes(c.k) && np[c.k] != null ? np[c.k] : lr[c.k]; el.value = v ?? ''; }); msg('#formMsg', 'Copied. Change what is different and add the row.', 'ok'); };
  m.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { Entry.editing = +b.dataset.edit; drawEntry(); $('#formCard').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  m.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const r = d.rows[+b.dataset.del];
    if (await confirmBox('Delete this row?', `${esc(d.title)}: <b>${esc(d.keys.map(k => r[k]).join(' · '))}</b>. This cannot be undone except from a backup.`, 'Delete row')) {
      d.rows.splice(+b.dataset.del, 1); logChange('Deleted row', d.id, d.keys.map(k => r[k]).join(' · ')); Entry.editing = null; await persist(); afterDataChange(); drawEntry(); }
  });
  $('#dropPanel').ontoggle = e => { Entry.dropOpen = e.target.open; };
  drawDrop(d);
  $('#bulkGo').onclick = () => bulkImport(d);
  $('#tmplCsv').onclick = () => download(d.id + '-template.csv', d.cols.map(c => csvCell(c.label)).join(',') + '\n', 'text/csv');
  $('#ncGo').onclick = async () => {
    const label = $('#ncLabel').value.trim(); if (!label) return msg('#ncMsg', 'Give the column a name.', 'err');
    if (d.cols.some(c => c.label.toLowerCase() === label.toLowerCase())) return msg('#ncMsg', 'A column with that name already exists.', 'err');
    d.cols.push({k: 'x' + Date.now().toString(36), label, t: $('#ncType').value, custom: true});
    logChange('Added column', d.id, label); await persist(); drawEntry();
  };
  $('#bkAll').onclick = () => download('nepal-macro-monitor-backup-' + new Date().toISOString().slice(0, 10) + '.json', dbJson(Store.db), 'application/json');
  $('#bkFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const db = JSON.parse(await f.text()); if (!db.datasets) throw new Error('This file is not a Nepal Information Hub backup.');
      if (!(await confirmBox('Restore this backup?', `It has ${Object.keys(db.datasets).length} datasets, last updated ${esc(db.updated || 'unknown')}. Your current data will be replaced (a server copy is kept in data/backups).`, 'Restore'))) return;
      Store.db = db; db.log = db.log || []; for (const x of Object.values(db.datasets)) sortRows(x); logChange('Restored backup', 'smi', f.name); await persist(); afterDataChange(); renderEntry();
    } catch (err) { toast('Could not restore: ' + err.message); }
  };
  if ($('#resetDs')) $('#resetDs').onclick = async () => { if (await confirmBox('Reset this dataset?', `All rows and columns you added to <b>${esc(d.title)}</b> will be replaced with the original NRB figures.`, 'Reset dataset')) {
    Store.db.datasets[d.id] = clone(window.SEED_DB.datasets[d.id]); logChange('Reset dataset', d.id); await persist(); afterDataChange(); renderEntry(); } };
  if ($('#delDs')) $('#delDs').onclick = async () => { if (await confirmBox('Delete this dataset?', `<b>${esc(d.title)}</b> and its ${d.rows.length} rows will be removed.`, 'Delete dataset')) {
    delete Store.db.datasets[d.id]; logChange('Deleted dataset', d.id, d.title); Entry.id = 'nepse_daily'; await persist(); renderEntry(); } };
  $('#resetAll').onclick = async () => { if (await confirmBox('Reset everything?', 'Every dataset goes back to the original NRB figures. Datasets you created and rows you added will be removed. Download a backup first if you may need them.', 'Reset everything')) {
    const log = Store.db.log; Store.db = clone(window.SEED_DB); Store.db.log = log; logChange('Reset everything', 'smi'); await persist(); afterDataChange(); renderEntry(); } };
}
/* ---------- Data entry › drop rows, columns or datasets ---------- */
const Drop = {mode: 'rows', rule: 'period', col: '', op: 'eq', val: '', from: '', to: '', sel: new Set()};
function dropMatches(d) {
  const ps = periods(d), pi = r => ps.indexOf(plabel(d, r)), c = d.cols.find(x => x.k === Drop.col) || d.cols[0], idx = [];
  d.rows.forEach((r, i) => { let ok = false;
    if (Drop.rule === 'period') { const a = Drop.from ? ps.indexOf(Drop.from) : 0, b = Drop.to ? ps.indexOf(Drop.to) : ps.length - 1, k = pi(r); ok = k >= Math.min(a, b) && k <= Math.max(a, b); }
    else if (Drop.rule === 'blank') ok = d.cols.filter(x => !d.keys.includes(x.k)).some(x => r[x.k] == null || r[x.k] === '');
    else if (Drop.rule === 'allblank') ok = d.cols.filter(x => !d.keys.includes(x.k) && x.t === 'num').every(x => !isNum(r[x.k]));
    else if (Drop.rule === 'value') { const v = r[c.k], t = Drop.val.trim();
      if (Drop.op === 'blank') ok = v == null || v === '';
      else if (c.t === 'num') { const x = parseNum(t); ok = isNum(v) && isNum(x) && ({eq: v === x, ne: v !== x, gt: v > x, lt: v < x, ge: v >= x, le: v <= x})[Drop.op]; }
      else { const a = String(v ?? '').toLowerCase(), b = t.toLowerCase(); ok = ({eq: a === b, ne: a !== b, has: a.includes(b), gt: a > b, lt: a < b, ge: a >= b, le: a <= b})[Drop.op]; } }
    if (ok) idx.push(i); });
  if (Drop.rule === 'dup') { const seen = new Map(); d.rows.forEach((r, i) => { const k = JSON.stringify(d.cols.map(x => r[x.k] ?? null)); if (seen.has(k)) idx.push(i); else seen.set(k, i); }); }
  return idx;
}
function drawDrop(d) {
  const b = $('#dropBody'); if (!b) return; const ps = periods(d);
  const nonKey = d.cols.filter(c => !d.keys.includes(c.k)), all = allDs().slice().sort((x, y) => (x.group || '').localeCompare(y.group || '') || x.title.localeCompare(y.title));
  if (!d.cols.some(c => c.k === Drop.col)) Drop.col = nonKey[0]?.k || d.cols[0].k;
  const col = d.cols.find(c => c.k === Drop.col), ops = Drop.op === 'blank' || col.t === 'num' ? [['eq', '='], ['ne', '≠'], ['gt', '>'], ['lt', '<'], ['ge', '≥'], ['le', '≤'], ['blank', 'is blank']] : [['eq', 'equals'], ['ne', 'not equal'], ['has', 'contains'], ['gt', 'after (A–Z)'], ['lt', 'before (A–Z)'], ['blank', 'is blank']];
  let body = '';
  if (Drop.mode === 'rows') {
    const m = dropMatches(d), show = m.slice(-300).reverse(), shCols = d.cols.slice(0, 6);
    Drop.sel = new Set([...Drop.sel].filter(i => m.includes(i)));
    body = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <div class="f"><label for="drRule">Select rows by</label><select id="drRule">${[['period', 'Period range'], ['value', 'Column condition'], ['blank', 'Any blank value'], ['allblank', 'All numbers blank'], ['dup', 'Exact duplicates (keeps first)']].map(([k, l]) => `<option value="${k}" ${Drop.rule === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${Drop.rule === 'period' ? `<div class="f"><label for="drFrom">From</label><select id="drFrom">${ps.map(x => `<option ${x === (Drop.from || ps[0]) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div class="f"><label for="drTo">To</label><select id="drTo">${ps.map(x => `<option ${x === (Drop.to || ps[ps.length - 1]) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : ''}
      ${Drop.rule === 'value' ? `<div class="f"><label for="drCol">Column</label><select id="drCol">${d.cols.map(c => `<option value="${esc(c.k)}" ${c.k === Drop.col ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div><div class="f"><label for="drOp">Condition</label><select id="drOp">${ops.map(([k, l]) => `<option value="${k}" ${Drop.op === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${Drop.op === 'blank' ? '' : `<div class="f"><label for="drVal">Value</label><input id="drVal" value="${esc(Drop.val)}"></div>`}` : ''}</div>
      <p class="sub">${m.length} of ${d.rows.length} rows match${m.length > 300 ? ' (the latest 300 are listed)' : ''}. Tick rows to drop only those, or drop every match.</p>
      ${m.length ? `<div class="tbl scroll" style="max-height:320px"><table><thead><tr><th><input type="checkbox" id="drAll" aria-label="Select all listed"></th>${shCols.map(c => `<th class="${c.t !== 'num' ? 'txt' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${show.map(i => { const r = d.rows[i]; return `<tr><td><input type="checkbox" data-dr="${i}" ${Drop.sel.has(i) ? 'checked' : ''}></td>${shCols.map(c => c.t === 'num' ? `<td class="num">${fmtAuto(r[c.k])}</td>` : `<td class="txt">${esc(trunc(r[c.k], 40))}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>` : ''}
      <div class="actions"><button class="btn danger" id="drSel" ${Drop.sel.size ? '' : 'disabled'}>Drop ${Drop.sel.size} ticked row${Drop.sel.size === 1 ? '' : 's'}</button><button class="btn danger" id="drMatch" ${m.length ? '' : 'disabled'}>Drop all ${m.length} matching rows</button><span id="drMsg"></span></div>`;
  } else if (Drop.mode === 'cols') {
    body = `<p class="sub">Identifier columns (${esc(d.cols.filter(c => d.keys.includes(c.k)).map(c => c.label).join(', '))}) cannot be dropped — they define each row.</p>
      <div class="dropchk">${nonKey.map(c => { const filled = d.rows.filter(r => r[c.k] != null && r[c.k] !== '').length; return `<label><input type="checkbox" data-dc="${esc(c.k)}"> ${esc(c.label)} <span class="sub">· ${c.t} · ${filled}/${d.rows.length} filled${c.custom ? ' · added by you' : ''}</span></label>`; }).join('') || '<span class="sub">No droppable columns.</span>'}</div>
      <div class="actions"><button class="btn small" id="dcEmpty">Tick empty columns</button><button class="btn danger" id="dcGo">Drop ticked columns</button><span id="drMsg"></span></div>`;
  } else {
    const missing = Object.keys(window.SEED_DB.datasets).filter(id => !Store.db.datasets[id]);
    body = `<p class="sub">Dropping an NRB dataset removes it from every chart and page that uses it (those panels show “no data”). It can be brought back with <b>Restore dropped NRB datasets</b>; datasets you created or imported can only come back from a backup.</p>
      <div class="dropchk">${uniq(all.map(x => x.group || 'Other')).map(g => `<div class="grouphead">${esc(g)}</div>${all.filter(x => (x.group || 'Other') === g).map(x => `<label><input type="checkbox" data-dd="${esc(x.id)}"> ${esc(x.title)} <span class="sub">· ${x.rows.length} rows${x.custom ? ' · yours' : ''}</span></label>`).join('')}`).join('')}</div>
      <div class="actions"><button class="btn danger" id="ddGo">Drop ticked datasets</button>${missing.length ? `<button class="btn" id="ddRestore">Restore dropped NRB datasets (${missing.length})</button>` : ''}<span id="drMsg"></span></div>`;
  }
  b.innerHTML = `<p class="sub">Remove data you no longer need. Every drop asks for confirmation and is written to <i>Recent changes</i>; download a backup first if you may want it back.</p>
    <div class="subnav" id="drMode">${[['rows', 'Drop rows'], ['cols', 'Drop columns'], ['ds', 'Drop datasets']].map(([k, l]) => `<button data-m="${k}" aria-selected="${Drop.mode === k}">${l}</button>`).join('')}</div><div style="margin-top:10px">${body}</div>`;
  const redraw = () => drawDrop(d), done = async (what, id, detail) => { logChange(what, id, detail); Drop.sel.clear(); await persist(); afterDataChange(); drawEntry(); };
  $('#drMode').onclick = e => { const x = e.target.closest('button'); if (!x) return; Drop.mode = x.dataset.m; redraw(); };
  if (Drop.mode === 'rows') {
    $('#drRule').onchange = e => { Drop.rule = e.target.value; Drop.sel.clear(); redraw(); };
    if ($('#drFrom')) { $('#drFrom').onchange = e => { Drop.from = e.target.value; redraw(); }; $('#drTo').onchange = e => { Drop.to = e.target.value; redraw(); }; }
    if ($('#drCol')) { $('#drCol').onchange = e => { Drop.col = e.target.value; redraw(); }; $('#drOp').onchange = e => { Drop.op = e.target.value; redraw(); }; }
    if ($('#drVal')) $('#drVal').onchange = e => { Drop.val = e.target.value; redraw(); };
    b.querySelectorAll('[data-dr]').forEach(cb => cb.onchange = () => { cb.checked ? Drop.sel.add(+cb.dataset.dr) : Drop.sel.delete(+cb.dataset.dr); const n = Drop.sel.size; $('#drSel').disabled = !n; $('#drSel').textContent = `Drop ${n} ticked row${n === 1 ? '' : 's'}`; });
    if ($('#drAll')) $('#drAll').onchange = e => { b.querySelectorAll('[data-dr]').forEach(cb => { cb.checked = e.target.checked; cb.onchange(); }); };
    const drop = async idx => { if (!idx.length) return; if (!(await confirmBox(`Drop ${idx.length} row${idx.length === 1 ? '' : 's'}?`, `From <b>${esc(d.title)}</b>. This cannot be undone except from a backup.`, 'Drop rows'))) return;
      const del = new Set(idx); d.rows = d.rows.filter((_, i) => !del.has(i)); Entry.editing = null; await done('Dropped rows', d.id, `${idx.length} rows`); };
    $('#drSel').onclick = () => drop([...Drop.sel]); $('#drMatch').onclick = () => drop(dropMatches(d));
  } else if (Drop.mode === 'cols') {
    $('#dcEmpty').onclick = () => b.querySelectorAll('[data-dc]').forEach(cb => { cb.checked = !d.rows.some(r => r[cb.dataset.dc] != null && r[cb.dataset.dc] !== ''); });
    $('#dcGo').onclick = async () => { const ks = [...b.querySelectorAll('[data-dc]:checked')].map(x => x.dataset.dc); if (!ks.length) return msg('#drMsg', 'Tick at least one column.', 'err');
      const labels = ks.map(k => d.cols.find(c => c.k === k).label); if (!(await confirmBox(`Drop ${ks.length} column${ks.length === 1 ? '' : 's'}?`, `From <b>${esc(d.title)}</b>: ${labels.map(esc).join(', ')}. The values in every row are removed too.`, 'Drop columns'))) return;
      d.cols = d.cols.filter(c => !ks.includes(c.k)); d.rows.forEach(r => ks.forEach(k => delete r[k])); await done('Dropped columns', d.id, labels.join(', ')); };
  } else {
    $('#ddGo').onclick = async () => { const ids = [...b.querySelectorAll('[data-dd]:checked')].map(x => x.dataset.dd); if (!ids.length) return msg('#drMsg', 'Tick at least one dataset.', 'err');
      if (ids.length >= allDs().length) return msg('#drMsg', 'At least one dataset must remain.', 'err');
      if (!(await confirmBox(`Drop ${ids.length} dataset${ids.length === 1 ? '' : 's'}?`, ids.map(id => `<b>${esc(ds(id).title)}</b> (${ds(id).rows.length} rows)`).join('<br>'), 'Drop datasets'))) return;
      const titles = ids.map(id => ds(id).title); ids.forEach(id => delete Store.db.datasets[id]); if (!ds(Entry.id)) Entry.id = ds('nepse_daily') ? 'nepse_daily' : Object.keys(Store.db.datasets)[0];
      logChange('Dropped datasets', Entry.id, titles.join(', ')); Drop.sel.clear(); await persist(); afterDataChange(); renderEntry(); };
    if ($('#ddRestore')) $('#ddRestore').onclick = async () => { const miss = Object.keys(window.SEED_DB.datasets).filter(id => !Store.db.datasets[id]); miss.forEach(id => Store.db.datasets[id] = clone(window.SEED_DB.datasets[id])); logChange('Restored NRB datasets', miss[0], miss.length + ' datasets'); await persist(); afterDataChange(); renderEntry(); };
  }
}
function readForm(d) {
  const row = {}, errs = [];
  d.cols.forEach(c => { const el = $('#f_' + c.k); if (!el) return; const raw = el.value.trim();
    if (c.t === 'num') { const v = parseNum(raw); if (Number.isNaN(v)) errs.push(`${c.label}: "${raw}" is not a number`); row[c.k] = Number.isNaN(v) ? null : v; }
    else row[c.k] = raw === '' ? null : raw; });
  d.keys.forEach(k => { if (row[k] == null || row[k] === '') errs.push(`${d.cols.find(c => c.k === k)?.label || k} is required`); });
  if (d.period === 'fy' || d.period === 'fy-cat' || d.period === 'fy-month' || d.period === 'fy-month2') if (row.fy && !/^\d{4}\/\d{2}$/.test(row.fy)) errs.push('Fiscal year must look like 2026/27');
  if ((d.period === 'year' || d.period === 'year-cat' || d.period === 'year-month') && row.year && !/^\d{4}$/.test(row.year)) errs.push('Year must be four digits, like 2027');
  return {row, errs};
}
const sameKey = (d, a, b) => d.keys.every(k => String(a[k] ?? '') === String(b[k] ?? ''));
async function saveRow(d) {
  const {row, errs} = readForm(d);
  if (errs.length) return msg('#formMsg', errs.join('. ') + '.', 'err');
  const ed = Entry.editing;
  const dup = d.rows.findIndex((r, i) => i !== ed && sameKey(d, r, row));
  if (dup >= 0) {
    if (!(await confirmBox('Replace existing row?', `A row for <b>${esc(d.keys.map(k => row[k]).join(' · '))}</b> already exists. Replace its values with the ones you entered?`, 'Replace'))) return;
    d.rows[dup] = Object.assign({}, d.rows[dup], row); if (ed != null) d.rows.splice(ed, 1);
    logChange('Updated row', d.id, d.keys.map(k => row[k]).join(' · '));
  } else if (ed != null) { d.rows[ed] = Object.assign({}, d.rows[ed], row); logChange('Edited row', d.id, d.keys.map(k => row[k]).join(' · ')); }
  else { d.rows.push(row); logChange('Added row', d.id, d.keys.map(k => row[k]).join(' · ')); }
  sortRows(d); Entry.editing = null; await persist(true);
  toast((ed != null || dup >= 0 ? 'Updated ' : 'Added ') + d.keys.map(k => row[k]).join(' · ') + (Store.mode === 'server' ? ' · saved to data/db.json' : ' · saved in this browser'));
  afterDataChange(); drawEntry();
}
function parseTable(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = l => { if (sep === '\t') return l.split('\t'); const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  return lines.map(split);
}
async function bulkImport(d) {
  const t = parseTable($('#bulkText').value); if (t.length < 2) return msg('#bulkMsg', 'Paste a header row and at least one data row.', 'err');
  const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const map = t[0].map(h => d.cols.find(c => norm(c.label) === norm(h) || norm(c.k) === norm(h)));
  const miss = d.keys.filter(k => !map.some(c => c && c.k === k));
  if (miss.length) return msg('#bulkMsg', 'Missing required columns: ' + miss.map(k => d.cols.find(c => c.k === k).label).join(', '), 'err');
  let added = 0, updated = 0, bad = [];
  t.slice(1).forEach((cells, n) => {
    const row = {}; map.forEach((c, j) => { if (!c) return; const raw = (cells[j] ?? '').trim(); if (c.t === 'num') { const v = parseNum(raw); if (Number.isNaN(v)) bad.push(`row ${n + 2} ${c.label}`); row[c.k] = Number.isNaN(v) ? null : v; } else row[c.k] = raw || null; });
    if (d.keys.some(k => row[k] == null)) { bad.push(`row ${n + 2} missing identifiers`); return; }
    const i = d.rows.findIndex(r => sameKey(d, r, row));
    if (i >= 0) { d.rows[i] = Object.assign({}, d.rows[i], row); updated++; } else { d.rows.push(row); added++; }
  });
  sortRows(d); logChange('Imported rows', d.id, `${added} added, ${updated} updated`); await persist(true);
  afterDataChange(); drawEntry();
  toast(`Imported: ${added} added, ${updated} updated` + (bad.length ? `. Check: ${bad.slice(0, 4).join('; ')}` : ''));
}
function newDatasetForm() {
  const groups = uniq(allDs().map(d => d.group));
  $('#entryMain').innerHTML = `<div class="card"><h2>New dataset</h2><p class="sub">Create a table for anything NRB or others publish that is not here yet. It will appear in All data, Data entry and Compare.</p>
  <div class="form">
    <div class="f"><label for="ndTitle">Name <span class="req">*</span></label><input id="ndTitle" type="text" placeholder="e.g. Khalti monthly wallet load"></div>
    <div class="f"><label for="ndGroup">Group</label><input id="ndGroup" type="text" list="ndGroups" value="My data"><datalist id="ndGroups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
    <div class="f"><label for="ndPeriod">Rows are identified by</label><select id="ndPeriod">
      <option value="fy">Fiscal year (2026/27)</option><option value="fy-month">Fiscal year + month</option><option value="year">Calendar year</option><option value="year-month">Calendar year + month</option>
      <option value="date">Date</option><option value="fy-cat">Fiscal year + a category</option><option value="date-cat">Date + a category</option><option value="snapshot">Period label + a category</option></select></div>
    <div class="f"><label for="ndCat">Category column name (if you chose a category)</label><input id="ndCat" type="text" placeholder="e.g. Province"></div>
    <div class="f"><label for="ndUnit">Unit</label><input id="ndUnit" type="text" placeholder="e.g. Rs million"></div>
    <div class="f"><label for="ndSource">Source</label><input id="ndSource" type="text" placeholder="e.g. NRB press release"></div>
  </div>
  <div class="f" style="display:grid;gap:4px"><label for="ndCols" class="sub">Value columns, one per line. Add <code>| text</code> for text columns; numbers are the default.</label>
  <textarea id="ndCols">Transactions (count)\nValue (Rs mn)\nRemarks | text</textarea></div>
  <div class="actions"><button class="btn primary" id="ndGo">Create dataset</button><button class="btn" id="ndCancel">Cancel</button><span id="ndMsg"></span></div></div>`;
  $('#ndCancel').onclick = () => drawEntry();
  $('#ndGo').onclick = async () => {
    const title = $('#ndTitle').value.trim(), per = $('#ndPeriod').value, catName = $('#ndCat').value.trim();
    if (!title) return msg('#ndMsg', 'Give the dataset a name.', 'err');
    const needCat = ['fy-cat', 'date-cat', 'snapshot'].includes(per); if (needCat && !catName) return msg('#ndMsg', 'Name the category column.', 'err');
    const cols = [];
    if (per.startsWith('fy')) cols.push({k: 'fy', label: 'Fiscal year', t: 'text', key: true, ph: '2026/27'});
    if (per === 'fy-month') cols.push({k: 'month', label: 'Month', t: 'select', key: true, opts: MON_AUG});
    if (per.startsWith('year')) cols.push({k: 'year', label: 'Year', t: 'text', key: true, ph: '2027'});
    if (per === 'year-month') cols.push({k: 'month', label: 'Month', t: 'select', key: true, opts: MON_CAL});
    if (per.startsWith('date')) cols.push({k: 'date', label: 'Date', t: 'date', key: true});
    if (per === 'snapshot') cols.push({k: 'period', label: 'Period', t: 'text', key: true, ph: 'Shrawan 2083'});
    if (needCat) cols.push({k: 'cat', label: catName, t: 'text', key: true});
    $('#ndCols').value.split('\n').map(s => s.trim()).filter(Boolean).forEach((s, i) => { const [l, ty] = s.split('|').map(x => x.trim()); cols.push({k: 'v' + i, label: l, t: ty === 'text' ? 'text' : ty === 'date' ? 'date' : 'num'}); });
    if (!cols.some(c => !c.key)) return msg('#ndMsg', 'Add at least one value column.', 'err');
    const id = 'my_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) + '_' + Date.now().toString(36).slice(-4);
    Store.db.datasets[id] = {id, title, group: $('#ndGroup').value.trim() || 'My data', period: per, cols, rows: [], keys: cols.filter(c => c.key).map(c => c.k), source: $('#ndSource').value.trim(), unit: $('#ndUnit').value.trim(), note: '', custom: true, cat: needCat ? 'cat' : undefined};
    logChange('Created dataset', id, title); await persist(); Entry.id = id; renderEntry();
  };
}
function afterDataChange() { for (const k of Object.keys(rendered)) rendered[k] = false; try { if (typeof newsRefresh === 'function') newsRefresh(); } catch (e) { console.error(e); } }

/* ============================== COMPARE ============================== */
const Cmp = {mode: 'time', freq: 'fy', tr: 'actual', type: 'line',
  series: [{ds: 'bop_annual', cat: '', col: 'remit_gdp'}, {ds: 'trade_annual', cat: '', col: 'imp_gdp'}, {ds: 'debt', cat: '', col: 'tot_gdp'}],
  pp: {ds: 'smi', a: '', b: '', col: '', sort: 'orig'}};
const freqOf = d => PERIOD_TYPES[d.period]?.freq;
function catOptions(d) { if (!catKeys(d).length) return []; return uniq(d.rows.map(r => catLabel(d, r))); }
function renderCmp() {
  const p = $('#p-cmp');
  p.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Compare</h2><p class="sub">Put any series side by side over time, or compare two periods of one dataset item by item.</p></div>
    <div class="seg" id="cmpMode"><button data-v="time" aria-pressed="${Cmp.mode === 'time'}">Series over time</button><button data-v="pp" aria-pressed="${Cmp.mode === 'pp'}">Period vs period</button></div></div>
    <div id="cmpBody" style="display:grid;gap:14px"></div></div>`;
  seg('#cmpMode', v => { Cmp.mode = v; drawCmp(); });
  drawCmp();
}
function drawCmp() { Cmp.mode === 'time' ? drawCmpTime() : drawCmpPP(); }
function drawCmpTime() {
  const b = $('#cmpBody'), t = T(), colors = t.s;
  const dsOpts = allDs().filter(d => freqOf(d) === Cmp.freq && d.rows.length);
  Cmp.series = Cmp.series.filter(s => ds(s.ds) && freqOf(ds(s.ds)) === Cmp.freq);
  const rowHTML = (s, i) => { const d = ds(s.ds), cats = catOptions(d);
    return `<div class="series-row" data-i="${i}"><span class="sw" style="background:${colors[i]}"></span>
      <select data-f="ds" aria-label="Dataset ${i + 1}">${dsOpts.map(x => `<option value="${esc(x.id)}" ${x.id === s.ds ? 'selected' : ''}>${esc(x.group)} · ${esc(x.title)}</option>`).join('')}</select>
      ${cats.length ? `<select data-f="cat" aria-label="Category ${i + 1}">${cats.map(c => `<option ${c === s.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : '<span class="sub">–</span>'}
      <select data-f="col" aria-label="Measure ${i + 1}">${numCols(d).map(c => `<option value="${esc(c.k)}" ${c.k === s.col ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      <button class="btn small" data-rm="${i}" title="Remove series" aria-label="Remove series ${i + 1}">×</button></div>`; };
  Cmp.series.forEach(s => { const d = ds(s.ds), cats = catOptions(d); if (cats.length && !cats.includes(s.cat)) s.cat = cats[0]; if (!numCols(d).some(c => c.k === s.col)) s.col = numCols(d)[0]?.k; });
  b.innerHTML = `<div class="ctrls"><label class="sub" for="cmpFreq">Frequency</label><select id="cmpFreq">${FREQS.filter(f => allDs().some(d => freqOf(d) === f[0])).map(f => `<option value="${f[0]}" ${f[0] === Cmp.freq ? 'selected' : ''}>${f[1]}</option>`).join('')}</select>
      <label class="sub" for="cmpTr">Show as</label><select id="cmpTr"><option value="actual">Actual values</option><option value="index">Index, first common period = 100</option><option value="yoy">% change from previous period</option><option value="yoy12">% change from a year earlier</option></select>
      <div class="seg" id="cmpType"><button data-v="line" aria-pressed="${Cmp.type === 'line'}">Line</button><button data-v="bar" aria-pressed="${Cmp.type === 'bar'}">Bars</button></div></div>
    <div style="display:grid;gap:8px" id="cmpSeries">${Cmp.series.map(rowHTML).join('')}</div>
    <div class="actions">${Cmp.series.length < 6 ? '<button class="btn small" id="cmpAdd">+ Add series</button>' : ''}<span class="sub">Up to 6 series of the same frequency. Mixed units? Switch to Index or % change.</span></div>
    <div class="ctrls"><label class="sub" for="cmpFrom">From</label><select id="cmpFrom"></select><label class="sub" for="cmpTo">to</label><select id="cmpTo"></select></div>
    <div class="cv tall"><canvas id="cCmp"></canvas></div>
    <div class="readout" id="cmpNote"></div>
    <div class="grid2"><div><h3>Summary</h3><div class="tbl"><table id="cmpStats"></table></div></div><div><h3>Correlation (common periods)</h3><div class="tbl"><table id="cmpCorr"></table></div></div></div>
    <div class="chead"><h3>Values</h3><button class="btn small" id="cmpCsv">Download CSV</button></div>
    <div class="tbl scroll"><table id="cmpTable"></table></div>`;
  $('#cmpTr').value = Cmp.tr;
  $('#cmpFreq').onchange = e => { Cmp.freq = e.target.value; const first = allDs().filter(d => freqOf(d) === Cmp.freq && d.rows.length); Cmp.series = first.slice(0, 2).map(d => ({ds: d.id, cat: '', col: numCols(d)[0]?.k}));
    if (Cmp.freq === 'day' && ds('stock_ohlc')?.rows.length) { const sy = uniq(ds('stock_ohlc').rows.map(r => r.symbol)); Cmp.series = ['NEPSE', 'BANKING', 'NABIL'].filter(s => sy.includes(s)).map(s => ({ds: 'stock_ohlc', cat: s, col: 'close'})); Cmp.tr = 'index'; }
    Cmp.from = Cmp.to = null; drawCmpTime(); };
  $('#cmpTr').onchange = e => { Cmp.tr = e.target.value; drawCmpTime(); };
  seg('#cmpType', v => { Cmp.type = v; drawCmpTime(); });
  b.querySelectorAll('.series-row select').forEach(sel => sel.onchange = () => { const i = +sel.closest('.series-row').dataset.i, f = sel.dataset.f; Cmp.series[i][f] = sel.value; if (f === 'ds') { Cmp.series[i].cat = ''; Cmp.series[i].col = ''; } drawCmpTime(); });
  b.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { Cmp.series.splice(+x.dataset.rm, 1); drawCmpTime(); });
  if ($('#cmpAdd')) $('#cmpAdd').onclick = () => { const d = dsOpts[0]; Cmp.series.push({ds: d.id, cat: '', col: numCols(d)[0]?.k}); drawCmpTime(); };
  if (!Cmp.series.length) { emptyChart('cCmp', 'Add a series to start comparing.'); return; }
  // build aligned table
  const maps = Cmp.series.map(s => { const d = ds(s.ds), m = new Map(); d.rows.forEach(r => { if (catKeys(d).length && catLabel(d, r) !== s.cat) return; m.set(alignKey(d, r), r[s.col]); }); return m; });
  let keys = uniq(maps.flatMap(m => [...m.keys()])).sort();
  const labels = keys.map(k => alignLabel(Cmp.freq, k));
  fillSelect('#cmpFrom', keys.map((k, i) => [k, labels[i]]), Cmp.from || keys[Math.max(0, keys.length - (Cmp.freq === 'fym' ? 60 : Cmp.freq === 'day' ? 120 : 30))]);
  fillSelect('#cmpTo', keys.map((k, i) => [k, labels[i]]), Cmp.to || last(keys));
  $('#cmpFrom').onchange = e => { Cmp.from = e.target.value; drawCmpTime(); }; $('#cmpTo').onchange = e => { Cmp.to = e.target.value; drawCmpTime(); };
  const from = $('#cmpFrom').value, to = $('#cmpTo').value;
  keys = keys.filter(k => k >= from && k <= to);
  const raw = maps.map(m => keys.map(k => isNum(m.get(k)) ? m.get(k) : null));
  const common = keys.findIndex((k, i) => raw.every(v => isNum(v[i])));
  const lag = Cmp.freq === 'fym' || Cmp.freq === 'ym' ? 12 : Cmp.freq === 'q' ? 4 : 1;
  const vals = raw.map(v => v.map((x, i) => {
    if (Cmp.tr === 'index') { const base = v[common >= 0 ? common : v.findIndex(isNum)]; return isNum(x) && isNum(base) && base !== 0 ? x / base * 100 : null; }
    if (Cmp.tr === 'yoy') return i > 0 ? pct(x, v[i - 1]) : null;
    if (Cmp.tr === 'yoy12') return i >= lag ? pct(x, v[i - lag]) : null;
    return x; }));
  const name = s => { const d = ds(s.ds), c = d.cols.find(x => x.k === s.col); return (s.cat ? s.cat + ' · ' : '') + (c?.label || s.col); };
  const unit = Cmp.tr === 'actual' ? '' : Cmp.tr === 'index' ? '' : '%';
  clearEmpty('cCmp');
  mk('cCmp', {type: Cmp.type, data: {labels: keys.map(k => alignLabel(Cmp.freq, k)), datasets: Cmp.series.map((s, i) => Cmp.type === 'line' ? line(name(s), vals[i], colors[i], {pointRadius: keys.length < 40 ? 2.5 : 0}) : bar(name(s), vals[i], colors[i], {maxBarThickness: 18}))},
    options: {plugins: {tooltip: tip(unit, 2)}, scales: {x: xCat(10), y: {beginAtZero: Cmp.type === 'bar'}}}});
  const units = uniq(Cmp.series.map(s => ds(s.ds).unit));
  $('#cmpNote').innerHTML = Cmp.tr === 'actual' && Cmp.series.length > 1 ? `<span>Units: <b>${esc(units.join(' / '))}</b>. If the series use different units, "Index" or "% change" makes them comparable on one axis.</span>` : '';
  // stats
  const st = vals.map(v => { const f = v.filter(isNum); const fi = v.findIndex(isNum), li = v.length - 1 - [...v].reverse().findIndex(isNum);
    const n = li - fi; const cagr = Cmp.freq === 'fy' || Cmp.freq === 'year' ? (n > 0 && v[fi] > 0 && v[li] > 0 ? (Math.pow(v[li] / v[fi], 1 / n) - 1) * 100 : null) : null;
    return {first: v[fi], last: v[li], fl: keys[fi], ll: keys[li], min: f.length ? Math.min(...f) : null, max: f.length ? Math.max(...f) : null, avg: avg(f), chg: isNum(v[li]) && isNum(v[fi]) ? v[li] - v[fi] : null, cagr}; });
  $('#cmpStats').innerHTML = `<thead><tr><th>Series</th><th>First</th><th>Latest</th><th>Change</th><th>Average</th><th>Min</th><th>Max</th>${Cmp.freq === 'fy' || Cmp.freq === 'year' ? '<th>CAGR</th>' : ''}</tr></thead><tbody>` +
    st.map((x, i) => `<tr><td class="txt"><span class="bar-inline" style="background:${colors[i]};width:10px;margin:0 6px 0 0"></span>${esc(name(Cmp.series[i]))}</td><td class="num">${fmtAuto(x.first)}<br><span class="sub">${esc(alignLabel(Cmp.freq, x.fl || ''))}</span></td><td class="num">${fmtAuto(x.last)}<br><span class="sub">${esc(alignLabel(Cmp.freq, x.ll || ''))}</span></td><td class="num ${x.chg < 0 ? 'neg' : ''}">${fmtAuto(x.chg)}</td><td class="num">${fmtAuto(x.avg)}</td><td class="num">${fmtAuto(x.min)}</td><td class="num">${fmtAuto(x.max)}</td>${Cmp.freq === 'fy' || Cmp.freq === 'year' ? `<td class="num">${isNum(x.cagr) ? fmt(x.cagr, 1) + '%' : '–'}</td>` : ''}</tr>`).join('') + '</tbody>';
  const corr = (a, b) => { const p = a.map((x, i) => [x, b[i]]).filter(([x, y]) => isNum(x) && isNum(y)); if (p.length < 3) return null; const mx = avg(p.map(q => q[0])), my = avg(p.map(q => q[1])); let sxy = 0, sx = 0, sy = 0; p.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sx += (x - mx) ** 2; sy += (y - my) ** 2; }); return sx && sy ? sxy / Math.sqrt(sx * sy) : null; };
  $('#cmpCorr').innerHTML = Cmp.series.length < 2 ? '<tbody><tr><td class="txt">Add a second series to see correlation.</td></tr></tbody>' :
    `<thead><tr><th></th>${Cmp.series.map((s, i) => `<th>S${i + 1}</th>`).join('')}</tr></thead><tbody>` + Cmp.series.map((s, i) => `<tr><td class="txt">S${i + 1} ${esc(name(s)).slice(0, 38)}</td>${Cmp.series.map((z, j) => { const r = i === j ? 1 : corr(vals[i], vals[j]); return `<td class="num" style="${isNum(r) && i !== j ? `color:${Math.abs(r) > .7 ? 'var(--ink)' : 'var(--ink-3)'};font-weight:${Math.abs(r) > .7 ? 600 : 400}` : ''}">${isNum(r) ? r.toFixed(2) : '–'}</td>`; }).join('')}</tr>`).join('') + '</tbody>';
  $('#cmpTable').innerHTML = `<thead><tr><th>Period</th>${Cmp.series.map((s, i) => `<th>S${i + 1} ${esc(name(s))}</th>`).join('')}</tr></thead><tbody>` + keys.map((k, r) => `<tr><td>${esc(alignLabel(Cmp.freq, k))}</td>${vals.map(v => `<td class="num ${v[r] < 0 ? 'neg' : ''}">${fmtAuto(v[r])}</td>`).join('')}</tr>`).reverse().join('') + '</tbody>';
  $('#cmpCsv').onclick = () => download('comparison.csv', ['Period,' + Cmp.series.map(s => csvCell(name(s))).join(','), ...keys.map((k, r) => csvCell(alignLabel(Cmp.freq, k)) + ',' + vals.map(v => v[r] ?? '').join(','))].join('\n'), 'text/csv');
}
function drawCmpPP() {
  const b = $('#cmpBody'), t = T(), P = Cmp.pp, d = ds(P.ds) || ds('smi'); P.ds = d.id;
  const ps = periods(d); if (!ps.includes(P.b)) P.b = last(ps); if (!ps.includes(P.a) || P.a === P.b) P.a = ps[ps.indexOf(P.b) - 1] || ps[0];
  const cats = catKeys(d).length > 0, nc = numCols(d); if (!nc.some(c => c.k === P.col)) P.col = nc[0]?.k;
  const groups = uniq(allDs().map(x => x.group));
  b.innerHTML = `<div class="ctrls"><label class="sub" for="ppDs">Dataset</label><select id="ppDs">${groups.map(g => `<optgroup label="${esc(g)}">${allDs().filter(x => x.group === g && x.rows.length).map(x => `<option value="${esc(x.id)}" ${x.id === d.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</optgroup>`).join('')}</select>
    <label class="sub" for="ppA">Compare</label><select id="ppA">${ps.slice().reverse().map(x => `<option ${x === P.a ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    <label class="sub" for="ppB">with</label><select id="ppB">${ps.slice().reverse().map(x => `<option ${x === P.b ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    ${cats ? `<label class="sub" for="ppCol">Measure</label><select id="ppCol">${nc.map(c => `<option value="${esc(c.k)}" ${c.k === P.col ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>` : ''}
    <label class="sub" for="ppSort">Order</label><select id="ppSort"><option value="orig">As published</option><option value="abs">Largest change first</option><option value="pct">Largest % change first</option><option value="b">Largest value first</option></select></div>
    <p class="sub">% change for each item (capped at ±300% on the chart; the table shows exact values)</p><div class="cv tall"><canvas id="cPP"></canvas></div>
    <div class="chead"><h3 id="ppTitle"></h3><button class="btn small" id="ppCsv">Download CSV</button></div>
    <div class="tbl scroll"><table id="ppTable"></table></div>`;
  $('#ppSort').value = P.sort;
  $('#ppDs').onchange = e => { P.ds = e.target.value; P.a = P.b = P.col = ''; drawCmpPP(); };
  $('#ppA').onchange = e => { P.a = e.target.value; drawCmpPP(); }; $('#ppB').onchange = e => { P.b = e.target.value; drawCmpPP(); };
  if ($('#ppCol')) $('#ppCol').onchange = e => { P.col = e.target.value; drawCmpPP(); };
  $('#ppSort').onchange = e => { P.sort = e.target.value; drawCmpPP(); };
  let items;
  if (cats) {
    const A = rowsAt(d, P.a), B = rowsAt(d, P.b), names = uniq([...B, ...A].map(r => catLabel(d, r)));
    items = names.map(n => ({n, a: A.find(r => catLabel(d, r) === n)?.[P.col], b: B.find(r => catLabel(d, r) === n)?.[P.col]}));
  } else {
    const A = rowsAt(d, P.a)[0] || {}, B = rowsAt(d, P.b)[0] || {};
    items = nc.map(c => ({n: c.label, a: A[c.k], b: B[c.k]}));
  }
  items = items.map(x => ({...x, d: isNum(x.a) && isNum(x.b) ? x.b - x.a : null, p: pct(x.b, x.a)}));
  if (P.sort === 'abs') items.sort((x, y) => Math.abs(y.d ?? -1) - Math.abs(x.d ?? -1));
  if (P.sort === 'pct') items.sort((x, y) => Math.abs(y.p ?? -1) - Math.abs(x.p ?? -1));
  if (P.sort === 'b') items.sort((x, y) => (y.b ?? -Infinity) - (x.b ?? -Infinity));
  const mp = Math.max(1, ...items.map(x => Math.abs(x.p || 0)).filter(isFinite));
  $('#ppTitle').textContent = `${d.title}: ${P.a} vs ${P.b}` + (cats ? ' · ' + (nc.find(c => c.k === P.col)?.label || '') : '');
  $('#ppTable').innerHTML = `<thead><tr><th class="txt">${cats ? 'Item' : 'Indicator'}</th><th>${esc(P.a)}</th><th>${esc(P.b)}</th><th>Change</th><th>% change</th></tr></thead><tbody>` +
    items.map(x => `<tr><td class="txt">${esc(x.n)}</td><td class="num">${fmtAuto(x.a)}</td><td class="num">${fmtAuto(x.b)}</td><td class="num ${x.d < 0 ? 'neg' : ''}">${isNum(x.d) ? (x.d > 0 ? '+' : '') + fmtAuto(x.d) : '–'}</td><td class="num ${x.p < 0 ? 'neg' : 'pos'}">${isNum(x.p) ? (x.p > 0 ? '+' : '') + fmt(x.p, 1) + '%' : '–'}${isNum(x.p) ? `<span class="bar-inline" style="width:${Math.min(60, Math.abs(x.p) / mp * 60)}px;background:${x.p < 0 ? 'var(--crit)' : 'var(--good)'}"></span>` : ''}</td></tr>`).join('') + '</tbody>';
  const top = items.filter(x => isNum(x.p)).slice(0, 25);
  if (!top.length) emptyChart('cPP', 'No items have values in both periods.');
  else { clearEmpty('cPP'); mk('cPP', {type: 'bar', data: {labels: top.map(x => x.n.length > 40 ? x.n.slice(0, 38) + '…' : x.n), datasets: [bar('% change', top.map(x => Math.max(-300, Math.min(300, x.p))), top.map(x => x.p < 0 ? t.crit : t.good), {maxBarThickness: 14})]},
    options: hbarOpts('%', 1, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => { const x = top[c.dataIndex]; return ` ${fmt(x.p, 1)}% · ${fmtAuto(x.a)} → ${fmtAuto(x.b)}`; }}}}, scales: {x: {ticks: {callback: v => v + '%'}}, y: {grid: {display: false}, ticks: {autoSkip: false, color: t.ink2, font: {size: 11.5}}}}})}); }
  $('#ppCsv').onclick = () => download('period-comparison.csv', ['Item,' + csvCell(P.a) + ',' + csvCell(P.b) + ',Change,% change', ...items.map(x => [csvCell(x.n), x.a ?? '', x.b ?? '', x.d ?? '', x.p ?? ''].join(','))].join('\n'), 'text/csv');
}

/* ============================== STOCK MARKET ============================== */
const Stk = {sym: '', fy: ''};
function renderStock() {
  const p = $('#stockBody') || $('#p-stock'), nd = {rows: nepseDaily()}, sa = ds('stock_annual'), sp = ds('stock_ohlc');
  const a1 = last(sa.rows), a0 = sa.rows[sa.rows.length - 2], l = last(nd.rows), l0 = nd.rows[nd.rows.length - 2];
  const syms = uniq(sp.rows.map(r => r.symbol)); if (!syms.includes(Stk.sym)) Stk.sym = syms[0] || '';
  const sfy = uniq(ds('stock_sector_index').rows.map(r => r.fy)); if (!sfy.includes(Stk.fy)) Stk.fy = last(sfy);
  p.innerHTML = `
  <div class="kpis" id="kpisStk"></div>
  <div class="grid2">
    <div class="card">
      <div class="chead"><div><h2>NEPSE index</h2><p class="sub" id="nepseSub"></p></div>
      <div class="seg" id="nepseMeas"><button data-v="nepse" aria-pressed="true">NEPSE</button><button data-v="sensitive" aria-pressed="false">Sensitive</button><button data-v="float" aria-pressed="false">Float</button><button data-v="turnover" aria-pressed="false">Turnover</button></div></div>
      <div class="cv"><canvas id="cNepse"></canvas></div>
    </div>
    <div class="card admin-only">
      <h2>Add today's market summary</h2>
      <p class="sub">Saved to NEPSE daily market summary. Use the same date again to correct a day.</p>
      <form class="form" id="qNepse" autocomplete="off">
        <div class="f"><label for="qn_date">Date (AD) <span class="req">*</span></label><input id="qn_date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="f"><label for="qn_bs">Date (BS)</label><input id="qn_bs" type="text" placeholder="e.g. 2083-06-11"></div>
        <div class="f"><label for="qn_nepse">NEPSE index <span class="req">*</span></label><input id="qn_nepse" inputmode="decimal" placeholder="e.g. 2610.45"></div>
        <div class="f"><label for="qn_sens">Sensitive index</label><input id="qn_sens" inputmode="decimal"></div>
        <div class="f"><label for="qn_float">Float index</label><input id="qn_float" inputmode="decimal"></div>
        <div class="f"><label for="qn_turn">Turnover (Rs mn)</label><input id="qn_turn" inputmode="decimal"></div>
        <div class="f"><label for="qn_sh">Shares traded</label><input id="qn_sh" inputmode="decimal"></div>
        <div class="f"><label for="qn_tx">Transactions</label><input id="qn_tx" inputmode="decimal"></div>
      </form>
      <div class="actions"><button class="btn primary" id="qnGo">Save day</button><button class="btn small" id="qnMore">More fields and past days</button><span id="qnMsg"></span></div>
    </div>
    <div class="card">
      <div class="chead"><div><h2>Company prices (watchlist)</h2><p class="sub">${syms.length ? 'Closing price of the symbol you pick' : 'Add a few days of prices for any company to chart it'}</p></div>
      ${syms.length ? `<select id="symSel" aria-label="Symbol">${syms.map(s => `<option ${s === Stk.sym ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}</div>
      <div class="cv short"><canvas id="cSym"></canvas></div>
      <form class="form" id="qSym" autocomplete="off">
        <div class="f"><label for="qs_date">Date <span class="req">*</span></label><input id="qs_date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="f"><label for="qs_sym">Symbol <span class="req">*</span></label><input id="qs_sym" type="text" list="symList" placeholder="e.g. NABIL" value="${esc(Stk.sym)}"><datalist id="symList">${syms.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
        <div class="f"><label for="qs_close">Close (LTP) <span class="req">*</span></label><input id="qs_close" inputmode="decimal"></div>
        <div class="f"><label for="qs_vol">Volume</label><input id="qs_vol" inputmode="decimal"></div>
      </form>
      <div class="actions"><button class="btn primary" id="qsGo">Save price</button><span id="qsMsg"></span></div>
      <div class="tbl"><table id="tWatch"></table></div>
    </div>
    <div class="card">
      <div class="chead"><div><h2>Sector indices</h2><p class="sub" id="secIdxSub"></p></div>
      <select id="stkFy" aria-label="Fiscal year">${sfy.slice().reverse().map(y => `<option ${y === Stk.fy ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></div>
      <div class="cv tall"><canvas id="cSecIdx"></canvas></div>
      <p class="src">NRB Table 66 (NEPSE), mid-July to mid-July.</p>
    </div>
    <div class="card">
      <h2>Turnover by sector</h2><p class="sub" id="turnSub"></p>
      <div class="cv tall"><canvas id="cTurn"></canvas></div>
      <p class="src">NRB Table 67.</p>
    </div>
    <div class="card">
      <h2>Market capitalisation by sector</h2><p class="sub" id="mcapSub"></p>
      <div class="cv tall"><canvas id="cMcap"></canvas></div>
      <p class="src">NRB Table 65.</p>
    </div>
    <div class="card wide">
      <h2>Market indicators, mid-July</h2>
      <div class="tbl"><table id="tStkAnnual"></table></div>
      <p class="src">NRB Table 63.${IS_ADMIN ? ' Add a new year under Data entry → Stock market indicators.' : ''}</p>
    </div>
    <div class="card wide">
      <div class="chead"><div><h2>Public issue approvals (SEBON)</h2><p class="sub" id="issSub"></p></div>
      <select id="issType" aria-label="Issue type"><option value="">All types</option>${uniq(ds('stock_issues').rows.map(r => r.type)).map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="tbl scroll" style="max-height:380px"><table id="tIss"></table></div>
    </div>
  </div>`;
  const tn = isNum(l?.turnover) ? l.turnover : null;
  kpis('#kpisStk', [
    l ? {k: `NEPSE, ${l.date}`, v: fmt(l.nepse, 2), chip: l0 ? arrow(l.nepse, l0.nepse) + ' ' + fmt(l.nepse - l0.nepse, 2) + ' (' + fmt(pct(l.nepse, l0.nepse), 2) + '%)' : 'first entry', dir: dirc(l.nepse, l0?.nepse)}
      : {k: `NEPSE, mid-July ${a1.year}`, v: fmt(a1.nepse, 2), chip: arrow(a1.nepse, a0?.nepse) + ' ' + fmt(pct(a1.nepse, a0?.nepse), 1) + '%', dir: dirc(a1.nepse, a0?.nepse), d: ' over the year'},
    l && tn != null ? {k: 'Turnover, latest day', v: 'Rs ' + fmt(tn, 1) + ' mn', chip: l0 && isNum(l0.turnover) ? arrow(tn, l0.turnover) + ' ' + fmt(pct(tn, l0.turnover), 0) + '%' : '', dir: 'nt'}
      : {k: `Turnover, FY to mid-July ${a1.year}`, v: 'Rs ' + fmt(bn(a1.trade_amt), 0) + ' bn', chip: arrow(a1.trade_amt, a0?.trade_amt) + ' ' + fmt(pct(a1.trade_amt, a0?.trade_amt), 1) + '%', dir: 'nt'},
    {k: `Market cap, mid-July ${a1.year}`, v: 'Rs ' + fmt(a1.mcap / 1e6, 2) + ' tn', chip: fmt(a1.mcap_gdp, 1) + '% of GDP'},
    {k: 'Listed companies', v: fmt(a1.listed, 0), chip: '+' + fmt(a1.listed - (a0?.listed || 0), 0), d: ' in a year'},
    {k: 'NEPSE sessions on record', v: fmt(nd.rows.length, 0), chip: nd.rows.length ? 'since ' + nd.rows[0].date : 'add below', d: ''},
  ]);
  const nm = seg('#nepseMeas', () => drawNepse(nm()));
  drawNepse('nepse');
  $('#qnGo').onclick = () => quickSave('nepse_daily', {date: 'qn_date', date_bs: 'qn_bs', nepse: 'qn_nepse', sensitive: 'qn_sens', float: 'qn_float', turnover: 'qn_turn', shares: 'qn_sh', txns: 'qn_tx'}, '#qnMsg', ['date', 'nepse']);
  $('#qnMore').onclick = () => { Entry.id = 'nepse_daily'; Entry.editing = null; show('entry'); };
  $('#qsGo').onclick = () => { quickSave('stock_ohlc', {date: 'qs_date', symbol: 'qs_sym', close: 'qs_close', volume: 'qs_vol'}, '#qsMsg', ['date', 'symbol', 'close'], r => { r.symbol = String(r.symbol).toUpperCase(); Stk.sym = r.symbol; }); };
  if ($('#symSel')) $('#symSel').onchange = e => { Stk.sym = e.target.value; drawSym(); };
  $('#stkFy').onchange = e => { Stk.fy = e.target.value; drawSecIdx(); drawTurn(); };
  $('#issType').onchange = () => drawIss();
  drawSym(); drawSecIdx(); drawTurn(); drawMcap(); drawStkAnnual(); drawIss();
}
async function quickSave(id, map, msgSel, req, tweak) {
  const d = ds(id), row = {}; let err = '';
  for (const [k, el] of Object.entries(map)) { const raw = document.getElementById(el).value.trim(), c = d.cols.find(x => x.k === k);
    if (c.t === 'num') { const v = parseNum(raw); if (Number.isNaN(v)) err = `${c.label} must be a number`; row[k] = Number.isNaN(v) ? null : v; } else row[k] = raw || null; }
  req.forEach(k => { if (row[k] == null) err = err || `${d.cols.find(c => c.k === k).label} is required`; });
  if (err) return msg(msgSel, err, 'err');
  if (tweak) tweak(row);
  const i = d.rows.findIndex(r => sameKey(d, r, row));
  if (i >= 0) d.rows[i] = Object.assign({}, d.rows[i], row); else d.rows.push(row);
  sortRows(d); logChange(i >= 0 ? 'Updated row' : 'Added row', id, d.keys.map(k => row[k]).join(' · ')); await persist(true);
  toast((i >= 0 ? 'Updated ' : 'Saved ') + d.keys.map(k => row[k]).join(' · ')); afterDataChange(); renderStockHub(); rendered.stock = true;
}
function nepseDaily() {   // NEPSE index by day: price history merged with manual daily summaries
  const m = new Map(), o = ds('stock_ohlc'), nd = ds('nepse_daily');
  if (o) o.rows.forEach(r => { if (r.symbol === 'NEPSE' && isNum(r.close)) m.set(r.date, {date: r.date, nepse: r.close, turnover: isNum(r.volume) ? r.volume / 1e6 : null}); });
  if (nd) nd.rows.forEach(r => { const x = m.get(r.date) || {date: r.date}; for (const [k, v] of Object.entries(r)) if (v != null) x[k] = v; m.set(r.date, x); });
  return [...m.values()].sort((a, b) => a.date < b.date ? -1 : 1);
}
function drawNepse(m) {
  const t = T(), nd = nepseDaily().filter(r => isNum(r[m]));
  const lbl = {nepse: 'NEPSE index', sensitive: 'Sensitive index', float: 'Float index', turnover: 'Turnover (Rs mn)'}[m];
  if (nd.length >= 2) {
    $('#nepseSub').textContent = `${lbl}, daily (${nd.length} sessions, ${nd[0].date} to ${last(nd).date})`; clearEmpty('cNepse');
    mk('cNepse', {type: m === 'turnover' ? 'bar' : 'line', data: {labels: nd.map(r => r.date), datasets: [m === 'turnover' ? bar(lbl, nd.map(r => r[m]), t.s[0], {maxBarThickness: 12}) : line(lbl, nd.map(r => r[m]), t.s[0], {pointRadius: nd.length < 40 ? 2.5 : 0, fill: {target: 'origin', above: t.s[0] + '14'}})]},
      options: {plugins: {legend: {display: false}, tooltip: tip('', 2)}, scales: {x: xCat(8), y: {beginAtZero: m === 'turnover'}}}});
  } else {
    const si = ds('stock_sector_index').rows, key = {nepse: 'NEPSE Overall Index', sensitive: 'NEPSE Sensitive Index', float: 'NEPSE Float Index'}[m];
    if (!key) { const a = ds('stock_annual').rows; $('#nepseSub').textContent = 'Annual share trading amount, Rs billion (add daily entries for a daily chart)'; clearEmpty('cNepse');
      mk('cNepse', {type: 'bar', data: {labels: a.map(r => 'FY to Jul ' + r.year), datasets: [bar('Turnover', a.map(r => bn(r.trade_amt)), t.s[0])]}, options: {plugins: {legend: {display: false}, tooltip: tip(' bn', 1)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: true}}}}); return; }
    const rs = si.filter(r => r.sector === key);
    $('#nepseSub').textContent = `${lbl} at mid-July, with the year's high and low. Add daily entries to see a daily chart.`; clearEmpty('cNepse');
    mk('cNepse', {type: 'bar', data: {labels: rs.map(r => r.fy), datasets: [bar('Low', rs.map(r => r.low), t.neutral, {maxBarThickness: 22}), bar('Closing', rs.map(r => r.close), t.s[0], {maxBarThickness: 22}), bar('High', rs.map(r => r.high), t.s[2], {maxBarThickness: 22})]},
      options: {plugins: {tooltip: tip('', 2)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: false}}}});
  }
}
function drawSym() {
  const t = T(), sp = ds('stock_ohlc'), rs = sp.rows.filter(r => r.symbol === Stk.sym && isNum(r.close)).slice(-250);
  if (rs.length < 1) emptyChart('cSym', 'No prices yet. Enter a date, symbol and closing price below.');
  else { clearEmpty('cSym'); mk('cSym', {type: 'line', data: {labels: rs.map(r => r.date), datasets: [line(Stk.sym + ' close', rs.map(r => r.close), t.s[1], {pointRadius: rs.length < 40 ? 3 : 0})]}, options: {plugins: {legend: {display: false}, tooltip: tip(' Rs', 2)}, scales: {x: xCat(6)}}}); }
  const syms = uniq(sp.rows.map(r => r.symbol));
  $('#tWatch').innerHTML = syms.length ? `<thead><tr><th>Symbol</th><th>Latest date</th><th>Close</th><th>Change</th><th>Days</th></tr></thead><tbody>` + syms.map(s => { const r = sp.rows.filter(x => x.symbol === s && isNum(x.close)), a = last(r), b = r[r.length - 2]; const c = pct(a?.close, b?.close);
    return `<tr><td>${esc(s)}</td><td>${esc(a?.date || '')}</td><td class="num">${fmt(a?.close, 2)}</td><td class="num ${c < 0 ? 'neg' : 'pos'}">${isNum(c) ? (c > 0 ? '+' : '') + fmt(c, 2) + '%' : '–'}</td><td class="num">${r.length}</td></tr>`; }).join('') + '</tbody>' : '';
}
function drawSecIdx() {
  const t = T(), d = ds('stock_sector_index'), fys = uniq(d.rows.map(r => r.fy)), y = Stk.fy, py = fys[fys.indexOf(y) - 1];
  const rs = d.rows.filter(r => r.fy === y && !/^NEPSE/.test(r.sector) && isNum(r.close)).map(r => ({n: r.sector, v: pct(r.close, d.rows.find(x => x.fy === py && x.sector === r.sector)?.close)})).filter(r => isNum(r.v)).sort((a, b) => b.v - a.v);
  $('#secIdxSub').textContent = py ? `Change in closing index, mid-July ${py} to ${y}, %` : `Closing index, ${y}`;
  mk('cSecIdx', {type: 'bar', data: {labels: rs.map(r => r.n), datasets: [bar('Change', rs.map(r => r.v), rs.map(r => r.v < 0 ? t.crit : t.good), {maxBarThickness: 16})]}, options: hbarOpts('%', 1)});
}
function drawTurn() {
  const t = T(), d = ds('stock_turnover'), fys = uniq(d.rows.map(r => r.fy)), y = fys.includes(Stk.fy) ? Stk.fy : last(fys), rs = d.rows.filter(r => r.fy === y && isNum(r.value_mn));
  const tot = sum(rs.map(r => r.value_mn)); const s = rs.map(r => ({n: r.sector, v: r.value_mn / tot * 100, a: r.value_mn})).sort((a, b) => b.v - a.v);
  $('#turnSub').textContent = `Share of total turnover, ${y} (Rs ${fmt(tot / 1000, 0)} bn)`;
  mk('cTurn', {type: 'bar', data: {labels: s.map(r => r.n), datasets: [bar('Share', s.map(r => r.v), t.s[0], {maxBarThickness: 14})]}, options: hbarOpts('%', 1, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` ${fmt(c.parsed.x, 1)}% · Rs ${fmt(s[c.dataIndex].a / 1000, 1)} bn`}}}})});
}
function drawMcap() {
  const t = T(), d = ds('stock_listed'), y = latestP(d), rs = rowsAt(d, y).filter(r => !['Total', 'Financial Institutions'].includes(r.sector) && isNum(r.mcap)).sort((a, b) => b.mcap - a.mcap);
  $('#mcapSub').textContent = `Rs billion, mid-July ${y}; hover for number of companies`;
  mk('cMcap', {type: 'bar', data: {labels: rs.map(r => r.sector), datasets: [bar('Market cap', rs.map(r => bn(r.mcap)), t.s[2], {maxBarThickness: 14})]}, options: hbarOpts(' bn', 0, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` Rs ${fmt(c.parsed.x, 0)} bn · ${fmt(rs[c.dataIndex].companies, 0)} companies`}}}})});
}
function drawStkAnnual() {
  const d = ds('stock_annual'), rs = d.rows;
  $('#tStkAnnual').innerHTML = `<thead><tr><th class="txt">Indicator</th>${rs.map(r => `<th>${esc(r.year)}</th>`).join('')}<th>Latest change</th></tr></thead><tbody>` + numCols(d).map(c => { const a = rs[rs.length - 2]?.[c.k], b = last(rs)?.[c.k], p_ = pct(b, a);
    return `<tr><td class="txt">${esc(c.label)}</td>${rs.map(r => `<td class="num">${fmtAuto(r[c.k])}</td>`).join('')}<td class="num ${p_ < 0 ? 'neg' : 'pos'}">${isNum(p_) ? (p_ > 0 ? '+' : '') + fmt(p_, 1) + '%' : '–'}</td></tr>`; }).join('') + '</tbody>';
}
function drawIss() {
  const d = ds('stock_issues'), ty = $('#issType').value, rs = d.rows.filter(r => !ty || r.type === ty);
  $('#issSub').textContent = `${rs.length} approvals, Rs ${fmt(sum(rs.map(r => r.amount)) / 1000, 2)} bn`;
  $('#tIss').innerHTML = `<thead><tr><th class="txt">Company</th><th class="txt">Type</th><th>Amount (Rs mn)</th><th>Approved (BS)</th><th>FY</th></tr></thead><tbody>` + rs.slice().reverse().map(r => `<tr><td class="txt">${esc(r.company)}</td><td class="txt">${esc(r.type)}</td><td class="num">${fmt(r.amount, 2)}</td><td>${esc(r.date_bs || '')}</td><td>${esc(r.fy)}</td></tr>`).join('') + '</tbody>';
}

/* ============================== UI helpers ============================== */
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3200); }
function msg(sel, t, kind) { const el = $(sel); if (el) { el.className = 'msg ' + (kind || ''); el.textContent = t; } }
function confirmBox(title, html, okLabel) {
  return new Promise(res => {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle"><h3 id="mTitle">${esc(title)}</h3><div class="sub">${html}</div><div class="actions"><button class="btn danger" id="mOk">${esc(okLabel)}</button><button class="btn" id="mNo">Cancel</button></div></div></div>`;
    const done = v => { root.innerHTML = ''; res(v); };
    $('#mOk').onclick = () => done(true); $('#mNo').onclick = () => done(false);
    root.querySelector('.modal-bg').onclick = e => { if (e.target.classList.contains('modal-bg')) done(false); };
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', k); done(false); } });
    $('#mNo').focus();
  });
}

/* ============================== tabs ============================== */
const R = {ov: renderOv, real: renderReal, px: renderPx, ext: renderExt, fis: renderFis, bank: renderBank, pay: renderPay, cmp: renderCmp, quant: renderQuant, data: renderData, entry: renderEntry, imp: renderImport, stock: renderStockHub, news: renderNews, sem: renderSem,
  analysis: () => renderAnalysis(), fg: () => renderFG(), study: () => renderResearch(), opt: () => renderOptLab(),
  demo: () => renderDemographics(), blog: () => renderPubs('blog'), articles: () => renderPubs('article'),
  about: () => renderAbout(), aabout: () => renderAboutAdmin(), amarket: () => renderMarketAdmin(), ahome: () => renderAdminHome(), amenu: () => renderMenuEditor(), anotice: () => renderNoticeAdmin(), apubs: () => renderPubsAdmin(), afloor: () => renderFloorAdmin(), alib: () => renderLibrary(), aset: () => renderAdminSettings(), anrb: () => renderNrbIngest(),
  sdata: () => { $('#p-sdata').innerHTML = '<div id="stockBody" style="display:grid;gap:18px"></div>'; renderStockData(); },
  qseries: () => { $('#p-qseries').innerHTML = '<div id="qsSrc"></div>'; qsRenderSources($('#qsSrc')); }};
STK_SUBS.forEach(([k]) => { R['stk-' + k] = () => { StkHub.sub = k; renderStockHub(true); }; });
const LAB = ['analysis', 'study', 'quant', 'opt', 'sem', 'cmp', 'news', 'fg', 'data', 'entry', 'imp'];
const rendered = {};
let cur = 'ov';
const isRoute = k => !!k && (k in R || k.startsWith('page:') || ['macro', 'lab', 'stock', 'pubs'].includes(k));
function show(k, force) {
  k = siteResolve(k);
  if (!(k in R) && !k.startsWith('page:')) k = siteResolve('ov');
  cur = k; highlightNav(k);
  const pane = paneFor(k); ensurePane(pane);
  $$('section.pane').forEach(p => p.hidden = p.id !== pane);
  try { if (k.startsWith('page:')) renderCustomPage(k.slice(5)); else R[k](); } catch (e) { const miss = Object.keys(window.SEED_DB?.datasets || {}).filter(id => !Store.db.datasets[id]); if (miss.length) { console.warn(e); toast(`Part of this page uses a dataset you dropped (${miss.map(id => window.SEED_DB.datasets[id].title).slice(0, 3).join(', ')}${miss.length > 3 ? '…' : ''}). Restore it under Data entry › Drop rows, columns or datasets.`); } else { console.error(e); toast('Something in this section could not be drawn: ' + e.message); } }
  rendered[k] = true;
  try { localStorage.setItem(IS_ADMIN ? 'nih-atab' : 'nmm-tab', k); } catch (e) {}
  if (location.hash.slice(1) !== k) history.replaceState(null, '', location.pathname + location.search + '#' + k);
}
$('#tabs').addEventListener('click', onNavClick);
$('#labNav').addEventListener('click', onNavClick);
window.addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (isRoute(h) && h !== cur) show(h); });
/* theme */
function applyTheme() {
  let m = 'system', a = 'crimson'; try { m = localStorage.getItem('nmm-theme') || m; a = localStorage.getItem('nmm-accent') || a; } catch (e) {}
  const de = document.documentElement; if (m === 'system') de.removeAttribute('data-theme'); else de.setAttribute('data-theme', m);
  if (a === 'crimson') de.removeAttribute('data-accent'); else de.setAttribute('data-accent', a);
  const tm = $('#thMode'), ta = $('#thAccent'); if (tm) tm.value = m; if (ta) ta.value = a;
}
applyTheme();
$('#thMode').onchange = e => { try { localStorage.setItem('nmm-theme', e.target.value); } catch (er) {} applyTheme(); };
$('#thAccent').onchange = e => { try { localStorage.setItem('nmm-accent', e.target.value); } catch (er) {} applyTheme(); };
const NO_REDRAW = ['aabout', 'amarket', 'data', 'entry', 'news', 'sem', 'analysis', 'imp', 'amenu', 'anotice', 'apubs', 'afloor', 'alib', 'aset', 'anrb', 'sdata', 'qseries', 'ahome'];
const redraw = () => { if (!Store.db) return; if (!NO_REDRAW.includes(cur)) { if (cur.startsWith('page:')) renderCustomPage(cur.slice(5)); else R[cur](); } else if (cur === 'analysis' && typeof anRedraw === 'function') anRedraw(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
new MutationObserver(redraw).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'data-accent']});

(async function boot() {
  Chart.defaults.font.family = 'Instrument Sans, system-ui, sans-serif';
  if (IS_ADMIN && location.protocol !== 'file:' && !(await serverAlive())) { Store.mode = 'github'; await ghGate(); }
  await loadDb();
  if (IS_ADMIN) { await adminGate(); if (Store.mode === 'server' && Store.firstRun) await persist(true); }
  await marketLoad(); marketInject();
  buildNav(); applyBrand();
  try { await newsBoot(); } catch (e) { console.error(e); }
  if (IS_ADMIN) autoSyncFolders().then(() => { if (Object.keys(Store.db.imports || {}).length) { afterDataChange(); if (!NO_REDRAW.includes(cur)) show(cur); } });
  const sm = ds('smi'); if (sm) $('#latestFy').innerHTML = `Latest annual data <b>FY ${esc(last(sm.rows)?.fy || '')}</b>`;
  let start = decodeURIComponent(location.hash.slice(1));
  if (!isRoute(start)) { try { start = localStorage.getItem(IS_ADMIN ? 'nih-atab' : 'nmm-tab') || (IS_ADMIN ? 'ahome' : 'ov'); } catch (e) { start = IS_ADMIN ? 'ahome' : 'ov'; } }
  if (typeof chatInit === 'function' && Store.mode !== 'static') chatInit();
  show(start);
})();
