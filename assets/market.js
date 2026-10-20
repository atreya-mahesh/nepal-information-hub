/* Nepal Information Hub — daily share-price store ("Today's price" workbooks).
   The admin drops a workbook with one sheet per trading day (sheet names like 2026_10_02) or a single day's file;
   each day is stored once in data/market.json (server) or this browser's IndexedDB (file mode). On load the days are
   merged into the stock_ohlc dataset, so every chart, technical, quant and research tool sees the full history.
   Users get Stock market › Today's market: breadth, gainers, losers, turnover leaders, 52-week extremes and the
   full price table for any uploaded day. */
'use strict';
const MKT_FIELDS = ['sym', 'o', 'h', 'l', 'c', 'v', 't', 'vw', 'pc', 'tr', 'pct', 'hi52', 'lo52', 'a120', 'a180', 'ltp'];
const MF = Object.fromEntries(MKT_FIELDS.map((f, i) => [f, i]));
const Market = {data: null, version: 0, local: false};

/* ---------- parsing (also runs inside a Web Worker, so it must be self-contained) ---------- */
function mktParseSheets(sheets, fileName) {
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
  const num = v => { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; const x = Number(String(v).replace(/[,\s]/g, '')); return isFinite(x) && String(v).trim() !== '-' ? x : null; };
  const dateOf = s => { const m = /(20\d{2})[_\-. ](\d{1,2})[_\-. ](\d{1,2})/.exec(String(s || '')); if (!m) return null; const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; return isNaN(new Date(d)) ? null : d; };
  const cellDate = v => { if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); } return dateOf(v) || (() => { const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/.exec(String(v || '').trim()); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; })(); };
  const A = {sym: ['symbol', 'scrip', 'stock symbol', 'script', 'company symbol'], o: ['open', 'open price', 'opening price'], h: ['high', 'high price', 'max price'], l: ['low', 'low price', 'min price'], c: ['close', 'close price', 'closing price'], ltp: ['ltp', 'last traded price'],
    vw: ['vwap', 'avg traded price', 'average traded price', 'avg price'], v: ['vol', 'volume', 'total traded quantity', 'traded shares', 'qty', 'total quantity'], pc: ['prev close', 'previous close', 'prev closing price', 'previous closing price', 'prev close price'],
    t: ['turnover', 'turn over', 'total traded value', 'amount', 'turnover rs'], tr: ['trans', 'transactions', 'total trades', 'no of transactions', 'total transactions'], pct: ['diff %', '% change', 'percent change', 'change %', 'diff%', '% diff'],
    hi52: ['52 weeks high', '52 week high', '52w high'], lo52: ['52 weeks low', '52 week low', '52w low'], a120: ['120 days'], a180: ['180 days'], date: ['date', 'business date', 'trade date', 'as of date']};
  const days = {}, notes = [], fileDate = dateOf(fileName);
  for (const sh of sheets) { const aoa = sh.aoa || []; let H = -1, ix = {};
    for (let i = 0; i < Math.min(12, aoa.length); i++) { const h = (aoa[i] || []).map(norm); const f = k => h.findIndex(x => A[k].includes(x)); if (f('sym') >= 0 && (f('c') >= 0 || f('ltp') >= 0)) { H = i; Object.keys(A).forEach(k => { ix[k] = f(k); }); break; } }
    if (H < 0) { notes.push(`${sh.sheet}: no Symbol / Close header — skipped`); continue; }
    const sheetDate = dateOf(sh.sheet) || (sheets.length === 1 ? fileDate : null);
    if (!sheetDate && ix.date < 0) { notes.push(`${sh.sheet}: no trading date in the sheet name, file name or a Date column — skipped`); continue; }
    let n = 0;
    for (const r of aoa.slice(H + 1)) { const sym = String(r[ix.sym] == null ? '' : r[ix.sym]).trim().toUpperCase(); if (!sym || /^(total|grand total)$/i.test(sym)) continue;
      const g = k => ix[k] >= 0 ? num(r[ix[k]]) : null; let c = g('c'); const ltp = g('ltp'); if (!(c > 0)) c = ltp; if (!(c > 0)) continue;
      const d = sheetDate || cellDate(r[ix.date]); if (!d) continue; const pc = g('pc'); let pct = g('pct'); if (pct === null && pc > 0) pct = Math.round((c / pc - 1) * 1e4) / 100;
      const row = MKT_FIELDS.map(f => f === 'sym' ? sym : f === 'c' ? c : f === 'pct' ? pct : f === 'pc' ? pc : f === 'ltp' ? ltp : g(f));
      (days[d] = days[d] || []).push(row); n++; }
    if (!n) notes.push(`${sh.sheet}: header found but no rows with a price`); }
  Object.values(days).forEach(rows => { const seen = new Map(); rows.forEach(r => seen.set(r[0], r)); rows.length = 0; rows.push(...[...seen.values()].sort((a, b) => a[0] < b[0] ? -1 : 1)); });
  return {days, notes};
}
/* read one workbook (in a worker when possible: big multi-day books take a minute and should not freeze the page) */
function mktReadFile(file, onProg) {
  const workerOk = typeof Worker !== 'undefined' && /^https?:/.test(location.protocol);
  if (workerOk) return new Promise(async (res, rej) => {
    const src = `importScripts(${JSON.stringify(new URL('assets/xlsx.full.min.js', location.href).href)});
      const MKT_FIELDS = ${JSON.stringify(MKT_FIELDS)}; ${mktParseSheets.toString()}
      onmessage = e => { try { const {buf, name} = e.data, low = name.toLowerCase(), csv = /\\.(csv|txt|tsv)$/.test(low);
        const names = csv ? null : XLSX.read(buf, {type: 'array', bookSheets: true}).SheetNames, out = {days: {}, notes: []}, step = 120;
        const take = wb => wb.SheetNames.filter(n => wb.Sheets[n]).map(n => ({sheet: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, raw: true, defval: null, blankrows: false})}));
        const merge = r => { Object.assign(out.days, r.days); out.notes.push(...r.notes); };
        if (csv || names.length <= step) { const wb = XLSX.read(buf, {type: 'array', dense: true, cellDates: true}); merge(mktParseSheets(take(wb), name)); postMessage({prog: 1}); }
        else for (let i = 0; i < names.length; i += step) { const wb = XLSX.read(buf, {type: 'array', dense: true, cellDates: true, sheets: names.slice(i, i + step)}); const sh = take(wb).filter(x => names.slice(i, i + step).includes(x.sheet)); merge(mktParseSheets(sh, name)); postMessage({prog: Math.min(1, (i + step) / names.length)}); }
        postMessage({done: out}); } catch (er) { postMessage({error: er.message}); } };`;
    const w = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
    w.onmessage = e => { if (e.data.prog !== undefined && onProg) onProg(e.data.prog); if (e.data.done) { w.terminate(); res(e.data.done); } if (e.data.error) { w.terminate(); rej(new Error(e.data.error)); } };
    w.onerror = e => { w.terminate(); rej(new Error(e.message || 'The file could not be read')); };
    const buf = await file.arrayBuffer(); w.postMessage({buf, name: file.name}, [buf]);
  });
  return file.arrayBuffer().then(async buf => { const sh = await parseFileBuffer(file.name, buf); if (onProg) onProg(1); return mktParseSheets(sh, file.name); });
}

/* ---------- store ---------- */
async function marketLoad() {
  try {
    if (Store.mode === 'server') { const v = await (await fetch('api/market/version', {cache: 'no-store'})).json(); if (v.ok && v.version === Market.version && Market.data) return false;
      const j = await (await fetch('api/market', {cache: 'no-store'})).json(); if (!j.ok) return false; Market.data = j.market; Market.version = j.version || 0; return true; }
    if (Store.mode === 'github') { Market.data = await GH.loadMarket(); Market.version = 1; return true; }
    if (Store.mode === 'static') { const ix = await fetch('data/market/index.json', {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null);
      if (ix && ix.months) { const parts = await Promise.all(ix.months.map(k => fetch(`data/market/${k}.json`, {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null))); const days = {}; parts.forEach(p => p && Object.assign(days, p.days)); Market.data = {v: 1, fields: ix.fields, days}; Market.version = Store.db?.published || 1; return true; } const r = await fetch('data/market.json', {cache: 'no-cache'}); Market.data = r.ok ? await r.json() : null; Market.version = Store.db?.published || 1; return true; }
    const m = await IDB.get('market:store'); Market.data = m || null; Market.local = true; return true;
  } catch (e) { console.warn('market data not loaded', e); return false; }
}
function marketInject() {
  const d = Store.db?.datasets?.stock_ohlc; if (!d) return;
  [['vwap', 'VWAP'], ['prev_close', 'Previous close'], ['trans', 'Transactions']].forEach(([k, l]) => { if (!d.cols.some(c => c.k === k)) d.cols.push({k, label: l, t: 'num'}); });
  d.rows = d.rows.filter(r => !r._m); const days = Market.data?.days || {}; if (!Object.keys(days).length) return;
  const have = new Set(); const add = [];
  for (const [date, rows] of Object.entries(days)) for (const r of rows) { have.add(date + '|' + r[0]); add.push({date, symbol: r[0], open: r[MF.o], high: r[MF.h], low: r[MF.l], close: r[MF.c], pct: r[MF.pct], volume: r[MF.v], turnover: r[MF.t], vwap: r[MF.vw], prev_close: r[MF.pc], trans: r[MF.tr], _m: 1}); }
  d.rows = d.rows.filter(r => !have.has(r.date + '|' + r.symbol)).concat(add); sortRows(d);
}
async function marketSave(days, {replace = true} = {}) {
  if (Store.mode === 'server') { const j = await apiJson('api/market/days', {fields: MKT_FIELDS, days, replace}); if (!j.ok) throw new Error(j.error || 'Upload failed'); Market.version = 0; await marketLoad(); marketInject(); return j; }
  const m = Market.data || {v: 1, fields: MKT_FIELDS, days: {}}; let added = 0, replaced = 0;
  Object.entries(days).forEach(([d, rows]) => { if (m.days[d]) { if (!replace) return; replaced++; } else added++; m.days[d] = rows; if (Store.mode === 'github') GH.months.add(d.slice(0, 7)); });
  if (Store.mode === 'github') { m.days = Object.fromEntries(Object.entries(m.days).sort()); Market.data = m; marketInject(); Store.db.updated = new Date().toISOString(); await persist(true); return {added, replaced, days: Object.keys(m.days).length}; }
  m.days = Object.fromEntries(Object.entries(m.days).sort()); await IDB.put('market:store', m); Market.data = m; marketInject();
  Store.db.updated = new Date().toISOString(); await persist(true); return {added, replaced, days: Object.keys(m.days).length};
}
async function marketDelete(dates) {
  if (Store.mode === 'server') { const j = await apiJson('api/market/delete', {dates}); if (!j.ok) throw new Error(j.error); Market.version = 0; await marketLoad(); marketInject(); return j; }
  const m = Market.data; if (!m) return; dates.forEach(d => { delete m.days[d]; if (Store.mode === 'github') GH.months.add(d.slice(0, 7)); });
  if (Store.mode === 'github') { marketInject(); await persist(true); return {deleted: dates.length}; } await IDB.put('market:store', m); marketInject(); await persist(true); return {deleted: dates.length};
}
const mktDates = () => Object.keys(Market.data?.days || {}).sort();

/* ---------- admin portal ---------- */
const MA = {parsed: null, files: [], busy: false};
function renderMarketAdmin() {
  const p = $('#p-amarket'), dates = mktDates(), last5 = dates.slice(-5).reverse();
  const months = {}; dates.forEach(d => { const k = d.slice(0, 7); months[k] = (months[k] || 0) + 1; });
  p.innerHTML = `<div class="card wide"><h2>Stock market daily data</h2><p class="sub">Drop the daily <b>Today's price</b> workbook — one sheet per trading day named by date (e.g. <code>2026_10_02</code>) — or a single day's Excel / CSV (the date is then read from the file name, e.g. <code>Today's Price 2026-10-03.xlsx</code>, or from a Date column). Columns are recognised by name: <code>S.No, Symbol, Conf., Open, High, Low, Close, LTP, VWAP, Vol, Prev. Close, Turnover, Trans., Diff, Range, Diff %, … 52 Weeks High/Low</code> — older layouts without LTP work too. Every day replaces that day only; earlier days stay.</p>
    <div class="grid2"><label class="drop" for="maFiles" id="maDrop"><b>Drop workbook(s) here</b> or click to choose<input id="maFiles" type="file" multiple accept=".xlsx,.xls,.xlsm,.csv,.txt" hidden></label>
      <div class="kpis" style="margin:0">${[['Trading days stored', fmt(dates.length, 0), dates.length ? `${dates[0]} → ${last(dates)}` : 'none yet'], ['Latest day', last(dates) || '–', last(dates) ? fmt(Market.data.days[last(dates)].length, 0) + ' symbols' : ''], ['Stored in', Store.mode === 'server' ? 'data/market.json' : 'this browser', Store.mode === 'server' ? 'shared with every user' : 'run server.py to share']].map(([l, v, d]) => `<div class="kpi"><div class="k">${l}</div><div class="v" style="font-size:18px">${esc(v)}</div><div class="d">${esc(d)}</div></div>`).join('')}</div></div>
    <div class="actions"><span id="maMsg"></span></div><div class="prog" id="maProg" hidden><i></i></div></div>
    <div id="maPlan"></div>
    <div class="card wide"><div class="chead"><div><h2>Stored days</h2><p class="sub">Trading days per month. Tick days and delete them if a wrong file was uploaded.</p></div><div class="ctrls"><a class="btn small" href="index.html#stk-daily" target="_blank" rel="noopener">View on user dashboard ↗</a></div></div>
      ${dates.length ? `<div class="cv" style="height:200px"><canvas id="maCov"></canvas></div><details class="panel"><summary>All ${dates.length} days</summary><div><div class="opchk" id="maDays" style="max-height:260px">${dates.slice().reverse().map(d => `<label><input type="checkbox" value="${d}"> ${d} <span class="sub">(${Market.data.days[d].length})</span></label>`).join('')}</div><div class="actions"><button class="btn danger small" id="maDel">Delete ticked days</button><span id="maDMsg"></span></div></div></details>` : '<div class="empty">No daily price data yet.</div>'}</div>`;
  const go = async list => { const fs = [...list].filter(f => /\.(xlsx|xls|xlsm|csv|txt)$/i.test(f.name) && !/^~\$/.test(f.name)); if (!fs.length || MA.busy) return; MA.busy = true; const pr = $('#maProg'); pr.hidden = false;
    const out = {counts: {}, existing: new Set(), syms: new Set(), symN: 0, notes: [], preview: null, ids: [], days: {}}, have = new Set(mktDates());
    try { for (let i = 0; i < fs.length; i++) { const f = fs[i], t0 = Date.now(), tick = setInterval(() => msg('#maMsg', `Reading ${f.name} (${fmtSize(f.size)}) on the server… ${Math.round((Date.now() - t0) / 1000)} s${f.size > 5e6 ? ' — a big multi-day workbook takes 30–60 s' : ''}`), 1000);
        try {
          if (Store.mode === 'server' && !/\.xls$/i.test(f.name)) {   // fast path: the server reads the workbook (no browser memory limits)
            pr.firstElementChild.style.width = (100 * i / fs.length) + '%';
            const r = await fetch('api/market/parse?name=' + encodeURIComponent(f.name), {method: 'POST', headers: authHeaders({'Content-Type': 'application/octet-stream'}), body: f}); const j = await r.json(); if (r.status === 401) { await adminGate(true); throw new Error('Signed out — drop the file again.'); } if (!j.ok) throw new Error(f.name + ': ' + j.error);
            Object.assign(out.counts, j.counts); j.existing.forEach(d => out.existing.add(d)); out.symN = Math.max(out.symN, j.symbols); out.notes.push(...j.notes.map(n => f.name + ' · ' + n)); out.ids.push(j.id); if (j.preview?.date && (!out.preview || j.preview.date > out.preview.date)) out.preview = j.preview;
          } else {
            const r = await mktReadFile(f, x => { pr.firstElementChild.style.width = (100 * (i + x) / fs.length) + '%'; });
            Object.entries(r.days).forEach(([d, rows]) => { out.days[d] = rows; out.counts[d] = rows.length; if (have.has(d)) out.existing.add(d); rows.forEach(x => out.syms.add(x[0])); }); out.notes.push(...r.notes.map(n => f.name + ' · ' + n));
            const ld = Object.keys(r.days).sort().slice(-1)[0]; if (ld && (!out.preview || ld > out.preview.date)) out.preview = {date: ld, rows: r.days[ld].slice(0, 6)};
          } } finally { clearInterval(tick); } }
      out.symN = Math.max(out.symN, out.syms.size); MA.parsed = out; msg('#maMsg', `${Object.keys(out.counts).length} trading days found`, 'ok'); drawMarketPlan(); }
    catch (e) { msg('#maMsg', e.message, 'err'); } finally { MA.busy = false; pr.firstElementChild.style.width = '100%'; setTimeout(() => { pr.hidden = true; }, 500); } };
  $('#maFiles').onchange = e => go(e.target.files);
  const dz = $('#maDrop'); dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); }); dz.addEventListener('dragleave', () => dz.classList.remove('over')); dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); go(e.dataTransfer.files); });
  if (dates.length) { const t = T(), ks = Object.keys(months); mk('maCov', {type: 'bar', data: {labels: ks, datasets: [{label: 'Trading days', data: ks.map(k => months[k]), backgroundColor: t.s[0]}]}, options: {plugins: {legend: {display: false}}, scales: {x: {ticks: {maxTicksLimit: 18}}, y: {}}}});
    $('#maDel').onclick = async () => { const ds_ = [...$('#maDays').querySelectorAll('input:checked')].map(x => x.value); if (!ds_.length) return msg('#maDMsg', 'Tick days first.', 'err'); if (!(await confirmBox(`Delete ${ds_.length} day(s)?`, ds_.slice(0, 12).join(', ') + (ds_.length > 12 ? '…' : ''), 'Delete'))) return;
      try { await marketDelete(ds_); logChange('Deleted market days', 'stock_ohlc', ds_.join(', ')); afterDataChange(); renderMarketAdmin(); toast(ds_.length + ' day(s) deleted'); } catch (e) { msg('#maDMsg', e.message, 'err'); } }; }
  if (MA.parsed) drawMarketPlan();
}
function drawMarketPlan() {
  const host = $('#maPlan'), P = MA.parsed, ds_ = Object.keys(P.counts).sort(), nw = ds_.filter(d => !P.existing.has(d)), ex = ds_.filter(d => P.existing.has(d)), rows = ds_.reduce((a, d) => a + P.counts[d], 0), small = ds_.filter(d => P.counts[d] < 50);
  host.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Ready to save</h2><p class="sub">${fmt(ds_.length, 0)} trading days · ${fmt(rows, 0)} price rows · ${fmt(P.symN, 0)} symbols · ${ds_[0] || ''} → ${last(ds_) || ''}</p></div></div>
    <div class="kpis" style="margin:0">${[['New days', nw.length, nw.length ? nw.slice(-3).join(', ') + (nw.length > 3 ? ' …' : '') : ''], ['Days already stored', ex.length, 'replaced if ticked below'], ['Thin days (< 50 symbols)', small.length, small.slice(0, 3).join(', ')]].map(([l, v, d]) => `<div class="kpi"><div class="k">${l}</div><div class="v">${fmt(v, 0)}</div><div class="d">${esc(d)}</div></div>`).join('')}</div>
    ${P.notes.length ? `<details class="panel"><summary>Notes (${P.notes.length})</summary><div><p class="sub">${P.notes.slice(0, 60).map(esc).join('<br>')}</p></div></details>` : ''}
    ${P.preview ? `<div class="tbl"><table><thead><tr><th class="txt">Preview: ${esc(P.preview.date)}</th>${['Open', 'High', 'Low', 'Close', 'Change %', 'Volume', 'Turnover', 'Trans.'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${P.preview.rows.map(r => `<tr><td class="txt">${esc(r[0])}</td>${['o', 'h', 'l', 'c', 'pct', 'v', 't', 'tr'].map(f => `<td class="num">${['v', 't', 'tr'].includes(f) ? fmt(r[MF[f]], 0) : fmtAuto(r[MF[f]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    <div class="actions"><label class="sub"><input type="checkbox" id="maRep" checked> Replace days already stored</label><button class="btn primary" id="maSave" ${ds_.length ? '' : 'disabled'}>Save ${fmt(ds_.length, 0)} day(s)</button><button class="btn" id="maCancel">Cancel</button><span id="maSMsg"></span></div></div>`;
  $('#maCancel').onclick = () => { MA.parsed = null; host.innerHTML = ''; };
  $('#maSave').onclick = async () => { msg('#maSMsg', 'Saving…'); $('#maSave').disabled = true;
    try { let r; const rep = $('#maRep').checked;
      if (P.ids.length) { const j = await apiJson('api/market/commit', {ids: P.ids, replace: rep}); if (!j.ok) throw new Error(j.error); r = j; if (Object.keys(P.days).length) r = await marketSave(P.days, {replace: rep}); Market.version = 0; await marketLoad(); marketInject(); }
      else r = await marketSave(P.days, {replace: rep});
      logChange('Uploaded daily prices', 'stock_ohlc', `${r.added} new, ${r.replaced} replaced days`); if (Store.mode === 'server') await persist(true); afterDataChange(); MA.parsed = null; renderMarketAdmin(); toast(`Saved: ${r.added} new day(s), ${r.replaced} replaced. ${r.days} days stored.`); }
    catch (e) { msg('#maSMsg', e.message, 'err'); $('#maSave').disabled = false; } };
}
/* ---------- user page: Stock market › Today's market ---------- */
const TM = {date: null, q: '', sort: 't', dir: -1};
function renderMarketDaily() {
  const b = $('#stockBody'), dates = mktDates();
  if (!dates.length) { b.innerHTML = `<div class="card wide"><h2>Today's market</h2><div class="empty">No daily price files published yet.${IS_ADMIN ? '' : ' They are uploaded from the admin dashboard (Data › Stock market daily data).'}</div></div>`; return; }
  if (!TM.date || !dates.includes(TM.date)) TM.date = last(dates);
  const t = T(), rows = Market.data.days[TM.date].map(r => Object.fromEntries(MKT_FIELDS.map((f, i) => [f, r[i]]))), adv = rows.filter(r => r.pct > 0).length, dec = rows.filter(r => r.pct < 0).length, unc = rows.length - adv - dec;
  const sum = k => rows.reduce((a, r) => a + (isNum(r[k]) ? r[k] : 0), 0), top = (k, dir = -1, n = 10, f = () => true) => rows.filter(r => isNum(r[k]) && f(r)).sort((a, c) => dir * (a[k] - c[k])).slice(0, n);
  const hi = rows.filter(r => isNum(r.hi52) && r.hi52 > 0 && r.h >= r.hi52), lo = rows.filter(r => isNum(r.lo52) && r.lo52 > 0 && r.l <= r.lo52);
  const mini = (title, list, cols) => `<div class="card"><h2>${title}</h2><div class="tbl"><table><thead><tr><th class="txt">Symbol</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${list.map(r => `<tr><td class="txt"><a href="#" data-sym="${esc(r.sym)}">${esc(r.sym)}</a></td>${cols.map(c => `<td class="num ${c[1] === 'pct' && r.pct < 0 ? 'neg' : ''}">${c[1] === 'pct' ? (r.pct > 0 ? '+' : '') + fmt(r.pct, 2) + '%' : ['v', 't'].includes(c[1]) ? fmt(r[c[1]], 0) : fmtAuto(r[c[1]])}</td>`).join('')}</tr>`).join('') || `<tr><td class="txt" colspan="${cols.length + 1}">None</td></tr>`}</tbody></table></div></div>`;
  const breadth = dates.slice(-120).map(d => { const rs = Market.data.days[d]; let a = 0, dn = 0, tv = 0; rs.forEach(r => { const p = r[MF.pct]; if (p > 0) a++; else if (p < 0) dn++; tv += r[MF.t] || 0; }); return {d, a, dn, tv}; });
  b.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Today's market — ${esc(TM.date)}</h2><p class="sub">Daily price file published by the admin (${fmt(dates.length, 0)} trading days stored, ${dates[0]} → ${last(dates)}).</p></div><div class="ctrls"><select id="tmDate" aria-label="Trading day">${dates.slice().reverse().slice(0, 400).map(d => `<option ${d === TM.date ? 'selected' : ''}>${d}</option>`).join('')}</select><button class="btn small" id="tmCsv">Download this day (CSV)</button></div></div>
    <div class="kpis" style="margin:0">${[['Symbols traded', fmt(rows.length, 0), ''], ['Advances / declines', `${adv} / ${dec}`, `${unc} unchanged`], ['Turnover', 'Rs ' + (sum('t') / 1e7).toFixed(2) + ' cr', ''], ['Shares traded', fmt(sum('v'), 0), ''], ['Transactions', fmt(sum('tr'), 0), ''], ['New 52-week highs / lows', `${hi.length} / ${lo.length}`, '']].map(([l, v, d]) => `<div class="kpi"><div class="k">${l}</div><div class="v" style="font-size:20px">${v}</div><div class="d">${d}</div></div>`).join('')}</div></div>
    <div class="grid2">${mini('Top gainers', top('pct', -1), [['Close', 'c'], ['Change', 'pct'], ['Turnover', 't']])}${mini('Top losers', top('pct', 1), [['Close', 'c'], ['Change', 'pct'], ['Turnover', 't']])}${mini('Turnover leaders', top('t', -1), [['Close', 'c'], ['Change', 'pct'], ['Turnover', 't']])}${mini('Most traded (shares)', top('v', -1), [['Close', 'c'], ['Change', 'pct'], ['Volume', 'v']])}</div>
    <div class="grid2"><div class="card"><h2>Market breadth</h2><p class="sub">Advancing minus declining symbols, last ${breadth.length} trading days</p><div class="cv"><canvas id="tmBr"></canvas></div></div><div class="card"><h2>Total turnover</h2><p class="sub">Rs crore per trading day</p><div class="cv"><canvas id="tmTv"></canvas></div></div></div>
    ${hi.length || lo.length ? `<div class="grid2">${mini('At 52-week high', hi.slice(0, 15), [['High', 'h'], ['52-wk high', 'hi52'], ['Change', 'pct']])}${mini('At 52-week low', lo.slice(0, 15), [['Low', 'l'], ['52-wk low', 'lo52'], ['Change', 'pct']])}</div>` : ''}
    <div class="card wide"><div class="chead"><h2>All prices</h2><div class="ctrls"><input type="search" id="tmQ" placeholder="Filter symbol" value="${esc(TM.q)}" aria-label="Filter symbols"></div></div><div class="tbl scroll" style="max-height:620px" id="tmTbl"></div><p class="src">Click a column heading to sort; click a symbol for its chart. Change % from the file (Diff %) or Close vs previous close.</p></div>`;
  const cols = [['sym', 'Symbol'], ['o', 'Open'], ['h', 'High'], ['l', 'Low'], ['c', 'Close'], ['pct', 'Change %'], ['vw', 'VWAP'], ['v', 'Volume'], ['t', 'Turnover'], ['tr', 'Trans.'], ['pc', 'Prev. close'], ['hi52', '52-wk high'], ['lo52', '52-wk low'], ['a120', '120-day avg'], ['a180', '180-day avg']];
  const drawT = () => { const q = TM.q.toUpperCase(), rs = rows.filter(r => !q || r.sym.includes(q)).sort((a, c) => TM.sort === 'sym' ? TM.dir * a.sym.localeCompare(c.sym) : TM.dir * ((a[TM.sort] ?? -Infinity) - (c[TM.sort] ?? -Infinity)));
    $('#tmTbl').innerHTML = `<table><thead><tr>${cols.map(([k, l], i) => `<th class="sortable ${i ? '' : 'txt'}" data-k="${k}">${l}${TM.sort === k ? (TM.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${rs.map(r => `<tr>${cols.map(([k], i) => i ? `<td class="num ${k === 'pct' && r.pct < 0 ? 'neg' : ''}">${k === 'pct' ? (isNum(r.pct) ? fmt(r.pct, 2) : '–') : ['v', 't', 'tr'].includes(k) ? fmt(r[k], 0) : fmtAuto(r[k])}</td>` : `<td class="txt"><a href="#" data-sym="${esc(r.sym)}">${esc(r.sym)}</a></td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('#tmTbl').querySelectorAll('th.sortable').forEach(th => th.onclick = () => { if (TM.sort === th.dataset.k) TM.dir *= -1; else { TM.sort = th.dataset.k; TM.dir = th.dataset.k === 'sym' ? 1 : -1; } drawT(); }); wireSyms($('#tmTbl')); };
  const wireSyms = root => root.querySelectorAll('[data-sym]').forEach(a => a.onclick = e => { e.preventDefault(); openChart(a.dataset.sym); });
  drawT(); wireSyms(b);
  $('#tmQ').oninput = e => { TM.q = e.target.value; drawT(); };
  $('#tmDate').onchange = e => { TM.date = e.target.value; renderMarketDaily(); };
  $('#tmCsv').onclick = () => download(`prices-${TM.date}.csv`, [cols.map(c => c[1]).join(','), ...rows.map(r => cols.map(([k]) => r[k] ?? '').join(','))].join('\n'), 'text/csv');
  mk('tmBr', {type: 'bar', data: {labels: breadth.map(x => x.d), datasets: [{label: 'Advances − declines', data: breadth.map(x => x.a - x.dn), backgroundColor: breadth.map(x => x.a >= x.dn ? t.good : t.crit)}]}, options: {plugins: {legend: {display: false}}, scales: {x: {ticks: {maxTicksLimit: 8}}, y: {}}}});
  mk('tmTv', {type: 'line', data: {labels: breadth.map(x => x.d), datasets: [{label: 'Turnover (Rs cr)', data: breadth.map(x => x.tv / 1e7), borderColor: t.s[0], pointRadius: 0, borderWidth: 2}]}, options: {plugins: {legend: {display: false}}, scales: {x: {ticks: {maxTicksLimit: 8}}, y: {}}}});
}
