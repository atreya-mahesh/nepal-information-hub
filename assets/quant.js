/* Quant lab: type an equation over any series in the database and get computed series, regressions,
   fitted nonlinear models, forecasts and Monte Carlo risk. Loaded before app.js; defines functions only. */
'use strict';

const QL = {
  vars: [{name: 'NEPSE', ds: 'stock_ohlc', cat: 'NEPSE', col: 'close'}, {name: 'NABIL', ds: 'stock_ohlc', cat: 'NABIL', col: 'close'}, {name: 'BANK', ds: 'stock_ohlc', cat: 'BANKING', col: 'close'}],
  mode: 'ols', eq: 'ret(NABIL) ~ ret(NEPSE)', h: 10, method: 'hold', init: '', from: '', to: '', lastN: 500,
  mc: {v: 'NEPSE', look: 250, h: 10, paths: 5000, conf: 95, pos: 1000000}, result: null};
const QL_PRESETS = [
  {id: 'capm', label: 'CAPM beta: NABIL vs NEPSE daily returns', mode: 'ols', eq: 'ret(NABIL) ~ ret(NEPSE)', vars: 'stock3', lastN: 500},
  {id: 'ar2', label: 'AR(2) forecast of NEPSE, 20 sessions ahead', mode: 'ols', eq: 'NEPSE ~ lag(NEPSE,1) + lag(NEPSE,2)', vars: 'stock3', h: 20, lastN: 500},
  {id: 'multi', label: 'NABIL on NEPSE and BANKING returns plus a trend', mode: 'ols', eq: 'ret(NABIL) ~ ret(NEPSE) + ret(BANK) + t', vars: 'stock3', lastN: 500},
  {id: 'expo', label: 'Fit an exponential trend: NEPSE = a·exp(b·t)', mode: 'nls', eq: 'NEPSE = a*exp(b*t)', init: 'a=2000, b=0.0001', vars: 'stock3', h: 60, lastN: 0},
  {id: 'logistic', label: 'Fit a mean-reverting path: NABIL = c + d·exp(−k·t)', mode: 'nls', eq: 'NABIL = c + d*exp(-k*t)', init: 'c=500, d=500, k=0.005', vars: 'stock3', h: 60, lastN: 750},
  {id: 'pairs', label: 'Pairs spread z-score: log NABIL − log BANKING (60 sessions)', mode: 'calc', eq: 'spread = zscore(log(NABIL) - log(BANK), 60)', vars: 'stock3', lastN: 750},
  {id: 'mom', label: 'Momentum filter: 1 when SMA20 > SMA50', mode: 'calc', eq: 'signal = iff(sma(NEPSE,20) > sma(NEPSE,50), 1, 0)', vars: 'stock3', lastN: 500},
  {id: 'imp', label: 'Macro: imports elasticity to remittances (annual, logs)', mode: 'ols', eq: 'log(IMP) ~ log(REM)', vars: 'macro', h: 2, lastN: 0},
  {id: 'cpi', label: 'Macro: monthly CPI inflation, AR with a 12-month lag', mode: 'ols', eq: 'CPI ~ lag(CPI,1) + lag(CPI,12)', vars: 'cpi', h: 6, lastN: 0},
  {id: 'var', label: 'Monte Carlo price paths and 10-day VaR for NEPSE', mode: 'mc', vars: 'stock3'},
];
const QL_VARSETS = {
  stock3: [{name: 'NEPSE', ds: 'stock_ohlc', cat: 'NEPSE', col: 'close'}, {name: 'NABIL', ds: 'stock_ohlc', cat: 'NABIL', col: 'close'}, {name: 'BANK', ds: 'stock_ohlc', cat: 'BANKING', col: 'close'}],
  macro: [{name: 'IMP', ds: 'trade_annual', cat: '', col: 'imports'}, {name: 'REM', ds: 'bop_annual', cat: '', col: 'remit'}],
  cpi: [{name: 'CPI', ds: 'inflation_monthly', cat: '', col: 'cpi'}],
};
const QL_MODES = [['calc', 'Compute a series'], ['ols', 'Regression and forecast'], ['nls', 'Fit my equation'], ['mc', 'Monte Carlo and VaR']];

const QTOP = {v: 'models'};
function renderQuant() {
  try { QTOP.v = localStorage.getItem('nmm-qtop') || QTOP.v; } catch (e) {}
  const P = $('#p-quant');
  P.innerHTML = `<div class="subnav" id="qTop" role="tablist"><button data-v="models" aria-selected="${QTOP.v === 'models'}">Quant finance &amp; econometric models</button><button data-v="eq" aria-selected="${QTOP.v === 'eq'}">Equation lab</button></div><div id="qHost" style="display:grid;gap:18px"></div>`;
  $('#qTop').onclick = e => { const b = e.target.closest('button'); if (!b) return; QTOP.v = b.dataset.v; try { localStorage.setItem('nmm-qtop', QTOP.v); } catch (er) {} renderQuant(); };
  if (QTOP.v === 'models') { $('#qHost').innerHTML = '<div id="qsSrc"></div><div id="sqHost" style="display:grid;gap:18px"></div>'; qsRenderSources($('#qsSrc')); renderStockQuant(); return; }
  renderQuantEq();
}
function renderQuantEq() {
  const p = $('#qHost');
  QL.vars = QL.vars.filter(v => ds(v.ds));
  p.innerHTML = `
  <div class="card wide">
    <div class="chead"><div><h2>Equation lab</h2><p class="sub">Name the series you need, type an equation, and run it. Works on stock prices and every macro dataset in the app.</p></div>
      <div class="ctrls"><select id="qlPreset" aria-label="Examples"><option value="">Load an example…</option>${QL_PRESETS.map(x => `<option value="${x.id}">${esc(x.label)}</option>`).join('')}</select></div></div>
    <h3>1. Variables</h3>
    <div id="qlVars" style="display:grid;gap:8px"></div>
    <div class="actions"><button class="btn small" id="qlAddVar">+ Add variable</button><span class="sub" id="qlFreq"></span></div>
    <h3>2. Model</h3>
    <div class="seg" id="qlMode">${QL_MODES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${QL.mode === v}">${l}</button>`).join('')}</div>
    <div id="qlModeBody" style="display:grid;gap:10px"></div>
    <div class="actions"><button class="btn primary" id="qlRun">Run</button><span id="qlMsg"></span></div>
    <details class="panel"><summary>Equation language reference</summary><div>
      <div class="tbl"><table><tbody>${QC.FN_HELP.map(([a, b]) => `<tr><td class="txt"><code>${esc(a)}</code></td><td class="txt">${esc(b)}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub"><b>Compute:</b> <code>name = expression</code>. <b>Regression:</b> <code>y ~ x1 + x2 + lag(y,1)</code>; add <code>+ 0</code> to drop the intercept; <code>t</code> adds a trend; <code>(t &gt; 500)</code> is a dummy. <b>Fit my equation:</b> <code>y = a + b*x + c*x^2</code> — any name that is not a variable, function or <code>t</code> is a parameter to estimate.</p>
    </div></details>
  </div>
  <div id="qlOut" style="display:grid;gap:18px"></div>`;
  $('#qlPreset').onchange = e => { const x = QL_PRESETS.find(p => p.id === e.target.value); if (!x) return; QL.mode = x.mode; if (x.eq) QL.eq = x.eq; QL.init = x.init || ''; QL.h = x.h || 10; QL.lastN = x.lastN ?? 500; QL.vars = JSON.parse(JSON.stringify(QL_VARSETS[x.vars])).filter(v => ds(v.ds)); if (x.mode === 'mc') QL.mc.v = QL.vars[0]?.name || ''; QL.from = QL.to = ''; renderQuant(); runQuant(); };
  seg('#qlMode', v => { QL.mode = v; drawQlMode(); });
  $('#qlAddVar').onclick = () => { QL.vars.push({name: 'X' + (QL.vars.length + 1), ds: QL.vars[0]?.ds || 'smi', cat: '', col: ''}); drawQlVars(); };
  $('#qlRun').onclick = () => runQuant();
  drawQlVars(); drawQlMode();
  if (QL.result) runQuant(true);
}
function qlDsOptions(sel) {
  const groups = uniq(allDs().map(d => d.group));
  return groups.map(g => { const list = allDs().filter(d => d.group === g && freqOf(d) && numCols(d).length); return list.length ? `<optgroup label="${esc(g)}">${list.map(d => `<option value="${esc(d.id)}" ${d.id === sel ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</optgroup>` : ''; }).join('');
}
function drawQlVars() {
  const box = $('#qlVars'), t = T();
  box.innerHTML = QL.vars.map((v, i) => { const d = ds(v.ds), cats = d ? catOptions(d) : [];
    if (cats.length && !cats.includes(v.cat)) v.cat = cats.find(c => c.toUpperCase().startsWith(v.name.toUpperCase())) || cats[0];
    if (d && !numCols(d).some(c => c.k === v.col)) v.col = (numCols(d).find(c => c.k === 'close') || numCols(d)[0])?.k;
    return `<div class="series-row qvar" data-i="${i}" style="grid-template-columns:120px minmax(160px,1.4fr) minmax(110px,1fr) minmax(130px,1fr) 28px">
      <input data-f="name" value="${esc(v.name)}" aria-label="Variable name" style="font-family:var(--mono)">
      <select data-f="ds" aria-label="Dataset">${qlDsOptions(v.ds)}</select>
      ${cats.length ? `<select data-f="cat" aria-label="Item">${cats.map(c => `<option ${c === v.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : '<span class="sub">–</span>'}
      <select data-f="col" aria-label="Column">${d ? numCols(d).map(c => `<option value="${esc(c.k)}" ${c.k === v.col ? 'selected' : ''}>${esc(c.label)}</option>`).join('') : ''}</select>
      <button class="btn small" data-rm="${i}" aria-label="Remove variable">×</button></div>`; }).join('') || '<p class="sub">No variables yet. Add one.</p>';
  box.querySelectorAll('.qvar input, .qvar select').forEach(el => el.onchange = () => { const i = +el.closest('.qvar').dataset.i, f = el.dataset.f;
    QL.vars[i][f] = f === 'name' ? el.value.trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') : el.value; if (f === 'ds') { QL.vars[i].cat = ''; QL.vars[i].col = ''; } drawQlVars(); if (QL.mode === 'mc') drawQlMode(); });
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { QL.vars.splice(+b.dataset.rm, 1); drawQlVars(); });
  const fr = uniq(QL.vars.map(v => ds(v.ds) && freqOf(ds(v.ds))));
  $('#qlFreq').innerHTML = fr.length > 1 ? `<span class="msg err">These variables have different frequencies (${fr.map(f => FREQS.find(x => x[0] === f)?.[1]).join(', ')}). Use one frequency per model.</span>` : fr[0] ? 'Frequency: <b>' + FREQS.find(x => x[0] === fr[0])?.[1] + '</b>. Series are lined up by period; missing values are skipped.' : '';
}
function drawQlMode() {
  const b = $('#qlModeBody');
  if (QL.mode === 'mc') {
    b.innerHTML = `<div class="form">
      <div class="f"><label for="mcV">Price series</label><select id="mcV">${QL.vars.map(v => `<option ${v.name === QL.mc.v ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
      <div class="f"><label for="mcLook">Estimation window (periods)</label><input id="mcLook" value="${QL.mc.look}" inputmode="numeric"></div>
      <div class="f"><label for="mcH">Horizon (periods)</label><input id="mcH" value="${QL.mc.h}" inputmode="numeric"></div>
      <div class="f"><label for="mcPaths">Simulated paths</label><input id="mcPaths" value="${QL.mc.paths}" inputmode="numeric"></div>
      <div class="f"><label for="mcConf">Confidence %</label><input id="mcConf" value="${QL.mc.conf}" inputmode="decimal"></div>
      <div class="f"><label for="mcPos">Position value (Rs)</label><input id="mcPos" value="${QL.mc.pos}" inputmode="decimal"></div></div>
      <p class="sub">Geometric Brownian motion with drift and volatility estimated from log returns in the window. VaR is shown three ways: historical, parametric (normal) and Monte Carlo.</p>`;
    return;
  }
  const ph = {calc: 'spread = zscore(log(NABIL) - log(BANK), 60)', ols: 'ret(NABIL) ~ ret(NEPSE) + ret(BANK)', nls: 'NEPSE = a*exp(b*t)'}[QL.mode];
  b.innerHTML = `<textarea id="qlEq" spellcheck="false" style="min-height:64px;font-size:14px" placeholder="${esc(ph)}" aria-label="Equation">${esc(QL.eq)}</textarea>
    <div class="ctrls">
      <label class="sub" for="qlLast">Use the last</label><input id="qlLast" size="5" value="${QL.lastN || ''}" placeholder="all" inputmode="numeric"><span class="sub">observations</span>
      ${QL.mode !== 'calc' ? `<label class="sub" for="qlH">Forecast</label><input id="qlH" size="4" value="${QL.h}" inputmode="numeric"><span class="sub">periods ahead</span>
      <label class="sub" for="qlMeth">Future values of other variables</label><select id="qlMeth"><option value="hold">Hold at last value</option><option value="drift">Continue average change (last 30)</option><option value="trend">Linear trend (last 30)</option></select>` : ''}
      ${QL.mode === 'nls' ? `<label class="sub" for="qlInit">Starting values</label><input id="qlInit" size="22" value="${esc(QL.init)}" placeholder="a=1, b=0.01">` : ''}
    </div>`;
  if ($('#qlMeth')) $('#qlMeth').value = QL.method;
  $('#qlEq').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuant(); } });
}
function readQlInputs() {
  if (QL.mode === 'mc') { const n = (id, d) => { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : d; };
    QL.mc = {v: $('#mcV').value, look: n('#mcLook', 250) | 0, h: n('#mcH', 10) | 0, paths: Math.min(20000, n('#mcPaths', 5000) | 0), conf: Math.min(99.9, n('#mcConf', 95)), pos: n('#mcPos', 1e6)}; return; }
  QL.eq = $('#qlEq').value.trim(); QL.lastN = parseInt($('#qlLast').value) || 0;
  if ($('#qlH')) QL.h = Math.max(0, Math.min(500, parseInt($('#qlH').value) || 0));
  if ($('#qlMeth')) QL.method = $('#qlMeth').value; if ($('#qlInit')) QL.init = $('#qlInit').value;
}
/* assemble aligned data */
function qlData() {
  if (!QL.vars.length) throw new Error('Add at least one variable.');
  const names = QL.vars.map(v => v.name); const dup = names.find((n, i) => names.indexOf(n) !== i); if (dup) throw new Error(`The name "${dup}" is used twice.`);
  names.forEach(n => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error(`"${n}" is not a valid name. Use letters, digits and _ only.`); if (QC.FUNCS.has(n) || ['t', 'n', 'pi', 'e'].includes(n)) throw new Error(`"${n}" is reserved. Pick another variable name.`); });
  const fr = uniq(QL.vars.map(v => freqOf(ds(v.ds)))); if (fr.length > 1) throw new Error('All variables must have the same frequency.');
  const maps = QL.vars.map(v => { const d = ds(v.ds), m = new Map(); d.rows.forEach(r => { if (catKeys(d).length && catLabel(d, r) !== v.cat) return; if (isNum(r[v.col])) m.set(alignKey(d, r), r[v.col]); }); return m; });
  let keys = uniq(maps.flatMap(m => [...m.keys()])).sort();
  if (QL.lastN > 0) keys = keys.slice(-QL.lastN);
  const vars = {}; QL.vars.forEach((v, i) => vars[v.name] = keys.map(k => maps[i].has(k) ? maps[i].get(k) : null));
  return {freq: fr[0], keys, vars, n: keys.length};
}
function futureKeys(freq, lastKey, h) {
  const out = []; let k = lastKey;
  for (let i = 0; i < h; i++) {
    if (freq === 'day') { const d = new Date(k + 'T00:00:00Z'); do { d.setUTCDate(d.getUTCDate() + 1); } while ([5, 6].includes(d.getUTCDay())); k = d.toISOString().slice(0, 10); }  // NEPSE trades Sunday–Thursday
    else if (freq === 'fy' || freq === 'fym') { let [fy, m] = k.split('|'); const nfy = s => { const a = +s.slice(0, 4) + 1; return a + '/' + String((a + 1) % 100).padStart(2, '0'); };
      if (freq === 'fy') k = nfy(fy); else { let mi = +m + 1; if (mi > 11) { mi = 0; fy = nfy(fy); } k = fy + '|' + String(mi).padStart(2, '0'); } }
    else if (freq === 'ym') { let [y, m] = k.split('|'); let mi = +m + 1; if (mi > 11) { mi = 0; y = String(+y + 1); } k = y + '|' + String(mi).padStart(2, '0'); }
    else if (freq === 'year') k = String(+k + 1);
    else k = '+' + (i + 1);
    out.push(k);
  }
  return out;
}
function extendVar(a, h, method) {
  const v = a.slice(), idx = []; a.forEach((x, i) => { if (isNum(x)) idx.push(i); }); const lastI = last(idx); const lv = isNum(lastI) ? a[lastI] : null;
  const tail = idx.slice(-30).map(i => [i, a[i]]);
  let slope = 0, icpt = lv;
  if (method !== 'hold' && tail.length > 2) {
    if (method === 'drift') slope = (tail[tail.length - 1][1] - tail[0][1]) / (tail[tail.length - 1][0] - tail[0][0] || 1);
    else { const mx = QC.mean(tail.map(p => p[0])), my = QC.mean(tail.map(p => p[1])); let sxy = 0, sxx = 0; tail.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }); slope = sxx ? sxy / sxx : 0; icpt = my - slope * mx + slope * lastI; }
  }
  for (let j = 1; j <= h; j++) v.push(lv == null ? null : (method === 'trend' ? icpt + slope * j : lv + slope * j));
  return v;
}
const tArr = n => Array.from({length: n}, (_, i) => i);

function runQuant(silent) {
  try {
    readQlInputs(); msg('#qlMsg', 'Running…', '');
    const D = qlData(); if (D.n < 3) throw new Error('Not enough observations. Check the variables and the sample length.');
    const res = QL.mode === 'calc' ? qlCalc(D) : QL.mode === 'ols' ? qlOls(D) : QL.mode === 'nls' ? qlNls(D) : qlMc(D);
    QL.result = res; msg('#qlMsg', '', ''); $('#qlMsg').className = '';
  } catch (e) { msg('#qlMsg', e.message, 'err'); if (!silent) console.warn(e); }
}
const lbl = (freq, k) => k.startsWith('+') ? k : alignLabel(freq, k);
const stars = p => !isNum(p) ? '' : p < 0.01 ? '***' : p < 0.05 ? '**' : p < 0.1 ? '*' : '';
function qlOutShell(title, sub) {
  $('#qlOut').innerHTML = `<div class="card wide"><div class="chead"><div><h2>${esc(title)}</h2><p class="sub">${sub}</p></div><div class="ctrls"><button class="btn small" id="qlCsv">Download CSV</button><button class="btn small accent" id="qlSave">Save as dataset</button></div></div>
    <div class="kpis" id="qlKpis"></div><div class="cv tall"><canvas id="cQl"></canvas></div><div id="qlExtra" style="display:grid;gap:14px"></div></div>`;
}
function qlWire(freq, keys, cols, defaultName) {
  const labels = keys.map(k => lbl(freq, k));
  $('#qlCsv').onclick = () => download('quant-result.csv', ['Period,' + cols.map(c => csvCell(c[0])).join(','), ...keys.map((k, i) => csvCell(labels[i]) + ',' + cols.map(c => c[1][i] ?? '').join(','))].join('\n'), 'text/csv');
  $('#qlSave').onclick = () => saveQlDataset(freq, keys, cols, defaultName);
}
/* ---- compute ---- */
function qlCalc(D) {
  let name = 'result', expr = QL.eq; const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)(.*)$/s.exec(QL.eq); if (m) { name = m[1]; expr = m[2]; }
  if (!expr.trim()) throw new Error('Type an expression, e.g. spread = log(NABIL) - log(BANK)');
  const env = {n: D.n, t: tArr(D.n), vars: D.vars, params: {}}, out = QC.evaluate(QC.parse(expr), env);
  const v = Array.isArray(out) ? out : Array(D.n).fill(out), vv = v.filter(isNum), t = T();
  if (!vv.length) throw new Error('The expression returned no numbers. Check windows and lags against the sample length.');
  qlOutShell(name + ' = ' + expr.trim(), `${D.n} periods · ${lbl(D.freq, D.keys[0])} to ${lbl(D.freq, last(D.keys))}`);
  kpis('#qlKpis', [{k: 'Latest', v: fmtAuto(last(vv))}, {k: 'Mean', v: fmtAuto(QC.mean(vv))}, {k: 'Std. dev.', v: fmtAuto(QC.sd(vv))}, {k: 'Min / max', v: fmtAuto(Math.min(...vv)) + ' / ' + fmtAuto(Math.max(...vv))}, {k: 'Valid values', v: String(vv.length)}]);
  const inputs = QL.vars.filter(x => new RegExp('\\b' + x.name + '\\b').test(expr)).slice(0, 1);
  mk('cQl', {type: 'line', data: {labels: D.keys.map(k => lbl(D.freq, k)), datasets: [line(name, v, t.s[0], {yAxisID: 'y'})]}, options: {plugins: {tooltip: tip('', 4)}, scales: {x: xCat(10), y: {}}}});
  $('#qlExtra').innerHTML = `<div class="tbl scroll" style="max-height:320px"><table><thead><tr><th>Period</th><th>${esc(name)}</th>${QL.vars.map(x => `<th>${esc(x.name)}</th>`).join('')}</tr></thead><tbody>${D.keys.map((k, i) => `<tr><td>${esc(lbl(D.freq, k))}</td><td class="num">${fmtAuto(v[i])}</td>${QL.vars.map(x => `<td class="num">${fmtAuto(D.vars[x.name][i])}</td>`).join('')}</tr>`).reverse().join('')}</tbody></table></div>`;
  qlWire(D.freq, D.keys, [[name, v]], name);
  return {name, v};
}
/* ---- OLS ---- */
function qlOls(D) {
  const parts = QL.eq.split('~'); if (parts.length !== 2) throw new Error('A regression needs one "~", e.g. y ~ x1 + x2');
  const lhsSrc = parts[0].trim(); let terms = QC.splitTerms(parts[1].trim()); const noC = terms.some(x => x === '0' || x === '-1'); terms = terms.filter(x => !['0', '-1', '1', '+1'].includes(x));
  if (!terms.length && noC) throw new Error('Add at least one regressor.');
  const lhsAst = QC.parse(lhsSrc), tAsts = terms.map(s => ({s, a: QC.parse(s)}));
  const plainY = /^[A-Za-z_][A-Za-z0-9_]*$/.test(lhsSrc) && lhsSrc in D.vars ? lhsSrc : null;
  const evalAll = (vars, n) => { const env = {n, t: tArr(n), vars, params: {}}; const y = QC.evaluate(lhsAst, env), X = tAsts.map(x => { const v = QC.evaluate(x.a, env); return Array.isArray(v) ? v : Array(n).fill(v); }); return {y: Array.isArray(y) ? y : Array(n).fill(y), X}; };
  const {y, X} = evalAll(D.vars, D.n);
  const rows = []; for (let i = 0; i < D.n; i++) if (isNum(y[i]) && X.every(c => isNum(c[i]))) rows.push(i);
  const names = [...(noC ? [] : ['(Intercept)']), ...terms];
  const Xm = rows.map(i => [...(noC ? [] : [1]), ...X.map(c => c[i])]), ym = rows.map(i => y[i]);
  const r = QC.ols(ym, Xm, names);
  // forecast
  const h = QL.h, fk = futureKeys(D.freq, last(D.keys), h), tc = QC.tCrit(r.df);
  let fc = [], lo = [], hi = [];
  if (h > 0) {
    const ext = {}; for (const [k, a] of Object.entries(D.vars)) ext[k] = k === plainY ? a.concat(Array(h).fill(null)) : extendVar(a, h, QL.method);
    const N = D.n + h;
    for (let j = 0; j < h; j++) {
      const {X: Xe} = evalAll(ext, N), i = D.n + j, x0 = [...(noC ? [] : [1]), ...Xe.map(c => c[i])];
      if (!x0.every(isNum)) { fc.push(null); lo.push(null); hi.push(null); continue; }
      const yhat = x0.reduce((s, x, q) => s + x * r.coef[q], 0), lev = x0.reduce((s, xi, a) => s + xi * x0.reduce((u, xj, b) => u + r.XtXi[a][b] * xj, 0), 0);
      const se = r.s * Math.sqrt(1 + lev) * (plainY && terms.some(s => s.includes(plainY)) ? Math.sqrt(j + 1) : 1);
      fc.push(yhat); lo.push(yhat - tc * se); hi.push(yhat + tc * se);
      if (plainY && lhsSrc === plainY) ext[plainY][i] = yhat;
    }
  }
  const t = T(), labels = [...D.keys, ...fk].map(k => lbl(D.freq, k)), fitted = Array(D.n).fill(null); rows.forEach((i, j) => fitted[i] = r.fit[j]);
  const pad = a => a.concat(Array(h).fill(null)), fpad = a => Array(D.n - 1).fill(null).concat([h ? (y[D.n - 1] ?? fitted[D.n - 1]) : null], a);
  qlOutShell(lhsSrc + ' ~ ' + terms.join(' + ') + (noC ? ' (no intercept)' : ''), `OLS on ${r.n} observations · ${lbl(D.freq, D.keys[rows[0]])} to ${lbl(D.freq, D.keys[last(rows)])}` + (h ? ` · forecast ${h} periods, other variables: ${$('#qlMeth')?.selectedOptions[0]?.text || QL.method}` : ''));
  kpis('#qlKpis', [{k: 'R²', v: fmt(r.r2, 4), chip: 'adj. ' + fmt(r.adjR2, 4)}, {k: 'F statistic', v: fmt(r.F, 2), chip: 'p ' + (r.Fp < 1e-4 ? '< 0.0001' : fmt(r.Fp, 4))},
    {k: 'Std. error of regression', v: fmtAuto(r.s), chip: 'RMSE ' + fmtAuto(r.rmse)}, {k: 'Durbin–Watson', v: fmt(r.dw, 3), chip: r.dw < 1.5 ? 'positive autocorrelation' : r.dw > 2.5 ? 'negative autocorrelation' : 'no strong autocorrelation', dir: r.dw < 1.5 || r.dw > 2.5 ? 'dn' : 'up'},
    {k: 'AIC / BIC', v: fmt(r.aic, 1) + ' / ' + fmt(r.bic, 1), chip: 'n ' + r.n + ', k ' + r.k}, ...(h ? [{k: `Forecast, ${lbl(D.freq, last(fk))}`, v: fmtAuto(last(fc)), chip: `95%: ${fmtAuto(last(lo))} to ${fmtAuto(last(hi))}`}] : [])]);
  mk('cQl', {type: 'line', data: {labels, datasets: [line('Actual', pad(y), t.ink, {borderWidth: 1.5}), line('Fitted', pad(fitted), t.s[0], {borderWidth: 1.5}),
    ...(h ? [line('Forecast', fpad(fc), t.s[1], {borderWidth: 2.5, pointRadius: 2}), line('95% upper', fpad(hi), t.s[1] + '55', {borderWidth: 1, borderDash: [4, 4]}), line('95% lower', fpad(lo), t.s[1] + '55', {borderWidth: 1, borderDash: [4, 4], fill: '-1', backgroundColor: t.s[1] + '18'})] : [])]},
    options: {plugins: {tooltip: tip('', 4)}, scales: {x: xCat(10)}}});
  const eqStr = lhsSrc + ' = ' + r.coef.map((c, i) => (i && c >= 0 ? '+ ' : i ? '− ' : c < 0 ? '−' : '') + fmt(Math.abs(c), 4) + (names[i] === '(Intercept)' ? '' : ' × ' + names[i])).join(' ');
  $('#qlExtra').innerHTML = `<p class="note" style="font-family:var(--mono)">${esc(eqStr)}</p>
    <div class="grid2"><div><h3>Coefficients</h3><div class="tbl"><table><thead><tr><th class="txt">Term</th><th>Estimate</th><th>Std. error</th><th>t</th><th>p-value</th><th></th></tr></thead><tbody>
      ${names.map((nm, i) => `<tr><td class="txt"><code>${esc(nm)}</code></td><td class="num">${fmt(r.coef[i], 6)}</td><td class="num">${fmt(r.se[i], 6)}</td><td class="num">${fmt(r.t[i], 3)}</td><td class="num">${r.p[i] < 1e-4 ? '<0.0001' : fmt(r.p[i], 4)}</td><td>${stars(r.p[i])}</td></tr>`).join('')}
    </tbody></table></div><p class="src">*** p&lt;0.01, ** p&lt;0.05, * p&lt;0.1. Standard errors assume homoskedastic, uncorrelated errors.${plainY && terms.some(s => s.includes(plainY)) ? ' Forecast bands widen with √h as an approximation for the recursive forecast.' : ''}</p></div>
    <div><h3>Residuals</h3><div class="cv short"><canvas id="cQlRes"></canvas></div><div class="readout"><span>Mean <b>${fmt(QC.mean(r.res), 5)}</b></span><span>MAE <b>${fmtAuto(r.mae)}</b></span><span>Largest |e| <b>${fmtAuto(Math.max(...r.res.map(Math.abs)))}</b></span></div></div></div>
    ${h ? `<h3>Forecast</h3><div class="tbl"><table><thead><tr><th>Period</th><th>Forecast</th><th>95% lower</th><th>95% upper</th></tr></thead><tbody>${fk.map((k, i) => `<tr><td>${esc(lbl(D.freq, k))}</td><td class="num">${fmtAuto(fc[i])}</td><td class="num">${fmtAuto(lo[i])}</td><td class="num">${fmtAuto(hi[i])}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  mk('cQlRes', {type: 'bar', data: {labels: rows.map(i => lbl(D.freq, D.keys[i])), datasets: [bar('Residual', r.res, r.res.map(e => e < 0 ? t.crit + 'aa' : t.s[0] + 'aa'), {maxBarThickness: 6, borderRadius: 0})]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 4)}, scales: {x: xCat(6)}}});
  const allK = [...D.keys, ...fk];
  qlWire(D.freq, allK, [['Actual', pad(y)], ['Fitted', pad(fitted)], ['Forecast', Array(D.n).fill(null).concat(fc)], ['Lower 95', Array(D.n).fill(null).concat(lo)], ['Upper 95', Array(D.n).fill(null).concat(hi)]], 'regression');
  return r;
}
/* ---- nonlinear ---- */
function qlNls(D) {
  const m = /^(.*?)=(?!=)(.*)$/s.exec(QL.eq); if (!m) throw new Error('Write the model as y = f(...), e.g. NEPSE = a*exp(b*t)');
  const lhsSrc = m[1].trim(), rhsAst = QC.parse(m[2]), lhsAst = QC.parse(lhsSrc);
  const params = [...QC.idsIn(rhsAst)].filter(n => !(n in D.vars) && n !== 't' && n !== 'n' && !(n in QC.CONSTS));
  if (!params.length) throw new Error('No parameters found. Use names that are not variables, e.g. a, b, c.');
  if (params.length > 10) throw new Error('Too many parameters (max 10).');
  const init = {}; QL.init.split(/[,;]/).forEach(s => { const q = s.split('='); if (q.length === 2 && isFinite(+q[1])) init[q[0].trim()] = +q[1]; });
  const envY = {n: D.n, t: tArr(D.n), vars: D.vars, params: {}}, yAll = QC.evaluate(lhsAst, envY), y = Array.isArray(yAll) ? yAll : Array(D.n).fill(yAll);
  const p0 = params.map(p => p in init ? init[p] : 1);
  const f = (p, vars, n) => { const env = {n, t: tArr(n), vars, params: Object.fromEntries(params.map((k, i) => [k, p[i]]))}; const o = QC.evaluate(rhsAst, env); return Array.isArray(o) ? o : Array(n).fill(o); };
  const probe = f(p0, D.vars, D.n); const rows = []; for (let i = 0; i < D.n; i++) if (isNum(y[i]) && (isNum(probe[i]) || probe[i] === null)) rows.push(i);
  const usable = rows.filter(i => isNum(y[i])); if (usable.length <= params.length) throw new Error('Not enough observations for this many parameters.');
  const ys = usable.map(i => y[i]);
  const fit = QC.lm(p => { const o = f(p, D.vars, D.n); return usable.map(i => isNum(o[i]) ? o[i] : 1e15); }, ys, p0);
  if (!isFinite(fit.sse)) throw new Error('The fit did not converge. Try different starting values.');
  const h = QL.h, fk = futureKeys(D.freq, last(D.keys), h), ext = {}; for (const [k, a] of Object.entries(D.vars)) ext[k] = extendVar(a, h, QL.method);
  const full = f(fit.p, ext, D.n + h), fitted = full.slice(0, D.n), fc = full.slice(D.n), tc = QC.tCrit(fit.df), band = fit.s * tc;
  const t = T(), labels = [...D.keys, ...fk].map(k => lbl(D.freq, k)), pad = a => a.concat(Array(h).fill(null)), fpad = a => Array(D.n).fill(null).concat(a);
  qlOutShell(QL.eq, `Nonlinear least squares (Levenberg–Marquardt) on ${fit.n} observations${h ? ` · ${h}-period projection` : ''}`);
  kpis('#qlKpis', [{k: 'R²', v: fmt(fit.r2, 4)}, {k: 'RMSE', v: fmtAuto(fit.rmse)}, {k: 'Residual std. error', v: fmtAuto(fit.s), chip: 'df ' + fit.df}, ...(h ? [{k: `Projection, ${lbl(D.freq, last(fk))}`, v: fmtAuto(last(fc)), chip: `± ${fmtAuto(band)} (95%)`}] : [])]);
  mk('cQl', {type: 'line', data: {labels, datasets: [line('Actual', pad(y), t.ink, {borderWidth: 1.5}), line('Fitted', pad(fitted), t.s[0], {borderWidth: 2}), ...(h ? [line('Projection', fpad(fc), t.s[1], {borderWidth: 2.5}), line('Upper', fpad(fc.map(v => isNum(v) ? v + band : null)), t.s[1] + '55', {borderWidth: 1, borderDash: [4, 4]}), line('Lower', fpad(fc.map(v => isNum(v) ? v - band : null)), t.s[1] + '55', {borderWidth: 1, borderDash: [4, 4], fill: '-1', backgroundColor: t.s[1] + '18'})] : [])]},
    options: {plugins: {tooltip: tip('', 4)}, scales: {x: xCat(10)}}});
  let eqFit = m[2]; params.forEach((p, i) => { eqFit = eqFit.replace(new RegExp('\\b' + p + '\\b', 'g'), '(' + fit.p[i].toPrecision(6) + ')'); });
  $('#qlExtra').innerHTML = `<p class="note" style="font-family:var(--mono)">${esc(lhsSrc)} = ${esc(eqFit.trim())}</p>
    <div class="tbl"><table><thead><tr><th class="txt">Parameter</th><th>Estimate</th><th>Std. error</th><th>t</th><th>p-value</th><th>Start</th></tr></thead><tbody>
    ${params.map((p, i) => `<tr><td class="txt"><code>${esc(p)}</code></td><td class="num">${fit.p[i].toPrecision(6)}</td><td class="num">${isNum(fit.se[i]) ? fit.se[i].toPrecision(4) : '–'}</td><td class="num">${fmt(fit.t[i], 2)}</td><td class="num">${fit.pv[i] < 1e-4 ? '<0.0001' : fmt(fit.pv[i], 4)}</td><td class="num">${p0[i]}</td></tr>`).join('')}</tbody></table></div>
    <p class="src">If R² is low or estimates look odd, change the starting values and run again; nonlinear fits can stop at a local minimum.</p>`;
  qlWire(D.freq, [...D.keys, ...fk], [['Actual', pad(y)], ['Fitted', pad(fitted)], ['Projection', fpad(fc)]], 'fit');
  return fit;
}
/* ---- Monte Carlo & VaR ---- */
function qlMc(D) {
  const S = D.vars[QL.mc.v]; if (!S) throw new Error('Pick the price series.');
  const px = S.filter(isNum); if (px.length < 30) throw new Error('Need at least 30 prices.');
  const lr = QC.logRet(px).filter(isNum).slice(-QL.mc.look), mu = QC.mean(lr), sg = QC.sd(lr), S0 = last(px), h = Math.max(1, QL.mc.h), a = 1 - QL.mc.conf / 100, P = QL.mc.pos;
  const sim = QC.gbm(S0, mu, sg, h, QL.mc.paths);
  const retMC = sim.finals.map(s => s / S0 - 1), varMC = -QC.quantile(retMC, a), cvMC = -QC.mean(retMC.filter(r => r <= -varMC));
  const hRets = []; for (let i = h; i < px.length; i++) hRets.push(px[i] / px[i - h] - 1); const hw = hRets.slice(-QL.mc.look);
  const varH = -QC.quantile(hw, a), cvH = -QC.mean(hw.filter(r => r <= -varH));
  const z = QC.normInv(a), varP = -(Math.exp(mu * h + z * sg * Math.sqrt(h)) - 1);
  const t = T(), histN = Math.min(120, px.length), hist = px.slice(-histN), fk = futureKeys(D.freq, last(D.keys), h), keysH = D.keys.filter((k, i) => isNum(S[i])).slice(-histN);
  const labels = [...keysH, ...fk].map(k => lbl(D.freq, k)), fp = a2 => Array(histN - 1).fill(null).concat([S0], a2), ppy = D.freq === 'day' ? 240 : D.freq === 'fym' || D.freq === 'ym' ? 12 : D.freq === 'q' ? 4 : 1;
  qlOutShell(`Monte Carlo: ${QL.mc.v}, ${h} periods ahead`, `${QL.mc.paths.toLocaleString()} GBM paths · drift ${fmt(mu * 100, 3)}% and volatility ${fmt(sg * 100, 2)}% per period (annualised ${fmt(sg * Math.sqrt(ppy) * 100, 1)}%) from the last ${lr.length} returns`);
  kpis('#qlKpis', [
    {k: 'Current price', v: fmtAuto(S0)},
    {k: `Median in ${h} periods`, v: fmtAuto(last(sim.bands[2])), chip: `90%: ${fmtAuto(last(sim.bands[0]))}–${fmtAuto(last(sim.bands[4]))}`},
    {k: 'Chance of ending higher', v: fmt(sim.finals.filter(s => s > S0).length / sim.finals.length * 100, 1) + '%'},
    {k: `${QL.mc.conf}% VaR (Monte Carlo)`, v: 'Rs ' + fmt(varMC * P, 0), chip: fmt(varMC * 100, 2) + '% of position', dir: 'dn'},
    {k: `Expected shortfall (MC)`, v: 'Rs ' + fmt(cvMC * P, 0), chip: fmt(cvMC * 100, 2) + '%', dir: 'dn'},
  ]);
  mk('cQl', {type: 'line', data: {labels, datasets: [line('History', hist.concat(Array(h).fill(null)), t.ink, {borderWidth: 1.5}),
    line('95th pct', fp(sim.bands[4]), t.s[0] + '55', {borderWidth: 1}), line('5th pct', fp(sim.bands[0]), t.s[0] + '55', {borderWidth: 1, fill: '-1', backgroundColor: t.s[0] + '14'}),
    line('75th pct', fp(sim.bands[3]), t.s[0] + '88', {borderWidth: 1}), line('25th pct', fp(sim.bands[1]), t.s[0] + '88', {borderWidth: 1, fill: '-1', backgroundColor: t.s[0] + '22'}),
    line('Median', fp(sim.bands[2]), t.s[1], {borderWidth: 2.5})]}, options: {plugins: {tooltip: tip('', 2)}, scales: {x: xCat(10)}}});
  const bins = 30, mn = Math.min(...retMC), mx = Math.max(...retMC), w = (mx - mn) / bins || 1, hc = Array(bins).fill(0); retMC.forEach(r => hc[Math.min(bins - 1, Math.floor((r - mn) / w))]++);
  $('#qlExtra').innerHTML = `<div class="grid2"><div><h3>Value at Risk, ${h}-period horizon</h3><div class="tbl"><table><thead><tr><th class="txt">Method</th><th>VaR %</th><th>VaR (Rs)</th><th>Expected shortfall (Rs)</th></tr></thead><tbody>
      <tr><td class="txt">Historical (${hw.length} overlapping ${h}-period returns)</td><td class="num">${fmt(varH * 100, 2)}</td><td class="num">${fmt(varH * P, 0)}</td><td class="num">${fmt(cvH * P, 0)}</td></tr>
      <tr><td class="txt">Parametric (normal log returns)</td><td class="num">${fmt(varP * 100, 2)}</td><td class="num">${fmt(varP * P, 0)}</td><td class="num">–</td></tr>
      <tr><td class="txt">Monte Carlo (GBM)</td><td class="num">${fmt(varMC * 100, 2)}</td><td class="num">${fmt(varMC * P, 0)}</td><td class="num">${fmt(cvMC * P, 0)}</td></tr></tbody></table></div>
      <p class="src">Loss not expected to be exceeded with ${QL.mc.conf}% confidence on a Rs ${fmt(P, 0)} position. GBM assumes constant volatility and normal shocks; NEPSE returns have fatter tails, so the historical figure is often the most conservative.</p></div>
    <div><h3>Distribution of simulated ${h}-period returns</h3><div class="cv short"><canvas id="cQlHist"></canvas></div></div></div>`;
  mk('cQlHist', {type: 'bar', data: {labels: hc.map((_, i) => fmt((mn + (i + 0.5) * w) * 100, 1) + '%'), datasets: [bar('Paths', hc, hc.map((_, i) => mn + (i + 1) * w <= -varMC ? t.crit : t.s[0]), {maxBarThickness: 20, borderRadius: 2})]}, options: {plugins: {legend: {display: false}, tooltip: tip(' paths', 0)}, scales: {x: xCat(8), y: {beginAtZero: true}}}});
  qlWire(D.freq, fk, [['p5', sim.bands[0]], ['p25', sim.bands[1]], ['median', sim.bands[2]], ['p75', sim.bands[3]], ['p95', sim.bands[4]]], 'montecarlo');
  return {mu, sg, varMC};
}
/* ---- save result as a dataset ---- */
async function saveQlDataset(freq, keys, cols, base) {
  const name = (base || 'result') + ' — quant lab ' + new Date().toISOString().slice(0, 10);
  const per = {day: 'date', fy: 'fy', fym: 'fy-month', year: 'year', ym: 'year-month', q: 'quarter'}[freq] || 'quarter';
  const kc = per === 'date' ? [{k: 'date', label: 'Date', t: 'date', key: true}] : per === 'fy' ? [{k: 'fy', label: 'Fiscal year', t: 'text', key: true}] : per === 'fy-month' ? [{k: 'fy', label: 'Fiscal year', t: 'text', key: true}, {k: 'month', label: 'Month', t: 'select', key: true, opts: MON_AUG}]
    : per === 'year' ? [{k: 'year', label: 'Year', t: 'text', key: true}] : per === 'year-month' ? [{k: 'year', label: 'Year', t: 'text', key: true}, {k: 'month', label: 'Month', t: 'select', key: true, opts: MON_CAL}] : [{k: 'quarter', label: 'Period', t: 'text', key: true}];
  const vc = cols.map((c, i) => ({k: 'v' + i, label: c[0], t: 'num'}));
  const rows = keys.map((k, i) => { const r = {}; if (per === 'fy-month') { const [fy, m] = k.split('|'); r.fy = fy; r.month = MON_AUG[+m]; } else if (per === 'year-month') { const [y, m] = k.split('|'); r.year = y; r.month = MON_CAL[+m]; } else r[kc[0].k] = k; cols.forEach((c, j) => r['v' + j] = isNum(c[1][i]) ? +c[1][i].toPrecision(10) : null); return r; }).filter(r => cols.some((c, j) => r['v' + j] != null));
  const id = 'my_quant_' + Date.now().toString(36);
  Store.db.datasets[id] = {id, title: name, group: 'My data', period: per, cols: [...kc, ...vc], rows, keys: kc.map(c => c.k), source: 'Quant lab: ' + (QL.mode === 'mc' ? 'Monte Carlo ' + QL.mc.v : QL.eq), unit: '', note: 'Variables: ' + QL.vars.map(v => `${v.name} = ${ds(v.ds)?.title}${v.cat ? ' · ' + v.cat : ''} · ${v.col}`).join('; '), custom: true};
  sortRows(Store.db.datasets[id]); logChange('Saved quant result', id, name); await persist(true); afterDataChange();
  toast(`Saved "${name}" (${rows.length} rows). Find it under All data → My data.`);
}
