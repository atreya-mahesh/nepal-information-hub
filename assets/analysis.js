/* Research lab › Data analysis: a step-by-step econometrics and forecasting workbench.
   1 Data (time series / cross-section / panel, from any dataset or an uploaded file) → 2 Clean → 3 New variables
   → 4 Model (OLS with assumption tests, ARIMA family, VAR family, panel FE/RE, ML, Prophet-style, TimesFM, distributions)
   → 5 Compare. Uses ST, TS, ML, QC. Loaded before app.js; defines functions only. */
'use strict';

const AN = {type: 'ts', step: 'data', freq: 'fym', vars: [], cs: {ds: 'stock_fundamentals', period: '', cols: []}, pn: {ds: 'stock_sector_index', cols: [], from: '', to: ''},
  up: null, tbl: null, hist: [], log: [], sel: [], goal: 'impact', fam: 'ols', m: {}, compare: [], busy: false, lastRes: null};
const AN_STEPS = [['data', 'Data'], ['clean', 'Clean'], ['vars', 'New variables'], ['model', 'Model'], ['compare', 'Compare models']];
const AN_TYPES = [['ts', 'Time series'], ['cs', 'Cross-sectional'], ['panel', 'Panel']];
const anFmt = (v, d = 4) => isNum(v) ? (Math.abs(v) >= 1e5 ? fmt(v, 0) : Math.abs(v) >= 100 ? fmt(v, 2) : fmt(v, d)) : '–';
const anP = p => !isNum(p) ? '–' : p < 0.001 ? '<0.001' : fmt(p, 3);
const anStar = p => !isNum(p) ? '' : p < 0.01 ? '***' : p < 0.05 ? '**' : p < 0.1 ? '*' : '';
const anVerdict = (good, txt) => `<span class="${good === null ? 'warnc' : good ? 'okc' : 'badc'}">${good === null ? '?' : good ? '✓' : '✗'} ${txt}</span>`;
const anVals = v => AN.tbl.rows.map(r => r[v]);
const anNum = () => AN.tbl ? AN.tbl.cols.filter(c => AN.tbl.rows.some(r => isNum(r[c]))) : [];
function anRedraw() { if (AN.lastRes) AN.lastRes(); }

function renderAnalysis() {
  const p = $('#p-analysis');
  p.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Data analysis</h2><p class="sub">Econometrics and forecasting in five steps. Pick the data type, clean it, build variables, then estimate, test assumptions and forecast.</p></div>
      <div class="ctrls"><div class="seg" id="anType">${AN_TYPES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${AN.type === v}">${l}</button>`).join('')}</div></div></div>
    <div class="steps" id="anSteps" role="tablist">${AN_STEPS.map(([k, l]) => `<button data-s="${k}" aria-selected="${AN.step === k}" ${k !== 'data' && !AN.tbl ? 'disabled' : ''}>${l}</button>`).join('')}</div>
    <div id="anStatus" class="readout" style="margin-top:8px"></div></div>
  <div id="anBody" style="display:grid;gap:18px"></div>`;
  seg('#anType', v => { if (v === AN.type) return; AN.type = v; AN.tbl = null; AN.hist = []; AN.log = []; AN.step = 'data'; AN.fam = v === 'panel' ? 'panel' : 'ols'; AN.m = {}; renderAnalysis(); });
  $('#anSteps').onclick = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; AN.step = b.dataset.s; renderAnalysis(); };
  anStatus();
  ({data: anData, clean: anClean, vars: anNewVars, model: anModel, compare: anCompare})[AN.step]();
}
function anStatus() { const el = $('#anStatus'); if (!el) return; if (!AN.tbl) { el.innerHTML = '<span>No data loaded yet.</span>'; return; }
  const t = AN.tbl; el.innerHTML = `<span>Type <b>${AN_TYPES.find(x => x[0] === AN.type)[1]}</b></span><span>Rows <b>${t.rows.length}</b></span><span>Variables <b>${t.cols.length}</b></span>${AN.type === 'ts' ? `<span>Frequency <b>${FREQS.find(f => f[0] === t.freq)?.[1] || t.freq}</b></span><span>From <b>${esc(anLbl(t.rows[0]))}</b> to <b>${esc(anLbl(last(t.rows)))}</b></span>` : ''}${AN.type === 'panel' ? `<span>Units <b>${uniq(t.rows.map(r => r._u)).length}</b></span><span>Periods <b>${uniq(t.rows.map(r => r._t)).length}</b></span>` : ''}<span>Missing cells <b>${t.rows.reduce((s, r) => s + t.cols.filter(c => !isNum(r[c])).length, 0)}</b></span><span>Steps applied <b>${AN.log.length}</b></span>`; }
const anLbl = r => AN.type === 'ts' ? alignLabel(AN.tbl.freq, r._t) : AN.type === 'panel' ? r._u + ' · ' + r._t : r._u;

/* ======================= 1. DATA ======================= */
function anData() {
  const b = $('#anBody'), dsOk = f => allDs().filter(f), tsList = dsOk(d => freqOf(d) && numCols(d).length && d.rows.length);
  const csList = dsOk(d => (catKeys(d).length || d.period === 'snapshot') && numCols(d).length && d.rows.length), pnList = dsOk(d => catKeys(d).length && freqOf(d) && numCols(d).length && d.rows.length);
  const dsSel = (list, sel) => list.map(d => `<option value="${esc(d.id)}" ${d.id === sel ? 'selected' : ''}>${esc(d.title)}</option>`).join('');
  let inner = '';
  if (AN.type === 'ts') {
    if (!AN.vars.length) AN.vars = [{name: 'NEPSE', ds: 'stock_ohlc', cat: 'NEPSE', col: 'close'}, {name: 'BANKING', ds: 'stock_ohlc', cat: 'BANKING', col: 'close'}, {name: 'NABIL', ds: 'stock_ohlc', cat: 'NABIL', col: 'close'}];
    inner = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div class="f"><label for="anFreq">Frequency</label><select id="anFreq">${FREQS.map(([v, l]) => `<option value="${v}" ${v === AN.freq ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f"><label for="anAgg">Daily data to month/year</label><select id="anAgg"><option value="last">Last value</option><option value="mean">Average</option><option value="sum">Total</option></select></div></div>
      <p class="sub">Daily series can be used in monthly or annual models: they are converted with the rule above (Nepali months end around the 15th, as in NRB tables).</p>
      <div id="anVarRows" style="display:grid;gap:8px"></div><div class="actions"><button class="btn small" id="anAddVar">+ Add variable</button></div>`;
  } else if (AN.type === 'cs') {
    const d = ds(AN.cs.ds) || csList[0]; if (d) AN.cs.ds = d.id; const per = d ? uniq(d.rows.map(r => plabel(d, r))) : []; if (!per.includes(AN.cs.period)) AN.cs.period = last(per) || '';
    inner = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class="f"><label for="anCsDs">Dataset (one row per company / sector / item)</label><select id="anCsDs">${dsSel(csList, AN.cs.ds)}</select></div>
      <div class="f"><label for="anCsPer">Period</label><select id="anCsPer">${per.map(x => `<option ${x === AN.cs.period ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
      <div class="sub">Variables</div><div>${d ? numCols(d).map(c => `<label class="vchk"><input type="checkbox" data-cc="${esc(c.k)}" ${!AN.cs.cols.length || AN.cs.cols.includes(c.k) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('') : ''}</div>`;
  } else {
    const d = ds(AN.pn.ds) || pnList[0]; if (d) AN.pn.ds = d.id;
    inner = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class="f"><label for="anPnDs">Dataset (units × periods)</label><select id="anPnDs">${dsSel(pnList, AN.pn.ds)}</select></div>
      <div class="f"><label for="anPnFrom">From (optional)</label><input id="anPnFrom" value="${esc(AN.pn.from)}" placeholder="e.g. 2015/16 or 2024-01-01"></div><div class="f"><label for="anPnTo">To (optional)</label><input id="anPnTo" value="${esc(AN.pn.to)}"></div></div>
      <div class="sub">Variables</div><div>${d ? numCols(d).map(c => `<label class="vchk"><input type="checkbox" data-pc="${esc(c.k)}" ${!AN.pn.cols.length || AN.pn.cols.includes(c.k) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('') : ''}</div>
      <p class="sub">Panel rows are unit × period (for example sector × fiscal year, or symbol × date in daily prices).</p>`;
  }
  b.innerHTML = `<div class="card wide"><h2>1. Choose data</h2>
    <div class="grid2"><div>${inner}<div class="actions"><button class="btn primary" id="anLoad">Load data</button><span id="anMsg"></span></div></div>
    <div><h3>…or upload a file</h3><label class="drop" for="anFile"><b>Drop a CSV / Excel file</b> or click to choose<input id="anFile" type="file" accept=".csv,.xlsx,.xls,.txt,.tsv,.json" hidden></label><div id="anUp"></div></div></div></div>
  <div id="anPreview"></div>`;
  if (AN.type === 'ts') { $('#anFreq').onchange = e => { AN.freq = e.target.value; drawAnVars(); }; $('#anAgg').value = AN.agg || 'last'; $('#anAgg').onchange = e => AN.agg = e.target.value; $('#anAddVar').onclick = () => { AN.vars.push({name: 'X' + (AN.vars.length + 1), ds: 'smi', cat: '', col: ''}); drawAnVars(); }; drawAnVars(); }
  if (AN.type === 'cs') { $('#anCsDs').onchange = e => { AN.cs.ds = e.target.value; AN.cs.cols = []; anData(); }; $('#anCsPer').onchange = e => AN.cs.period = e.target.value; }
  if (AN.type === 'panel') { $('#anPnDs').onchange = e => { AN.pn.ds = e.target.value; AN.pn.cols = []; anData(); }; $('#anPnFrom').onchange = e => AN.pn.from = e.target.value.trim(); $('#anPnTo').onchange = e => AN.pn.to = e.target.value.trim(); }
  $('#anLoad').onclick = () => { try { anLoad(); msg('#anMsg', 'Loaded.', 'ok'); anStatus(); renderAnalysis(); } catch (e) { msg('#anMsg', e.message, 'err'); } };
  $('#anFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const sh = await parseFileBuffer(f.name, await f.arrayBuffer()); AN.up = {name: f.name, sheets: sh.filter(s => s.aoa)}; drawAnUpload(); } catch (er) { $('#anUp').innerHTML = `<p class="msg err">${esc(er.message)}</p>`; } };
  if (AN.up) drawAnUpload();
  if (AN.tbl) anPreview();
}
function drawAnVars() {
  const box = $('#anVarRows'); if (!box) return;
  const okDs = d => { const f = freqOf(d); if (!f || !numCols(d).length) return false; if (f === AN.freq) return true; return f === 'day' && ['fym', 'ym', 'fy', 'year'].includes(AN.freq) || f === 'fym' && AN.freq === 'fy'; };
  box.innerHTML = AN.vars.map((v, i) => { const d = ds(v.ds), cats = d ? catOptions(d) : []; if (cats.length && !cats.includes(v.cat)) v.cat = cats[0]; if (d && !numCols(d).some(c => c.k === v.col)) v.col = (numCols(d).find(c => c.k === 'close') || numCols(d)[0])?.k;
    return `<div class="series-row anv" data-i="${i}" style="grid-template-columns:110px minmax(160px,1.4fr) minmax(110px,1fr) minmax(130px,1fr) 28px"><input data-f="name" value="${esc(v.name)}" class="mono" aria-label="Name">
      <select data-f="ds">${uniq(allDs().map(x => x.group)).map(g => { const l = allDs().filter(x => x.group === g && okDs(x)); return l.length ? `<optgroup label="${esc(g)}">${l.map(x => `<option value="${esc(x.id)}" ${x.id === v.ds ? 'selected' : ''}>${esc(x.title)}${freqOf(x) !== AN.freq ? ' (converted)' : ''}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
      ${cats.length ? `<select data-f="cat">${cats.map(c => `<option ${c === v.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : '<span class="sub">–</span>'}
      <select data-f="col">${d ? numCols(d).map(c => `<option value="${esc(c.k)}" ${c.k === v.col ? 'selected' : ''}>${esc(c.label)}</option>`).join('') : ''}</select><button class="btn small" data-rm="${i}" aria-label="Remove">×</button></div>`; }).join('');
  box.querySelectorAll('.anv input, .anv select').forEach(el => el.onchange = () => { const i = +el.closest('.anv').dataset.i, f = el.dataset.f; AN.vars[i][f] = f === 'name' ? el.value.trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') : el.value; if (f === 'ds') { AN.vars[i].cat = ''; AN.vars[i].col = ''; } drawAnVars(); });
  box.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { AN.vars.splice(+x.dataset.rm, 1); drawAnVars(); });
}
function anDayKey(dateStr, freq) { if (freq === 'day') return dateStr; if (freq === 'ym') return dateStr.slice(0, 4) + '|' + String(+dateStr.slice(5, 7) - 1).padStart(2, '0'); const fym = dateToFym(dateStr); if (freq === 'fym') return fym; if (freq === 'fy') return fym.split('|')[0]; if (freq === 'year') return dateStr.slice(0, 4); return null; }
function anLoad() {
  if (AN.type === 'ts') {
    const names = AN.vars.map(v => v.name); if (!names.length) throw new Error('Add at least one variable.'); if (uniq(names).length < names.length) throw new Error('Two variables have the same name.');
    const maps = AN.vars.map(v => { const d = ds(v.ds), f = freqOf(d), m = new Map(), rows = d.rows.filter(r => (!catKeys(d).length || catLabel(d, r) === v.cat) && isNum(r[v.col]));
      if (f === AN.freq) rows.forEach(r => m.set(alignKey(d, r), r[v.col]));
      else { const g = new Map(), dk = periodKeys(d)[0]; rows.slice().sort((a, c) => sortKey(d, a) < sortKey(d, c) ? -1 : 1).forEach(r => { const k = f === 'day' ? anDayKey(r[dk], AN.freq) : alignKey(d, r).split('|')[0]; if (!k) return; if (!g.has(k)) g.set(k, []); g.get(k).push(r[v.col]); });
        g.forEach((a, k) => m.set(k, AN.agg === 'mean' ? a.reduce((s, x) => s + x, 0) / a.length : AN.agg === 'sum' ? a.reduce((s, x) => s + x, 0) : a[a.length - 1])); }
      if (!m.size) throw new Error(`${v.name} has no values.`); return m; });
    let keys = uniq(maps.flatMap(m => [...m.keys()])).sort();
    // keep the span where at least one variable is observed; trim leading/trailing rows where the first variable is missing for daily data
    if (AN.freq === 'day') { const k0 = [...maps[0].keys()].sort(); keys = keys.filter(k => k >= k0[0] && k <= last(k0) && maps[0].has(k)); }
    AN.tbl = {freq: AN.freq, cols: names.slice(), rows: keys.map(k => { const r = {_t: k}; AN.vars.forEach((v, i) => r[v.name] = maps[i].has(k) ? maps[i].get(k) : null); return r; })};
  } else if (AN.type === 'cs') {
    const d = ds(AN.cs.ds), cols = [...document.querySelectorAll('[data-cc]:checked')].map(x => x.dataset.cc); if (!cols.length) throw new Error('Tick at least one variable.'); AN.cs.cols = cols;
    const rows = d.rows.filter(r => plabel(d, r) === AN.cs.period), tbl = rows.map(r => { const o = {_u: catLabel(d, r) || plabel(d, r)}; cols.forEach(c => o[anCol(d, c)] = isNum(r[c]) ? r[c] : null); return o; });
    if (tbl.length < 5) throw new Error('Fewer than 5 units in that period.'); AN.tbl = {cols: cols.map(c => anCol(d, c)), rows: tbl};
  } else {
    const d = ds(AN.pn.ds), cols = [...document.querySelectorAll('[data-pc]:checked')].map(x => x.dataset.pc); if (!cols.length) throw new Error('Tick at least one variable.'); AN.pn.cols = cols;
    let rows = d.rows.filter(r => { const k = alignKey(d, r); return (!AN.pn.from || k >= AN.pn.from) && (!AN.pn.to || k <= AN.pn.to); });
    if (rows.length > 60000) throw new Error(`That is ${rows.length} rows. Narrow the period with From / To.`);
    const seen = new Set(); AN.tbl = {freq: freqOf(d), cols: cols.map(c => anCol(d, c)), rows: rows.map(r => { const o = {_u: catLabel(d, r), _t: alignKey(d, r)}; cols.forEach(c => o[anCol(d, c)] = isNum(r[c]) ? r[c] : null); return o; }).filter(o => { const k = o._u + '|' + o._t; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, c) => a._u === c._u ? (a._t < c._t ? -1 : 1) : (a._u < c._u ? -1 : 1))};
  }
  AN.hist = []; AN.log = [`Loaded ${AN.tbl.rows.length} rows`]; AN.sel = AN.tbl.cols.slice();
}
const anCol = (d, k) => (d.cols.find(c => c.k === k)?.label || k).replace(/\(.*?\)/g, '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1').slice(0, 24) || k;
function drawAnUpload() {
  const u = AN.up, box = $('#anUp'); const sh = u.sheets[u.si || 0], hdr = (sh.aoa[0] || []).map((h, i) => String(h ?? 'col' + (i + 1)));
  box.innerHTML = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:8px">${u.sheets.length > 1 ? `<div class="f"><label for="anSh">Sheet</label><select id="anSh">${u.sheets.map((s, i) => `<option value="${i}" ${i === (u.si || 0) ? 'selected' : ''}>${esc(s.sheet)}</option>`).join('')}</select></div>` : ''}
    ${AN.type !== 'cs' ? `<div class="f"><label for="anUt">Time / date column</label><select id="anUt">${hdr.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('')}</select></div>` : ''}
    ${AN.type !== 'ts' ? `<div class="f"><label for="anUu">Unit / name column</label><select id="anUu">${hdr.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('')}</select></div>` : ''}</div>
    <div class="actions"><button class="btn accent" id="anUpGo">Use ${esc(u.name)}</button><span id="anUpMsg"></span></div>`;
  if ($('#anSh')) $('#anSh').onchange = e => { u.si = +e.target.value; drawAnUpload(); };
  if (AN.type === 'panel' && $('#anUt')) $('#anUt').value = String(Math.min(1, hdr.length - 1));
  $('#anUpGo').onclick = () => { try {
    const it = $('#anUt') ? +$('#anUt').value : -1, iu = $('#anUu') ? +$('#anUu').value : -1, body = sh.aoa.slice(1), numericIdx = hdr.map((_, j) => j).filter(j => j !== it && j !== iu && body.filter(r => r[j] != null && r[j] !== '').every(r => isNum(cellNum(r[j]))) && body.some(r => isNum(cellNum(r[j]))));
    if (!numericIdx.length) throw new Error('No numeric columns found.');
    const names = numericIdx.map(j => hdr[j].replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1').slice(0, 24) || 'v' + j);
    const tKey = v => { const dd = cellDate(v); if (dd) return dd; return String(v ?? '').trim(); };
    let rows = body.map(r => { const o = {}; if (it >= 0) o._t = tKey(r[it]); if (iu >= 0) o._u = String(r[iu] ?? '').trim(); numericIdx.forEach((j, k) => { const v = cellNum(r[j]); o[names[k]] = isNum(v) ? v : null; }); return o; }).filter(o => (it < 0 || o._t) && (iu < 0 || o._u));
    rows.sort((a, c) => ((a._u || '') + '|' + (a._t || '')) < ((c._u || '') + '|' + (c._t || '')) ? -1 : 1);
    const fr = AN.type === 'cs' ? null : (rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r._t)) ? 'day' : rows.every(r => /^\d{4}\/\d{2}$/.test(r._t)) ? 'fy' : rows.every(r => /^\d{4}$/.test(r._t)) ? 'year' : 'q');
    AN.tbl = {freq: fr, cols: names, rows, file: u.name}; AN.hist = []; AN.log = [`Loaded ${rows.length} rows from ${u.name}`]; AN.sel = names.slice(); renderAnalysis();
  } catch (er) { msg('#anUpMsg', er.message, 'err'); } };
}
function anPreview() {
  const t = AN.tbl, b = $('#anPreview'), nc = anNum(), st = nc.map(c => { const v = anVals(c).filter(isNum); return {c, n: v.length, miss: t.rows.length - v.length, mean: v.length ? ST.mean(v) : null, sd: v.length > 1 ? ST.sd(v) : null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, sk: v.length > 2 ? ST.skew(v) : null, ku: v.length > 3 ? ST.kurt(v) - 3 : null}; });
  const head = ['Period / unit', ...t.cols];
  b.innerHTML = `<div class="card wide"><h2>Variables</h2><div class="tbl scroll"><table><thead><tr><th class="txt">Variable</th><th>N</th><th>Missing</th><th>Mean</th><th>Std. dev.</th><th>Min</th><th>Max</th><th>Skew</th><th>Excess kurtosis</th></tr></thead><tbody>${st.map(s => `<tr><td class="txt mono">${esc(s.c)}</td><td class="num">${s.n}</td><td class="num ${s.miss ? 'neg' : ''}">${s.miss}</td><td class="num">${anFmt(s.mean)}</td><td class="num">${anFmt(s.sd)}</td><td class="num">${anFmt(s.min)}</td><td class="num">${anFmt(s.max)}</td><td class="num">${anFmt(s.sk, 2)}</td><td class="num">${anFmt(s.ku, 2)}</td></tr>`).join('')}</tbody></table></div>
    ${nc.length > 1 && nc.length <= 14 ? `<h3>Correlations</h3><div class="tbl scroll"><table><thead><tr><th></th>${nc.map(c => `<th class="mono">${esc(c)}</th>`).join('')}</tr></thead><tbody>${nc.map(a => `<tr><td class="txt mono">${esc(a)}</td>${nc.map(c => { const r = QC.corr(anVals(a), anVals(c)); return `<td class="num" style="${isNum(r) && a !== c ? `background:rgba(${r >= 0 ? '42,120,214' : '227,73,72'},${(Math.abs(r) * 0.5).toFixed(2)})` : ''}">${isNum(r) ? fmt(r, 2) : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    <h3>Data (first 200 rows)</h3><div class="tbl scroll" style="max-height:360px"><table><thead><tr>${head.map(h => `<th class="${h === head[0] ? 'txt' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, 200).map(r => `<tr><td class="txt">${esc(anLbl(r))}</td>${t.cols.map(c => `<td class="num ${isNum(r[c]) ? '' : 'neg'}">${isNum(r[c]) ? anFmt(r[c]) : '·'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="actions"><button class="btn small" id="anCsv">Download working data (CSV)</button><button class="btn small accent" id="anSave">Save as dataset</button><button class="btn small" id="anToSem">Send to Factor &amp; SEM</button><button class="btn primary" id="anNext">Next: Clean →</button></div></div>`;
  $('#anCsv').onclick = () => download('analysis-data.csv', [head.map(csvCell).join(','), ...t.rows.map(r => [anLbl(r), ...t.cols.map(c => r[c] ?? '')].map(csvCell).join(','))].join('\n'), 'text/csv');
  $('#anSave').onclick = () => anSaveDataset(); $('#anNext').onclick = () => { AN.step = 'clean'; renderAnalysis(); };
  $('#anToSem').onclick = () => { if (AN.type !== 'ts' || !['day', 'fym'].includes(t.freq)) return toast('Factor & SEM uses daily or monthly time series. Load one of those first.'); SM.external = {freq: t.freq, keys: t.rows.map(r => r._t), vars: Object.fromEntries(t.cols.map(c => [c, anVals(c)]))};
    SM.inds = t.cols.map(c => ({name: c.toLowerCase() === c ? c + '_' : c.toLowerCase(), expr: c})); SM.base = []; SM.preset = ''; SM.efa = {items: SM.inds.map(x => x.name), target: '', k: 'auto', ext: 'pca', rot: 'varimax'}; SM.method = 'efa'; show('sem'); toast('Your working data is in Factor & SEM as indicators.'); };
}
async function anSaveDataset() {
  const t = AN.tbl, name = 'Analysis data ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (AN.type === 'ts') return saveQlDataset(t.freq, t.rows.map(r => r._t), t.cols.map(c => [c, anVals(c)]), 'Analysis data');
  const id = 'u_' + Date.now().toString(36), cols = [{k: 'unit', label: 'Unit', t: 'text', key: true}, ...(AN.type === 'panel' ? [{k: 'period', label: 'Period', t: 'text', key: true}] : []), ...t.cols.map((c, i) => ({k: 'v' + i, label: c, t: 'num'}))];
  Store.db.datasets[id] = {id, title: name, group: 'Your datasets', period: AN.type === 'panel' ? 'year-cat' : 'snapshot', cols: AN.type === 'panel' ? [{k: 'year', label: 'Period', t: 'text', key: true}, {k: 'unit', label: 'Unit', t: 'text', key: true}, ...cols.slice(2)] : [{k: 'period', label: 'Period', t: 'text', key: true}, ...cols], keys: AN.type === 'panel' ? ['year', 'unit'] : ['period', 'unit'], custom: true, source: 'Data analysis', unit: '',
    rows: t.rows.map(r => { const o = AN.type === 'panel' ? {year: r._t, unit: r._u} : {period: 'analysis', unit: r._u}; t.cols.forEach((c, i) => o['v' + i] = r[c]); return o; })};
  logChange('Saved analysis data', id, name); await persist(true); afterDataChange(); toast('Saved as “' + name + '” under Your datasets.');
}

/* ======================= 2. CLEAN ======================= */
const AN_CLEAN = [['dropRows', 'Drop rows with a missing value', 'Listwise deletion over the ticked variables'], ['dropCols', 'Drop the ticked columns', ''], ['dropSparse', 'Drop columns with too many gaps', 'Removes variables whose share of missing values is above the threshold'],
  ['mean', 'Fill with the average', 'Mean of the variable (within each unit for panel data)'], ['median', 'Fill with the median', 'Robust to outliers'], ['next', 'Fill with the next value (next latest)', 'Back-fill: carries the following observation backwards'],
  ['prev', 'Fill with the previous value (old latest)', 'Forward-fill: carries the last observation forward (LOCF)'], ['interp', 'Linear interpolation', 'Straight line between known neighbours'], ['zero', 'Fill with zero', ''], ['const', 'Fill with a constant', ''],
  ['seasonal', 'Fill with the same season last year', 'Value 12 months (or s periods) earlier'], ['winsor', 'Winsorise outliers', 'Caps values at the chosen lower and upper percentiles'], ['zout', 'Blank out extreme outliers', 'Sets |z| above the limit to missing (then fill them)'],
  ['dedupe', 'Remove duplicate rows', 'Same period / unit'], ['range', 'Keep a period range', 'Drop rows outside From–To']];
function anClean() {
  const b = $('#anBody'), t = AN.tbl;
  b.innerHTML = `<div class="card wide"><h2>2. Clean the data</h2><p class="sub">Tick the variables to act on, pick a method and apply. Every step can be undone.</p>
    <div id="anSel">${t.cols.map(c => { const m = t.rows.filter(r => !isNum(r[c])).length; return `<label class="vchk"><input type="checkbox" value="${esc(c)}" ${AN.sel.includes(c) ? 'checked' : ''}> ${esc(c)} <span class="sub">${m ? m + ' missing' : ''}</span></label>`; }).join('')} <button class="btn small" id="anAll">All</button> <button class="btn small" id="anNone">None</button></div>
    <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:10px"><div class="f" style="grid-column:span 2"><label for="anOp">Method</label><select id="anOp">${AN_CLEAN.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
      <div class="f"><label for="anP1">Parameter</label><input id="anP1" placeholder="see note"></div><div class="f"><label for="anP2">Second parameter</label><input id="anP2"></div></div>
    <p class="sub" id="anOpNote"></p><div class="actions"><button class="btn primary" id="anApply">Apply</button><button class="btn" id="anUndo" ${AN.hist.length ? '' : 'disabled'}>Undo last step</button><span id="anCMsg"></span></div>
    <h3>Steps applied</h3><ol class="sub">${AN.log.map(l => `<li>${esc(l)}</li>`).join('')}</ol></div><div id="anPreview"></div>`;
  const note = () => { const k = $('#anOp').value, x = AN_CLEAN.find(c => c[0] === k); const extra = {dropSparse: 'Parameter: maximum missing share in % (default 30).', const: 'Parameter: the value to use.', winsor: 'Parameters: lower and upper percentile (default 1 and 99).', zout: 'Parameter: z limit (default 3).', range: 'Parameters: From and To (period labels as shown, e.g. 2020-01-01 or 2018/19).', seasonal: 'Parameter: season length (default 12 for months, 4 for quarters, 5 for trading weeks).'}[k] || ''; $('#anOpNote').textContent = (x[2] ? x[2] + '. ' : '') + extra; };
  $('#anOp').onchange = note; note();
  $('#anSel').onchange = () => AN.sel = [...$('#anSel').querySelectorAll('input:checked')].map(x => x.value);
  $('#anAll').onclick = () => { AN.sel = t.cols.slice(); anClean(); }; $('#anNone').onclick = () => { AN.sel = []; anClean(); };
  $('#anApply').onclick = () => { try { const n = anApplyClean($('#anOp').value, $('#anP1').value.trim(), $('#anP2').value.trim()); anStatus(); anClean(); msg('#anCMsg', n, 'ok'); } catch (e) { msg('#anCMsg', e.message, 'err'); } };
  $('#anUndo').onclick = () => { const h = AN.hist.pop(); if (h) { AN.tbl = h.tbl; AN.log = h.log; } anStatus(); anClean(); };
  anPreview();
}
function anGroups() { const t = AN.tbl; if (AN.type !== 'panel') return [t.rows]; const g = new Map(); t.rows.forEach(r => { if (!g.has(r._u)) g.set(r._u, []); g.get(r._u).push(r); }); return [...g.values()]; }
function anApplyClean(op, p1, p2) {
  const sel = AN.sel.filter(c => AN.tbl.cols.includes(c)); if (!sel.length && !['dedupe', 'range', 'dropSparse'].includes(op)) throw new Error('Tick at least one variable.');
  AN.hist.push({tbl: JSON.parse(JSON.stringify(AN.tbl)), log: AN.log.slice()}); if (AN.hist.length > 30) AN.hist.shift();
  const t = AN.tbl, before = t.rows.length; let changed = 0, label = AN_CLEAN.find(c => c[0] === op)[1];
  const fill = (rows, c, f) => rows.forEach((r, i) => { if (!isNum(r[c])) { const v = f(rows, i); if (isNum(v)) { r[c] = v; changed++; } } });
  if (op === 'dropRows') t.rows = t.rows.filter(r => sel.every(c => isNum(r[c])));
  else if (op === 'dropCols') { t.cols = t.cols.filter(c => !sel.includes(c)); t.rows.forEach(r => sel.forEach(c => delete r[c])); }
  else if (op === 'dropSparse') { const lim = (parseFloat(p1) || 30) / 100, drop = t.cols.filter(c => t.rows.filter(r => !isNum(r[c])).length / t.rows.length > lim); t.cols = t.cols.filter(c => !drop.includes(c)); label += ` (> ${lim * 100}%: ${drop.join(', ') || 'none'})`; }
  else if (op === 'dedupe') { const s = new Set(); t.rows = t.rows.filter(r => { const k = (r._u || '') + '|' + (r._t || ''); if (s.has(k)) return false; s.add(k); return true; }); }
  else if (op === 'range') { t.rows = t.rows.filter(r => { const k = r._t ?? r._u; return (!p1 || k >= p1) && (!p2 || k <= p2); }); label += ` ${p1 || '…'} to ${p2 || '…'}`; }
  else for (const g of anGroups()) for (const c of sel) {
    const v = g.map(r => r[c]).filter(isNum); if (!v.length && !['zero', 'const'].includes(op)) continue;
    if (op === 'mean') { const m = ST.mean(v); fill(g, c, () => m); } else if (op === 'median') { const m = ST.median(v); fill(g, c, () => m); }
    else if (op === 'zero') fill(g, c, () => 0); else if (op === 'const') { const k = parseFloat(p1); if (!isNum(k)) throw new Error('Type the constant in Parameter.'); fill(g, c, () => k); }
    else if (op === 'prev') { let lastV = null; g.forEach(r => { if (isNum(r[c])) lastV = r[c]; else if (isNum(lastV)) { r[c] = lastV; changed++; } }); }
    else if (op === 'next') { let nx = null; for (let i = g.length - 1; i >= 0; i--) { if (isNum(g[i][c])) nx = g[i][c]; else if (isNum(nx)) { g[i][c] = nx; changed++; } } }
    else if (op === 'interp') { const idx = g.map((r, i) => isNum(r[c]) ? i : -1).filter(i => i >= 0); for (let k = 0; k < idx.length - 1; k++) { const a = idx[k], b2 = idx[k + 1]; for (let i = a + 1; i < b2; i++) { g[i][c] = g[a][c] + (g[b2][c] - g[a][c]) * (i - a) / (b2 - a); changed++; } } }
    else if (op === 'seasonal') { const s = parseInt(p1, 10) || (AN.tbl.freq === 'q' ? 4 : AN.tbl.freq === 'day' ? 5 : 12); g.forEach((r, i) => { if (!isNum(r[c]) && i >= s && isNum(g[i - s][c])) { r[c] = g[i - s][c]; changed++; } }); }
    else if (op === 'winsor') { const lo = ST.quantile(v, (parseFloat(p1) || 1) / 100), hi = ST.quantile(v, (parseFloat(p2) || 99) / 100); g.forEach(r => { if (isNum(r[c]) && (r[c] < lo || r[c] > hi)) { r[c] = Math.min(hi, Math.max(lo, r[c])); changed++; } }); }
    else if (op === 'zout') { const m = ST.mean(v), s = ST.sd(v), L = parseFloat(p1) || 3; g.forEach(r => { if (isNum(r[c]) && Math.abs((r[c] - m) / s) > L) { r[c] = null; changed++; } }); }
  }
  const msgTxt = op.startsWith('drop') || ['dedupe', 'range'].includes(op) ? `${label}: ${before - t.rows.length} rows removed` : `${label} on ${sel.join(', ')}: ${changed} cells changed`;
  AN.log.push(msgTxt); return msgTxt;
}

/* ======================= 3. NEW VARIABLES ======================= */
const AN_TRANS = [['log', 'Logarithm  ln(x)'], ['d1', 'First difference  Δx'], ['d2', 'Second difference  Δ²x'], ['dlog', 'Continuous change  Δln(x)×100'], ['pct', 'Rate of change  % change'], ['sdiff', 'Seasonal difference  x − x(t−s)'], ['spct', 'Year-on-year % change'], ['lag', 'Lag  x(t−k)'], ['lead', 'Lead  x(t+k)'], ['z', 'Standardise  (x−mean)/sd'], ['ma', 'Moving average (k)'], ['sq', 'Square  x²'], ['inv', 'Inverse  1/x'], ['cum', 'Cumulative sum'], ['rank', 'Rank (0–1)']];
function anNewVars() {
  const b = $('#anBody'), t = AN.tbl, nc = anNum(), isTs = AN.type !== 'cs', sp = t.freq === 'q' ? 4 : t.freq === 'day' ? 5 : 12;
  b.innerHTML = `<div class="grid2">
    <div class="card"><h2>Transform a variable</h2><div class="form" style="grid-template-columns:1fr 1fr"><div class="f"><label for="anTv">Variable</label><select id="anTv">${nc.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      <div class="f"><label for="anTt">Transformation</label><select id="anTt">${AN_TRANS.filter(x => isTs || !['d1', 'd2', 'dlog', 'pct', 'sdiff', 'spct', 'lag', 'lead', 'ma', 'cum'].includes(x[0])).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
      <div class="f"><label for="anTk">k (lag, window or season)</label><input id="anTk" value="1"></div><div class="f"><label for="anTn">New name (optional)</label><input id="anTn" class="mono"></div></div>
      <div class="actions"><button class="btn primary" id="anTGo">Create</button><button class="btn small" id="anTAll">Apply to all ticked below</button><span id="anTMsg"></span></div>
      <div>${nc.map(c => `<label class="vchk"><input type="checkbox" data-tall="${esc(c)}"> ${esc(c)}</label>`).join('')}</div></div>
    <div class="card"><h2>Dummy variables</h2><div class="form" style="grid-template-columns:1fr 1fr"><div class="f"><label for="anDk">Type</label><select id="anDk">
      <option value="cond">Condition (1 when true)</option>${isTs ? `<option value="break">Structural break (1 from a period on)</option><option value="event">Single-period event</option><option value="range">Period window (1 between two periods)</option>${['fym', 'ym', 'day', 'q'].includes(t.freq) ? `<option value="season">Seasonal dummies (${t.freq === 'day' ? 'weekday' : t.freq === 'q' ? 'quarter' : 'month'})</option>` : ''}` : ''}${AN.type !== 'ts' ? '<option value="unit">One dummy per unit</option>' : ''}</select></div>
      <div class="f"><label for="anD1">Condition / period</label><input id="anD1" class="mono" placeholder="e.g. NEPSE > 2500  or  2020-03-22"></div><div class="f"><label for="anD2">End period (window)</label><input id="anD2"></div><div class="f"><label for="anDn">Name</label><input id="anDn" class="mono" placeholder="D_covid"></div></div>
      <div class="actions"><button class="btn primary" id="anDGo">Create dummy</button><span id="anDMsg"></span></div>
      <p class="sub">Seasonal and unit dummies leave out the first category to avoid the dummy-variable trap.</p></div>
    <div class="card wide"><h2>Formula</h2><p class="sub">Any expression in the Quant lab language over the variables above, e.g. <code>spread = log(NABIL) - log(BANKING)</code>, <code>real_rate = RATE - CPI</code>. ${AN.type === 'panel' ? 'Computed within each unit.' : ''}</p>
      <div class="form" style="grid-template-columns:1fr"><div class="f"><input id="anFx" class="mono" placeholder="name = expression"></div></div><div class="actions"><button class="btn primary" id="anFGo">Create</button><span id="anFMsg"></span></div></div></div><div id="anPreview"></div>`;
  const nameOf = (v, k, kk) => ({log: 'ln_' + v, d1: 'd_' + v, d2: 'd2_' + v, dlog: 'dln_' + v, pct: 'pct_' + v, sdiff: 'sd_' + v, spct: 'yoy_' + v, lag: v + '_L' + kk, lead: v + '_F' + kk, z: 'z_' + v, ma: 'ma' + kk + '_' + v, sq: v + '_sq', inv: 'inv_' + v, cum: 'cum_' + v, rank: 'rk_' + v})[k];
  const mk1 = (v, k, kk, nm) => { const name = nm || nameOf(v, k, kk); if (AN.tbl.cols.includes(name)) throw new Error(`${name} already exists.`); anPush(); for (const g of anGroups()) { const x = g.map(r => r[v]), y = anTransform(x, k, kk, sp); g.forEach((r, i) => r[name] = isNum(y[i]) ? y[i] : null); } AN.tbl.cols.push(name); AN.log.push(`New variable ${name}`); return name; };
  $('#anTGo').onclick = () => { try { const nm = mk1($('#anTv').value, $('#anTt').value, parseInt($('#anTk').value, 10) || 1, $('#anTn').value.trim().replace(/[^A-Za-z0-9_]/g, '_')); msg('#anTMsg', 'Created ' + nm, 'ok'); anStatus(); setTimeout(anNewVars, 400); } catch (e) { msg('#anTMsg', e.message, 'err'); } };
  $('#anTAll').onclick = () => { try { const vs = [...document.querySelectorAll('[data-tall]:checked')].map(x => x.dataset.tall); if (!vs.length) throw new Error('Tick variables in the list.'); const out = vs.map(v => mk1(v, $('#anTt').value, parseInt($('#anTk').value, 10) || 1)); msg('#anTMsg', 'Created ' + out.join(', '), 'ok'); anStatus(); setTimeout(anNewVars, 500); } catch (e) { msg('#anTMsg', e.message, 'err'); } };
  $('#anDGo').onclick = () => { try { const k = $('#anDk').value, a = $('#anD1').value.trim(), z = $('#anD2').value.trim(); let nm = $('#anDn').value.trim().replace(/[^A-Za-z0-9_]/g, '_'); anPush(); const T_ = AN.tbl, made = [];
      if (k === 'cond') { if (!a) throw new Error('Type a condition, e.g. NEPSE > 2500'); nm = nm || 'D' + (T_.cols.length + 1); for (const g of anGroups()) { const vars = {}; T_.cols.forEach(c => vars[c] = g.map(r => r[c])); const o = QC.evaluate(QC.parse(a), {n: g.length, t: g.map((_, i) => i), vars, params: {}}); g.forEach((r, i) => { const v = Array.isArray(o) ? o[i] : o; r[nm] = isNum(v) ? (v ? 1 : 0) : null; }); } made.push(nm); }
      else if (k === 'break' || k === 'event' || k === 'range') { if (!a) throw new Error('Type the period exactly as in the data, e.g. 2020-03-22 or 2019/20 or 2020|03.'); const key = anFindKey(a), key2 = k === 'range' ? anFindKey(z || a) : null; nm = nm || (k === 'break' ? 'D_from_' : 'D_') + a.replace(/[^A-Za-z0-9]/g, ''); T_.rows.forEach(r => r[nm] = k === 'break' ? +(r._t >= key) : k === 'event' ? +(r._t === key) : +(r._t >= key && r._t <= key2)); made.push(nm); }
      else if (k === 'season') { const lab = r => { if (T_.freq === 'day') return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(r._t + 'T00:00:00Z').getUTCDay()]; if (T_.freq === 'q') return (String(r._t).match(/Q\d/) || ['Q?'])[0]; const i = +String(r._t).split('|')[1]; return T_.freq === 'fym' ? MON_AUG[i] : MON_CAL[i]; };
        const cats = uniq(T_.rows.map(lab)); cats.slice(1).forEach(cn => { const n2 = 'S_' + cn; T_.rows.forEach(r => r[n2] = +(lab(r) === cn)); made.push(n2); }); }
      else if (k === 'unit') { const us = uniq(T_.rows.map(r => r._u)); if (us.length > 60) throw new Error(`${us.length} units: too many dummies. Use fixed effects in the panel model instead.`); us.slice(1).forEach(u => { const n2 = 'U_' + String(u).replace(/[^A-Za-z0-9]/g, '_').slice(0, 18); T_.rows.forEach(r => r[n2] = +(r._u === u)); made.push(n2); }); }
      made.forEach(m => { if (!T_.cols.includes(m)) T_.cols.push(m); }); AN.log.push('Dummies: ' + made.join(', ')); msg('#anDMsg', 'Created ' + made.join(', '), 'ok'); anStatus(); setTimeout(anNewVars, 500); } catch (e) { AN.hist.pop(); msg('#anDMsg', e.message, 'err'); } };
  $('#anFGo').onclick = () => { try { const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)(.*)$/s.exec($('#anFx').value); if (!m) throw new Error('Write it as name = expression'); const nm = m[1]; if (AN.tbl.cols.includes(nm)) throw new Error(nm + ' already exists.'); anPush();
      for (const g of anGroups()) { const vars = {}; AN.tbl.cols.forEach(c => vars[c] = g.map(r => r[c])); const o = QC.evaluate(QC.parse(m[2]), {n: g.length, t: g.map((_, i) => i), vars, params: {}}); g.forEach((r, i) => { const v = Array.isArray(o) ? o[i] : o; r[nm] = isNum(v) ? v : null; }); }
      AN.tbl.cols.push(nm); AN.log.push('Formula ' + $('#anFx').value.trim()); msg('#anFMsg', 'Created ' + nm, 'ok'); anStatus(); setTimeout(anNewVars, 400); } catch (e) { msg('#anFMsg', e.message, 'err'); } };
  anPreview();
}
function anPush() { AN.hist.push({tbl: JSON.parse(JSON.stringify(AN.tbl)), log: AN.log.slice()}); if (AN.hist.length > 30) AN.hist.shift(); }
function anFindKey(s) { const t = AN.tbl; if (t.rows.some(r => r._t === s)) return s; const hit = t.rows.find(r => alignLabel(t.freq, r._t) === s || alignLabel(t.freq, r._t).toLowerCase() === s.toLowerCase()); if (hit) return hit._t; return s; }
function anTransform(x, k, kk, sp) { const n = x.length, o = new Array(n).fill(null), okv = isNum;
  switch (k) { case 'log': return x.map(v => okv(v) && v > 0 ? Math.log(v) : null); case 'd1': return x.map((v, i) => i >= 1 && okv(v) && okv(x[i - 1]) ? v - x[i - 1] : null);
    case 'd2': { const d = anTransform(x, 'd1'); return anTransform(d, 'd1'); } case 'dlog': return x.map((v, i) => i >= 1 && v > 0 && x[i - 1] > 0 ? Math.log(v / x[i - 1]) * 100 : null);
    case 'pct': return x.map((v, i) => i >= 1 && okv(v) && okv(x[i - 1]) && x[i - 1] !== 0 ? (v / x[i - 1] - 1) * 100 : null); case 'sdiff': { const s = kk > 1 ? kk : sp; return x.map((v, i) => i >= s && okv(v) && okv(x[i - s]) ? v - x[i - s] : null); }
    case 'spct': { const s = kk > 1 ? kk : sp; return x.map((v, i) => i >= s && okv(v) && okv(x[i - s]) && x[i - s] ? (v / x[i - s] - 1) * 100 : null); }
    case 'lag': return x.map((_, i) => i - kk >= 0 && okv(x[i - kk]) ? x[i - kk] : null); case 'lead': return x.map((_, i) => i + kk < n && okv(x[i + kk]) ? x[i + kk] : null);
    case 'z': { const v = x.filter(okv), m = ST.mean(v), s = ST.sd(v); return x.map(a => okv(a) ? (a - m) / s : null); } case 'ma': return QC.sma(x, Math.max(1, kk)); case 'sq': return x.map(v => okv(v) ? v * v : null);
    case 'inv': return x.map(v => okv(v) && v !== 0 ? 1 / v : null); case 'cum': { let s = 0; return x.map(v => okv(v) ? (s += v) : null); }
    case 'rank': { const v = x.map((a, i) => [a, i]).filter(p => okv(p[0])).sort((a, b) => a[0] - b[0]); v.forEach(([, i], r) => o[i] = v.length > 1 ? r / (v.length - 1) : 0.5); return o; }
    case 'level': default: return x.slice(); } }

/* ======================= 4. MODEL ======================= */
const AN_FAMS = {
  ts: [['ols', 'Regression (OLS)'], ['arima', 'AR / MA / ARMA / ARIMA / SARIMA'], ['var', 'VAR / VARMA / VARIMA / SVARIMA'], ['ml', 'LSTM / TCN / XGBoost'], ['prophet', 'Prophet / TimesFM'], ['tests', 'Unit root, ACF & lags'], ['dist', 'Distributions']],
  cs: [['ols', 'Regression (OLS)'], ['xgb', 'XGBoost'], ['dist', 'Distributions']],
  panel: [['panel', 'Pooled / Fixed / Random effects'], ['ols', 'Pooled regression (OLS)'], ['dist', 'Distributions']]};
const AN_TF = [['level', 'Level'], ['d1', 'Δ (first difference)'], ['d2', 'Δ² (second difference)'], ['log', 'log'], ['dlog', 'Δlog ×100 (continuous change)'], ['pct', '% change (rate of change)']];
function anModel() {
  const b = $('#anBody'), fams = AN_FAMS[AN.type]; if (!fams.some(f => f[0] === AN.fam)) AN.fam = fams[0][0];
  b.innerHTML = `<div class="card wide"><h2>4. Model</h2>
    <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))"><div class="f"><label>Goal</label><div class="seg" id="anGoal"><button data-v="impact" aria-pressed="${AN.goal === 'impact'}">Impact (explain)</button><button data-v="forecast" aria-pressed="${AN.goal === 'forecast'}">Prediction / forecast</button></div></div>
      <div class="f" style="grid-column:span 2"><label>Model family</label><div class="seg" id="anFam" style="flex-wrap:wrap">${fams.map(([v, l]) => `<button data-v="${v}" aria-pressed="${AN.fam === v}">${esc(l)}</button>`).join('')}</div></div></div>
    <div id="anMBody" style="display:grid;gap:12px;margin-top:10px"></div><div class="actions"><button class="btn primary" id="anRun">Run</button><span id="anRMsg"></span></div></div>
  <div id="anOut" style="display:grid;gap:18px"></div>`;
  seg('#anGoal', v => { AN.goal = v; anModelBody(); }); seg('#anFam', v => { AN.fam = v; AN.lastRes = null; anModel(); });
  $('#anRun').onclick = () => anRun(); anModelBody();
}
const anOpt = (list, sel) => list.map(x => Array.isArray(x) ? `<option value="${esc(x[0])}" ${x[0] === sel ? 'selected' : ''}>${esc(x[1])}</option>` : `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
function anModelBody() {
  const b = $('#anMBody'), nc = anNum(), M = AN.m[AN.fam] = AN.m[AN.fam] || {}, F = AN.fam, fc = AN.goal === 'forecast';
  const chks = (key, list, def) => { M[key] = M[key] || def || []; return list.map(c => `<label class="vchk"><input type="checkbox" data-k="${key}" value="${esc(c)}" ${M[key].includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join(''); };
  const tfSel = (key, def = 'level') => `<select data-m="${key}">${anOpt(AN_TF, M[key] || def)}</select>`;
  const inp = (key, label, def, ph = '') => `<div class="f"><label>${label}</label><input data-m="${key}" value="${esc(M[key] ?? def)}" placeholder="${esc(ph)}"></div>`;
  const sel = (key, label, opts, def) => `<div class="f"><label>${label}</label><select data-m="${key}">${anOpt(opts, M[key] ?? def)}</select></div>`;
  M.y = nc.includes(M.y) ? M.y : nc[0];
  let h = '';
  if (F === 'ols') h = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${sel('y', 'Dependent variable (Y)', nc, nc[0])}<div class="f"><label>Y transformation</label>${tfSel('ytf')}</div>${AN.type !== 'cs' ? inp('ylags', 'Lags of Y as regressors (ARDL)', 0) : ''}${sel('se', 'Standard errors', [['classic', 'Classical'], ['hc1', 'Robust (HC1, heteroskedasticity)'], ['hac', 'Newey–West HAC (autocorrelation)'], ...(AN.type === 'panel' ? [['cluster', 'Clustered by unit']] : [])], AN.type === 'ts' ? 'hac' : 'hc1')}${fc ? inp('hold', 'Holdout for testing (%)', 20) : ''}</div>
    <div class="sub">Regressors (X), each with its own transformation${AN.type !== 'cs' ? ' and lags (e.g. 0,1,2 = distributed lag)' : ''}</div><div id="anXrows" style="display:grid;gap:6px"></div>
    ${AN.type !== 'cs' ? `<div class="actions"><button class="btn small" id="anLagIc">Choose the lag length by AIC / BIC</button><span id="anLagMsg" class="sub"></span></div>` : ''}`;
  else if (F === 'arima') h = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">${sel('y', 'Series', nc, nc[0])}${sel('tf', 'Transform first', [['level', 'None'], ['log', 'log']], 'level')}${sel('preset', 'Model', [['custom', 'Custom (p,d,q)(P,D,Q)s'], ['ar', 'AR(p)'], ['ma', 'MA(q)'], ['arma', 'ARMA(p,q)'], ['arima', 'ARIMA(p,d,q)'], ['sarima', 'SARIMA'], ['auto', 'Auto ARIMA (AIC search)']], 'arima')}
    ${inp('p', 'p (AR)', 1)}${inp('d', 'd (differences)', 1)}${inp('q', 'q (MA)', 1)}${inp('P', 'P (seasonal AR)', 0)}${inp('D', 'D (seasonal diff.)', 0)}${inp('Q', 'Q (seasonal MA)', 0)}${inp('s', 's (season length)', AN.tbl.freq === 'day' ? 5 : AN.tbl.freq === 'q' ? 4 : 12)}${sel('mean', 'Constant / drift', [['auto', 'Auto'], ['yes', 'Include'], ['no', 'Exclude']], 'auto')}${inp('h', 'Forecast horizon', 12)}${inp('hold', 'Holdout for testing (%)', fc ? 15 : 0)}</div>
    <p class="sub">Exact maximum likelihood (Kalman filter), the same estimator as statsmodels SARIMAX. Auto ARIMA chooses d with ADF/KPSS and p, q (and P, Q if s &gt; 1 and seasonal is ticked) by AIC.</p><label class="vchk"><input type="checkbox" data-m="seasAuto" ${M.seasAuto ? 'checked' : ''}> Seasonal search in Auto</label>`;
  else if (F === 'var') h = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${sel('kind', 'Model', [['var', 'VAR(p)'], ['varma', 'VARMA(p,q)'], ['varima', 'VARIMA(p,d,q)'], ['svarima', 'Seasonal VARIMA']], 'var')}${sel('tf', 'Transform all', AN_TF, 'dlog')}${inp('p', 'p (lags)', 'auto')}${inp('maxp', 'Max lags to test', 8)}${inp('q', 'q (MA)', 1)}${inp('d', 'd', 1)}${inp('P', 'P', 1)}${inp('Q', 'Q', 0)}${inp('D', 'D', 1)}${inp('s', 's', AN.tbl.freq === 'day' ? 5 : 12)}${inp('h', 'Horizon (IRF & forecast)', 12)}${inp('boot', 'Bootstrap reps for IRF bands', 100)}</div>
    <div class="sub">Variables (2–6), in Cholesky order: the first is the most exogenous</div><div>${chks('vars', nc, nc.slice(0, Math.min(3, nc.length)))}</div><p class="sub">VAR by OLS per equation (as statsmodels VAR). VARMA/VARIMA/seasonal VARIMA by the Hannan–Rissanen two-step method; d and D difference every series and forecasts are integrated back to levels.</p>`;
  else if (F === 'ml' || F === 'xgb') h = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${sel('y', 'Target', nc, nc[0])}${F === 'ml' ? sel('algo', 'Algorithm', [['lstm', 'LSTM'], ['tcn', 'TCN (temporal convolution)'], ['xgb', 'XGBoost (lagged features)']], 'lstm') : ''}${F === 'ml' ? sel('ytf', 'Predict', [['dlog', 'Next-period Δlog ×100'], ['pct', 'Next-period % change'], ['level', 'Next-period level'], ['d1', 'Next-period change']], 'dlog') : ''}${F === 'ml' ? inp('win', 'Window / lags (periods)', 20) : ''}${inp('hid', 'Hidden units / trees', F === 'xgb' ? 200 : 16)}${inp('ep', 'Epochs / depth', F === 'xgb' ? 3 : 30)}${inp('hold', 'Test share (%)', 20)}</div>
    <div class="sub">Features ${F === 'ml' ? '(their recent history feeds the model; the target\'s own history is always included)' : ''}</div><div>${chks('xs', nc.filter(c => c !== M.y), [])}</div>`;
  else if (F === 'prophet') h = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${sel('y', 'Series', nc, nc[0])}${sel('engine', 'Engine', [['local', 'Prophet-style (built in)'], ['prophet', 'Prophet (Meta) via Python'], ['timesfm', 'TimesFM (Google) via Python']], 'local')}${inp('h', 'Horizon', 30)}${inp('hold', 'Holdout for testing (%)', 15)}${inp('cps', 'Changepoint scale', 0.05)}</div>
    <p class="sub">The built-in model fits a piecewise-linear trend with changepoints plus Fourier yearly/weekly seasonality (the design of Meta's Prophet) by regularised least squares. "via Python" sends the series to <code>server.py</code>, which runs the real package if installed (<code>pip install prophet</code> or <code>pip install "timesfm[torch]"</code>).</p>`;
  else if (F === 'tests') h = `<div class="sub">Variables</div><div>${chks('vars', nc, nc.slice(0, 4))}</div><div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${sel('reg', 'ADF deterministic terms', [['c', 'Constant'], ['ct', 'Constant + trend'], ['n', 'None']], 'c')}${inp('lags', 'ACF/PACF lags', 24)}</div>`;
  else if (F === 'dist') h = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${sel('y', 'Variable', nc, nc[0])}${sel('tf', 'Transform first', AN_TF, 'level')}</div><p class="sub">Fits Normal, Student-t, Laplace, Logistic, Cauchy, Lognormal, Exponential, Gamma and Weibull by maximum likelihood and ranks them by AIC, with Kolmogorov–Smirnov tests and Q–Q plots.</p>`;
  else if (F === 'panel') h = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${sel('y', 'Dependent variable', nc, nc[0])}${sel('ytf', 'Y transformation (within unit)', AN_TF, 'level')}${sel('se', 'Standard errors', [['cluster', 'Clustered by unit'], ['classic', 'Classical']], 'cluster')}${sel('tw', 'Effects', [['one', 'Unit effects'], ['two', 'Unit + time effects (two-way FE)']], 'one')}</div><div class="sub">Regressors</div><div id="anXrows" style="display:grid;gap:6px"></div>`;
  b.innerHTML = h;
  if ($('#anXrows')) { M.xs = (M.xs || nc.filter(c => c !== M.y).slice(0, 2)).filter(c => nc.includes(c)); M.xtf = M.xtf || {}; M.xlag = M.xlag || {};
    $('#anXrows').innerHTML = nc.filter(c => c !== M.y).map(c => `<div class="series-row" style="grid-template-columns:minmax(150px,1fr) minmax(180px,1fr) ${AN.type === 'ts' ? '120px' : ''}"><label class="vchk"><input type="checkbox" data-x="${esc(c)}" ${M.xs.includes(c) ? 'checked' : ''}> ${esc(c)}</label><select data-xtf="${esc(c)}">${anOpt(AN_TF, M.xtf[c] || 'level')}</select>${AN.type === 'ts' ? `<input data-xlag="${esc(c)}" value="${esc(M.xlag[c] || '0')}" title="Lags, e.g. 0,1,2">` : ''}</div>`).join('') || '<p class="sub">Only one variable. Add more in step 1 or 3.</p>';
    b.querySelectorAll('[data-x]').forEach(el => el.onchange = () => { M.xs = [...b.querySelectorAll('[data-x]:checked')].map(x => x.dataset.x); });
    b.querySelectorAll('[data-xtf]').forEach(el => el.onchange = () => M.xtf[el.dataset.xtf] = el.value); b.querySelectorAll('[data-xlag]').forEach(el => el.onchange = () => M.xlag[el.dataset.xlag] = el.value); }
  b.querySelectorAll('[data-m]').forEach(el => { const k = el.dataset.m; el.onchange = () => { M[k] = el.type === 'checkbox' ? el.checked : el.value; if (k === 'y' || k === 'preset' || k === 'algo') { if (k === 'preset') anPresetOrder(M); anModelBody(); } }; if (M[k] === undefined) M[k] = el.type === 'checkbox' ? el.checked : el.value; });
  b.querySelectorAll('[data-k]').forEach(el => el.onchange = () => { M[el.dataset.k] = [...b.querySelectorAll(`[data-k="${el.dataset.k}"]:checked`)].map(x => x.value); });
  if ($('#anLagIc')) $('#anLagIc').onclick = () => { try { const r = anLagSearch(M); M.xs.forEach(c => M.xlag[c] = r.best ? Array.from({length: r.best + 1}, (_, i) => i).join(',') : '0'); M.ylags = r.bestY; anModelBody(); msg('#anLagMsg', `AIC picks ${r.best} lag(s) of X and ${r.bestY} of Y (BIC: ${r.bestBic}, ${r.bestYBic}).`, 'ok'); } catch (e) { msg('#anLagMsg', e.message, 'err'); } };
}
function anPresetOrder(M) { const s = M.preset; if (s === 'ar') Object.assign(M, {p: 2, d: 0, q: 0, P: 0, D: 0, Q: 0}); if (s === 'ma') Object.assign(M, {p: 0, d: 0, q: 2, P: 0, D: 0, Q: 0}); if (s === 'arma') Object.assign(M, {p: 1, d: 0, q: 1, P: 0, D: 0, Q: 0}); if (s === 'arima') Object.assign(M, {p: 1, d: 1, q: 1, P: 0, D: 0, Q: 0}); if (s === 'sarima') Object.assign(M, {p: 1, d: 1, q: 1, P: 1, D: 1, Q: 1}); }

/* ---------- building the regression design ---------- */
function anSeries(name, tf) { if (AN.type !== 'panel') return anTransform(anVals(name), tf || 'level'); const out = new Array(AN.tbl.rows.length).fill(null); let i0 = 0; for (const g of anGroups()) { const y = anTransform(g.map(r => r[name]), tf || 'level'); y.forEach((v, i) => out[i0 + i] = v); i0 += g.length; } return out; }
function anLagged(x, k) { if (AN.type !== 'panel') return x.map((_, i) => i - k >= 0 ? x[i - k] : null); const out = new Array(x.length).fill(null); let i0 = 0; for (const g of anGroups()) { for (let i = k; i < g.length; i++) out[i0 + i] = x[i0 + i - k]; i0 += g.length; } return out; }
function anDesign(M, opts = {}) {
  const yname = M.y, ytf = M.ytf || 'level', y = anSeries(yname, ytf), cols = [], names = [];
  const lbl = (v, tf) => tf === 'level' ? v : ({d1: 'Δ', d2: 'Δ²', log: 'ln ', dlog: 'Δln ', pct: '%Δ '}[tf] + v);
  (M.xs || []).forEach(c => { const tf = M.xtf?.[c] || 'level', base = anSeries(c, tf), lags = AN.type === 'cs' ? [0] : String(opts.xlag ?? (M.xlag?.[c] ?? '0')).split(',').map(s => parseInt(s, 10)).filter(v => v >= 0);
    (lags.length ? lags : [0]).forEach(l => { cols.push(l ? anLagged(base, l) : base); names.push(lbl(c, tf) + (l ? `(t−${l})` : '')); }); });
  const yl = AN.type === 'cs' ? 0 : parseInt(opts.ylags ?? M.ylags ?? 0, 10) || 0; for (let l = 1; l <= yl; l++) { cols.push(anLagged(y, l)); names.push(lbl(yname, ytf) + `(t−${l})`); }
  const idx = []; for (let i = 0; i < y.length; i++) if (isNum(y[i]) && cols.every(c => isNum(c[i]))) idx.push(i);
  return {y: idx.map(i => y[i]), X: idx.map(i => [1, ...cols.map(c => c[i])]), names: ['const', ...names], idx, yname: lbl(yname, ytf), ytf, xtf: M.xtf || {}};
}
function anLagSearch(M) { const maxL = 6, res = []; const minStart = maxL; for (let L = 0; L <= Math.min(maxL, 4); L++) for (let Ly = 0; Ly <= 4; Ly++) { try { const D = anDesign(M, {xlag: Array.from({length: L + 1}, (_, i) => i).join(','), ylags: Ly}); const keep = D.idx.map((v, i) => i).filter(i => D.idx[i] >= minStart + 1); const f = ST.ols(keep.map(i => D.y[i]), keep.map(i => D.X[i])); res.push({L, Ly, aic: f.aic, bic: f.bic}); } catch (e) {} }
  if (!res.length) throw new Error('Could not compare lag lengths.'); const a = res.reduce((x, y) => y.aic < x.aic ? y : x), b2 = res.reduce((x, y) => y.bic < x.bic ? y : x); return {best: a.L, bestY: a.Ly, bestBic: b2.L, bestYBic: b2.Ly, table: res}; }

/* ---------- run ---------- */
async function anRun() {
  const M = AN.m[AN.fam]; msg('#anRMsg', 'Estimating…'); $('#anRun').disabled = true; await new Promise(r => setTimeout(r, 20));
  try { await ({ols: anRunOls, arima: anRunArima, var: anRunVar, ml: anRunMl, xgb: anRunMl, prophet: anRunProphet, tests: anRunTests, dist: anRunDist, panel: anRunPanel})[AN.fam](M); msg('#anRMsg', ''); }
  catch (e) { if (!(e instanceof Error) || /is not a function|undefined|null/.test(e.message)) console.error(e); msg('#anRMsg', e.message, 'err'); } finally { $('#anRun').disabled = false; }
}
const anLabels = idx => idx.map(i => anLbl(AN.tbl.rows[i]));
function anCoefTable(names, coef, se, t, p, ci, extra) { return `<div class="tbl scroll"><table><thead><tr><th class="txt">Term</th><th>Coefficient</th><th>Std. err.</th><th>t / z</th><th>p</th>${ci ? '<th>95% CI</th>' : ''}${extra ? `<th>${extra.h}</th>` : ''}</tr></thead><tbody>${names.map((n, i) => `<tr><td class="txt mono">${esc(n)}</td><td class="num"><b>${anFmt(coef[i])}</b></td><td class="num">${anFmt(se[i])}</td><td class="num">${anFmt(t[i], 2)}</td><td class="num">${anP(p[i])} ${anStar(p[i])}</td>${ci ? `<td class="num">[${anFmt(ci[i][0], 3)}, ${anFmt(ci[i][1], 3)}]</td>` : ''}${extra ? `<td class="num">${extra.v[i] ?? ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`; }
function anAddCompare(o) { AN.compare = AN.compare.filter(x => x.id !== o.id); AN.compare.push({...o, at: new Date().toLocaleTimeString()}); }
const anMetrics = (a, p, naive) => { const n = a.length, e = a.map((v, i) => v - p[i]), rmse = Math.sqrt(e.reduce((s, v) => s + v * v, 0) / n), mae = e.reduce((s, v) => s + Math.abs(v), 0) / n, mape = a.every(v => v !== 0) ? a.reduce((s, v, i) => s + Math.abs(e[i] / v), 0) / n * 100 : null;
  const out = {rmse, mae, mape, n}; if (naive) { const en = a.map((v, i) => v - naive[i]); out.rmseN = Math.sqrt(en.reduce((s, v) => s + v * v, 0) / n); out.theil = rmse / out.rmseN; } return out; };

/* OLS */
function anRunOls(M) {
  if (!(M.xs || []).length && !(+M.ylags)) throw new Error('Tick at least one regressor.');
  const D = anDesign(M), fc = AN.goal === 'forecast', hold = fc ? Math.max(0, Math.min(50, +M.hold || 0)) : 0, n = D.y.length, ntr = hold ? Math.floor(n * (1 - hold / 100)) : n;
  if (ntr < D.X[0].length + 5) throw new Error(`Only ${ntr} usable observations for ${D.X[0].length} coefficients.`);
  const f = ST.ols(D.y.slice(0, ntr), D.X.slice(0, ntr), D.names, {se: M.se || 'classic', lags: undefined, groups: M.se === 'cluster' ? D.idx.slice(0, ntr).map(i => AN.tbl.rows[i]._u) : null});
  const g = ST.diagnostics(f, D.X.slice(0, ntr), D.y.slice(0, ntr)), isTs = AN.type === 'ts', adfR = isTs && D.ytf === 'level' ? ST.adf(f.res) : null, adfY = isTs ? ST.adf(D.y.slice(0, ntr)) : null;
  // tests table: assumption, test, statistic, p, verdict, remedy
  const T = [];
  T.push(['Linearity / functional form', 'Ramsey RESET (ŷ², ŷ³)', g.reset?.stat, g.reset?.p, g.reset ? g.reset.p > 0.05 : null, 'Add squares/logs or interactions; try log transformations.']);
  T.push(['Normal errors', 'Jarque–Bera', g.jb.stat, g.jb.p, g.jb.p > 0.05, `Skew ${fmt(g.jb.skew, 2)}, kurtosis ${fmt(g.jb.kurt, 2)}. With large n inference still works; consider robust SE, outlier treatment or Student-t errors.`]);
  T.push(['Constant variance (homoskedasticity)', 'Breusch–Pagan (Koenker)', g.bp?.stat, g.bp?.p, g.bp ? g.bp.p > 0.05 : null, 'Use robust (HC1) or HAC standard errors; model volatility with GARCH.']);
  T.push(['Constant variance (homoskedasticity)', 'White', g.white?.stat, g.white?.p, g.white ? g.white.p > 0.05 : null, 'As above.']);
  if (AN.type !== 'cs') { T.push(['No autocorrelation', `Durbin–Watson`, g.dw, null, g.dw > 1.5 && g.dw < 2.5, 'Add lags of Y or X, use HAC standard errors, or model the errors with ARIMA.']); T.push(['No autocorrelation', `Breusch–Godfrey LM (${g.bg?.df} lags)`, g.bg?.stat, g.bg?.p, g.bg ? g.bg.p > 0.05 : null, 'As above.']); T.push(['No autocorrelation', `Ljung–Box Q(${g.lb.lags})`, g.lb.stat, g.lb.p, g.lb.p > 0.05, 'As above.']); }
  T.push(['No perfect / high multicollinearity', 'Max VIF', Math.max(...g.vif, 0), null, Math.max(...g.vif, 0) < 10, 'Drop or combine highly correlated regressors, or use differences.']);
  T.push(['No perfect / high multicollinearity', 'Condition number', g.cond, null, g.cond < 30, 'Centre or scale variables; remove redundant ones.']);
  T.push(['Zero-mean errors', 'Mean of residuals', g.meanRes, null, Math.abs(g.meanRes) < 1e-6 * (1 + Math.abs(ST.mean(D.y))) || f.hasC, 'Keep an intercept in the model.']);
  if (adfY) T.push(['Stationarity (avoid spurious regression)', `ADF on Y (${D.yname})`, adfY.stat, adfY.p, adfY.p < 0.05, 'Difference or use Δlog / % change, or test for cointegration.']);
  if (adfR) T.push(['Cointegration (if Y and X are in levels)', 'Engle–Granger ADF on residuals', adfR.stat, ST.mackinnonP(adfR.stat, 'c', Math.min(3, 1 + (M.xs || []).length)), ST.mackinnonP(adfR.stat, 'c', Math.min(3, 1 + (M.xs || []).length)) < 0.05, 'If residuals are not stationary the levels regression may be spurious: use differences or an error-correction model.']);
  // interpretation: elasticities and standardized betas
  const sdY = ST.sd(D.y.slice(0, ntr)), interp = f.names.map((nm, i) => { if (i === 0) return ''; const b = f.coef[i], sdx = ST.sd(D.X.slice(0, ntr).map(r => r[i])), ylog = ['log', 'dlog'].includes(D.ytf), xlog = /^(ln |Δln )/.test(nm);
    const kind = ylog && xlog ? `elasticity: 1% ↑ → ${fmt(b, 3)}% ${b >= 0 ? '↑' : '↓'}` : ylog ? `1 unit ↑ → ${fmt(b * 100, 2)}% change in Y` : xlog ? `1% ↑ → ${fmt(b / 100, 4)} units in Y` : `1 unit ↑ → ${fmt(b, 4)} units in Y`; return `${kind}; std. β ${fmt(b * sdx / sdY, 3)}`; });
  // holdout forecast
  let oos = null; if (hold && n - ntr > 2) { const yh = D.X.slice(ntr).map(r => ST.dot(r, f.coef)), act = D.y.slice(ntr), naive = D.y.slice(ntr - 1, n - 1); oos = {...anMetrics(act, yh, naive), yh, act, labels: anLabels(D.idx.slice(ntr))}; oos.r2 = 1 - act.reduce((s, v, i) => s + (v - yh[i]) ** 2, 0) / act.reduce((s, v) => s + (v - ST.mean(D.y.slice(0, ntr))) ** 2, 0); }
  anAddCompare({id: 'ols:' + D.yname + ':' + f.names.join(','), family: 'OLS', target: D.yname, spec: f.names.slice(1).join(' + '), n: f.n, aic: f.aic, bic: f.bic, r2: f.r2, rmse: oos?.rmse, mae: oos?.mae, theil: oos?.theil});
  const draw = () => {
    const t = T_(), out = $('#anOut'), labels = anLabels(D.idx.slice(0, ntr));
    out.innerHTML = `<div class="card wide"><div class="chead"><div><h2>OLS: ${esc(D.yname)}</h2><p class="sub">${f.n} observations · ${f.k} coefficients · ${({classic: 'classical', hc1: 'HC1 robust', hac: 'Newey–West HAC', cluster: 'clustered by unit'})[f.seType]} standard errors</p></div><div class="ctrls"><button class="btn small" id="anOCsv">Download fitted &amp; residuals</button></div></div>
      <div class="kpis" id="anK"></div>
      ${anCoefTable(f.names, f.coef, f.se, f.t, f.p, f.ci, {h: 'Interpretation', v: interp.map(esc)})}
      <h3>Classical OLS assumptions</h3><div class="tbl scroll"><table><thead><tr><th class="txt">Assumption</th><th class="txt">Test</th><th>Statistic</th><th>p</th><th class="txt">Verdict</th><th class="txt">If violated</th></tr></thead><tbody>${T.map(r => `<tr><td class="txt">${esc(r[0])}</td><td class="txt">${esc(r[1])}</td><td class="num">${anFmt(r[2], 3)}</td><td class="num">${anP(r[3])}</td><td class="txt">${anVerdict(r[4], r[4] === null ? 'n/a' : r[4] ? 'OK' : 'Violated')}</td><td class="txt sub">${esc(r[5])}</td></tr>`).join('')}</tbody></table></div>
      <div class="grid2"><div><h3>Actual vs fitted</h3><div class="cv"><canvas id="anC1"></canvas></div></div><div><h3>Residuals vs fitted</h3><div class="cv"><canvas id="anC2"></canvas></div></div>
        <div><h3>Residual Q–Q plot (normality)</h3><div class="cv"><canvas id="anC3"></canvas></div></div><div><h3>${AN.type === 'cs' ? 'Residual histogram' : 'Residual ACF'}</h3><div class="cv"><canvas id="anC4"></canvas></div></div></div>
      ${oos ? `<h3>Out-of-sample test (last ${oos.n} observations)</h3><div class="readout"><span>RMSE <b>${anFmt(oos.rmse)}</b></span><span>MAE <b>${anFmt(oos.mae)}</b></span>${isNum(oos.mape) ? `<span>MAPE <b>${fmt(oos.mape, 1)}%</b></span>` : ''}<span>Naive (last value) RMSE <b>${anFmt(oos.rmseN)}</b></span><span>Theil U <b>${anFmt(oos.theil, 3)}</b> ${oos.theil < 1 ? '(beats naive)' : '(naive is better)'}</span><span>R²<sub>oos</sub> <b>${fmt(oos.r2 * 100, 1)}%</b></span></div><div class="cv"><canvas id="anC5"></canvas></div>` : ''}</div>`;
    kpis('#anK', [{k: 'R²', v: fmt(f.r2 * 100, 1) + '%', chip: 'adj. ' + fmt(f.adjR2 * 100, 1) + '%'}, {k: 'F test', v: anFmt(f.F, 2), chip: 'p ' + anP(f.Fp), dir: f.Fp < 0.05 ? 'up' : 'dn'}, {k: 'AIC / BIC', v: fmt(f.aic, 1), chip: 'BIC ' + fmt(f.bic, 1)}, {k: 'Residual std. error', v: anFmt(f.s)}, {k: 'Assumptions OK', v: `${T.filter(r => r[4]).length} / ${T.filter(r => r[4] !== null).length}`}]);
    mk('anC1', {type: AN.type === 'cs' ? 'scatter' : 'line', data: AN.type === 'cs' ? {datasets: [{label: 'Actual vs fitted', data: f.fit.map((v, i) => ({x: v, y: D.y[i]})), backgroundColor: t.s[0], pointRadius: 3}]} : {labels, datasets: [line('Actual', D.y.slice(0, ntr), t.ink3, {borderWidth: 1.2}), line('Fitted', f.fit, t.s[0])]}, options: {plugins: {tooltip: tip('', 3)}, scales: AN.type === 'cs' ? {x: {title: {display: true, text: 'fitted', color: t.ink3}}, y: {title: {display: true, text: 'actual', color: t.ink3}}} : {x: xCat(8)}}});
    mk('anC2', {type: 'scatter', data: {datasets: [{label: 'Residual', data: f.fit.map((v, i) => ({x: v, y: f.res[i]})), backgroundColor: t.s[1], pointRadius: 2.5}]}, options: {plugins: {legend: {display: false}}, scales: {x: {title: {display: true, text: 'fitted', color: t.ink3}}, y: {}}}});
    anQQ('anC3', f.res); if (AN.type === 'cs') anHist('anC4', f.res); else anAcfChart('anC4', f.res, 20, 'Residual ACF');
    if (oos) mk('anC5', {type: 'line', data: {labels: oos.labels, datasets: [line('Actual', oos.act, t.ink3, {borderWidth: 1.2}), line('Predicted', oos.yh, t.s[1])]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(8)}}});
    $('#anOCsv').onclick = () => download('ols-fitted.csv', ['period,actual,fitted,residual', ...f.fit.map((v, i) => [labels[i], D.y[i], v, f.res[i]].map(csvCell).join(','))].join('\n'), 'text/csv');
  };
  AN.lastRes = draw; draw();
}
const T_ = () => T();
function anQQ(id, x0) { const t = T_(), x = x0.filter(isNum).slice().sort((a, b) => a - b), n = x.length, m = ST.mean(x), s = ST.sd(x); const pts = x.map((v, i) => ({x: ST.normInv((i + 0.5) / n), y: (v - m) / s})); mk(id, {type: 'scatter', data: {datasets: [{label: 'Standardised residual', data: pts, backgroundColor: t.s[0], pointRadius: 2}, {type: 'line', label: '45° line', data: [{x: -3.5, y: -3.5}, {x: 3.5, y: 3.5}], borderColor: t.ink3, borderWidth: 1, pointRadius: 0}]}, options: {plugins: {legend: {display: false}}, scales: {x: {type: 'linear', title: {display: true, text: 'theoretical normal quantile', color: t.ink3}}, y: {title: {display: true, text: 'sample quantile', color: t.ink3}}}}}); }
function anHist(id, x0, fits) { const t = T_(), x = x0.filter(isNum), n = x.length, mn = Math.min(...x), mx = Math.max(...x), bins = Math.min(60, Math.max(10, Math.round(Math.sqrt(n)))), w = (mx - mn) / bins || 1, cnt = new Array(bins).fill(0); x.forEach(v => cnt[Math.min(bins - 1, Math.floor((v - mn) / w))]++);
  const centers = cnt.map((_, i) => mn + (i + 0.5) * w), ds_ = [{type: 'bar', label: 'Density', data: centers.map((c, i) => ({x: c, y: cnt[i] / (n * w)})), backgroundColor: t.neutral, barPercentage: 1, categoryPercentage: 1, order: 3}];
  (fits || []).forEach((f, k) => ds_.push({type: 'line', label: f.label, data: centers.map(c => ({x: c, y: ST.DISTS[f.key].pdf(c, f.params)})), borderColor: t.s[k % 8], borderWidth: 2, pointRadius: 0, tension: .3, order: 1}));
  mk(id, {type: 'bar', data: {datasets: ds_}, options: {plugins: {tooltip: tip('', 4)}, scales: {x: {type: 'linear', grid: {display: false}}, y: {beginAtZero: true}}}}); }
function anAcfChart(id, x0, L, label, pac) { const t = T_(), x = x0.filter(isNum), a = pac ? ST.pacf(x, L) : ST.acf(x, L), ci = 1.96 / Math.sqrt(x.length);
  mk(id, {type: 'bar', data: {labels: a.map((_, i) => i).slice(1), datasets: [bar(label, a.slice(1), a.slice(1).map(v => Math.abs(v) > ci ? t.s[0] : t.neutral), {maxBarThickness: 12}), line('+95%', a.slice(1).map(() => ci), t.crit, {type: 'line', borderDash: [4, 4], borderWidth: 1}), line('−95%', a.slice(1).map(() => -ci), t.crit, {type: 'line', borderDash: [4, 4], borderWidth: 1})]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 3)}, scales: {x: {grid: {display: false}, title: {display: true, text: 'lag', color: t.ink3}}, y: {suggestedMin: -1, suggestedMax: 1}}}}); }

/* ARIMA family */
function anRunArima(M) {
  const raw = anVals(M.y), first = raw.findIndex(isNum), lastI = raw.length - 1 - raw.slice().reverse().findIndex(isNum), ys0 = raw.slice(first, lastI + 1);
  if (ys0.some(v => !isNum(v))) throw new Error(`${M.y} has gaps inside the sample. Fill them in step 2 (Clean) first.`);
  const ys = M.tf === 'log' ? ys0.map(v => v > 0 ? Math.log(v) : NaN) : ys0; if (ys.some(v => !isFinite(v))) throw new Error('log needs positive values.');
  const keys = AN.tbl.rows.slice(first, lastI + 1).map(r => r._t), hold = Math.max(0, Math.min(40, +M.hold || 0)), n = ys.length, ntr = hold ? Math.floor(n * (1 - hold / 100)) : n, ytr = ys.slice(0, ntr);
  const ord = {p: +M.p || 0, d: +M.d || 0, q: +M.q || 0, P: +M.P || 0, D: +M.D || 0, Q: +M.Q || 0, s: +M.s || 0}, mean = M.mean === 'yes' ? true : M.mean === 'no' ? false : null;
  let fit, table = null;
  if (M.preset === 'auto') { const r = TS.autoArima(ytr, {seasonal: !!M.seasAuto, s: ord.s, D: M.seasAuto ? 1 : 0}); fit = r.best; table = r.table.slice(0, 12); if (!fit) throw new Error('Auto ARIMA found no model.'); }
  else fit = TS.arima(ytr, {...ord, mean});
  const o = fit.order, name = `${o.P + o.D + o.Q ? 'SARIMA' : o.d ? 'ARIMA' : o.p && o.q ? 'ARMA' : o.p ? 'AR' : 'MA'}(${o.p},${o.d},${o.q})${o.P + o.D + o.Q ? `(${o.P},${o.D},${o.Q})${o.s}` : ''}`;
  const lb = ST.ljungBox(fit.resid, Math.min(20, Math.floor(fit.resid.length / 5)), o.p + o.q + o.P + o.Q), jb = ST.diagnostics({n: fit.resid.length, k: 1, res: fit.std, fit: fit.std, hasC: true, dw: 2}, fit.std.map(() => [1]), fit.std).jb;
  const back = v => M.tf === 'log' ? Math.exp(v) : v, h = Math.max(1, +M.h || 12);
  let oos = null; if (ntr < n) { const fc = TS.arimaForecast(fit, n - ntr), act = ys0.slice(ntr), pr = fc.mean.map(back), naive = act.map(() => ys0[ntr - 1]); oos = {...anMetrics(act, pr, naive), act, pr, labels: keys.slice(ntr).map(k => alignLabel(AN.tbl.freq, k))}; }
  const full = ntr < n ? TS.arima(ys, {...fit.order, mean: fit.useMean}) : fit, fc = TS.arimaForecast(full, h), fk = futureKeys(AN.tbl.freq || 'q', last(keys), h);
  const adfL = ST.adf(ys), adfD = ST.adf(ys.slice(1).map((v, i) => v - ys[i])), kp = ST.kpss(ys);
  anAddCompare({id: 'arima:' + M.y + name, family: name, target: (M.tf === 'log' ? 'ln ' : '') + M.y, spec: name, n: fit.nobs, aic: fit.aic, bic: fit.bic, rmse: oos?.rmse, mae: oos?.mae, theil: oos?.theil});
  const draw = () => { const t = T_(), out = $('#anOut'), w = fit.w;
    out.innerHTML = `<div class="card wide"><div class="chead"><div><h2>${name}${M.tf === 'log' ? ' on ln ' : ' on '}${esc(M.y)}</h2><p class="sub">Exact Gaussian MLE · ${fit.nobs} observations after differencing · σ² ${anFmt(fit.sigma2)}</p></div><div class="ctrls"><button class="btn small" id="anFcCsv">Download forecast</button></div></div>
      <div class="kpis" id="anK"></div>${anCoefTable(fit.names, fit.coef, fit.se, fit.z, fit.p)}
      ${table ? `<details class="panel"><summary>Auto ARIMA search (best 12 by AIC)</summary><div><div class="tbl"><table><thead><tr><th>p</th><th>d</th><th>q</th><th>P</th><th>D</th><th>Q</th><th>AIC</th><th>BIC</th></tr></thead><tbody>${table.map(r => `<tr>${['p', 'd', 'q', 'P', 'D', 'Q'].map(k => `<td class="num">${r[k]}</td>`).join('')}<td class="num">${fmt(r.aic, 2)}</td><td class="num">${fmt(r.bic, 2)}</td></tr>`).join('')}</tbody></table></div></div></details>` : ''}
      <div class="tbl"><table><thead><tr><th class="txt">Check</th><th>Statistic</th><th>p</th><th class="txt">Verdict</th></tr></thead><tbody>
        <tr><td class="txt">ADF on the series (unit root null)</td><td class="num">${anFmt(adfL?.stat, 3)}</td><td class="num">${anP(adfL?.p)}</td><td class="txt">${anVerdict(adfL ? adfL.p < 0.05 : null, adfL?.p < 0.05 ? 'stationary: d = 0 is fine' : 'unit root: difference (d ≥ 1)')}</td></tr>
        <tr><td class="txt">ADF on the first difference</td><td class="num">${anFmt(adfD?.stat, 3)}</td><td class="num">${anP(adfD?.p)}</td><td class="txt">${anVerdict(adfD ? adfD.p < 0.05 : null, adfD?.p < 0.05 ? 'difference is stationary' : 'consider d = 2')}</td></tr>
        <tr><td class="txt">KPSS on the series (stationarity null)</td><td class="num">${anFmt(kp?.stat, 3)}</td><td class="num">${kp ? (kp.pBound ? kp.pBound + ' ' : '') + anP(kp.p) : '–'}</td><td class="txt">${anVerdict(kp ? kp.p > 0.05 : null, kp?.p > 0.05 ? 'stationary' : 'non-stationary')}</td></tr>
        <tr><td class="txt">Ljung–Box on residuals (white noise null), ${lb.lags} lags</td><td class="num">${anFmt(lb.stat, 2)}</td><td class="num">${anP(lb.p)}</td><td class="txt">${anVerdict(lb.p > 0.05, lb.p > 0.05 ? 'residuals are white noise' : 'autocorrelation left: change p, q')}</td></tr>
        <tr><td class="txt">Jarque–Bera on standardised residuals</td><td class="num">${anFmt(jb.stat, 2)}</td><td class="num">${anP(jb.p)}</td><td class="txt">${anVerdict(jb.p > 0.05, jb.p > 0.05 ? 'normal' : 'fat tails: intervals may be too narrow (see GARCH in Stock market › Quantitative)')}</td></tr></tbody></table></div>
      <h3>Forecast (${h} periods, 80% and 95% bands)</h3><div class="cv tall"><canvas id="anC1"></canvas></div>
      ${oos ? `<h3>Holdout test (last ${oos.n} periods, multi-step from the end of training)</h3><div class="readout"><span>RMSE <b>${anFmt(oos.rmse)}</b></span><span>MAE <b>${anFmt(oos.mae)}</b></span>${isNum(oos.mape) ? `<span>MAPE <b>${fmt(oos.mape, 1)}%</b></span>` : ''}<span>Naive RMSE <b>${anFmt(oos.rmseN)}</b></span><span>Theil U <b>${anFmt(oos.theil, 3)}</b></span></div><div class="cv"><canvas id="anC5"></canvas></div>` : ''}
      <div class="grid2"><div><h3>ACF of the differenced series</h3><div class="cv short"><canvas id="anC2"></canvas></div></div><div><h3>PACF of the differenced series</h3><div class="cv short"><canvas id="anC3"></canvas></div></div><div><h3>Residual ACF</h3><div class="cv short"><canvas id="anC4"></canvas></div></div><div><h3>Residual Q–Q</h3><div class="cv short"><canvas id="anC6"></canvas></div></div></div></div>`;
    kpis('#anK', [{k: 'AIC', v: fmt(fit.aic, 2), chip: 'BIC ' + fmt(fit.bic, 2)}, {k: 'Log-likelihood', v: fmt(fit.ll, 2)}, {k: 'Next value', v: anFmt(back(fc.mean[0])), chip: alignLabel(AN.tbl.freq, fk[0]) || ''}, {k: `In ${h} periods`, v: anFmt(back(last(fc.mean))), chip: `95%: ${anFmt(back(fc.bands[1].lo[h - 1]))} – ${anFmt(back(fc.bands[1].hi[h - 1]))}`}]);
    const histN = Math.min(ys.length, 120), lab = [...keys.slice(-histN), ...fk].map(k => alignLabel(AN.tbl.freq, k)), pad = a => [...new Array(histN).fill(null), ...a];
    mk('anC1', {type: 'line', data: {labels: lab, datasets: [line('Actual', [...ys0.slice(-histN), ...new Array(h).fill(null)], t.ink, {borderWidth: 1.5}), line('Forecast', pad(fc.mean.map(back)), t.s[0], {borderDash: [5, 3]}),
      line('95% low', pad(fc.bands[1].lo.map(back)), t.s[0], {borderWidth: 0, pointRadius: 0, fill: false}), line('95% high', pad(fc.bands[1].hi.map(back)), t.s[0], {borderWidth: 0, backgroundColor: 'rgba(42,120,214,.12)', fill: '-1'}),
      line('80% low', pad(fc.bands[0].lo.map(back)), t.s[0], {borderWidth: 0}), line('80% high', pad(fc.bands[0].hi.map(back)), t.s[0], {borderWidth: 0, backgroundColor: 'rgba(42,120,214,.22)', fill: '-1'})]}, options: {plugins: {legend: {labels: {filter: i => !/low|high/.test(i.text)}}, tooltip: tip('', 3)}, scales: {x: xCat(10)}}});
    anAcfChart('anC2', w, 24, 'ACF'); anAcfChart('anC3', w, 24, 'PACF', true); anAcfChart('anC4', fit.resid, 24, 'Residual ACF'); anQQ('anC6', fit.std);
    if (oos) mk('anC5', {type: 'line', data: {labels: oos.labels, datasets: [line('Actual', oos.act, t.ink3), line('Forecast', oos.pr, t.s[1])]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(8)}}});
    $('#anFcCsv').onclick = () => download('arima-forecast.csv', ['period,forecast,lo80,hi80,lo95,hi95', ...fk.map((k, i) => [alignLabel(AN.tbl.freq, k), back(fc.mean[i]), back(fc.bands[0].lo[i]), back(fc.bands[0].hi[i]), back(fc.bands[1].lo[i]), back(fc.bands[1].hi[i])].map(csvCell).join(','))].join('\n'), 'text/csv');
  };
  AN.lastRes = draw; draw();
}

/* VAR family */
function anRunVar(M) {
  const vars = M.vars || []; if (vars.length < 2 || vars.length > 6) throw new Error('Tick 2 to 6 variables.');
  const kind = M.kind || 'var', tf = kind === 'varima' || kind === 'svarima' ? (M.tf === 'level' || M.tf === 'log' ? M.tf : 'level') : M.tf || 'level';
  const series = vars.map(v => anTransform(anVals(v), tf)), idx = []; for (let i = 0; i < AN.tbl.rows.length; i++) if (series.every(s => isNum(s[i]))) idx.push(i);
  // contiguous block at the end
  let st = idx.length - 1; while (st > 0 && idx[st - 1] === idx[st] - 1) st--; const use = idx.slice(st); if (use.length < 30) throw new Error(`Only ${use.length} consecutive complete observations. Clean gaps first.`);
  const Y = use.map(i => series.map(s => s[i])), keys = use.map(i => AN.tbl.rows[i]._t), h = Math.max(1, +M.h || 12), names = vars.map(v => tf === 'level' ? v : ({d1: 'Δ', d2: 'Δ²', log: 'ln ', dlog: 'Δln ', pct: '%Δ '}[tf] + v));
  let fit, sel = null, fcLevels = null, irfR, fevdR, boot = null, gc = null, radius = null, label;
  if (kind === 'var') { sel = TS.varSelect(Y, Math.max(1, Math.min(+M.maxp || 8, Math.floor(Y.length / (3 * vars.length))))); const p = M.p === 'auto' || !(+M.p) ? Math.max(1, sel.aic) : +M.p; fit = TS.varFit(Y, p, {names}); label = `VAR(${p})`;
    irfR = TS.irf(fit.A, fit.sigma, h); fevdR = TS.fevd(irfR.Theta, h); radius = TS.companionRadius(fit.A); gc = vars.map((_, i) => vars.map((__, j) => i === j ? null : TS.granger(fit, i, [j]))); if (+M.boot > 0) boot = TS.varBootIrf(fit, h, Math.min(500, +M.boot));
    const fc = TS.varForecast(fit, h); fcLevels = {mean: fc.mean, lo: fc.lo, hi: fc.hi}; }
  else { const d = kind === 'var' || kind === 'varma' ? 0 : +M.d || 0, D = kind === 'svarima' ? +M.D || 0 : 0, s = kind === 'svarima' ? +M.s || 12 : 0, cols = Y[0].map((_, j) => Y.map(r => r[j])), dif = cols.map(c => TS.difference(c, d, D, s || 1)), Yd = dif[0].map((_, t) => dif.map(c => c[t]));
    const p = M.p === 'auto' || !(+M.p) ? 1 : +M.p; fit = TS.varma(Yd, {p, q: +M.q || 0, P: kind === 'svarima' ? +M.P || 0 : 0, Q: kind === 'svarima' ? +M.Q || 0 : 0, s, names}); label = `${kind === 'varma' ? 'VARMA' : kind === 'varima' ? 'VARIMA' : 'Seasonal VARIMA'}(${p},${d},${+M.q || 0})${s ? `(${+M.P || 0},${D},${+M.Q || 0})${s}` : ''}`;
    irfR = TS.varmaIrf(fit, h); fevdR = TS.fevd(irfR.Theta, h); const fc = TS.varmaForecast(fit, h);
    if (d + D > 0) { const lv = cols.map((c, j) => TS.integrate(c, fc.mean.map(r => r[j]), d, D, s || 1)), sdl = cols.map((c, j) => { let acc = 0; return fc.se.map(r => (acc += r[j] ** 2, Math.sqrt(acc))); }); fcLevels = {mean: fc.mean.map((_, k) => lv.map(l => l[k])), lo: fc.mean.map((_, k) => lv.map((l, j) => l[k] - 1.96 * sdl[j][k])), hi: fc.mean.map((_, k) => lv.map((l, j) => l[k] + 1.96 * sdl[j][k]))}; }
    else fcLevels = {mean: fc.mean, lo: fc.lo, hi: fc.hi}; }
  const fk = futureKeys(AN.tbl.freq || 'q', last(keys), h);
  anAddCompare({id: 'var:' + label + vars.join(), family: label, target: names.join(', '), spec: tf, n: fit.n, aic: fit.aic, bic: fit.bic});
  AN.varState = AN.varState || {imp: 0, resp: 1};
  const draw = () => { const t = T_(), out = $('#anOut'), S = AN.varState;
    out.innerHTML = `<div class="card wide"><div class="chead"><div><h2>${label}: ${names.map(esc).join(', ')}</h2><p class="sub">${fit.n} observations · ${keys.length ? alignLabel(AN.tbl.freq, keys[0]) + ' to ' + alignLabel(AN.tbl.freq, last(keys)) : ''}</p></div></div>
      <div class="kpis" id="anK"></div>
      ${sel ? `<details class="panel" open><summary>Lag length selection</summary><div><div class="tbl"><table><thead><tr><th>p</th><th>AIC</th><th>BIC</th><th>HQIC</th><th>FPE</th></tr></thead><tbody>${sel.rows.map(r => `<tr><td class="num">${r.p}</td>${['aic', 'bic', 'hqic', 'fpe'].map(k => `<td class="num" style="${sel[k] === r.p ? 'font-weight:700;color:var(--accent)' : ''}">${fmt(r[k], 4)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="sub">Bold = minimum. AIC picks ${sel.aic}, BIC ${sel.bic}, HQIC ${sel.hqic}.</p></div></details>` : ''}
      ${gc ? `<h3>Granger causality (p-values: does the column variable help predict the row variable?)</h3><div class="tbl"><table><thead><tr><th class="txt">Caused ↓ / causing →</th>${names.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${names.map((x, i) => `<tr><td class="txt">${esc(x)}</td>${names.map((_, j) => `<td class="num" style="${gc[i][j] && gc[i][j].p < 0.05 ? 'font-weight:700;color:var(--accent)' : ''}">${gc[i][j] ? anP(gc[i][j].p) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      <h3>Impulse response (orthogonalised, Cholesky)${boot ? `, 90% bootstrap band (${boot.reps} reps)` : ''}</h3><div class="ctrls"><label class="sub">Shock in</label><select id="anImp">${names.map((x, i) => `<option value="${i}" ${i === S.imp ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><label class="sub">response of</label><select id="anResp">${names.map((x, i) => `<option value="${i}" ${i === S.resp ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div class="cv"><canvas id="anC1"></canvas></div>
      <div class="grid2"><div><h3>Forecast error variance decomposition of ${esc(names[S.resp])}</h3><div class="cv"><canvas id="anC2"></canvas></div></div><div><h3>Forecast of ${esc(vars[S.resp])}${tf !== 'level' && kind !== 'varima' && kind !== 'svarima' ? ' (' + esc(names[S.resp]) + ')' : ''}</h3><div class="cv"><canvas id="anC3"></canvas></div></div></div>
      <details class="panel"><summary>Coefficients</summary><div>${anVarCoefs(fit, names)}</div></details></div>`;
    kpis('#anK', [{k: 'AIC', v: fmt(fit.aic, 4), chip: 'BIC ' + fmt(fit.bic, 4)}, ...(radius != null ? [{k: 'Stability (max root modulus)', v: fmt(radius, 3), chip: radius < 1 ? 'stable' : 'NOT stable', dir: radius < 1 ? 'up' : 'dn'}] : []), {k: 'Equations', v: String(names.length)}]);
    const th = irfR.Theta.map(m => m[S.resp][S.imp]), ds_ = [line('Response', th, t.s[0], {pointRadius: 2})]; if (boot) { ds_.push(line('5%', boot.lo.map(m => m[S.resp][S.imp]), t.s[0], {borderWidth: 0})); ds_.push(line('95%', boot.hi.map(m => m[S.resp][S.imp]), t.s[0], {borderWidth: 0, backgroundColor: 'rgba(42,120,214,.15)', fill: '-1'})); } ds_.push(line('zero', th.map(() => 0), t.ink3, {borderWidth: 1}));
    mk('anC1', {type: 'line', data: {labels: th.map((_, i) => i), datasets: ds_}, options: {plugins: {legend: {display: false}, tooltip: tip('', 4)}, scales: {x: {grid: {display: false}, title: {display: true, text: 'periods after the shock', color: t.ink3}}}}});
    const fv = fevdR[S.resp]; mk('anC2', {type: 'bar', data: {labels: fv.map((_, i) => i + 1), datasets: names.map((x, j) => bar(x, fv.map(r => r[j] * 100), t.s[j % 8], {stack: 's'}))}, options: {plugins: {tooltip: tip('%', 1)}, scales: {x: {stacked: true, grid: {display: false}}, y: {stacked: true, max: 100}}}});
    const hist = Math.min(60, keys.length), act = (kind === 'varima' || kind === 'svarima') ? Y.slice(-hist).map(r => r[S.resp]) : Y.slice(-hist).map(r => r[S.resp]), lab = [...keys.slice(-hist), ...fk].map(k => alignLabel(AN.tbl.freq, k)), pad = a => [...new Array(hist).fill(null), ...a];
    mk('anC3', {type: 'line', data: {labels: lab, datasets: [line('Actual', [...act, ...new Array(h).fill(null)], t.ink), line('Forecast', pad(fcLevels.mean.map(r => r[S.resp])), t.s[1], {borderDash: [5, 3]}), line('95% low', pad(fcLevels.lo.map(r => r[S.resp])), t.s[1], {borderWidth: 0}), line('95% high', pad(fcLevels.hi.map(r => r[S.resp])), t.s[1], {borderWidth: 0, backgroundColor: 'rgba(235,104,52,.15)', fill: '-1'})]}, options: {plugins: {legend: {labels: {filter: i => !/low|high/.test(i.text)}}, tooltip: tip('', 3)}, scales: {x: xCat(8)}}});
    $('#anImp').onchange = e => { S.imp = +e.target.value; draw(); }; $('#anResp').onchange = e => { S.resp = +e.target.value; draw(); };
  };
  AN.lastRes = draw; draw();
}
function anVarCoefs(fit, names) { const rowsN = []; if (fit.kind === 'varma') { if (fit.c) rowsN.push('const'); fit.arL.forEach(l => names.forEach(n => rowsN.push(`${n}(t−${l})`))); fit.maL.forEach(l => names.forEach(n => rowsN.push(`u_${n}(t−${l})`))); } else { if (fit.kt) rowsN.push('const'); if (fit.trend === 'ct') rowsN.push('trend'); for (let l = 1; l <= fit.p; l++) names.forEach(n => rowsN.push(`${n}(t−${l})`)); }
  return `<div class="tbl scroll"><table><thead><tr><th class="txt">Regressor</th>${names.map(n => `<th>${esc(n)} eq.</th>`).join('')}</tr></thead><tbody>${fit.B.map((r, a) => `<tr><td class="txt mono">${esc(rowsN[a] || '')}</td>${r.map((v, i) => `<td class="num">${anFmt(v, 4)} ${anStar(fit.pv[a][i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="sub">* p &lt; 0.1, ** p &lt; 0.05, *** p &lt; 0.01</p>`; }

/* LSTM / TCN / XGBoost */
async function anRunMl(M) {
  const algo = AN.fam === 'xgb' ? 'xgbcs' : M.algo || 'lstm', hold = Math.max(5, Math.min(50, +M.hold || 20)), t = T_();
  if (algo === 'xgbcs') { // cross-sectional XGBoost
    const xs = M.xs || []; if (!xs.length) throw new Error('Tick feature variables.'); const rows = AN.tbl.rows.filter(r => isNum(r[M.y]) && xs.every(c => isNum(r[c]))); if (rows.length < 20) throw new Error('Fewer than 20 complete rows.');
    const ord = rows.map((_, i) => i).sort(() => 0), ntr = Math.floor(rows.length * (1 - hold / 100)), X = rows.map(r => xs.map(c => r[c])), y = rows.map(r => r[M.y]);
    const m = ML.gbtFit(X.slice(0, ntr), y.slice(0, ntr), {rounds: +M.hid || 200, maxDepth: +M.ep || 3, eta: 0.05}), pr = m.predict(X.slice(ntr)), act = y.slice(ntr), met = anMetrics(act, pr, act.map(() => ST.mean(y.slice(0, ntr)))); void ord;
    const imp = xs.map((c, i) => ({c, g: m.importance.gain[i]})).sort((a, b) => b.g - a.g), tot = imp.reduce((s, x) => s + x.g, 0) || 1;
    anAddCompare({id: 'xgbcs:' + M.y, family: 'XGBoost', target: M.y, spec: xs.join(' + '), n: rows.length, rmse: met.rmse, mae: met.mae, theil: met.theil});
    const draw = () => { $('#anOut').innerHTML = `<div class="card wide"><h2>XGBoost: ${esc(M.y)}</h2><p class="sub">Trained on ${ntr} rows, tested on ${act.length}. RMSE ${anFmt(met.rmse)}, mean-model RMSE ${anFmt(met.rmseN)}.</p><div class="grid2"><div><h3>Feature importance (gain share)</h3><div class="cv"><canvas id="anC1"></canvas></div></div><div><h3>Test set: actual vs predicted</h3><div class="cv"><canvas id="anC2"></canvas></div></div></div></div>`;
      mk('anC1', {type: 'bar', data: {labels: imp.map(x => x.c), datasets: [bar('Gain %', imp.map(x => x.g / tot * 100), T_().s[0])]}, options: hbarOpts('%', 1)}); mk('anC2', {type: 'scatter', data: {datasets: [{label: 'Test rows', data: act.map((v, i) => ({x: pr[i], y: v})), backgroundColor: T_().s[1]}]}, options: {scales: {x: {title: {display: true, text: 'predicted'}}, y: {title: {display: true, text: 'actual'}}}}}); };
    AN.lastRes = draw; draw(); return; }
  // time series: target at t = transformed y(t+1); features = transformed history of y and xs
  const yt = anTransform(anVals(M.y), M.ytf || 'dlog'), base = [M.y, ...(M.xs || [])], feats = base.map(c => { const v = anVals(c); const tr = anTransform(v, M.ytf === 'level' ? 'pct' : (M.ytf || 'dlog')); return tr; });
  if (M.ytf === 'level') feats.unshift(anVals(M.y));
  const n = AN.tbl.rows.length, ok_ = i => feats.every(f => isNum(f[i])); let st = 0; while (st < n && !ok_(st)) st++; let en = n - 1; while (en > st && !ok_(en)) en--;
  for (let i = st; i <= en; i++) if (!ok_(i)) throw new Error('Features have gaps in the middle. Fill them in Clean first.');
  const F = []; for (let i = st; i <= en; i++) F.push(feats.map(f => f[i])); const target = []; for (let i = st; i <= en; i++) target.push(i + 1 < n && isNum(yt[i + 1]) ? yt[i + 1] : null);
  const L = Math.max(2, +M.win || 20), keys = AN.tbl.rows.slice(st, en + 1).map(r => r._t);
  if (algo === 'xgb') { const X = [], y = [], idx = []; for (let i = L - 1; i < F.length; i++) { const row = []; for (let l = 0; l < L; l++) row.push(...F[i - l]); X.push(row); y.push(target[i]); idx.push(i); }
    const tr = X.map((_, i) => i).filter(i => isNum(y[i])), ntr = Math.floor(tr.length * (1 - hold / 100)), trn = tr.slice(0, ntr), tst = tr.slice(ntr);
    const m = ML.gbtFit(trn.map(i => X[i]), trn.map(i => y[i]), {rounds: Math.min(600, +M.hid || 200), maxDepth: Math.min(8, +M.ep || 3), eta: 0.05, subsample: 0.8, colsample: 0.8});
    const pr = m.predict(tst.map(i => X[i])), act = tst.map(i => y[i]), nxt = m.predict([X[X.length - 1]])[0];
    const fnames = [...(M.ytf === 'level' ? [M.y + ' level'] : []), ...base.map(c => c + ' change')], nF = feats.length, gainBy = fnames.map((_, j) => m.importance.gain.filter((__, k) => k % nF === j).reduce((x, z) => x + z, 0));
    return anMlOut({algo: 'XGBoost', act, pr, labels: tst.map(i => alignLabel(AN.tbl.freq, keys[idx[i]])), next: nxt, hist: null, imp: fnames.map((c, j) => ({c, g: gainBy[j]})), M}); }
  const W = ML.makeWindows(F, target, L); if (W.X.length < 60) throw new Error(`Only ${W.X.length} training windows. Use a shorter window or more data.`);
  $('#anOut').innerHTML = `<div class="card wide"><h2>Training ${algo.toUpperCase()}…</h2><div class="cv short"><canvas id="anTrain"></canvas></div><p class="sub" id="anTrainMsg"></p></div>`; const hist = [];
  const res = await ML.trainSeq(algo, W, {trainFrac: 1 - hold / 100, hidden: Math.max(4, Math.min(64, +M.hid || 16)), epochs: Math.max(1, Math.min(200, +M.ep || 30)), onEpoch: async (e, tl, vl) => { hist.push({e, tl, vl}); $('#anTrainMsg').textContent = `Epoch ${e}: train loss ${fmt(tl, 4)}, validation loss ${fmt(vl, 4)}`; mk('anTrain', {type: 'line', data: {labels: hist.map(x => x.e), datasets: [line('Train', hist.map(x => x.tl), t.s[0]), line('Validation', hist.map(x => x.vl), t.s[1])]}, options: {animation: false, scales: {x: {grid: {display: false}}}}}); await new Promise(r => setTimeout(r, 0)); }});
  const tst = Array.from({length: W.X.length - res.ntr}, (_, i) => res.ntr + i), act = tst.map(i => W.y[i]), pr = tst.map(i => res.pred[i]), lastWin = F.slice(-L), nxt = res.predictWindow(lastWin);
  anMlOut({algo: algo === 'tcn' ? `TCN (receptive field ${res.receptive})` : 'LSTM', act, pr, labels: tst.map(i => alignLabel(AN.tbl.freq, keys[W.idx[i]])), next: nxt, hist, M});
}
function anMlOut({algo, act, pr, labels, next, hist, imp, M}) {
  const met = anMetrics(act, pr, act.map(() => 0)), dir = act.filter((v, i) => Math.sign(v) === Math.sign(pr[i])).length / act.length * 100, ic = QC.corr(act, pr), tgt = ({dlog: 'Δln ×100', pct: '% change', level: 'level', d1: 'change'})[M.ytf || 'dlog'];
  anAddCompare({id: 'ml:' + algo + M.y, family: algo, target: `next ${tgt} of ${M.y}`, spec: (M.xs || []).join(', ') || 'own history', n: act.length, rmse: met.rmse, mae: met.mae, theil: met.theil, dir});
  const draw = () => { const t = T_(); $('#anOut').innerHTML = `<div class="card wide"><h2>${esc(algo)}: next-period ${esc(tgt)} of ${esc(M.y)}</h2><div class="kpis" id="anK"></div>
    <div class="grid2"><div><h3>Test period: actual vs predicted</h3><div class="cv"><canvas id="anC1"></canvas></div></div><div><h3>${imp ? 'Feature importance (gain)' : 'Training curve'}</h3><div class="cv"><canvas id="anC2"></canvas></div></div></div>
    <p class="sub">Benchmark is a zero-change forecast (random walk). Direction accuracy above 50% and positive information coefficient (correlation of prediction with outcome) are what matter for trading; small R² is normal for returns.</p></div>`;
    kpis('#anK', [{k: 'Test RMSE', v: anFmt(met.rmse), chip: 'random walk ' + anFmt(met.rmseN), dir: met.rmse < met.rmseN ? 'up' : 'dn'}, {k: 'Direction accuracy', v: fmt(dir, 1) + '%', chip: act.length + ' test periods', dir: dir > 50 ? 'up' : 'dn'}, {k: 'Information coefficient', v: fmt(ic, 3)}, {k: 'Next-period prediction', v: anFmt(next), chip: tgt}]);
    mk('anC1', {type: 'line', data: {labels, datasets: [line('Actual', act, t.ink3, {borderWidth: 1}), line('Predicted', pr, t.s[0])]}, options: {plugins: {tooltip: tip('', 3)}, scales: {x: xCat(8)}}});
    if (imp) { const tot = imp.reduce((s, x) => s + x.g, 0) || 1; mk('anC2', {type: 'bar', data: {labels: imp.map(x => x.c), datasets: [bar('Gain %', imp.map(x => x.g / tot * 100), t.s[0])]}, options: hbarOpts('%', 1)}); }
    else if (hist) mk('anC2', {type: 'line', data: {labels: hist.map(x => x.e), datasets: [line('Train', hist.map(x => x.tl), t.s[0]), line('Validation', hist.map(x => x.vl), t.s[1])]}, options: {scales: {x: {grid: {display: false}}}}}); };
  AN.lastRes = draw; draw();
}

/* Prophet / TimesFM */
function anKeyDate(freq, k) { if (freq === 'day') return k; if (freq === 'ym') { const [y, i] = k.split('|'); return `${y}-${String(+i + 1).padStart(2, '0')}-15`; } if (freq === 'fym') { const [fy, i] = k.split('|'), m = MON_AUG[+i], mi = MON_CAL.indexOf(m), y = +fy.slice(0, 4) + (+i >= 5 ? 1 : 0); return `${y}-${String(mi + 1).padStart(2, '0')}-15`; } if (freq === 'fy') return (+k.slice(0, 4) + 1) + '-07-15'; if (freq === 'year') return k + '-12-31'; return null; }
async function anRunProphet(M) {
  const fq = AN.tbl.freq; if (!['day', 'ym', 'fym', 'fy', 'year'].includes(fq)) throw new Error('Prophet needs dated data (daily, monthly or yearly).');
  const rows = AN.tbl.rows.filter(r => isNum(r[M.y])), dates = rows.map(r => anKeyDate(fq, r._t)), y = rows.map(r => r[M.y]), h = Math.max(1, +M.h || 30), hold = Math.max(0, Math.min(40, +M.hold || 0)), n = y.length, ntr = hold ? Math.floor(n * (1 - hold / 100)) : n;
  const fk = futureKeys(fq, last(rows)._t, h), fdates = fk.map(k => anKeyDate(fq, k));
  const run = async (ds_, ys_, fd) => { if (M.engine === 'local') { const r = TS.prophetLike(ds_, ys_, {futureDates: fd, cpScale: +M.cps || 0.05, monthly: false}); return {mean: r.mean, lo: r.lo, hi: r.hi, extra: r, engine: 'Prophet-style (built in)'}; }
    const resp = await fetch('api/forecast', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({engine: M.engine, y: ys_, dates: ds_, h: fd.length, freq: fq === 'day' ? 'D' : ['ym', 'fym'].includes(fq) ? 'MS' : 'YS'})}).catch(() => null);
    if (!resp || !resp.ok) throw new Error('This engine needs the app running through server.py (start-windows.bat).'); const j = await resp.json(); if (!j.ok) throw new Error(j.error); return {mean: j.mean, lo: j.lo, hi: j.hi, engine: j.engine}; };
  const full = await run(dates, y, fdates); let oos = null;
  if (ntr < n) { const r = await run(dates.slice(0, ntr), y.slice(0, ntr), dates.slice(ntr)); const act = y.slice(ntr); oos = {...anMetrics(act, r.mean, act.map(() => y[ntr - 1])), act, pr: r.mean, labels: rows.slice(ntr).map(rr => alignLabel(fq, rr._t))}; }
  anAddCompare({id: 'prophet:' + M.engine + M.y, family: full.engine, target: M.y, spec: '', n, rmse: oos?.rmse, mae: oos?.mae, theil: oos?.theil});
  const draw = () => { const t = T_(), hist = Math.min(n, fq === 'day' ? 250 : 120), lab = [...rows.slice(-hist).map(r => alignLabel(fq, r._t)), ...fk.map(k => alignLabel(fq, k))], pad = a => [...new Array(hist).fill(null), ...a];
    $('#anOut').innerHTML = `<div class="card wide"><h2>${esc(full.engine)}: ${esc(M.y)}</h2><div class="kpis" id="anK"></div><div class="cv tall"><canvas id="anC1"></canvas></div>
      ${full.extra ? `<div class="grid2"><div><h3>Trend component</h3><div class="cv short"><canvas id="anC2"></canvas></div></div><div><h3>Seasonal component</h3><div class="cv short"><canvas id="anC3"></canvas></div></div></div>` : ''}
      ${oos ? `<h3>Holdout test</h3><div class="readout"><span>RMSE <b>${anFmt(oos.rmse)}</b></span><span>MAE <b>${anFmt(oos.mae)}</b></span><span>Naive RMSE <b>${anFmt(oos.rmseN)}</b></span><span>Theil U <b>${anFmt(oos.theil, 3)}</b></span></div><div class="cv"><canvas id="anC4"></canvas></div>` : ''}</div>`;
    kpis('#anK', [{k: 'Next', v: anFmt(full.mean[0]), chip: alignLabel(fq, fk[0])}, {k: `In ${h} periods`, v: anFmt(last(full.mean)), chip: `${anFmt(last(full.lo))} – ${anFmt(last(full.hi))}`}, ...(full.extra ? [{k: 'Current trend slope', v: anFmt(full.extra.slope, 3) + '/day'}] : [])]);
    mk('anC1', {type: 'line', data: {labels: lab, datasets: [line('Actual', [...y.slice(-hist), ...new Array(h).fill(null)], t.ink, {borderWidth: 1.4}), line('Forecast', pad(full.mean), t.s[0], {borderDash: [5, 3]}), line('low', pad(full.lo), t.s[0], {borderWidth: 0}), line('high', pad(full.hi), t.s[0], {borderWidth: 0, backgroundColor: 'rgba(42,120,214,.15)', fill: '-1'})]}, options: {plugins: {legend: {labels: {filter: i => !/low|high/.test(i.text)}}, tooltip: tip('', 2)}, scales: {x: xCat(10)}}});
    if (full.extra) { mk('anC2', {type: 'line', data: {labels: rows.map(r => alignLabel(fq, r._t)), datasets: [line('Trend', full.extra.trend, t.s[0])]}, options: {plugins: {legend: {display: false}}, scales: {x: xCat(6)}}}); mk('anC3', {type: 'line', data: {labels: rows.map(r => alignLabel(fq, r._t)), datasets: [line('Seasonal', full.extra.seasonal, t.s[2], {borderWidth: 1})]}, options: {plugins: {legend: {display: false}}, scales: {x: xCat(6)}}}); }
    if (oos) mk('anC4', {type: 'line', data: {labels: oos.labels, datasets: [line('Actual', oos.act, t.ink3), line('Forecast', oos.pr, t.s[1])]}, options: {scales: {x: xCat(8)}}}); };
  AN.lastRes = draw; draw();
}

/* unit roots, ACF/PACF */
function anRunTests(M) {
  const vars = M.vars || []; if (!vars.length) throw new Error('Tick variables.'); const L = Math.max(4, Math.min(60, +M.lags || 24));
  const rows = vars.flatMap(v => { const x = anVals(v).filter(isNum), d = x.slice(1).map((a, i) => a - x[i]); return [['level', x], ['Δ', d]].map(([k, s]) => { const a = ST.adf(s, {reg: M.reg || 'c'}), kp = ST.kpss(s, {reg: M.reg === 'ct' ? 'ct' : 'c'}); return {v, k, a, kp, lb: ST.ljungBox(s, Math.min(10, Math.floor(s.length / 5)))}; }); });
  AN.testVar = vars.includes(AN.testVar) ? AN.testVar : vars[0];
  const draw = () => { $('#anOut').innerHTML = `<div class="card wide"><h2>Stationarity and autocorrelation</h2><div class="tbl scroll"><table><thead><tr><th class="txt">Variable</th><th class="txt">Form</th><th>ADF stat</th><th>ADF p</th><th>Lags</th><th>5% crit.</th><th>KPSS stat</th><th>KPSS p</th><th>Ljung–Box p</th><th class="txt">Conclusion</th></tr></thead><tbody>${rows.map(r => { const st = r.a && r.a.p < 0.05, ks = r.kp && r.kp.p > 0.05; return `<tr><td class="txt mono">${esc(r.v)}</td><td class="txt">${r.k}</td><td class="num">${anFmt(r.a?.stat, 3)}</td><td class="num">${anP(r.a?.p)}</td><td class="num">${r.a?.lags ?? '–'}</td><td class="num">${anFmt(r.a?.crit['5%'], 3)}</td><td class="num">${anFmt(r.kp?.stat, 3)}</td><td class="num">${r.kp ? (r.kp.pBound || '') + anP(r.kp.p) : '–'}</td><td class="num">${anP(r.lb.p)}</td><td class="txt">${anVerdict(st && ks ? true : !st && !ks ? false : null, st && ks ? 'stationary' : !st && !ks ? 'unit root' : 'mixed evidence')}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="sub">ADF null: unit root (p &lt; 0.05 → stationary). KPSS null: stationary (p &lt; 0.05 → not stationary). A series that is non-stationary in levels but stationary in Δ is I(1): use differences or Δlog in models, or test cointegration.</p>
    <div class="ctrls"><label class="sub">ACF/PACF of</label><select id="anTv2">${vars.map(v => `<option ${v === AN.testVar ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <div class="grid2"><div><h3>ACF (level)</h3><div class="cv short"><canvas id="anC1"></canvas></div></div><div><h3>PACF (level)</h3><div class="cv short"><canvas id="anC2"></canvas></div></div><div><h3>ACF (Δ)</h3><div class="cv short"><canvas id="anC3"></canvas></div></div><div><h3>PACF (Δ)</h3><div class="cv short"><canvas id="anC4"></canvas></div></div></div></div>`;
    const x = anVals(AN.testVar).filter(isNum), d = x.slice(1).map((a, i) => a - x[i]); anAcfChart('anC1', x, L, 'ACF'); anAcfChart('anC2', x, L, 'PACF', true); anAcfChart('anC3', d, L, 'ACF'); anAcfChart('anC4', d, L, 'PACF', true); $('#anTv2').onchange = e => { AN.testVar = e.target.value; draw(); }; };
  AN.lastRes = draw; draw();
}
/* distributions */
function anRunDist(M) {
  const x = anTransform(anVals(M.y), M.tf || 'level').filter(isNum); if (x.length < 20) throw new Error('Need at least 20 values.'); const fits = ST.fitDists(x), good = fits.filter(f => f.params);
  const draw = () => { const best = good[0]; $('#anOut').innerHTML = `<div class="card wide"><h2>Distribution of ${esc(M.y)}${M.tf && M.tf !== 'level' ? ' (' + esc(AN_TF.find(t => t[0] === M.tf)[1]) + ')' : ''}</h2>
    <div class="readout"><span>n <b>${x.length}</b></span><span>Mean <b>${anFmt(ST.mean(x))}</b></span><span>Std. dev. <b>${anFmt(ST.sd(x))}</b></span><span>Skew <b>${fmt(ST.skew(x), 3)}</b></span><span>Excess kurtosis <b>${fmt(ST.kurt(x) - 3, 3)}</b></span><span>Best fit by AIC <b>${esc(best.label)}</b></span></div>
    <div class="tbl scroll"><table><thead><tr><th class="txt">Distribution</th><th class="txt">Parameters (MLE)</th><th>Log-lik.</th><th>AIC</th><th>BIC</th><th>KS D</th><th>KS p</th></tr></thead><tbody>${fits.map(f => f.params ? `<tr><td class="txt"><b>${esc(f.label)}</b></td><td class="txt mono">${f.names.map((nm, i) => `${nm} ${anFmt(f.params[i], 4)}`).join(', ')}</td><td class="num">${fmt(f.ll, 2)}</td><td class="num">${fmt(f.aic, 2)}</td><td class="num">${fmt(f.bic, 2)}</td><td class="num">${fmt(f.ks, 4)}</td><td class="num ${f.ksp < 0.05 ? 'neg' : ''}">${anP(f.ksp)}</td></tr>` : `<tr><td class="txt">${esc(f.label)}</td><td class="txt sub" colspan="6">${esc(f.skipped)}</td></tr>`).join('')}</tbody></table></div>
    <p class="sub">KS p-values are approximate when parameters are estimated from the same data (they are conservative).</p>
    <div class="grid2"><div><h3>Histogram with the three best fits</h3><div class="cv"><canvas id="anC1"></canvas></div></div><div><h3>Q–Q plot against ${esc(best.label)}</h3><div class="cv"><canvas id="anC2"></canvas></div></div></div></div>`;
    anHist('anC1', x, good.slice(0, 3)); const t = T_(), s = x.slice().sort((a, b) => a - b), n = s.length, mn = s[0] - 10 * ST.sd(x), mx = s[n - 1] + 10 * ST.sd(x);
    const pts = s.map((v, i) => ({x: ST.distQuantile(best.key, (i + 0.5) / n, best.params, best.key === 'lognormal' || best.key === 'gamma' || best.key === 'weibull' || best.key === 'exponential' ? 0 : mn, mx), y: v}));
    mk('anC2', {type: 'scatter', data: {datasets: [{label: 'Q–Q', data: pts, backgroundColor: t.s[0], pointRadius: 2}, {type: 'line', label: '45°', data: [{x: s[0], y: s[0]}, {x: s[n - 1], y: s[n - 1]}], borderColor: t.ink3, borderWidth: 1, pointRadius: 0}]}, options: {plugins: {legend: {display: false}}, scales: {x: {type: 'linear', title: {display: true, text: 'theoretical', color: t.ink3}}, y: {title: {display: true, text: 'sample', color: t.ink3}}}}}); };
  AN.lastRes = draw; draw();
}
/* panel */
function anRunPanel(M) {
  const xs = M.xs || []; if (!xs.length) throw new Error('Tick at least one regressor.');
  const y = anSeries(M.y, M.ytf || 'level'), X = xs.map(c => anSeries(c, M.xtf?.[c] || 'level')), rows = [];
  AN.tbl.rows.forEach((r, i) => { if (isNum(y[i]) && X.every(x => isNum(x[i]))) rows.push({u: r._u, t: r._t, y: y[i], x: X.map(x => x[i])}); });
  if (rows.length < xs.length + 10) throw new Error('Too few complete observations.');
  const P = ST.panel(rows, xs, {twoWay: M.tw === 'two', cluster: M.se !== 'classic'}), H = P.hausman, Fe = P.fe.Ftest, LM = P.bplm;
  const rec = H ? (H.stat < 0 ? 'Hausman statistic is negative (variance difference not positive definite): prefer fixed effects as the safe choice.' : H.p < 0.05 ? 'Hausman rejects: random-effects is inconsistent. Use fixed effects.' : 'Hausman does not reject: random effects is consistent and more efficient.') : '';
  anAddCompare({id: 'panel:' + M.y + xs.join(), family: 'Panel FE/RE', target: M.y, spec: xs.join(' + '), n: rows.length});
  const draw = () => { const re = P.re && !P.re.error ? P.re : null;
    $('#anOut').innerHTML = `<div class="card wide"><h2>Panel regression: ${esc(M.y)}</h2><p class="sub">${P.n} observations · ${P.N} units · ${P.T} periods · ${P.balanced ? 'balanced' : 'unbalanced'} · ${M.se !== 'classic' ? 'standard errors clustered by unit' : 'classical standard errors'}</p>
      <div class="kpis" id="anK"></div>
      <div class="tbl scroll"><table><thead><tr><th class="txt">Variable</th><th>Pooled OLS</th><th>Fixed effects${M.tw === 'two' ? ' (two-way)' : ''}</th><th>Random effects</th></tr></thead><tbody>${xs.map((c, i) => { const fi = P.fe.names.indexOf(c); return `<tr><td class="txt mono">${esc(c)}</td><td class="num">${anFmt(P.pooled.coef[i + 1])} ${anStar(P.pooled.p[i + 1])}<br><span class="sub">(${anFmt(P.pooled.se[i + 1])})</span></td><td class="num">${fi >= 0 ? `${anFmt(P.fe.coef[fi])} ${anStar(P.fe.p[fi])}<br><span class="sub">(${anFmt(P.fe.se[fi])})</span>` : '<span class="sub">time-invariant</span>'}</td><td class="num">${re ? `${anFmt(re.coef[i + 1])} ${anStar(re.p[i + 1])}<br><span class="sub">(${anFmt(re.se[i + 1])})</span>` : '–'}</td></tr>`; }).join('')}
      <tr><td class="txt">Constant</td><td class="num">${anFmt(P.pooled.coef[0])}</td><td class="num sub">unit-specific</td><td class="num">${re ? anFmt(re.coef[0]) : '–'}</td></tr><tr><td class="txt">R²</td><td class="num">${fmt(P.pooled.r2, 3)}</td><td class="num">${fmt(P.fe.r2within, 3)} <span class="sub">within</span></td><td class="num">${re ? fmt(re.r2, 3) : '–'}</td></tr></tbody></table></div>
      <h3>Which model?</h3><div class="tbl"><table><thead><tr><th class="txt">Test</th><th>Statistic</th><th>p</th><th class="txt">Reading</th></tr></thead><tbody>
        <tr><td class="txt">F test: all unit effects = 0 (pooled vs FE)</td><td class="num">${anFmt(Fe.stat, 3)}</td><td class="num">${anP(Fe.p)}</td><td class="txt">${Fe.p < 0.05 ? 'Unit effects matter: pooled OLS is biased.' : 'No evidence of unit effects.'}</td></tr>
        ${LM ? `<tr><td class="txt">Breusch–Pagan LM (pooled vs RE)</td><td class="num">${anFmt(LM.stat, 3)}</td><td class="num">${anP(LM.p)}</td><td class="txt">${LM.p < 0.05 ? 'Random unit effects present.' : 'Pooled OLS is adequate.'}</td></tr>` : ''}
        ${H ? `<tr><td class="txt">Hausman (FE vs RE)</td><td class="num">${anFmt(H.stat, 3)}</td><td class="num">${H.stat < 0 ? '–' : anP(H.p)}</td><td class="txt">${esc(rec)}</td></tr>` : ''}</tbody></table></div>
      ${re ? `<p class="sub">Random effects: σ<sub>u</sub> ${anFmt(re.sigma_u)}, σ<sub>e</sub> ${anFmt(re.sigma_e)}, share of variance from unit effects ρ = ${fmt(re.rho, 3)}.</p>` : ''}
      <h3>Estimated unit effects (FE)</h3><div class="cv"><canvas id="anC1"></canvas></div></div>`;
    kpis('#anK', [{k: 'Units', v: String(P.N)}, {k: 'Within R² (FE)', v: fmt(P.fe.r2within * 100, 1) + '%'}, {k: 'Recommended', v: H && H.stat >= 0 && H.p >= 0.05 ? 'Random effects' : Fe.p < 0.05 ? 'Fixed effects' : 'Pooled OLS'}]);
    const al = P.fe.alpha.slice().sort((a, b) => b.a - a.a).slice(0, 40); mk('anC1', {type: 'bar', data: {labels: al.map(a => a.u), datasets: [bar('Unit effect', al.map(a => a.a), T_().s[0])]}, options: hbarOpts('', 3)}); };
  AN.lastRes = draw; draw();
}

/* ======================= 5. COMPARE ======================= */
function anCompare() {
  const b = $('#anBody'), C = AN.compare;
  b.innerHTML = `<div class="card wide"><h2>5. Compare models</h2><p class="sub">Every model you run in this session is listed. Information criteria compare models on the same target and sample; holdout errors compare forecasting skill (lower is better; Theil U below 1 beats the naive forecast).</p>
    ${C.length ? `<div class="tbl scroll"><table><thead><tr><th class="txt">Model</th><th class="txt">Target</th><th class="txt">Specification</th><th>N</th><th>AIC</th><th>BIC</th><th>R²</th><th>Holdout RMSE</th><th>MAE</th><th>Theil U</th><th>Direction</th><th>Run at</th></tr></thead><tbody>${C.map(r => `<tr><td class="txt"><b>${esc(r.family)}</b></td><td class="txt">${esc(r.target)}</td><td class="txt sub">${esc(r.spec || '')}</td><td class="num">${r.n ?? ''}</td><td class="num">${anFmt(r.aic, 2)}</td><td class="num">${anFmt(r.bic, 2)}</td><td class="num">${isNum(r.r2) ? fmt(r.r2 * 100, 1) + '%' : '–'}</td><td class="num">${anFmt(r.rmse)}</td><td class="num">${anFmt(r.mae)}</td><td class="num ${r.theil < 1 ? 'pos' : r.theil >= 1 ? 'neg' : ''}">${anFmt(r.theil, 3)}</td><td class="num">${isNum(r.dir) ? fmt(r.dir, 0) + '%' : '–'}</td><td class="sub">${r.at}</td></tr>`).join('')}</tbody></table></div>
    <div class="actions"><button class="btn small" id="anCmpCsv">Download</button><button class="btn small danger" id="anCmpClr">Clear list</button></div>` : '<div class="empty">Run a model in step 4 first.</div>'}</div>`;
  if (C.length) { $('#anCmpCsv').onclick = () => download('model-comparison.csv', ['model,target,spec,n,aic,bic,r2,rmse,mae,theil,direction', ...C.map(r => [r.family, r.target, r.spec, r.n, r.aic, r.bic, r.r2, r.rmse, r.mae, r.theil, r.dir].map(csvCell).join(','))].join('\n'), 'text/csv'); $('#anCmpClr').onclick = () => { AN.compare = []; anCompare(); }; }
}
