/* Import: upload files, link folders (through the local server) or pick a folder in the browser.
   Recognises NepseAlpha price exports, screener/fundamental exports, CSVs exported from this app and backups;
   anything else goes through a column-mapping step. Loaded before app.js. */
'use strict';

const Imp = {pending: [], browserDir: null, browserFiles: [], folders: null};
const normH = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
const cellNum = v => { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; const s = String(v).replace(/[,%\s]/g, '').replace(/^Rs\.?/i, ''); if (s === '' || s === '-' || s === '--') return null; const n = Number(s); return isFinite(n) ? n : null; };
function cellDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000 && window.XLSX) { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  const s = String(v).trim(); let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s); if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;   // m/d/yyyy
  const d = new Date(s); return isNaN(d) ? null : new Date(d.getTime() + 12 * 3600e3).toISOString().slice(0, 10);
}
/* ---------- parsing ---------- */
async function parseFileBuffer(name, buf) {
  const low = name.toLowerCase();
  if (low.endsWith('.json')) {
    const j = JSON.parse(new TextDecoder().decode(buf));
    if (j && j.datasets) return [{sheet: 'backup', backup: j}];
    const arr = Array.isArray(j) ? j : Object.values(j).find(Array.isArray);
    if (!arr || !arr.length || typeof arr[0] !== 'object') throw new Error('This JSON file does not contain a table (an array of records).');
    const hdr = uniq(arr.flatMap(o => Object.keys(o))); return [{sheet: 'data', aoa: [hdr, ...arr.map(o => hdr.map(h => o[h] ?? null))]}];
  }
  if (!window.XLSX) throw new Error('The spreadsheet reader did not load (assets/xlsx.full.min.js).');
  const wb = XLSX.read(buf, {type: 'array', cellDates: true, raw: low.endsWith('.csv') || low.endsWith('.txt') || low.endsWith('.tsv') ? false : undefined});
  return wb.SheetNames.map(s => ({sheet: s, aoa: XLSX.utils.sheet_to_json(wb.Sheets[s], {header: 1, raw: true, defval: null, blankrows: false})})).filter(x => x.aoa.length);
}
function findHeader(aoa, must) { for (let i = 0; i < Math.min(15, aoa.length); i++) { const h = aoa[i].map(normH); if (must.every(m => h.includes(m))) return i; } return -1; }
function detect(fileName, sh, mtime) {
  if (sh.backup) return {kind: 'backup', label: 'App backup', info: `${Object.keys(sh.backup.datasets).length} datasets, updated ${sh.backup.updated || '?'}`, backup: sh.backup};
  const aoa = sh.aoa;
  // 1. price history (NepseAlpha, merolagani, sharesansar exports)
  let hi = findHeader(aoa, ['date', 'close']);
  if (hi >= 0 && aoa[hi].map(normH).some(h => ['open', 'high', 'ltp', 'close price'].includes(h) || h === 'high')) {
    const H = aoa[hi].map(normH), ix = (...names) => H.findIndex(h => names.includes(h));
    const iS = ix('symbol', 'script', 'scrip', 'stock symbol'), iD = ix('date', 'business date', 'published date'), iO = ix('open', 'open price'), iH = ix('high', 'high price', 'max price'), iL = ix('low', 'low price', 'min price'), iC = ix('close', 'close price', 'ltp'), iP = ix('percent change', 'change %', '% change', 'diff %'), iV = ix('volume', 'total traded quantity', 'traded shares', 'qty'), iT = ix('turn over', 'turnover', 'total traded value', 'amount');
    const symFromName = (/price_([A-Za-z0-9]+)_/.exec(fileName) || /^([A-Za-z0-9]+)[ _-]/.exec(fileName) || [])[1];
    const rows = [];
    for (const r of aoa.slice(hi + 1)) { const date = cellDate(r[iD]), close = cellNum(r[iC]); if (!date || !isNum(close)) continue;
      const sym = String((iS >= 0 ? r[iS] : null) || symFromName || '').trim().toUpperCase(); if (!sym) continue;
      rows.push({date, symbol: sym, open: cellNum(r[iO]), high: cellNum(r[iH]), low: cellNum(r[iL]), close, pct: cellNum(r[iP]), volume: cellNum(r[iV]), turnover: cellNum(r[iT])}); }
    if (rows.length) { const syms = uniq(rows.map(r => r.symbol)), dates = rows.map(r => r.date).sort();
      return {kind: 'ohlc', target: 'stock_ohlc', label: 'Daily prices', info: `${rows.length} rows · ${syms.slice(0, 6).join(', ')}${syms.length > 6 ? '…' : ''} · ${dates[0]} to ${last(dates)}`, rows}; }
  }
  // 2. fundamentals / screener
  hi = findHeader(aoa, ['symbol']);
  if (hi >= 0) { const H = aoa[hi].map(normH); const has = k => H.includes(k);
    if ((has('pe') || has('p e') || has('pe ratio')) && (has('pb') || has('p b') || has('roe') || has('eps'))) {
      const ix = (...n) => H.findIndex(h => n.includes(h)), map = {symbol: ix('symbol'), sector: ix('sector'), ltp: ix('ltp', 'price', 'close'), daily: ix('daily gain'), pe: ix('pe', 'p e', 'pe ratio'), pb: ix('pb', 'p b', 'pb ratio'), roe: ix('roe'), roa: ix('roa'), peg: ix('peg'),
        graham_disc: ix('discount from graham number'), dy: ix('dividend yield'), payout: ix('payout ratio'), eps: ix('eps', 'eps annualized'), bvps: ix('book value', 'bvps', 'book value per share'), dps: ix('dps', 'dividend per share'), mcap: ix('market cap', 'market capitalization', 'market capitalisation', 'mcap', 'market cap rs', 'market capitalization rs'),
        pe_vs: ix('pe vs sector'), pb_vs: ix('pb vs sector'), peg_vs: ix('peg vs sector'), dy_vs: ix('dividend yield vs sector'), roe_vs: ix('roe vs sector')};
      const txtK = ['symbol', 'sector', 'pe_vs', 'pb_vs', 'peg_vs', 'dy_vs', 'roe_vs'], asof = mtime ? new Date(mtime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const rows = aoa.slice(hi + 1).filter(r => r[map.symbol]).map(r => { const o = {asof, symbol: String(r[map.symbol]).trim().toUpperCase()}; for (const [k, i] of Object.entries(map)) { if (k === 'symbol' || i < 0) continue; o[k] = txtK.includes(k) ? (r[i] == null || ['--', '-'].includes(String(r[i]).trim()) ? null : String(r[i]).trim()) : cellNum(r[i]); } return o; });
      // yields given as percent (e.g. 4.2) rather than fractions → convert
      ['roe', 'roa', 'dy'].forEach(k => { const v = rows.map(r => r[k]).filter(isNum); if (v.length && QC.quantile(v.map(Math.abs), 0.5) > 1) rows.forEach(r => { if (isNum(r[k])) r[k] /= 100; }); });
      return {kind: 'fund', target: 'stock_fundamentals', label: 'Company fundamentals', info: `${rows.length} companies · as of ${asof} (change below if needed)`, rows, asof};
    } }
  // 3. news articles / documents for the News & sentiment workbench
  for (let i = 0; i < Math.min(10, aoa.length); i++) { const H = (aoa[i] || []).map(normH), ix = (...n) => H.findIndex(h => n.includes(h));
    const iT = ix('title', 'headline', 'heading', 'name'), iX = ix('text', 'content', 'body', 'summary', 'description', 'article', 'full text');
    if (iT < 0 || iX < 0 || H.includes('close')) continue;
    const iD = ix('date', 'published', 'published date', 'pubdate', 'publish date', 'date published'), iS = ix('source', 'publisher', 'outlet', 'site'), iU = ix('url', 'link'), iY = ix('type', 'category'), iL = ix('language', 'lang'), iId = ix('id', 'doc id', 'document id'), iH = ix('your label', 'label', 'sentiment', 'human');
    const today = new Date().toISOString().slice(0, 10), rows = [];
    for (const r of aoa.slice(i + 1)) { const title = String(r[iT] ?? '').trim(), text = String(r[iX] ?? '').trim(); if (!title && !text) continue;
      const date = (iD >= 0 && cellDate(r[iD])) || today; let t0 = title || text.slice(0, 80); if (iT >= 0 && H[iT] === 'name') t0 = t0.replace(/^\d{4}-\d{2}-\d{2}\s+/, '');
      let h = 5381; const key = date + '|' + t0; for (let k = 0; k < key.length; k++) h = ((h << 5) + h + key.charCodeAt(k)) | 0;
      const lab = iH >= 0 ? String(r[iH] ?? '').trim() : '', human = ['Positive', 'Negative', 'Neutral', 'Mixed'].find(x => x.toLowerCase() === lab.toLowerCase()) || null;
      rows.push({date, doc_id: iId >= 0 && r[iId] ? String(r[iId]).trim() : 'I' + date.replace(/-/g, '').slice(2) + '-' + (h >>> 0).toString(36), title: t0, source: iS >= 0 ? (String(r[iS] ?? '').trim() || null) : fileName.replace(/\.[^.]+$/, ''),
        type: iY >= 0 ? (String(r[iY] ?? '').trim() || 'News') : 'News', lang: iL >= 0 ? (String(r[iL] ?? '').trim() || null) : null, url: iU >= 0 ? (String(r[iU] ?? '').trim() || null) : null, text: text || title, human}); }
    if (rows.length && ds('news_docs')) { const dates = rows.map(r => r.date).sort();
      return {kind: 'news', target: 'news_docs', label: 'News and documents', info: `${rows.length} documents · ${dates[0]} to ${last(dates)} · scored and auto-coded on import`, rows}; }
  }
  // 4. a CSV exported from this app
  const hdr = (aoa[0] || []).map(normH);
  const match = allDs().find(d => d.cols.length === hdr.length && d.cols.every((c, i) => normH(c.label) === hdr[i]));
  if (match) return {kind: 'dataset', target: match.id, label: 'Matches: ' + match.title, info: `${aoa.length - 1} rows`, aoa};
  return {kind: 'generic', label: 'New table', info: `${aoa.length - 1} rows × ${aoa[0]?.length || 0} columns`, aoa};
}
/* ---------- applying imports ---------- */
function upsert(d, rows) {
  const key = r => d.keys.map(k => String(r[k] ?? '')).join('\u0001'), idx = new Map(d.rows.map((r, i) => [key(r), i])); let added = 0, updated = 0;
  for (const r of rows) { const k = key(r); if (idx.has(k)) { const i = idx.get(k); d.rows[i] = Object.assign({}, d.rows[i], Object.fromEntries(Object.entries(r).filter(([, v]) => v != null))); updated++; } else { idx.set(k, d.rows.length); d.rows.push(r); added++; } }
  sortRows(d); return {added, updated};
}
async function applyPlan(plan, fileId, meta, silent) {
  let res, target = plan.target;
  if (plan.kind === 'backup') {
    if (!(await confirmBox('Restore this backup?', `${esc(plan.info)}. Your current data will be replaced.`, 'Restore'))) return null;
    Store.db = plan.backup; Store.db.log = Store.db.log || []; for (const x of Object.values(Store.db.datasets)) sortRows(x); res = {added: 0, updated: 0}; target = 'smi';
  } else if (plan.kind === 'ohlc' || plan.kind === 'fund') { if (plan.kind === 'fund' && plan.asof) plan.rows.forEach(r => r.asof = plan.asof); res = upsert(ds(target), plan.rows); }
  else if (plan.kind === 'dataset') { const d = ds(target); const rows = plan.aoa.slice(1).map(r => rowFromCells(d, d.cols.map((c, i) => i), r)).filter(r => d.keys.every(k => r[k] != null)); res = upsert(d, rows); }
  else if (plan.kind === 'news') { res = upsert(ds(target), plan.rows); try { newsRefresh(false); autoCode(plan.rows.map(r => docBy(r.doc_id)).filter(Boolean)); } catch (e) { console.error(e); } }
  else if (plan.kind === 'mapped') res = plan.run();
  Store.db.imports = Store.db.imports || {};
  if (fileId) Store.db.imports[fileId] = {name: meta?.name || fileId, mtime: meta?.mtime || null, size: meta?.size || null, at: new Date().toISOString(), kind: plan.kind, target, added: res.added, updated: res.updated};
  logChange('Imported file', target, `${meta?.name || ''}: ${res.added} added, ${res.updated} updated`);
  await persist(true); afterDataChange();
  if (!silent) toast(`${meta?.name || 'File'}: ${res.added} rows added, ${res.updated} updated in ${ds(target)?.title || target}`);
  return res;
}
function rowFromCells(d, idxs, cells) {
  const r = {}; d.cols.forEach((c, j) => { const i = idxs[j]; if (i == null || i < 0) return; const v = cells[i];
    if (c.t === 'num') r[c.k] = cellNum(v); else if (c.t === 'date') r[c.k] = cellDate(v); else r[c.k] = v == null || v === '' ? null : (v instanceof Date ? cellDate(v) : String(v).trim()); });
  if (r.fy && /^\d{4}\/\d{4}$/.test(r.fy)) r.fy = r.fy.slice(0, 5) + r.fy.slice(7);
  return r;
}

/* ---------- UI ---------- */
function renderImport() {
  const p = $('#p-imp'), server = Store.mode === 'server', canPick = 'showDirectoryPicker' in window;
  p.innerHTML = `
  <div class="grid2">
    <div class="card">
      <h2>Upload files</h2>
      <p class="sub">CSV, Excel (.xlsx, .xls), JSON. NepseAlpha price exports and screener files are recognised automatically; other tables get a quick column-matching step.</p>
      <label class="drop" id="dropZone" for="impFiles"><b>Drop files here</b> or click to choose<input id="impFiles" type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,.json,.txt,.tsv" hidden></label>
    </div>
    <div class="card">
      <h2>Linked folders</h2>
      ${server ? `<p class="sub">Link a folder on this computer; the app lists its data files and imports new or changed ones. Files stay where they are.</p>
        <div class="form" style="grid-template-columns:1fr"><div class="f"><label for="lfPath">Folder path</label><input id="lfPath" placeholder="C:\\Users\\you\\Desktop\\NEPSE"></div></div>
        <div class="actions"><button class="btn primary" id="lfAdd">Link folder</button><label class="sub"><input type="checkbox" id="lfAuto" ${Store.db.settings?.autoSync ? 'checked' : ''}> Import new and changed files when the app opens</label><span id="lfMsg"></span></div>`
      : `<p class="note">Folder linking needs the local server. Start the app with <code>start-windows.bat</code> and open <code>http://localhost:8080</code>.</p>`}
      ${canPick ? `<div class="actions"><button class="btn" id="pickDir">Choose a folder in this browser…</button><span class="sub">Chrome or Edge; you pick the folder each session.</span></div>` : ''}
    </div>
  </div>
  <div id="impPending" style="display:grid;gap:18px"></div>
  <div id="impFolders" style="display:grid;gap:18px"></div>
  <div class="card"><h2>Import history</h2><div class="tbl"><table id="impHist"></table></div></div>`;
  const fi = $('#impFiles'); fi.onchange = () => handleFiles([...fi.files].map(f => ({f, name: f.name, mtime: f.lastModified, size: f.size, id: 'upload:' + f.name})));
  const dz = $('#dropZone'); ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => handleFiles([...e.dataTransfer.files].map(f => ({f, name: f.name, mtime: f.lastModified, size: f.size, id: 'upload:' + f.name}))));
  if (server) {
    $('#lfAdd').onclick = async () => { const path = $('#lfPath').value.trim(); if (!path) return msg('#lfMsg', 'Type the folder path first.', 'err');
      const r = await (await fetch('api/folders', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path})})).json();
      if (!r.ok) return msg('#lfMsg', r.error, 'err'); msg('#lfMsg', r.note || 'Linked.', 'ok'); $('#lfPath').value = ''; loadFolders(); };
    $('#lfAuto').onchange = async e => { Store.db.settings = Store.db.settings || {}; Store.db.settings.autoSync = e.target.checked; await persist(true); toast(e.target.checked ? 'Linked folders will sync when the app opens' : 'Automatic sync turned off'); };
    loadFolders();
  }
  if ($('#pickDir')) $('#pickDir').onclick = pickBrowserDir;
  drawPending(); drawHistory(); if (Imp.browserFiles.length) drawBrowserDir();
}
function drawHistory() {
  const h = Object.entries(Store.db.imports || {}).sort((a, b) => (b[1].at || '').localeCompare(a[1].at || ''));
  $('#impHist').innerHTML = h.length ? `<thead><tr><th class="txt">File</th><th class="txt">Into</th><th>Added</th><th>Updated</th><th>Imported</th></tr></thead><tbody>` + h.slice(0, 50).map(([id, x]) => `<tr><td class="txt">${esc(x.name)}<br><span class="sub">${esc(id.split(':')[0])}</span></td><td class="txt">${esc(ds(x.target)?.title || x.target)}</td><td class="num">${x.added}</td><td class="num">${x.updated}</td><td>${esc((x.at || '').replace('T', ' ').slice(0, 16))}</td></tr>`).join('') + '</tbody>' : '<tbody><tr><td class="txt">Nothing imported yet.</td></tr></tbody>';
}
async function handleFiles(list) {
  for (const it of list) {
    try { const buf = it.buf || await it.f.arrayBuffer(); const sheets = await parseFileBuffer(it.name, buf);
      sheets.forEach((sh, si) => { const plan = detect(it.name, sh, it.mtime); Imp.pending.push({...it, sheet: sh.sheet, sheets: sheets.length, plan, uid: Math.random().toString(36).slice(2), id: it.id + (sheets.length > 1 ? '#' + sh.sheet : '')}); });
    } catch (e) { toast(`${it.name}: ${e.message}`); }
  }
  drawPending();
}
function drawPending() {
  const box = $('#impPending'); if (!box) return;
  box.innerHTML = Imp.pending.map(x => `<div class="card" data-uid="${x.uid}">
      <div class="chead"><div><h2>${esc(x.name)}${x.sheets > 1 ? ' · ' + esc(x.sheet) : ''}</h2><p class="sub"><span class="pill">${esc(x.plan.label)}</span> ${esc(x.plan.info)}</p></div>
      <div class="ctrls"><button class="btn small" data-x="drop">Dismiss</button></div></div>
      ${x.plan.kind === 'fund' ? `<div class="ctrls"><label class="sub" for="asof_${x.uid}">Ratios are as of</label><input type="date" id="asof_${x.uid}" value="${esc(x.plan.asof)}"></div>` : ''}
      ${x.plan.kind === 'generic' ? mappingHTML(x) : ''}
      ${previewHTML(x)}
      <div class="actions"><button class="btn primary" data-x="go">${x.plan.kind === 'backup' ? 'Restore backup' : x.plan.kind === 'generic' ? 'Import with these settings' : 'Import into ' + esc(ds(x.plan.target)?.title || '')}</button><span class="msgslot"></span></div>
    </div>`).join('');
  box.querySelectorAll('[data-uid]').forEach(card => { const x = Imp.pending.find(p => p.uid === card.dataset.uid);
    card.querySelector('[data-x="drop"]').onclick = () => { Imp.pending = Imp.pending.filter(p => p !== x); drawPending(); };
    if (x.plan.kind === 'generic') wireMapping(card, x);
    card.querySelector('[data-x="go"]').onclick = async () => {
      try { if (x.plan.kind === 'fund') x.plan.asof = card.querySelector('#asof_' + x.uid).value || x.plan.asof;
        if (x.plan.kind === 'generic') buildMappedPlan(card, x);
        const r = await applyPlan(x.plan, x.id, x); if (r) { Imp.pending = Imp.pending.filter(p => p !== x); drawPending(); drawHistory(); if (Imp.folders) drawFolders(); }
      } catch (e) { const s = card.querySelector('.msgslot'); s.className = 'msg err'; s.textContent = e.message; } };
  });
}
function previewHTML(x) {
  const p = x.plan;
  if (p.rows) { const cols = Object.keys(p.rows[0] || {}); return `<div class="tbl"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${p.rows.slice(0, 5).map(r => `<tr>${cols.map(c => `<td class="${isNum(r[c]) ? 'num' : 'txt'}">${isNum(r[c]) ? fmtAuto(r[c]) : esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
  if (p.aoa) return `<div class="tbl"><table><tbody>${p.aoa.slice(0, 6).map((r, i) => `<tr>${r.map(v => `<td class="txt" style="${i === 0 ? 'font-weight:600' : ''}">${esc(v instanceof Date ? cellDate(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return '';
}
/* generic mapping */
function guessHeaderRow(aoa) { let best = 0, bs = -1; for (let i = 0; i < Math.min(10, aoa.length); i++) { const r = aoa[i], s = r.filter(v => typeof v === 'string' && v.trim() && !isFinite(+v)).length - r.filter(v => v == null).length * 0.3; if (s > bs) { bs = s; best = i; } } return best; }
function colKind(vals) { const v = vals.filter(x => x != null && x !== ''); if (!v.length) return 'text';
  if (v.every(x => x instanceof Date || (typeof x === 'string' && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(x)))) return 'date';
  if (v.every(x => /^\d{4}\/\d{2}(\d{2})?$/.test(String(x).trim()))) return 'fy';
  if (v.every(x => /^\d{4}$/.test(String(x).trim()))) return 'year';
  return v.filter(x => cellNum(x) != null).length >= v.length * 0.8 ? 'num' : 'text'; }
function mappingHTML(x) {
  const aoa = x.plan.aoa, hr = x.hr ?? (x.hr = guessHeaderRow(aoa)), H = aoa[hr].map((h, i) => String(h ?? 'Column ' + (i + 1)).trim()), body = aoa.slice(hr + 1), kinds = H.map((_, i) => colKind(body.map(r => r[i])));
  x.H = H; x.kinds = kinds; x.body = body;
  const idCol = kinds.findIndex(k => ['date', 'fy', 'year'].includes(k)), groups = uniq(allDs().map(d => d.group));
  return `<div class="form">
    <div class="f"><label>Header row</label><select data-m="hr">${aoa.slice(0, 10).map((r, i) => `<option value="${i}" ${i === hr ? 'selected' : ''}>Row ${i + 1}: ${esc(r.filter(v => v != null).slice(0, 3).join(', ')).slice(0, 40)}</option>`).join('')}</select></div>
    <div class="f"><label>Import into</label><select data-m="target"><option value="__new">A new dataset</option>${groups.map(g => `<optgroup label="${esc(g)}">${allDs().filter(d => d.group === g).map(d => `<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="f nd"><label>New dataset name</label><input data-m="title" value="${esc(x.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))}"></div>
    <div class="f nd"><label>Rows are identified by</label><select data-m="idcol">${H.map((h, i) => `<option value="${i}" ${i === Math.max(0, idCol) ? 'selected' : ''}>${esc(h)} (${kinds[i]})</option>`).join('')}</select></div>
    <div class="f nd"><label>Category column (optional)</label><select data-m="catcol"><option value="">None</option>${H.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('')}</select></div>
  </div><div class="ex" style="display:none"><p class="sub">Match each column of the dataset to a column in the file:</p><div class="form exmap"></div></div>`;
}
function wireMapping(card, x) {
  const q = s => card.querySelector(`[data-m="${s}"]`);
  q('hr').onchange = e => { x.hr = +e.target.value; drawPending(); };
  const upd = () => { const tgt = q('target').value, isNew = tgt === '__new'; card.querySelectorAll('.nd').forEach(el => el.style.display = isNew ? '' : 'none'); card.querySelector('.ex').style.display = isNew ? 'none' : '';
    if (!isNew) { const d = ds(tgt); card.querySelector('.exmap').innerHTML = d.cols.map(c => { const g = x.H.findIndex(h => normH(h) === normH(c.label) || normH(h) === normH(c.k)); return `<div class="f"><label>${esc(c.label)}${d.keys.includes(c.k) ? ' <span class="req">*</span>' : ''}</label><select data-c="${esc(c.k)}"><option value="-1">(leave empty)</option>${x.H.map((h, i) => `<option value="${i}" ${i === g ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`; }).join(''); } };
  q('target').onchange = upd; upd();
}
function buildMappedPlan(card, x) {
  const q = s => card.querySelector(`[data-m="${s}"]`), tgt = q('target').value;
  if (tgt !== '__new') {
    const d = ds(tgt), idxs = d.cols.map(c => +card.querySelector(`[data-c="${c.k}"]`).value);
    const miss = d.keys.filter((k, j) => idxs[d.cols.findIndex(c => c.k === k)] < 0); if (miss.length) throw new Error('Match the required columns: ' + miss.map(k => d.cols.find(c => c.k === k).label).join(', '));
    x.plan = {kind: 'mapped', target: tgt, label: x.plan.label, info: x.plan.info, run: () => upsert(d, x.body.map(r => rowFromCells(d, idxs, r)).filter(r => d.keys.every(k => r[k] != null)))};
    return;
  }
  const title = q('title').value.trim() || x.name, idc = +q('idcol').value, cc = q('catcol').value === '' ? null : +q('catcol').value, kind = x.kinds[idc];
  const per = kind === 'date' ? (cc != null ? 'date-cat' : 'date') : kind === 'fy' ? (cc != null ? 'fy-cat' : 'fy') : kind === 'year' ? (cc != null ? 'year-cat' : 'year') : 'snapshot';
  const kcol = per.startsWith('date') ? {k: 'date', label: x.H[idc], t: 'date', key: true} : per.startsWith('fy') ? {k: 'fy', label: x.H[idc], t: 'text', key: true} : per.startsWith('year') ? {k: 'year', label: x.H[idc], t: 'text', key: true} : {k: 'period', label: x.H[idc], t: 'text', key: true};
  const cols = [kcol], idxs = [idc];
  if (cc != null) { cols.push({k: 'cat', label: x.H[cc], t: 'text', key: true}); idxs.push(cc); }
  else if (per === 'snapshot') { cols[0].k = 'period'; }
  x.H.forEach((h, i) => { if (i === idc || i === cc || !String(h).trim()) return; cols.push({k: 'c' + i, label: h, t: x.kinds[i] === 'num' ? 'num' : x.kinds[i] === 'date' ? 'date' : 'text'}); idxs.push(i); });
  const id = 'my_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) + '_' + Date.now().toString(36).slice(-4);
  const d = {id, title, group: 'My data', period: per, cols, rows: [], keys: cols.filter(c => c.key).map(c => c.k), source: 'Imported from ' + x.name, unit: '', note: '', custom: true, cat: cc != null ? 'cat' : undefined};
  if (per === 'snapshot' && cc == null) { d.period = 'snapshot'; }
  x.plan = {kind: 'mapped', target: id, label: 'New dataset', info: title, run: () => { Store.db.datasets[id] = d; return upsert(d, x.body.map(r => rowFromCells(d, idxs, r)).filter(r => d.keys.every(k => r[k] != null))); }};
}
/* linked folders (server) */
async function loadFolders() {
  try { const r = await (await fetch('api/folders', {cache: 'no-store'})).json(); Imp.folders = r.folders || []; } catch (e) { Imp.folders = []; }
  drawFolders();
}
function fileStatus(id, f) { const h = (Store.db.imports || {})[id]; if (!h) return ['new', 'Not imported']; if (f.mtime && h.mtime && f.mtime > h.mtime + 1000) return ['changed', 'Changed since import']; return ['ok', 'Imported ' + (h.at || '').slice(0, 10)]; }
function drawFolders() {
  const box = $('#impFolders'); if (!box || !Imp.folders) return;
  box.innerHTML = Imp.folders.map(F => `<div class="card"><div class="chead"><div><h2>${esc(F.label)}</h2><p class="sub"><code>${esc(F.path)}</code>${F.exists ? ` · ${F.files.length} data files` : ' · <b>folder not found</b>'}</p></div>
    <div class="ctrls"><button class="btn small primary" data-sync="${F.id}">Import new and changed</button><button class="btn small" data-refresh="1">Refresh</button><button class="btn small danger" data-unlink="${F.id}">Unlink</button></div></div>
    <div class="tbl"><table><thead><tr><th class="txt">File</th><th>Size</th><th>Modified</th><th class="txt">Status</th><th></th></tr></thead><tbody>
    ${F.files.map(f => { const id = 'folder:' + F.path + '/' + f.rel, [st, lab] = fileStatus(id, f); return `<tr><td class="txt">${esc(f.rel)}</td><td class="num">${fmt(f.size / 1024, 0)} KB</td><td>${esc(new Date(f.mtime).toISOString().slice(0, 16).replace('T', ' '))}</td><td class="txt"><span class="chip ${st === 'ok' ? 'up' : st === 'changed' ? 'dn' : 'nt'}">${esc(lab)}</span></td><td><button class="btn small" data-open="${F.id}" data-rel="${esc(f.rel)}">Open</button></td></tr>`; }).join('') || '<tr><td class="txt" colspan="5">No CSV, Excel or JSON files in this folder.</td></tr>'}
    </tbody></table></div></div>`).join('');
  box.querySelectorAll('[data-open]').forEach(b => b.onclick = async () => { const F = Imp.folders[+b.dataset.open], f = F.files.find(x => x.rel === b.dataset.rel); b.disabled = true;
    const buf = await (await fetch(`api/folder-file?id=${F.id}&rel=${encodeURIComponent(f.rel)}`)).arrayBuffer(); await handleFiles([{buf, name: f.rel.split('/').pop(), mtime: f.mtime, size: f.size, id: 'folder:' + F.path + '/' + f.rel}]); b.disabled = false; $('#impPending').scrollIntoView({behavior: 'smooth'}); });
  box.querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => { b.disabled = true; const n = await syncFolder(Imp.folders[+b.dataset.sync], false); b.disabled = false; drawFolders(); drawHistory(); drawPending(); if (!n.done && !n.review) toast('Everything in this folder is already up to date.'); });
  box.querySelectorAll('[data-refresh]').forEach(b => b.onclick = () => loadFolders());
  box.querySelectorAll('[data-unlink]').forEach(b => b.onclick = async () => { const F = Imp.folders[+b.dataset.unlink];
    if (!(await confirmBox('Unlink this folder?', `<code>${esc(F.path)}</code> will no longer be listed. Your files and imported data stay as they are.`, 'Unlink'))) return;
    await fetch('api/folders/remove', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: F.id})}); loadFolders(); });
}
async function syncFolder(F, silent) {
  let done = 0, review = 0, rows = 0;
  for (const f of F.files) { const id = 'folder:' + F.path + '/' + f.rel, [st] = fileStatus(id, f); if (st === 'ok') continue;
    try { const buf = await (await fetch(`api/folder-file?id=${F.id}&rel=${encodeURIComponent(f.rel)}`)).arrayBuffer(), sheets = await parseFileBuffer(f.rel, buf);
      for (const sh of sheets) { const plan = detect(f.rel.split('/').pop(), sh, f.mtime);
        if (['ohlc', 'fund', 'dataset'].includes(plan.kind)) { const r = await applyPlan(plan, id + (sheets.length > 1 ? '#' + sh.sheet : ''), {name: f.rel, mtime: f.mtime, size: f.size}, true); rows += r.added + r.updated; done++; }
        else if (!silent) { Imp.pending.push({buf, name: f.rel.split('/').pop(), mtime: f.mtime, size: f.size, id, sheet: sh.sheet, sheets: sheets.length, plan, uid: Math.random().toString(36).slice(2)}); review++; } }
    } catch (e) { if (!silent) toast(`${f.rel}: ${e.message}`); } }
  if (done || review) toast(`${F.label}: ${done} file${done === 1 ? '' : 's'} imported (${rows} rows)${review ? `, ${review} need column matching below` : ''}`);
  return {done, review};
}
async function autoSyncFolders() {
  if (Store.mode !== 'server' || !Store.db.settings?.autoSync) return;
  try { const r = await (await fetch('api/folders', {cache: 'no-store'})).json(); for (const F of r.folders || []) if (F.exists) await syncFolder(F, true); } catch (e) {}
}
/* browser folder picker (File System Access API) */
async function pickBrowserDir() {
  try { Imp.browserDir = await window.showDirectoryPicker({mode: 'read'}); } catch (e) { return; }
  Imp.browserFiles = []; const walk = async (dir, pre, depth) => { for await (const [name, h] of dir.entries()) { if (h.kind === 'directory' && depth < 2 && !name.startsWith('.')) await walk(h, pre + name + '/', depth + 1); else if (h.kind === 'file' && /\.(csv|xlsx|xls|xlsm|json|txt|tsv)$/i.test(name) && !name.startsWith('~$')) { const f = await h.getFile(); Imp.browserFiles.push({rel: pre + name, f}); } } };
  await walk(Imp.browserDir, '', 0); drawBrowserDir();
}
function drawBrowserDir() {
  const box = $('#impFolders'); if (!box) return; const name = Imp.browserDir?.name || 'Folder';
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<div class="chead"><div><h2>${esc(name)} <span class="pill">browser</span></h2><p class="sub">${Imp.browserFiles.length} data files</p></div><div class="ctrls"><button class="btn small primary" id="bdAll">Open all</button></div></div>
    <div class="tbl"><table><tbody>${Imp.browserFiles.map((x, i) => { const [st, lab] = fileStatus('browser:' + name + '/' + x.rel, {mtime: x.f.lastModified}); return `<tr><td class="txt">${esc(x.rel)}</td><td class="num">${fmt(x.f.size / 1024, 0)} KB</td><td class="txt"><span class="chip ${st === 'ok' ? 'up' : st === 'changed' ? 'dn' : 'nt'}">${esc(lab)}</span></td><td><button class="btn small" data-bf="${i}">Open</button></td></tr>`; }).join('')}</tbody></table></div>`;
  box.prepend(card);
  const open = xs => handleFiles(xs.map(x => ({f: x.f, name: x.rel.split('/').pop(), mtime: x.f.lastModified, size: x.f.size, id: 'browser:' + name + '/' + x.rel})));
  card.querySelectorAll('[data-bf]').forEach(b => b.onclick = () => open([Imp.browserFiles[+b.dataset.bf]]));
  card.querySelector('#bdAll').onclick = () => open(Imp.browserFiles);
}
