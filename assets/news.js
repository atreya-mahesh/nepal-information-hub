/* News & sentiment: a qualitative workbench in the NVivo / ATLAS.ti tradition (documents, codebook, coding,
   memos, queries, inter-coder reliability, REFI-QDA exchange) plus lexicon and machine-learning sentiment
   linked to NEPSE. Loaded before app.js; defines functions only. */
'use strict';

const NW = {sub: 'overview', doc: null, q: '', src: '', lab: '', code: '', sel: null, tone: false, view: 'all', qtype: 'freq', edit: null, fetchOpen: false, addOpen: false,
  qf: {src: '', from: '', to: '', code: ''}, mx: {rows: 'codes', cols: 'source', meas: 'segs'}, co: {level: 'doc'}, fw: [], wf: {min: 3, stem: false, bi: false}, kw: '', relA: '', relB: ''};
const THEME_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#4a3aa7', '#e34948', '#d55181', '#6b7280'];
function defaultCodebook() {
  const T_ = [
    ['Monetary policy & banking', [['Interest rates', 'interest rate, interest rates, policy rate, lending rate, deposit rate, base rate, spread, bank rate'], ['Liquidity operations', 'liquidity, deposit collection, repo, standing deposit, sdf, slf, nrb bond, excess liquidity'], ['Credit & lending', 'credit, loan, loans, lending, borrowing, cd ratio'], ['Banking regulation', 'directive, capital adequacy, holding period, provision, npl, non-performing, trading book, stress test, penalised, penalized, microfinance']]],
    ['Prices & cost of living', [['Inflation', 'inflation, cpi, consumer price'], ['Food & essentials', 'vegetable, sugar, lpg, cooking gas, egg, eggs, ghee, butter, fertilizer, urea'], ['Gold & commodities', 'gold, silver, petroleum, fuel, oil prices']]],
    ['External sector', [['Remittance', 'remittance, remittances'], ['Trade & customs', 'import, imports, export, exports, trade deficit, customs'], ['Exchange rate & reserves', 'exchange rate, foreign exchange, reserves, usd, dollar, rupee'], ['Aid, loans & FDI', 'grant, aid, assistance, fdi, foreign direct investment, adb, world bank, aiib, donor']]],
    ['Public finance', [['Revenue & tax', 'revenue, tax, vat, capital gains, excise'], ['Public debt', 'public debt, debt'], ['Budget & spending', 'budget, capital expenditure, spending, procurement, e-gp, contracts']]],
    ['Capital market', [['NEPSE movement', 'nepse, index, turnover, sub-index, market capitalisation, market capitalization'], ['Corporate actions', 'dividend, bonus, right share, agm, annual general meeting, book closure, profit'], ['Market regulation', 'sebon, intraday, lock-in, promoter, listing, ipo, securities board']]],
    ['Real economy & shocks', [['Floods & disasters', 'flood, floods, flooding, landslide, landslides, disaster, earthquake, damage'], ['Energy & hydropower', 'hydropower, electricity, megawatt, mw, nea, power plant, grid, power purchase'], ['Tourism & aviation', 'tourist, tourists, tourism, flight, flights, airline, airport, climbers, hotel'], ['Agriculture', 'farmer, farmers, agriculture, paddy, crop, crops'], ['Transport & supply chain', 'highway, highways, road, transport, supply, blocked, blockage, freight']]],
    ['Governance & policy', [['Legislation & courts', 'parliament, parliamentary, bill, act, amendment, supreme court, committee'], ['Government decisions', 'minister, ministry, cabinet, government']]],
    ['Tone (manual)', [['Positive tone', ''], ['Negative tone', ''], ['Uncertainty', '']]],
  ];
  const codes = []; let n = 0;
  T_.forEach(([th, kids], i) => { const tid = 'c' + (++n); codes.push({id: tid, name: th, parent: null, color: THEME_COLORS[i], desc: 'Theme', incl: '', excl: '', kw: ''});
    kids.forEach(([nm, kw]) => codes.push({id: 'c' + (++n), name: nm, parent: tid, color: nm === 'Positive tone' ? '#0ca30c' : nm === 'Negative tone' ? '#d03b3b' : nm === 'Uncertainty' ? '#b77800' : THEME_COLORS[i], desc: '', incl: '', excl: '', kw})); });
  return codes;
}
function Q() {
  const db = Store.db;
  if (!db.qual) db.qual = {codes: defaultCodebook(), segs: [], memos: [], coders: ['Me', 'Auto'], coder: 'Me', lex: {}, lexVer: 1, phases: {}, autoSeeded: false,
    feeds: ['https://english.onlinekhabar.com/feed', 'https://kathmandupost.com/rss', 'https://english.nepalnews.com/rss'],
    feedKw: 'economy, economic, nepse, stock, share, bank, nrb, rastra bank, inflation, remittance, budget, tax, revenue, trade, export, import, investment, interest rate, liquidity, loan, credit, gdp, hydropower, tourism, price, dividend, insurance, finance, fiscal, monetary, debt, customs'};
  return db.qual;
}
const newsDs = () => ds('news_docs');
const docs = () => newsDs()?.rows || [];
const docBy = id => docs().find(r => r.doc_id === id);
const codeBy = id => Q().codes.find(c => c.id === id);
const themeOf = c => c && c.parent ? codeBy(c.parent) : c;
const leafCodes = () => Q().codes.filter(c => c.parent || !Q().codes.some(k => k.parent === c.id));
const codePath = c => c.parent ? codeBy(c.parent)?.name + ' › ' + c.name : c.name;
function codeOptions(sel, withThemes = false) {
  const q = Q(); return q.codes.filter(c => !c.parent).map(t => { const kids = q.codes.filter(c => c.parent === t.id); if (!kids.length) return `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`;
    return `<optgroup label="${esc(t.name)}">${withThemes ? `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)} (theme)</option>` : ''}${kids.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`; }).join('');
}
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };

/* ---------- sentiment scoring and the daily index ---------- */
function newsRefresh(force) {
  const d = newsDs(); if (!d) return false; const q = Q(); let changed = false;
  d.rows.forEach(r => { const h = hash((r.title || '') + '|' + (r.text || '') + '|' + q.lexVer); if (!force && r._h === h && isNum(r.score)) return;
    const s = TX.scoreText((r.title ? r.title + '. ' : '') + (r.text || ''), q.lex); r.score = +s.tone.toFixed(4); r.label = s.label; r._unc = s.unc; r._h = h; changed = true;
    if (!r.lang) r.lang = /[ऀ-ॿ]/.test(r.text || '') ? 'ne' : 'en'; });
  // daily index on NEPSE trading dates
  const trade = uniq((ds('stock_ohlc')?.rows || []).filter(r => r.symbol === 'NEPSE').map(r => r.date)).sort();
  const eff = dt => { if (!trade.length || dt > last(trade)) return dt; let lo = 0, hi = trade.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (trade[m] >= dt) hi = m; else lo = m + 1; } return trade[lo]; };
  const g = new Map(); d.rows.forEach(r => { if (!r.date || !isNum(r.score)) return; const k = eff(r.date); if (!g.has(k)) g.set(k, []); g.get(k).push(r); });
  const idx = [...g.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, rs]) => ({date, docs: rs.length, tone: +avg(rs.map(r => r.score)).toFixed(4),
    net: +((rs.filter(r => r.label === 'Positive').length - rs.filter(r => r.label === 'Negative').length) / rs.length).toFixed(4),
    pos: +(rs.filter(r => r.label === 'Positive').length / rs.length).toFixed(4), neg: +(rs.filter(r => r.label === 'Negative').length / rs.length).toFixed(4), unc: +avg(rs.map(r => r._unc || 0)).toFixed(3)}));
  const si = ds('news_sentiment'); if (si && JSON.stringify(si.rows) !== JSON.stringify(idx)) { si.rows = idx; changed = true; }
  return changed;
}
function autoCode(docList, codes, coder = 'Auto') {
  const q = Q(); let n = 0; const rules = (codes || leafCodes()).filter(c => c.kw && c.kw.trim()).map(c => ({c, re: new RegExp('(?<![\\p{L}\\p{N}])(' + c.kw.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|') + ')(?![\\p{L}\\p{N}])', 'iu')}));
  const have = new Set(q.segs.map(s => s.doc + '|' + s.code + '|' + s.start + '|' + s.end + '|' + s.coder));
  (docList || docs()).forEach(d => TX.sentences(d.text || '').forEach(s => rules.forEach(({c, re}) => { if (re.test(s.text)) { const k = d.doc_id + '|' + c.id + '|' + s.start + '|' + s.end + '|' + coder; if (!have.has(k)) { have.add(k); q.segs.push({id: TX.uuid(), doc: d.doc_id, start: s.start, end: s.end, code: c.id, coder, at: new Date().toISOString()}); n++; } } })));
  return n;
}
async function newsBoot() {
  if (!newsDs()) return; const q = Q(); let ch = newsRefresh(false);
  if (!q.autoSeeded) { autoCode(); q.autoSeeded = true; ch = true; }
  if (ch) await persist(true);
}

/* fetch every configured RSS feed (needs server.py); used by the Refresh news buttons */
async function newsRefreshUI(sel) { const el = $(sel); if (Store.mode !== 'server') { if (el) el.innerHTML = '<span class="msg warn">Refreshing news needs the app running through server.py (start-windows.bat).</span>'; return null; }
  if (el) el.innerHTML = '<span>Fetching the latest news…</span>'; try { const r = await newsFetchAll(); if (el) el.innerHTML = `<span><b>${r.added}</b> new items · ${r.skipped} filtered out${r.errs.length ? ' · problems: ' + esc(r.errs.join('; ')) : ''}</span>`; return r; } catch (e) { if (el) el.innerHTML = `<span class="msg err">${esc(e.message)}</span>`; return null; } }
async function newsFetchAll({autocode = true} = {}) {
  const q = Q();
      const kws = q.feedKw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean), d = newsDs(), seen = new Set(d.rows.map(r => r.url).filter(Boolean)), seenT = new Set(d.rows.map(r => (r.title || '').toLowerCase())); let added = 0, skipped = 0; const errs = [], newDocs = [];
      for (const f of q.feeds) { try { const j = await (await fetch('api/rss?url=' + encodeURIComponent(f))).json(); if (!j.ok) throw new Error(j.error);
          const x = new DOMParser().parseFromString(j.text, 'application/xml'), ch = x.querySelector('channel > title, feed > title')?.textContent?.trim() || new URL(f).hostname;
          const items = [...x.querySelectorAll('item, entry')];
          items.forEach(it => { const g = s => it.querySelector(s)?.textContent?.trim() || ''; const title = g('title'), link = g('link') || it.querySelector('link')?.getAttribute('href') || '', raw = g('description') || g('summary') || g('content');
            const text = new DOMParser().parseFromString(raw, 'text/html').body.textContent.replace(/\s+/g, ' ').trim(); const dt = new Date(g('pubDate') || g('published') || g('updated') || Date.now());
            const hay = (title + ' ' + text).toLowerCase(); if (kws.length && !kws.some(k => hay.includes(k))) { skipped++; return; }
            if ((link && seen.has(link)) || seenT.has(title.toLowerCase())) return; seen.add(link); seenT.add(title.toLowerCase());
            const date = isNaN(dt) ? new Date().toISOString().slice(0, 10) : new Date(dt.getTime() + 5.75 * 3600e3).toISOString().slice(0, 10);
            const row = {date, doc_id: 'R' + date.replace(/-/g, '').slice(2) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(), title, source: ch, type: 'News', lang: /[ऀ-ॿ]/.test(title + text) ? 'ne' : 'en', url: link || null, text: text || title};
            d.rows.push(row); newDocs.push(row); added++; }); } catch (e) { errs.push(`${f}: ${e.message}`); } }
      sortRows(d); newsRefresh(false); if (autocode && newDocs.length) autoCode(newDocs); q.lastFetch = new Date().toISOString(); logChange('Fetched news', 'news_docs', `${added} added`); await persist(true); afterDataChange();
      return {added, skipped, errs};
}
/* ---------- menu ---------- */
const NW_SUBS = [['overview', 'Overview'], ['docs', 'Documents & coding'], ['codebook', 'Codebook'], ['analysis', 'Queries'], ['senti', 'Sentiment model'], ['rel', 'Reliability'], ['memos', 'Memos & themes'], ['xchg', 'NVivo / ATLAS.ti exchange']];
function renderNews() {
  try { NW.sub = localStorage.getItem('nmm-news-sub') || NW.sub; } catch (e) {}
  if (!newsDs()) { $('#p-news').innerHTML = '<div class="card"><div class="empty">The news dataset is missing. Reset from Data entry.</div></div>'; return; }
  Q(); newsRefresh(false);
  $('#p-news').innerHTML = `<div class="subnav" id="nwSub">${NW_SUBS.map(([k, l]) => `<button data-s="${k}" aria-selected="${NW.sub === k}">${l}</button>`).join('')}<button class="link" id="nwRefresh" title="Fetch the latest items from your RSS feeds">↻ Refresh news</button></div><div class="readout" id="nwRefMsg"></div><div id="nwBody" style="display:grid;gap:18px"></div>`;
  $('#nwRefresh').onclick = async e => { e.stopPropagation(); await newsRefreshUI('#nwRefMsg'); renderNews(); };
  $('#nwSub').onclick = e => { const b = e.target.closest('button'); if (!b || !b.dataset.s) return; NW.sub = b.dataset.s; try { localStorage.setItem('nmm-news-sub', NW.sub); } catch (err) {} renderNews(); };
  ({overview: nwOverview, docs: nwDocs, codebook: nwCodebook, analysis: nwAnalysis, senti: nwSenti, rel: nwRel, memos: nwMemos, xchg: nwExchange})[NW.sub]();
}
const toneChip = s => !isNum(s) ? '' : `<span class="chip ${s > 0.2 ? 'up' : s < -0.2 ? 'dn' : 'nt'}">${s > 0 ? '+' : ''}${fmt(s, 2)}</span>`;
function openDoc(id) { NW.doc = id; NW.sub = 'docs'; try { localStorage.setItem('nmm-news-sub', 'docs'); } catch (e) {} if (cur !== 'news') show('news'); else renderNews(); }

/* ---------- overview ---------- */
function nwOverview() {
  const b = $('#nwBody'), D = docs().filter(r => r.date).sort((a, c) => a.date < c.date ? -1 : 1), q = Q(), si = ds('news_sentiment').rows, t = T();
  if (!D.length) { b.innerHTML = `<div class="card"><div class="empty">No documents yet. Add news under <b>Documents & coding</b>, fetch RSS feeds, or import a CSV / NVivo / ATLAS.ti project.</div></div>`; return; }
  const lastD = last(D).date, day = s => new Date(s + 'T00:00:00Z').getTime(), L7 = D.filter(r => day(lastD) - day(r.date) < 7 * 864e5), P7 = D.filter(r => { const x = day(lastD) - day(r.date); return x >= 7 * 864e5 && x < 14 * 864e5; });
  const a7 = avg(L7.map(r => r.score)), p7 = avg(P7.map(r => r.score)), cnt = {}; q.segs.forEach(s => cnt[s.code] = (cnt[s.code] || 0) + 1);
  const topC = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0];
  kpis('#nwBody', []);
  b.innerHTML = `<div class="kpis" id="nwK"></div>
  <div class="grid2">
    <div class="card"><h2>Daily news sentiment index</h2><p class="sub">Average lexicon tone of the day's documents (−1 to +1); news on holidays counts toward the next NEPSE session</p><div class="cv"><canvas id="cNwIdx"></canvas></div></div>
    <div class="card"><h2>NEPSE over the same days</h2><p class="sub">Closing index on the sentiment index dates</p><div class="cv"><canvas id="cNwNepse"></canvas></div></div>
    <div class="card"><h2>Does news tone lead the market?</h2><p class="sub">Correlation between tone on day t and NEPSE daily return on day t+k</p><div class="cv short"><canvas id="cNwLag"></canvas></div><div class="readout" id="nwLagRead"></div></div>
    <div class="card"><h2>What the news is about</h2><p class="sub">Coded segments by theme (all coders)</p><div class="cv short"><canvas id="cNwThemes"></canvas></div></div>
    <div class="card"><h2>Most positive documents</h2><div id="nwTopPos"></div></div>
    <div class="card"><h2>Most negative documents</h2><div id="nwTopNeg"></div></div>
  </div>`;
  kpis('#nwK', [
    {k: 'Documents', v: fmt(D.length, 0), chip: D[0].date + ' → ' + lastD},
    {k: 'Average tone, last 7 days', v: (a7 > 0 ? '+' : '') + fmt(a7, 2), chip: isNum(p7) ? 'prior week ' + (p7 > 0 ? '+' : '') + fmt(p7, 2) : 'no prior week', dir: dirc(a7, p7)},
    {k: 'Negative documents', v: fmt(D.filter(r => r.label === 'Negative').length / D.length * 100, 0) + '%', chip: fmt(D.filter(r => r.label === 'Positive').length / D.length * 100, 0) + '% positive'},
    {k: 'Coded segments', v: fmt(q.segs.length, 0), chip: uniq(q.segs.map(s => s.coder)).length + ' coders'},
    {k: 'Most frequent code', v: topC ? codeBy(topC[0])?.name || '–' : '–', chip: topC ? topC[1] + ' segments' : ''},
  ]);
  mk('cNwIdx', {type: 'bar', data: {labels: si.map(r => r.date), datasets: [bar('Tone', si.map(r => r.tone), si.map(r => r.tone >= 0 ? t.good : t.crit), {maxBarThickness: 18, order: 2}), line('3-day EMA', QC.ema(si.map(r => r.tone), 3), t.ink, {type: 'line', order: 1, borderWidth: 1.5})]},
    options: {plugins: {tooltip: {callbacks: {label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y, 2)}` + (c.datasetIndex === 0 ? ` · ${si[c.dataIndex].docs} docs` : '')}}}, scales: {x: xCat(8), y: {suggestedMin: -1, suggestedMax: 1}}}});
  const px = new Map((ds('stock_ohlc')?.rows || []).filter(r => r.symbol === 'NEPSE').map(r => [r.date, r.close]));
  mk('cNwNepse', {type: 'line', data: {labels: si.map(r => r.date), datasets: [line('NEPSE', si.map(r => px.get(r.date) ?? null), t.s[0], {pointRadius: 2.5})]}, options: {plugins: {legend: {display: false}, tooltip: tip('', 2)}, scales: {x: xCat(8)}}});
  // lead–lag on trading days
  const days = [...px.keys()].sort(), ret = new Map(days.map((d, i) => [d, i ? (px.get(d) / px.get(days[i - 1]) - 1) * 100 : null])), tone = new Map(si.map(r => [r.date, r.tone]));
  const ks = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5], cs = ks.map(k => { const a = [], b2 = []; days.forEach((d, i) => { if (!tone.has(d)) return; const j = i + k; if (j < 0 || j >= days.length) return; const r = ret.get(days[j]); if (isNum(r)) { a.push(tone.get(d)); b2.push(r); } }); return {k, r: QC.corr(a, b2), n: a.length}; });
  mk('cNwLag', {type: 'bar', data: {labels: ks.map(k => (k > 0 ? '+' : '') + k), datasets: [bar('Correlation', cs.map(c => c.r), cs.map(c => c.k > 0 ? t.s[0] : t.neutral), {maxBarThickness: 22})]}, options: {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` r = ${fmt(c.parsed.y, 2)} (n = ${cs[c.dataIndex].n})`}}}, scales: {x: {grid: {display: false}, title: {display: true, text: 'k (days; positive = tone leads)', color: t.ink3}}, y: {suggestedMin: -1, suggestedMax: 1}}}});
  const n0 = cs.find(c => c.k === 1)?.n || 0, crit = n0 > 3 ? 1.96 / Math.sqrt(n0) : null;
  $('#nwLagRead').innerHTML = `<span>Sessions with news: <b>${cs.find(c => c.k === 0)?.n || 0}</b></span><span>Tone → next-day return: <b>r = ${fmt(cs.find(c => c.k === 1)?.r, 2)}</b></span>${crit ? `<span>|r| above <b>${fmt(crit, 2)}</b> is significant at 5%</span>` : ''}<span>${n0 < 30 ? 'Few sessions yet: keep adding news before reading much into this.' : ''}</span>`;
  const th = q.codes.filter(c => !c.parent), tc = th.map(x => q.segs.filter(s => { const c = codeBy(s.code); return c && (c.id === x.id || c.parent === x.id); }).length);
  mk('cNwThemes', {type: 'bar', data: {labels: th.map(x => x.name), datasets: [bar('Segments', tc, th.map(x => x.color), {maxBarThickness: 16})]}, options: hbarOpts('', 0)});
  const lst = rs => rs.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--grid)"><a href="#" data-doc="${esc(r.doc_id)}"><b>${esc(r.title)}</b></a> ${toneChip(r.score)}<br><span class="sub">${esc(r.date)} · ${esc(r.source || '')}</span></div>`).join('');
  $('#nwTopPos').innerHTML = lst(D.slice().sort((a, c) => c.score - a.score).slice(0, 5)); $('#nwTopNeg').innerHTML = lst(D.slice().sort((a, c) => a.score - c.score).slice(0, 5));
  b.querySelectorAll('[data-doc]').forEach(a => a.onclick = e => { e.preventDefault(); openDoc(a.dataset.doc); });
}

/* ---------- documents & coding ---------- */
function nwFilteredDocs() {
  const q = Q(), s = NW.q.toLowerCase();
  let rs = docs().filter(r => (!NW.src || r.source === NW.src) && (!NW.lab || (NW.lab === 'Unlabelled' ? !r.human : r.label === NW.lab || r.human === NW.lab)) && (!s || (r.title + ' ' + r.text).toLowerCase().includes(s)));
  if (NW.code) { const has = new Set(q.segs.filter(x => x.code === NW.code || codeBy(x.code)?.parent === NW.code).map(x => x.doc)); rs = rs.filter(r => has.has(r.doc_id)); }
  return rs.sort((a, c) => (c.date || '').localeCompare(a.date || '') || (a.doc_id < c.doc_id ? -1 : 1));
}
function nwDocs() {
  const b = $('#nwBody'), q = Q(), rs = nwFilteredDocs(), srcs = uniq(docs().map(r => r.source).filter(Boolean)).sort();
  if (!NW.doc || !docBy(NW.doc)) NW.doc = rs[0]?.doc_id || null;
  const segCount = {}; q.segs.forEach(s => segCount[s.doc] = (segCount[s.doc] || 0) + 1);
  b.innerHTML = `
  <div class="actions"><button class="btn primary admin-only" id="nwAdd">+ Add document</button><button class="btn" id="nwFetch">Fetch news (RSS)</button><button class="btn admin-only" onclick="show('imp')">Import CSV / Excel</button><span class="sub">Coding as</span>
    <select id="nwCoder" aria-label="Coder">${q.coders.map(c => `<option ${c === q.coder ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><button class="btn small" id="nwNewCoder">+ Coder</button></div>
  <div id="nwPanel"></div>
  <div class="split" style="grid-template-columns:320px minmax(0,1fr)">
    <aside class="dslist" style="gap:8px">
      <input id="nwQ" type="search" placeholder="Search text" value="${esc(NW.q)}" aria-label="Search documents">
      <select id="nwSrc" aria-label="Source"><option value="">All sources</option>${srcs.map(s => `<option ${s === NW.src ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select id="nwLab" aria-label="Tone"><option value="">Any tone</option>${['Positive', 'Negative', 'Neutral', 'Mixed', 'Unlabelled'].map(s => `<option ${s === NW.lab ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select id="nwCode" aria-label="Code"><option value="">Any code</option>${codeOptions(NW.code, true)}</select>
      <div class="sub">${rs.length} documents</div>
      <div style="display:grid;gap:2px">${rs.slice(0, 400).map(r => `<button class="ds" data-id="${esc(r.doc_id)}" aria-current="${r.doc_id === NW.doc}" style="display:block"><span style="display:block;font-weight:500">${esc(r.title || r.doc_id)}</span><span class="sub">${esc(r.date || '')} · ${esc((r.source || '').slice(0, 24))} ${toneChip(r.score)} ${segCount[r.doc_id] ? `<span class="pill">${segCount[r.doc_id]} codes</span>` : ''}</span></button>`).join('')}</div>
    </aside>
    <div id="nwViewer" style="display:grid;gap:14px;min-width:0"></div>
  </div>`;
  $('#nwAdd').onclick = () => { NW.addOpen = !NW.addOpen; NW.fetchOpen = false; NW.edit = null; nwPanel(); };
  $('#nwFetch').onclick = () => { NW.fetchOpen = !NW.fetchOpen; NW.addOpen = false; nwPanel(); };
  $('#nwCoder').onchange = async e => { q.coder = e.target.value; await persist(true); nwViewer(); };
  $('#nwNewCoder').onclick = () => { const box = $('#nwPanel'); box.innerHTML = `<div class="card"><div class="ctrls"><label for="ncName" class="sub">New coder name</label><input id="ncName" placeholder="e.g. Sita"><button class="btn primary small" id="ncOk">Add</button></div><p class="sub">Each coder's coding is stored separately, so you can compare coders under Reliability.</p></div>`;
    $('#ncOk').onclick = async () => { const n = $('#ncName').value.trim(); if (!n) return; if (!q.coders.includes(n)) q.coders.push(n); q.coder = n; await persist(true); nwDocs(); }; };
  const re = () => { NW.q = $('#nwQ').value; NW.src = $('#nwSrc').value; NW.lab = $('#nwLab').value; NW.code = $('#nwCode').value; nwDocs(); };
  $('#nwQ').onchange = re; ['#nwSrc', '#nwLab', '#nwCode'].forEach(s => $(s).onchange = re);
  b.querySelectorAll('button.ds').forEach(x => x.onclick = () => { NW.doc = x.dataset.id; NW.sel = null; b.querySelectorAll('button.ds').forEach(y => y.setAttribute('aria-current', y === x)); nwViewer(); });
  nwPanel(); nwViewer();
}
function nwPanel() {
  const box = $('#nwPanel'); if (!box) return; const q = Q();
  if (NW.addOpen || NW.edit) { const r = NW.edit ? docBy(NW.edit) : {date: new Date().toISOString().slice(0, 10), type: 'News', lang: 'en'};
    box.innerHTML = `<div class="card"><h2>${NW.edit ? 'Edit document' : 'Add a document'}</h2><div class="form">
      <div class="f"><label for="ndDate">Date <span class="req">*</span></label><input id="ndDate" type="date" value="${esc(r.date || '')}"></div>
      <div class="f" style="grid-column:span 2"><label for="ndTitle">Title <span class="req">*</span></label><input id="ndTitle" value="${esc(r.title || '')}"></div>
      <div class="f"><label for="ndSrc">Source</label><input id="ndSrc" list="ndSrcList" value="${esc(r.source || '')}" placeholder="e.g. Kathmandu Post"><datalist id="ndSrcList">${uniq(docs().map(x => x.source).filter(Boolean)).map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="f"><label for="ndType">Type</label><select id="ndType">${newsDs().cols.find(c => c.k === 'type').opts.map(o => `<option ${o === r.type ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="f"><label for="ndUrl">Link</label><input id="ndUrl" value="${esc(r.url || '')}" placeholder="https://"></div></div>
      <div class="f" style="display:grid;gap:4px"><label for="ndText" class="sub">Text (paste the full article, statement or transcript; Nepali works too)</label><textarea id="ndText" style="min-height:180px;font-family:var(--sans);font-size:14px">${esc(r.text || '')}</textarea></div>
      ${NW.edit && q.segs.some(s => s.doc === NW.edit) ? '<p class="msg warn">This document has coded segments. Changing the text can shift them; edit only typos or add text at the end.</p>' : ''}
      <div class="actions"><button class="btn primary" id="ndSave">${NW.edit ? 'Save changes' : 'Add document'}</button><button class="btn" id="ndCancel">Cancel</button><span id="ndMsg"></span></div></div>`;
    $('#ndCancel').onclick = () => { NW.addOpen = false; NW.edit = null; nwPanel(); };
    $('#ndSave').onclick = async () => { const date = $('#ndDate').value, title = $('#ndTitle').value.trim(), text = $('#ndText').value;
      if (!date || !title) return msg('#ndMsg', 'Date and title are required.', 'err');
      const d = newsDs(); let row = NW.edit ? docBy(NW.edit) : null;
      if (!row) { row = {date, doc_id: 'D' + date.replace(/-/g, '').slice(2) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()}; d.rows.push(row); }
      Object.assign(row, {date, title, source: $('#ndSrc').value.trim() || null, type: $('#ndType').value, url: $('#ndUrl').value.trim() || null, text, lang: /[ऀ-ॿ]/.test(text) ? 'ne' : 'en'}); row._h = null;
      sortRows(d); newsRefresh(false); logChange(NW.edit ? 'Edited document' : 'Added document', 'news_docs', title); await persist(true); afterDataChange();
      NW.doc = row.doc_id; NW.addOpen = false; NW.edit = null; toast('Saved · tone ' + fmt(row.score, 2)); nwDocs(); };
    return; }
  if (NW.fetchOpen) {
    box.innerHTML = `<div class="card"><h2>Fetch news from RSS feeds</h2>${Store.mode !== 'server' ? '<p class="msg warn">Fetching needs the local server (start-windows.bat). In this mode you can still paste articles or import files.</p>' : ''}
      <div class="grid2"><div class="f" style="display:grid;gap:4px"><label for="fdList" class="sub">Feeds, one per line (any RSS or Atom link)</label><textarea id="fdList">${esc(q.feeds.join('\n'))}</textarea></div>
      <div class="f" style="display:grid;gap:4px"><label for="fdKw" class="sub">Keep items that mention any of these words (leave empty to keep everything)</label><textarea id="fdKw">${esc(q.feedKw)}</textarea></div></div>
      <div class="actions"><button class="btn primary" id="fdGo" ${Store.mode !== 'server' ? 'disabled' : ''}>Fetch now</button><label class="sub"><input type="checkbox" id="fdCode" checked> Auto-code new items with keyword rules</label><span id="fdMsg"></span></div>
      <p class="src">Feeds usually give the headline and a short summary. Open the link and paste the full text into the document for deeper coding.</p></div>`;
    $('#fdGo').onclick = async () => { q.feeds = $('#fdList').value.split('\n').map(s => s.trim()).filter(Boolean); q.feedKw = $('#fdKw').value; msg('#fdMsg', 'Fetching…', '');
      const {added, skipped, errs} = await newsFetchAll({autocode: $('#fdCode').checked});
      msg('#fdMsg', `${added} new items added, ${skipped} skipped by the keyword filter.${errs.length ? ' Problems: ' + errs.join('; ') : ''}`, errs.length ? 'warn' : 'ok'); if (added) setTimeout(() => nwDocs(), 1500); };
    return; }
  box.innerHTML = '';
}
function offsetsIn(el) { const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0); if (!el.contains(r.startContainer) || !el.contains(r.endContainer) || r.collapsed) return null;
  const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset); const start = pre.toString().length; return {start, end: start + r.toString().length}; }
function nwViewer() {
  const v = $('#nwViewer'); if (!v) return; const q = Q(), r = docBy(NW.doc);
  if (!r) { v.innerHTML = '<div class="card"><div class="empty">Pick or add a document.</div></div>'; return; }
  const text = r.text || '', segs = q.segs.filter(s => s.doc === r.doc_id && (NW.view === 'all' || s.coder === NW.view)).sort((a, b) => a.start - b.start);
  const sc = TX.scoreText(text, q.lex), marks = [];
  segs.forEach(s => marks.push({a: s.start, b: s.end, seg: s}));
  if (NW.tone) sc.hits.forEach(h => { if (isNum(h.i)) marks.push({a: h.i, b: h.i + h.t.length, tone: h.w}); });
  const pts = uniq([0, text.length, ...marks.flatMap(m => [m.a, m.b])]).filter(x => x >= 0 && x <= text.length).sort((a, b) => a - b);
  let html = ''; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b2 = pts[i + 1], act = marks.filter(m => m.a <= a && m.b >= b2), ss = act.filter(m => m.seg), tn = act.find(m => m.tone != null), piece = esc(text.slice(a, b2));
    if (!ss.length && !tn) { html += piece; continue; }
    const c0 = ss.length ? codeBy(ss[0].seg.code) : null, st = [c0 ? `background:${c0.color}33` : '', ss.length > 1 ? 'text-decoration:underline double ' + (codeBy(ss[1].seg.code)?.color || '') : '', tn ? `color:${tn.tone > 0 ? 'var(--good)' : 'var(--crit)'};font-weight:600` : ''].filter(Boolean).join(';');
    html += `<span style="${st}" title="${esc(ss.map(m => codeBy(m.seg.code)?.name + ' (' + m.seg.coder + ')').join(', '))}">${piece}</span>`; }
  const coders = uniq(q.segs.filter(s => s.doc === r.doc_id).map(s => s.coder)), memo = q.memos.find(m => m.type === 'doc' && m.ref === r.doc_id);
  v.innerHTML = `<div class="card">
    <div class="chead"><div><h2>${esc(r.title || r.doc_id)}</h2><p class="sub">${esc(r.date || '')} · ${esc(r.source || '')} · ${esc(r.type || '')} ${r.url ? `· <a href="${esc(r.url)}" target="_blank" rel="noopener">original article</a>` : ''}</p></div>
      <div class="ctrls">${toneChip(r.score)}<span class="sub">lexicon ${esc(r.label || '')}</span><label class="sub" for="nwHuman">Your label</label><select id="nwHuman"><option value="">–</option>${['Positive', 'Negative', 'Neutral', 'Mixed'].map(o => `<option ${o === r.human ? 'selected' : ''}>${o}</option>`).join('')}</select><button class="btn small" id="nwEdit">Edit</button><button class="btn small danger" id="nwDel">Delete</button></div></div>
    <div class="ctrls" style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:8px">
      <select id="nwCodeSel" aria-label="Code to apply" style="max-width:260px">${codeOptions(NW.lastCode || leafCodes()[0]?.id)}</select>
      <button class="btn small primary" id="nwApply" disabled>Code selection</button><button class="btn small" id="nwWhole">Code whole document</button>
      <span class="sub" id="nwSelInfo">Select text below, then choose a code.</span>
      <span style="margin-left:auto" class="ctrls"><label class="sub"><input type="checkbox" id="nwTone" ${NW.tone ? 'checked' : ''}> Show tone words</label>
      <select id="nwView" aria-label="Show coding by"><option value="all">All coders</option>${coders.map(c => `<option ${c === NW.view ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></span></div>
    <div id="docText" style="white-space:pre-wrap;font-size:15px;line-height:1.75;max-width:78ch;padding:6px 2px;user-select:text">${html || '<span class="sub">This document has no text yet. Use Edit to paste it.</span>'}</div>
    ${NW.tone ? `<p class="src">Tone words: <span style="color:var(--good);font-weight:600">positive</span> and <span style="color:var(--crit);font-weight:600">negative</span> hits for the lexicon (${fmt(sc.pos, 1)} vs ${fmt(sc.neg, 1)}; ${sc.unc} uncertainty words).</p>` : ''}
  </div>
  <div class="card"><h3>Coded segments (${segs.length})</h3><div class="tbl"><table><thead><tr><th class="txt">Code</th><th class="txt">Excerpt</th><th class="txt">Coder</th><th class="txt">Comment</th><th></th></tr></thead><tbody>
    ${segs.map(s => { const c = codeBy(s.code); return `<tr data-seg="${s.id}"><td class="txt"><span class="bar-inline" style="width:10px;background:${c?.color};margin:0 6px 0 0"></span>${esc(c ? codePath(c) : '(deleted code)')}</td><td class="txt" style="max-width:420px">${esc(text.slice(s.start, s.end).slice(0, 220))}</td><td>${esc(s.coder)}</td><td class="txt"><input data-note="${s.id}" value="${esc(s.note || '')}" placeholder="add a comment" style="width:100%"></td><td><button class="btn small danger" data-rm="${s.id}">Remove</button></td></tr>`; }).join('') || '<tr><td class="txt" colspan="5">Nothing coded yet in this document.</td></tr>'}
  </tbody></table></div>
  <h3>Document memo</h3><textarea id="nwMemo" style="min-height:70px;font-family:var(--sans);font-size:13px" placeholder="Observations, context, questions about this document">${esc(memo?.text || '')}</textarea><div class="actions"><button class="btn small" id="nwMemoSave">Save memo</button></div></div>`;
  const dt = $('#docText');
  const upd = () => { const o = offsetsIn(dt); NW.sel = o; $('#nwApply').disabled = !o; $('#nwSelInfo').textContent = o ? `Selected ${o.end - o.start} characters: “${text.slice(o.start, Math.min(o.end, o.start + 60))}${o.end - o.start > 60 ? '…' : ''}”` : 'Select text below, then choose a code.'; };
  dt.addEventListener('mouseup', upd); dt.addEventListener('keyup', upd);
  const addSeg = async (start, end) => { const code = $('#nwCodeSel').value; NW.lastCode = code; q.segs.push({id: TX.uuid(), doc: r.doc_id, start, end, code, coder: q.coder, at: new Date().toISOString()}); await persist(true); nwViewer(); toast('Coded as ' + codeBy(code).name); };
  $('#nwApply').onclick = () => { if (NW.sel) { let {start, end} = NW.sel; while (start < end && /\s/.test(text[start])) start++; while (end > start && /\s/.test(text[end - 1])) end--; if (end > start) addSeg(start, end); } };
  $('#nwWhole').onclick = () => addSeg(0, text.length);
  $('#nwTone').onchange = e => { NW.tone = e.target.checked; nwViewer(); }; $('#nwView').onchange = e => { NW.view = e.target.value; nwViewer(); };
  $('#nwHuman').onchange = async e => { r.human = e.target.value || null; await persist(true); toast('Label saved'); };
  $('#nwEdit').onclick = () => { NW.edit = r.doc_id; NW.addOpen = false; NW.fetchOpen = false; nwPanel(); $('#nwPanel').scrollIntoView({behavior: 'smooth'}); };
  $('#nwDel').onclick = async () => { if (!(await confirmBox('Delete this document?', `<b>${esc(r.title)}</b> and its ${q.segs.filter(s => s.doc === r.doc_id).length} coded segments will be removed.`, 'Delete'))) return;
    const d = newsDs(); d.rows = d.rows.filter(x => x !== r); q.segs = q.segs.filter(s => s.doc !== r.doc_id); q.memos = q.memos.filter(m => !(m.type === 'doc' && m.ref === r.doc_id)); newsRefresh(false); logChange('Deleted document', 'news_docs', r.title); await persist(true); afterDataChange(); NW.doc = null; nwDocs(); };
  v.querySelectorAll('[data-rm]').forEach(bn_ => bn_.onclick = async () => { q.segs = q.segs.filter(s => s.id !== bn_.dataset.rm); await persist(true); nwViewer(); });
  v.querySelectorAll('[data-note]').forEach(inp => inp.onchange = async () => { const s = q.segs.find(x => x.id === inp.dataset.note); s.note = inp.value; await persist(true); });
  $('#nwMemoSave').onclick = async () => { const tx = $('#nwMemo').value; let m = q.memos.find(x => x.type === 'doc' && x.ref === r.doc_id); if (!m) { m = {id: TX.uuid(), type: 'doc', ref: r.doc_id, title: 'Memo: ' + r.title}; q.memos.push(m); } m.text = tx; m.at = new Date().toISOString(); m.author = q.coder; await persist(true); toast('Memo saved'); };
}

/* ---------- codebook ---------- */
function nwCodebook() {
  const b = $('#nwBody'), q = Q(), cnt = {}, dcnt = {}; q.segs.forEach(s => { cnt[s.code] = (cnt[s.code] || 0) + 1; (dcnt[s.code] = dcnt[s.code] || new Set()).add(s.doc); });
  const rollup = c => { const ids = [c.id, ...q.codes.filter(k => k.parent === c.id).map(k => k.id)]; return {n: sum(ids.map(i => cnt[i] || 0)), d: new Set(ids.flatMap(i => [...(dcnt[i] || [])])).size}; };
  const row = (c, lvl) => { const r = rollup(c); return `<tr><td class="txt" style="padding-left:${10 + lvl * 20}px"><span class="bar-inline" style="width:12px;height:12px;background:${c.color};margin:0 8px 0 0"></span><b style="font-weight:${lvl ? 500 : 700}">${esc(c.name)}</b></td><td class="txt" style="max-width:280px">${esc(c.desc || '')}${c.incl ? `<br><span class="sub">Include: ${esc(c.incl)}</span>` : ''}${c.excl ? `<br><span class="sub">Exclude: ${esc(c.excl)}</span>` : ''}</td><td class="txt" style="max-width:240px"><span class="sub">${esc(c.kw || '')}</span></td><td class="num">${r.n}</td><td class="num">${r.d}</td>
    <td style="white-space:nowrap"><button class="btn small" data-ed="${c.id}">Edit</button> ${!c.parent ? `<button class="btn small" data-child="${c.id}">+ Code</button>` : ''} <button class="btn small" data-auto="${c.id}" ${c.kw ? '' : 'disabled'}>Auto-code</button></td></tr>`; };
  b.innerHTML = `<div class="card"><div class="chead"><div><h2>Codebook</h2><p class="sub">Themes (parents) group codes. Keywords drive auto-coding, like NVivo's auto code or ATLAS.ti's search & code; everything else is coded by hand in Documents.</p></div>
      <div class="ctrls"><button class="btn small primary" id="cbNewTheme">+ Theme</button><button class="btn small" id="cbAuto">Auto-code all documents</button><button class="btn small danger" id="cbClearAuto">Remove all "Auto" coding</button></div></div>
    <div id="cbEdit"></div>
    <div class="tbl"><table><thead><tr><th class="txt">Code</th><th class="txt">Definition</th><th class="txt">Keywords</th><th>Segments</th><th>Documents</th><th></th></tr></thead><tbody>
    ${q.codes.filter(c => !c.parent).map(t => row(t, 0) + q.codes.filter(c => c.parent === t.id).map(c => row(c, 1)).join('')).join('')}</tbody></table></div></div>`;
  const edit = (c, parent) => { const box = $('#cbEdit'), isNew = !c; c = c || {id: 'c' + Date.now().toString(36), name: '', parent: parent || null, color: parent ? codeBy(parent).color : THEME_COLORS[q.codes.filter(x => !x.parent).length % 8], desc: '', incl: '', excl: '', kw: ''};
    box.innerHTML = `<div class="card" style="background:var(--panel-2)"><h3>${isNew ? 'New ' + (c.parent ? 'code' : 'theme') : 'Edit ' + esc(c.name)}</h3><div class="form">
      <div class="f"><label for="ceName">Name <span class="req">*</span></label><input id="ceName" value="${esc(c.name)}"></div>
      <div class="f"><label for="ceParent">Theme</label><select id="ceParent"><option value="">(this is a theme)</option>${q.codes.filter(x => !x.parent && x.id !== c.id).map(x => `<option value="${x.id}" ${x.id === c.parent ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="f"><label for="ceColor">Colour</label><input id="ceColor" type="color" value="${esc(c.color)}"></div>
      <div class="f" style="grid-column:1/-1"><label for="ceDesc">Definition</label><input id="ceDesc" value="${esc(c.desc)}"></div>
      <div class="f"><label for="ceIncl">Include when…</label><input id="ceIncl" value="${esc(c.incl)}"></div><div class="f"><label for="ceExcl">Exclude when…</label><input id="ceExcl" value="${esc(c.excl)}"></div>
      <div class="f" style="grid-column:1/-1"><label for="ceKw">Keywords for auto-coding (comma separated; Nepali words work)</label><input id="ceKw" value="${esc(c.kw)}"></div></div>
      <div class="actions"><button class="btn primary small" id="ceSave">Save</button><button class="btn small" id="ceCancel">Cancel</button>${!isNew ? `<span class="sub">Merge into</span><select id="ceMergeTo">${q.codes.filter(x => x.id !== c.id).map(x => `<option value="${x.id}">${esc(codePath(x))}</option>`).join('')}</select><button class="btn small" id="ceMerge">Merge</button><button class="btn small danger" id="ceDel">Delete</button>` : ''}<span id="ceMsg"></span></div></div>`;
    $('#ceCancel').onclick = () => box.innerHTML = '';
    $('#ceSave').onclick = async () => { const nm = $('#ceName').value.trim(); if (!nm) return msg('#ceMsg', 'Name the code.', 'err');
      Object.assign(c, {name: nm, parent: $('#ceParent').value || null, color: $('#ceColor').value, desc: $('#ceDesc').value, incl: $('#ceIncl').value, excl: $('#ceExcl').value, kw: $('#ceKw').value});
      if (isNew) q.codes.push(c); await persist(true); nwCodebook(); };
    if (!isNew) { $('#ceMerge').onclick = async () => { const to = $('#ceMergeTo').value; if (!(await confirmBox('Merge codes?', `All segments coded <b>${esc(c.name)}</b> move to <b>${esc(codeBy(to).name)}</b>, and ${esc(c.name)} is removed.`, 'Merge'))) return;
        q.segs.forEach(s => { if (s.code === c.id) s.code = to; }); q.codes.forEach(k => { if (k.parent === c.id) k.parent = codeBy(to).parent || to; }); q.codes = q.codes.filter(k => k.id !== c.id); await persist(true); nwCodebook(); };
      $('#ceDel').onclick = async () => { const n = q.segs.filter(s => s.code === c.id).length; if (!(await confirmBox('Delete code?', `<b>${esc(c.name)}</b> and its ${n} coded segments will be removed. Child codes move up a level.`, 'Delete'))) return;
        q.segs = q.segs.filter(s => s.code !== c.id); q.codes.forEach(k => { if (k.parent === c.id) k.parent = null; }); q.codes = q.codes.filter(k => k.id !== c.id); await persist(true); nwCodebook(); }; }
  };
  $('#cbNewTheme').onclick = () => edit(null, null);
  b.querySelectorAll('[data-ed]').forEach(x => x.onclick = () => edit(codeBy(x.dataset.ed)));
  b.querySelectorAll('[data-child]').forEach(x => x.onclick = () => edit(null, x.dataset.child));
  b.querySelectorAll('[data-auto]').forEach(x => x.onclick = async () => { const n = autoCode(null, [codeBy(x.dataset.auto)]); await persist(true); toast(n + ' segments coded'); nwCodebook(); });
  $('#cbAuto').onclick = async () => { const n = autoCode(); await persist(true); toast(n + ' new segments coded by keyword rules (coder "Auto")'); nwCodebook(); };
  $('#cbClearAuto').onclick = async () => { const n = q.segs.filter(s => s.coder === 'Auto').length; if (!(await confirmBox('Remove automatic coding?', `${n} segments coded by keyword rules will be removed. Your own coding stays.`, 'Remove'))) return; q.segs = q.segs.filter(s => s.coder !== 'Auto'); await persist(true); nwCodebook(); };
}

/* ---------- queries ---------- */
function qDocs() { const f = NW.qf, q = Q(); let rs = docs().filter(r => (!f.src || r.source === f.src) && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to));
  if (f.code) { const has = new Set(q.segs.filter(s => s.code === f.code || codeBy(s.code)?.parent === f.code).map(s => s.doc)); rs = rs.filter(r => has.has(r.doc_id)); } return rs; }
function nwAnalysis() {
  const b = $('#nwBody'), f = NW.qf, srcs = uniq(docs().map(r => r.source).filter(Boolean)).sort();
  b.innerHTML = `<div class="card"><div class="chead"><div><h2>Queries</h2><p class="sub">Word frequency, text search, matrix coding, code co-occurrence, framework matrix and code tone, on the documents selected here.</p></div></div>
    <div class="seg" id="qType">${[['freq', 'Word frequency'], ['kwic', 'Text search'], ['matrix', 'Matrix coding'], ['co', 'Co-occurrence'], ['frame', 'Framework matrix'], ['ctone', 'Code × tone']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${NW.qtype === k}">${l}</button>`).join('')}</div>
    <div class="ctrls"><select id="qfSrc" aria-label="Source"><option value="">All sources</option>${srcs.map(s => `<option ${s === f.src ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <label class="sub" for="qfFrom">From</label><input id="qfFrom" type="date" value="${esc(f.from)}"><label class="sub" for="qfTo">to</label><input id="qfTo" type="date" value="${esc(f.to)}">
      <select id="qfCode" aria-label="Only documents coded"><option value="">Any code</option>${codeOptions(f.code, true)}</select><span class="sub" id="qfN"></span></div>
    <div id="qOut" style="display:grid;gap:12px"></div></div>`;
  seg('#qType', v => { NW.qtype = v; runQuery(); });
  const re = () => { f.src = $('#qfSrc').value; f.from = $('#qfFrom').value; f.to = $('#qfTo').value; f.code = $('#qfCode').value; runQuery(); };
  ['#qfSrc', '#qfFrom', '#qfTo', '#qfCode'].forEach(s => $(s).onchange = re);
  runQuery();
}
function heat(v, max, color = '42,120,214') { const a = max ? Math.min(1, v / max) : 0; return `background:rgba(${color},${(a * 0.55).toFixed(3)})`; }
function runQuery() {
  const o = $('#qOut'), D = qDocs(), q = Q(), ids = new Set(D.map(r => r.doc_id)), S = q.segs.filter(s => ids.has(s.doc)), t = T();
  $('#qfN').textContent = `${D.length} documents · ${S.length} segments`;
  if (NW.qtype === 'freq') {
    const w = NW.wf, rows = TX.wordFreq(D.map(r => (r.title || '') + '. ' + (r.text || '')), {minLen: w.min, stem: w.stem, bigrams: w.bi, top: 80}), mx = rows[0]?.[1] || 1;
    const dfreq = term => D.filter(r => ((r.title || '') + ' ' + (r.text || '')).toLowerCase().includes(term.split(' ')[0])).length;
    o.innerHTML = `<div class="ctrls"><label class="sub" for="wfMin">Min. length</label><input id="wfMin" size="2" value="${w.min}"><label class="sub"><input type="checkbox" id="wfStem" ${w.stem ? 'checked' : ''}> Group similar words</label><label class="sub"><input type="checkbox" id="wfBi" ${w.bi ? 'checked' : ''}> Two-word phrases</label></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;padding:12px;border:1px solid var(--line);border-radius:10px">${rows.slice(0, 60).map(([k, v]) => { const p = TX.polarityOf(k.split(' ')[0]); return `<span style="font-size:${12 + 22 * Math.sqrt(v / mx)}px;color:${p > 0 ? 'var(--good)' : p < 0 ? 'var(--crit)' : 'var(--ink)'};font-weight:${v / mx > 0.4 ? 600 : 400}" title="${v}">${esc(k)}</span>`; }).join('')}</div>
      <div class="tbl scroll" style="max-height:360px"><table><thead><tr><th class="txt">Term</th><th>Count</th><th>Documents</th><th class="txt">Lexicon</th></tr></thead><tbody>${rows.map(([k, v]) => { const p = TX.polarityOf(k.split(' ')[0]); return `<tr><td class="txt">${esc(k)}</td><td class="num">${v}</td><td class="num">${dfreq(k)}</td><td class="txt">${p > 0 ? '<span class="chip up">positive</span>' : p < 0 ? '<span class="chip dn">negative</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    $('#wfMin').onchange = e => { w.min = +e.target.value || 3; runQuery(); }; $('#wfStem').onchange = e => { w.stem = e.target.checked; runQuery(); }; $('#wfBi').onchange = e => { w.bi = e.target.checked; runQuery(); };
  } else if (NW.qtype === 'kwic') {
    const hits = TX.kwic(D, NW.kw);
    o.innerHTML = `<div class="ctrls"><input id="kwQ" value="${esc(NW.kw)}" placeholder="e.g. liquidity, remittanc*, interest rate" size="32" aria-label="Search words"><button class="btn small primary" id="kwGo">Search</button><span class="sub">${hits.length} hits in ${uniq(hits.map(h => h.doc.doc_id)).length} documents</span>
      ${hits.length ? `<span class="sub">Code every hit's sentence as</span><select id="kwCode">${codeOptions()}</select><button class="btn small" id="kwCodeAll">Code all hits</button>` : ''}</div>
      <div class="tbl scroll" style="max-height:480px"><table><tbody>${hits.slice(0, 500).map(h => `<tr><td class="txt" style="width:150px"><a href="#" data-doc="${esc(h.doc.doc_id)}">${esc(h.doc.date)}</a><br><span class="sub">${esc((h.doc.title || '').slice(0, 40))}</span></td><td style="text-align:right;color:var(--ink-2);white-space:normal">…${esc(h.left)}</td><td style="text-align:center;font-weight:700;background:var(--accent-soft)">${esc(h.hit)}</td><td class="txt" style="color:var(--ink-2)">${esc(h.right)}…</td></tr>`).join('')}</tbody></table></div>`;
    $('#kwGo').onclick = () => { NW.kw = $('#kwQ').value; runQuery(); }; $('#kwQ').onkeydown = e => { if (e.key === 'Enter') { NW.kw = e.target.value; runQuery(); } };
    if ($('#kwCodeAll')) $('#kwCodeAll').onclick = async () => { const code = $('#kwCode').value; let n = 0; const have = new Set(q.segs.map(s => s.doc + s.code + s.start + s.end + s.coder));
      hits.forEach(h => { const s = TX.sentences(h.doc.text).find(x => x.start <= h.start && x.end >= h.end) || {start: h.start, end: h.end}; const k = h.doc.doc_id + code + s.start + s.end + q.coder; if (!have.has(k)) { have.add(k); q.segs.push({id: TX.uuid(), doc: h.doc.doc_id, start: s.start, end: s.end, code, coder: q.coder, at: new Date().toISOString(), note: 'Text search: ' + NW.kw}); n++; } });
      await persist(true); toast(`${n} sentences coded as ${codeBy(code).name}`); };
    o.querySelectorAll('[data-doc]').forEach(a => a.onclick = e => { e.preventDefault(); openDoc(a.dataset.doc); });
  } else if (NW.qtype === 'matrix') {
    const m = NW.mx, colOf = {source: r => r.source || '–', type: r => r.type || '–', month: r => (r.date || '').slice(0, 7), week: r => { const d = new Date(r.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return 'wk ' + d.toISOString().slice(0, 10); }, label: r => r.label || '–', human: r => r.human || 'unlabelled', coder: null};
    const rowsC = m.rows === 'themes' ? q.codes.filter(c => !c.parent) : leafCodes(), inRow = (s, c) => m.rows === 'themes' ? (s.code === c.id || codeBy(s.code)?.parent === c.id) : s.code === c.id;
    const col = s => m.cols === 'coder' ? s.coder : colOf[m.cols](docBy(s.doc)), cols = uniq(S.map(col)).sort(), docsIn = cc => D.filter(r => m.cols === 'coder' ? S.some(s => s.doc === r.doc_id && s.coder === cc) : colOf[m.cols](r) === cc).length;
    const cell = (c, cc) => { const ss = S.filter(s => inRow(s, c) && col(s) === cc); if (m.meas === 'segs') return ss.length; const nd = uniq(ss.map(s => s.doc)).length; return m.meas === 'docs' ? nd : (docsIn(cc) ? nd / docsIn(cc) * 100 : 0); };
    const M = rowsC.map(c => cols.map(cc => cell(c, cc))), mx = Math.max(1, ...M.flat());
    o.innerHTML = `<div class="ctrls"><label class="sub">Rows</label><select id="mxR"><option value="codes">Codes</option><option value="themes">Themes</option></select><label class="sub">Columns</label><select id="mxC">${[['source', 'Source'], ['type', 'Document type'], ['month', 'Month'], ['week', 'Week'], ['label', 'Lexicon tone'], ['human', 'Your label'], ['coder', 'Coder']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <label class="sub">Cells</label><select id="mxM"><option value="segs">Coded segments</option><option value="docs">Documents</option><option value="pct">% of the column's documents</option></select><button class="btn small" id="mxCsv">Download CSV</button></div>
      <div class="tbl scroll" style="max-height:520px"><table><thead><tr><th class="txt">${m.rows === 'themes' ? 'Theme' : 'Code'}</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rowsC.map((c, i) => `<tr><td class="txt"><span class="bar-inline" style="width:10px;background:${c.color};margin:0 6px 0 0"></span>${esc(c.name)}</td>${M[i].map(v => `<td class="num" style="${heat(v, mx)}">${m.meas === 'pct' ? fmt(v, 0) + '%' : v || ''}</td>`).join('')}<td class="num"><b>${m.meas === 'pct' ? '' : sum(M[i])}</b></td></tr>`).join('')}</tbody></table></div>`;
    $('#mxR').value = m.rows; $('#mxC').value = m.cols; $('#mxM').value = m.meas;
    $('#mxR').onchange = e => { m.rows = e.target.value; runQuery(); }; $('#mxC').onchange = e => { m.cols = e.target.value; runQuery(); }; $('#mxM').onchange = e => { m.meas = e.target.value; runQuery(); };
    $('#mxCsv').onclick = () => download('matrix-coding.csv', ['Code,' + cols.map(csvCell).join(','), ...rowsC.map((c, i) => csvCell(c.name) + ',' + M[i].join(','))].join('\n'), 'text/csv');
  } else if (NW.qtype === 'co') {
    const lvl = NW.co.level, cs = leafCodes().filter(c => S.some(s => s.code === c.id)).sort((a, c) => S.filter(s => s.code === c.id).length - S.filter(s => s.code === a.id).length).slice(0, 16);
    const unit = c => lvl === 'doc' ? new Set(S.filter(s => s.code === c.id).map(s => s.doc)) : S.filter(s => s.code === c.id);
    const U = cs.map(unit), n = (i, j) => lvl === 'doc' ? [...U[i]].filter(x => U[j].has(x)).length : U[i].filter(a => U[j].some(b2 => a.doc === b2.doc && a.start < b2.end && b2.start < a.end)).length;
    const N = cs.map((_, i) => cs.map((__, j) => n(i, j))), size = i => lvl === 'doc' ? U[i].size : U[i].length, C = N.map((r, i) => r.map((v, j) => i === j ? 1 : v / (size(i) + size(j) - v || 1)));
    const mxc = Math.max(0.01, ...C.flatMap((r, i) => r.filter((_, j) => j !== i)));
    o.innerHTML = `<div class="ctrls"><label class="sub">Co-occur within</label><select id="coL"><option value="doc">the same document</option><option value="seg">overlapping segments</option></select><span class="sub">Cells show the count and the c-coefficient (ATLAS.ti): n₁₂ ÷ (n₁ + n₂ − n₁₂).</span></div>
      <div class="grid2"><div class="tbl scroll" style="max-height:520px"><table><thead><tr><th></th>${cs.map((c, j) => `<th title="${esc(c.name)}">${j + 1}</th>`).join('')}</tr></thead><tbody>${cs.map((c, i) => `<tr><td class="txt">${i + 1}. ${esc(c.name)}</td>${cs.map((_, j) => i === j ? `<td class="num" style="color:var(--ink-3)">${size(i)}</td>` : `<td class="num" style="${heat(C[i][j], mxc)}" title="c = ${fmt(C[i][j], 2)}">${N[i][j] || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div><svg id="coNet" viewBox="0 0 520 520" style="width:100%;max-width:520px" role="img" aria-label="Code co-occurrence network"></svg><p class="src">Line width shows the c-coefficient; circle size shows how often the code is used.</p></div></div>`;
    $('#coL').value = lvl; $('#coL').onchange = e => { NW.co.level = e.target.value; runQuery(); };
    const R = 190, cx = 260, cy = 260, P = cs.map((_, i) => [cx + R * Math.cos(2 * Math.PI * i / cs.length - Math.PI / 2), cy + R * Math.sin(2 * Math.PI * i / cs.length - Math.PI / 2)]), smax = Math.max(1, ...cs.map((_, i) => size(i)));
    let svg = ''; cs.forEach((_, i) => cs.forEach((__, j) => { if (j <= i || !N[i][j]) return; svg += `<line x1="${P[i][0]}" y1="${P[i][1]}" x2="${P[j][0]}" y2="${P[j][1]}" stroke="${t.ink3}" stroke-opacity="${0.25 + 0.6 * C[i][j] / mxc}" stroke-width="${1 + 7 * C[i][j] / mxc}"/>`; }));
    cs.forEach((c, i) => { const rr = 7 + 15 * Math.sqrt(size(i) / smax), right = P[i][0] >= cx; svg += `<circle cx="${P[i][0]}" cy="${P[i][1]}" r="${rr}" fill="${c.color}" stroke="${t.panel}" stroke-width="2"><title>${esc(c.name)}: ${size(i)}</title></circle><text x="${P[i][0] + (right ? rr + 4 : -rr - 4)}" y="${P[i][1] + 4}" text-anchor="${right ? 'start' : 'end'}" font-size="11" fill="${t.ink2}">${esc(c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name)}</text>`; });
    $('#coNet').innerHTML = svg;
  } else if (NW.qtype === 'frame') {
    if (!NW.fw.length) NW.fw = leafCodes().filter(c => S.some(s => s.code === c.id)).slice(0, 4).map(c => c.id);
    const cs = NW.fw.map(codeBy).filter(Boolean), rs = D.filter(r => S.some(s => s.doc === r.doc_id && NW.fw.includes(s.code))).slice(0, 60);
    o.innerHTML = `<p class="sub">Framework matrix (NVivo): one row per document, one column per code, with the coded text in each cell. Pick up to 6 codes.</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px">${leafCodes().map(c => `<label class="sub"><input type="checkbox" data-fw="${c.id}" ${NW.fw.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>
      <div class="tbl scroll" style="max-height:560px"><table><thead><tr><th class="txt">Document</th>${cs.map(c => `<th class="txt" style="min-width:200px">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${rs.map(r => `<tr><td class="txt" style="min-width:170px"><a href="#" data-doc="${esc(r.doc_id)}">${esc(r.title)}</a><br><span class="sub">${esc(r.date)} ${toneChip(r.score)}</span></td>${cs.map(c => `<td class="txt" style="font-size:12.5px;vertical-align:top">${S.filter(s => s.doc === r.doc_id && s.code === c.id).map(s => '“' + esc((r.text || '').slice(s.start, s.end).slice(0, 180)) + '”').join('<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    o.querySelectorAll('[data-fw]').forEach(x => x.onchange = () => { NW.fw = [...o.querySelectorAll('[data-fw]:checked')].map(y => y.dataset.fw).slice(0, 6); runQuery(); });
    o.querySelectorAll('[data-doc]').forEach(a => a.onclick = e => { e.preventDefault(); openDoc(a.dataset.doc); });
  } else {
    const cs = leafCodes().map(c => { const ss = S.filter(s => s.code === c.id), tn = ss.map(s => TX.scoreText((docBy(s.doc)?.text || '').slice(s.start, s.end), q.lex)); return {c, n: ss.length, tone: avg(tn.map(x => x.tone)), pos: tn.filter(x => x.label === 'Positive').length, neg: tn.filter(x => x.label === 'Negative').length}; }).filter(x => x.n).sort((a, c) => a.tone - c.tone);
    o.innerHTML = `<p class="sub">Average lexicon tone of the text coded under each code (segments, not whole documents). Useful for asking which topics carry good or bad news.</p><div class="cv tall"><canvas id="cCt"></canvas></div>
      <div class="tbl"><table><thead><tr><th class="txt">Code</th><th>Segments</th><th>Average tone</th><th>Positive</th><th>Negative</th></tr></thead><tbody>${cs.map(x => `<tr><td class="txt">${esc(codePath(x.c))}</td><td class="num">${x.n}</td><td class="num">${toneChip(x.tone)}</td><td class="num">${x.pos}</td><td class="num">${x.neg}</td></tr>`).join('')}</tbody></table></div>`;
    mk('cCt', {type: 'bar', data: {labels: cs.map(x => x.c.name), datasets: [bar('Average tone', cs.map(x => x.tone), cs.map(x => x.tone >= 0 ? t.good : t.crit), {maxBarThickness: 14})]}, options: hbarOpts('', 2, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` tone ${fmt(c.parsed.x, 2)} · ${cs[c.dataIndex].n} segments`}}}, scales: {x: {min: -1, max: 1}, y: {grid: {display: false}, ticks: {autoSkip: false, color: t.ink2, font: {size: 11.5}}}}})});
  }
}

/* ---------- sentiment model ---------- */
function nwSenti() {
  const b = $('#nwBody'), q = Q(), D = docs(), lab = D.filter(r => r.human), t = T();
  const lexAgree = TX.agreement(lab.filter(r => r.human !== 'Mixed').map(r => ({y: r.human, p: r.label})));
  const mlAgree = NW.cv ? TX.agreement(NW.cv) : null;
  const confT = a => a ? `<div class="readout"><span>Documents <b>${a.n}</b></span><span>Accuracy <b>${fmt(a.acc * 100, 1)}%</b></span><span>Cohen's κ <b>${fmt(a.kappa, 2)}</b></span><span>Macro F1 <b>${fmt(a.f1, 2)}</b></span></div>
    <div class="tbl"><table><thead><tr><th class="txt">Your label ↓ / predicted →</th>${a.cls.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${a.cls.map((c, i) => `<tr><td class="txt">${c}</td>${a.M[i].map((v, j) => `<td class="num" style="${i === j ? 'font-weight:700' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="sub">Label at least a few documents to see agreement.</p>';
  const queue = D.filter(r => !r.human).sort((a, c) => (c.date || '').localeCompare(a.date || '')).slice(0, 8);
  const custom = Object.entries(q.lex);
  b.innerHTML = `<div class="grid2">
    <div class="card"><h2>How tone is scored</h2><p class="sub">A finance lexicon of ${TX.lexiconSize()} English and Nepali terms. Direction words (rise, fall, बढ्यो, घट्यो) take their sign from the nearest economic target: inflation, prices, deficit, debt, NPL rising is negative; NEPSE, remittance, reserves, exports, profit rising is positive. Negation within three words flips the sign, and intensifiers (sharp, record) add weight. Tone = (positive − negative) ÷ (positive + negative).</p>
      <h3>Your own words</h3><p class="sub">Add terms the lexicon misses, with a weight from −2 to +2. Saving rescores every document.</p>
      <div class="ctrls"><input id="lxW" placeholder="word" size="14"><input id="lxV" placeholder="weight" size="5" inputmode="decimal"><button class="btn small primary" id="lxAdd">Add</button></div>
      <div class="tbl"><table><tbody>${custom.map(([w, v]) => `<tr><td class="txt">${esc(w)}</td><td class="num">${v > 0 ? '+' : ''}${v}</td><td><button class="btn small" data-lx="${esc(w)}">Remove</button></td></tr>`).join('') || '<tr><td class="txt">None yet.</td></tr>'}</tbody></table></div></div>
    <div class="card"><h2>Tone distribution</h2><div class="cv short"><canvas id="cToneH"></canvas></div><h3>Average tone by source</h3><div class="cv short"><canvas id="cToneS"></canvas></div></div>
    <div class="card"><h2>Label documents yourself</h2><p class="sub">Your labels are the benchmark for the lexicon and train the machine-learning model. ${lab.length} labelled so far.</p>
      ${queue.map(r => `<div style="border-top:1px solid var(--grid);padding:10px 0;display:grid;gap:6px"><div><b>${esc(r.title)}</b> <span class="sub">${esc(r.date)} · lexicon ${esc(r.label)} ${toneChip(r.score)}</span></div><div class="sub" style="color:var(--ink-2)">${esc((r.text || '').slice(0, 260))}${(r.text || '').length > 260 ? '…' : ''}</div>
        <div class="actions">${['Positive', 'Negative', 'Neutral', 'Mixed'].map(l => `<button class="btn small" data-hl="${esc(r.doc_id)}" data-v="${l}">${l}</button>`).join('')}</div></div>`).join('') || '<p class="sub">Everything is labelled.</p>'}</div>
    <div class="card"><h2>Lexicon vs your labels</h2>${confT(lexAgree)}
      <h2 style="margin-top:8px">Machine-learning model (naive Bayes)</h2><p class="sub">Learns words and phrases from your labels. Needs at least 10 labelled documents in two or more classes; accuracy is estimated by 5-fold cross-validation.</p>
      <div class="actions"><button class="btn primary small" id="nbTrain" ${lab.filter(r => r.human !== 'Mixed').length < 10 ? 'disabled' : ''}>Train and label all documents</button><span id="nbMsg" class="sub"></span></div>${mlAgree ? '<h3>Cross-validated accuracy</h3>' + confT(mlAgree) : ''}</div>
  </div>`;
  const sc = D.map(r => r.score).filter(isNum), bins = Array.from({length: 10}, (_, i) => -1 + i * 0.2), hc = bins.map(a => sc.filter(v => v >= a && (a >= 0.8 ? v <= 1 : v < a + 0.2)).length);
  mk('cToneH', {type: 'bar', data: {labels: bins.map(a => fmt(a, 1) + '…' + fmt(a + 0.2, 1)), datasets: [bar('Documents', hc, bins.map(a => a + 0.1 < -0.2 ? t.crit : a + 0.1 > 0.2 ? t.good : t.neutral), {maxBarThickness: 30})]}, options: {plugins: {legend: {display: false}, tooltip: tip(' docs', 0)}, scales: {x: {grid: {display: false}}, y: {beginAtZero: true}}}});
  const srcs = uniq(D.map(r => r.source).filter(Boolean)), st = srcs.map(s => ({s, v: avg(D.filter(r => r.source === s).map(r => r.score)), n: D.filter(r => r.source === s).length})).sort((a, c) => a.v - c.v);
  mk('cToneS', {type: 'bar', data: {labels: st.map(x => x.s), datasets: [bar('Tone', st.map(x => x.v), st.map(x => x.v >= 0 ? t.good : t.crit), {maxBarThickness: 16})]}, options: hbarOpts('', 2, {plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => ` ${fmt(c.parsed.x, 2)} · ${st[c.dataIndex].n} docs`}}}})});
  $('#lxAdd').onclick = async () => { const w = $('#lxW').value.trim().toLowerCase(), v = parseFloat($('#lxV').value); if (!w || !isFinite(v)) return; q.lex[w] = Math.max(-2, Math.min(2, v)); q.lexVer++; newsRefresh(true); await persist(true); afterDataChange(); nwSenti(); };
  b.querySelectorAll('[data-lx]').forEach(x => x.onclick = async () => { delete q.lex[x.dataset.lx]; q.lexVer++; newsRefresh(true); await persist(true); nwSenti(); });
  b.querySelectorAll('[data-hl]').forEach(x => x.onclick = async () => { docBy(x.dataset.hl).human = x.dataset.v; await persist(true); nwSenti(); });
  $('#nbTrain').onclick = async () => { const tr = lab.filter(r => r.human !== 'Mixed').map(r => ({text: (r.title || '') + '. ' + (r.text || ''), y: r.human}));
    if (uniq(tr.map(x => x.y)).length < 2) return msg('#nbMsg', 'Label at least two different classes.', 'err');
    NW.cv = TX.nbCV(tr, 5); const m = TX.nbTrain(tr); docs().forEach(r => { const p = TX.nbPredict(m, (r.title || '') + '. ' + (r.text || '')); r.ml = p.label; r._mlp = p.p; });
    logChange('Trained sentiment model', 'news_docs', tr.length + ' labels'); await persist(true); afterDataChange(); nwSenti(); toast('Model trained; every document now has a model label (see All data).'); };
}

/* ---------- reliability ---------- */
function nwRel() {
  const b = $('#nwBody'), q = Q(), coders = uniq(q.segs.map(s => s.coder));
  if (!NW.relA || !coders.includes(NW.relA)) NW.relA = coders.find(c => c !== 'Auto') || coders[0] || ''; if (!NW.relB || !coders.includes(NW.relB) || NW.relB === NW.relA) NW.relB = coders.find(c => c !== NW.relA) || '';
  const A = NW.relA, B = NW.relB, dA = new Set(q.segs.filter(s => s.coder === A).map(s => s.doc)), dB = new Set(q.segs.filter(s => s.coder === B).map(s => s.doc)), both = [...dA].filter(d => dB.has(d));
  const res = leafCodes().map(c => { const a = both.map(d => q.segs.some(s => s.doc === d && s.coder === A && s.code === c.id) ? 1 : 0), bb = both.map(d => q.segs.some(s => s.doc === d && s.coder === B && s.code === c.id) ? 1 : 0); return {c, k: TX.kappaBinary(a, bb), a, bb}; }).filter(x => x.k && (x.k.n11 + x.k.n10 + x.k.n01));
  const pooled = TX.kappaBinary(res.flatMap(x => x.a), res.flatMap(x => x.bb));
  const lk = k => !isNum(k) ? '' : k > 0.8 ? 'almost perfect' : k > 0.6 ? 'substantial' : k > 0.4 ? 'moderate' : k > 0.2 ? 'fair' : k > 0 ? 'slight' : 'poor';
  b.innerHTML = `<div class="card"><div class="chead"><div><h2>Inter-coder reliability</h2><p class="sub">Cohen's kappa per code, with the document as the unit (was the code applied to the document or not), over documents that both coders worked on.</p></div>
    <div class="ctrls"><label class="sub">Coder A</label><select id="rlA">${coders.map(c => `<option ${c === A ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><label class="sub">Coder B</label><select id="rlB">${coders.map(c => `<option ${c === B ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
    ${coders.length < 2 ? '<p class="note">Only one coder has coded so far. Add a coder in Documents & coding, switch to them and code the same documents independently.</p>' : ''}
    <div class="kpis" id="rlK"></div>
    <div class="tbl"><table><thead><tr><th class="txt">Code</th><th>κ</th><th class="txt">Strength</th><th>Agreement</th><th>Both</th><th>A only</th><th>B only</th><th>Neither</th></tr></thead><tbody>
    ${res.map(x => `<tr><td class="txt">${esc(codePath(x.c))}</td><td class="num">${fmt(x.k.kappa, 2)}</td><td class="txt"><span class="chip ${x.k.kappa > 0.6 ? 'up' : x.k.kappa > 0.4 ? 'nt' : 'dn'}">${lk(x.k.kappa)}</span></td><td class="num">${fmt(x.k.agree * 100, 0)}%</td><td class="num">${x.k.n11}</td><td class="num">${x.k.n10}</td><td class="num">${x.k.n01}</td><td class="num">${x.k.n00}</td></tr>`).join('') || '<tr><td class="txt" colspan="8">No overlap yet between these two coders.</td></tr>'}</tbody></table></div>
    <p class="src">Landis & Koch bands: 0.21–0.40 fair, 0.41–0.60 moderate, 0.61–0.80 substantial, above 0.80 almost perfect. Codes neither coder used are left out.</p></div>`;
  kpis('#rlK', [{k: 'Documents coded by both', v: String(both.length), chip: `${dA.size} by ${A || '–'}, ${dB.size} by ${B || '–'}`}, {k: 'Pooled kappa', v: pooled ? fmt(pooled.kappa, 2) : '–', chip: pooled ? lk(pooled.kappa) : ''}, {k: 'Pooled agreement', v: pooled ? fmt(pooled.agree * 100, 0) + '%' : '–'}, {k: 'Codes compared', v: String(res.length)}]);
  $('#rlA').onchange = e => { NW.relA = e.target.value; nwRel(); }; $('#rlB').onchange = e => { NW.relB = e.target.value; nwRel(); };
}

/* ---------- memos & themes ---------- */
const PHASES = [['Familiarisation', 'Read and re-read; note first impressions in memos.'], ['Initial codes', 'Code interesting features systematically across the data set.'], ['Searching for themes', 'Collate codes into candidate themes (the parents in the codebook).'], ['Reviewing themes', 'Check themes against coded extracts and the whole data set (Framework matrix, Co-occurrence).'], ['Defining and naming themes', 'Refine the story of each theme; write definitions in the codebook.'], ['Producing the report', 'Select vivid extracts and relate them to the research question and market data.']];
function nwMemos() {
  const b = $('#nwBody'), q = Q(), cnt = {}; q.segs.forEach(s => cnt[s.code] = (cnt[s.code] || 0) + 1);
  b.innerHTML = `<div class="grid2">
    <div class="card"><h2>Thematic analysis (Braun & Clarke)</h2><div class="tbl"><table><tbody>${PHASES.map(([p, h], i) => { const ph = q.phases[i] || {}; return `<tr><td class="txt" style="vertical-align:top"><b>${i + 1}. ${p}</b><br><span class="sub">${h}</span></td><td style="vertical-align:top"><select data-ph="${i}">${['Not started', 'In progress', 'Done'].map(s => `<option ${s === (ph.s || 'Not started') ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr><tr><td colspan="2"><textarea data-pn="${i}" style="min-height:44px;font-family:var(--sans);font-size:13px" placeholder="Notes for this phase">${esc(ph.n || '')}</textarea></td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="card"><div class="chead"><h2>Memos</h2><button class="btn small primary" id="mmNew">+ Memo</button></div><div id="mmForm"></div>
      ${q.memos.slice().sort((a, c) => (c.at || '').localeCompare(a.at || '')).map(m => `<div style="border-top:1px solid var(--grid);padding:8px 0"><b>${esc(m.title || 'Memo')}</b> <span class="pill">${esc(m.type)}</span> <span class="sub">${esc((m.at || '').slice(0, 10))} · ${esc(m.author || '')}</span><div style="white-space:pre-wrap;font-size:13px;margin-top:4px">${esc(m.text)}</div><button class="btn small" data-mdel="${m.id}">Delete</button> ${m.type === 'doc' ? `<button class="btn small" data-mdoc="${esc(m.ref)}">Open document</button>` : ''}</div>`).join('') || '<p class="sub">No memos yet.</p>'}</div>
    <div class="card wide"><div class="chead"><div><h2>Theme report</h2><p class="sub">Each theme with its codes, how often they were used, and example extracts (most recent first).</p></div><button class="btn small" id="thDl">Download report (HTML)</button></div><div id="thRep"></div></div>
  </div>`;
  b.querySelectorAll('[data-ph]').forEach(s => s.onchange = async () => { (q.phases[s.dataset.ph] = q.phases[s.dataset.ph] || {}).s = s.value; await persist(true); });
  b.querySelectorAll('[data-pn]').forEach(s => s.onchange = async () => { (q.phases[s.dataset.pn] = q.phases[s.dataset.pn] || {}).n = s.value; await persist(true); });
  $('#mmNew').onclick = () => { $('#mmForm').innerHTML = `<div class="form"><div class="f"><label for="mmT">Title</label><input id="mmT"></div><div class="f"><label for="mmK">About</label><select id="mmK"><option value="project">The project</option>${q.codes.map(c => `<option value="code:${c.id}">Code: ${esc(c.name)}</option>`).join('')}</select></div></div><textarea id="mmX" style="font-family:var(--sans);font-size:13px"></textarea><div class="actions"><button class="btn small primary" id="mmSave">Save memo</button></div>`;
    $('#mmSave').onclick = async () => { const k = $('#mmK').value; q.memos.push({id: TX.uuid(), type: k === 'project' ? 'project' : 'code', ref: k === 'project' ? null : k.slice(5), title: $('#mmT').value || 'Memo', text: $('#mmX').value, at: new Date().toISOString(), author: q.coder}); await persist(true); nwMemos(); }; };
  b.querySelectorAll('[data-mdel]').forEach(x => x.onclick = async () => { q.memos = q.memos.filter(m => m.id !== x.dataset.mdel); await persist(true); nwMemos(); });
  b.querySelectorAll('[data-mdoc]').forEach(x => x.onclick = () => openDoc(x.dataset.mdoc));
  const rep = () => q.codes.filter(c => !c.parent).map(th => { const kids = q.codes.filter(c => c.parent === th.id); const tot = sum(kids.map(k => cnt[k.id] || 0)) + (cnt[th.id] || 0); if (!tot) return '';
    return `<h3 style="color:${th.color}">${esc(th.name)} <span class="sub">(${tot} segments)</span></h3>${th.desc && th.desc !== 'Theme' ? `<p>${esc(th.desc)}</p>` : ''}<ul>${kids.filter(k => cnt[k.id]).map(k => { const ex = q.segs.filter(s => s.code === k.id).map(s => ({s, d: docBy(s.doc)})).filter(x => x.d).sort((a, c) => (c.d.date || '').localeCompare(a.d.date || '')).slice(0, 3);
      return `<li><b>${esc(k.name)}</b> — ${cnt[k.id]} segments${k.desc ? ': ' + esc(k.desc) : ''}<ul>${ex.map(x => `<li>“${esc((x.d.text || '').slice(x.s.start, x.s.end).slice(0, 220))}” <span class="sub">(${esc(x.d.source || '')}, ${esc(x.d.date)})</span></li>`).join('')}</ul></li>`; }).join('')}</ul>`; }).join('');
  $('#thRep').innerHTML = rep();
  $('#thDl').onclick = () => download('theme-report.html', `<!doctype html><meta charset="utf-8"><title>Theme report</title><body style="font-family:Georgia,serif;max-width:760px;margin:40px auto;line-height:1.6"><h1>Theme report</h1><p>${docs().length} documents · ${q.segs.length} coded segments · generated ${new Date().toISOString().slice(0, 10)}</p>${rep()}</body>`, 'text/html');
}

/* ---------- NVivo / ATLAS.ti exchange ---------- */
function nwExchange() {
  const b = $('#nwBody'), q = Q(), D = docs();
  b.innerHTML = `<div class="grid2">
    <div class="card"><h2>Export for NVivo, ATLAS.ti and MAXQDA</h2><p class="sub">REFI-QDA is the open exchange standard these programs share. The project file carries documents, the codebook, every coded segment and memos.</p>
      <div class="form"><div class="f"><label for="xFrom">Documents from</label><input id="xFrom" type="date"></div><div class="f"><label for="xTo">to</label><input id="xTo" type="date"></div><div class="f"><label for="xCoder">Coding by</label><select id="xCoder"><option value="">All coders</option>${uniq(q.segs.map(s => s.coder)).map(c => `<option>${esc(c)}</option>`).join('')}</select></div></div>
      <div class="actions"><button class="btn primary" id="xQdpx">Download project (.qdpx)</button><button class="btn" id="xQdc">Codebook only (.qdc)</button></div>
      <div class="actions"><button class="btn small" id="xSegs">Coded segments (CSV)</button><button class="btn small" id="xDocs">Documents with attributes (CSV)</button><button class="btn small" id="xIdx">Daily sentiment index (CSV)</button></div>
      <details class="panel"><summary>How to open the files</summary><div><p class="sub"><b>NVivo 14:</b> File › Import › Project, choose the .qdpx (REFI-QDA). Codebook only: Import › Codebook. The documents CSV imports as a Classification sheet (first column = document name).</p><p class="sub"><b>ATLAS.ti 9 or later:</b> File › Import & Export › Import REFI-QDA Project. Codebook: Codes › Import Codebook (.qdc).</p><p class="sub"><b>MAXQDA 2020 or later:</b> Import › REFI-QDA Project.</p><p class="sub">Sentiment scores travel in each document's description and in the documents CSV.</p></div></details></div>
    <div class="card"><h2>Import from NVivo or ATLAS.ti</h2><p class="sub">Bring a coded project or a codebook back. Documents are added to News and documents, codes to the codebook and coding under the coder name you give.</p>
      <div class="form"><div class="f"><label for="iCoder">Import coding as coder</label><input id="iCoder" value="Imported"></div><div class="f"><label for="iDate">Date for documents without one</label><input id="iDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
      <div class="actions"><label class="btn primary" for="iFile">Choose .qdpx or .qdc…</label><input id="iFile" type="file" accept=".qdpx,.qdc,.zip,.xml" hidden><span id="iMsg"></span></div>
      <p class="src">Text documents are supported; PDFs, images and audio inside a project are skipped.</p></div>
  </div>`;
  const pick = () => { const f = $('#xFrom').value, t2 = $('#xTo').value, c = $('#xCoder').value; const ds_ = D.filter(r => (!f || r.date >= f) && (!t2 || r.date <= t2)); const ids = new Set(ds_.map(r => r.doc_id)); return {ds_, segs: q.segs.filter(s => ids.has(s.doc) && (!c || s.coder === c))}; };
  $('#xQdpx').onclick = async () => { const {ds_, segs} = pick(); const codes = q.codes.map(c => ({...c}));
    const blob = TX.qdpx({name: 'Nepal economic news', origin: 'Nepal Information Hub', user: q.coder, codes, docs: ds_.map(r => ({key: r.doc_id, name: `${r.date} ${r.title}`.slice(0, 200), text: `${r.title}\n\n${r.text || ''}`, desc: `Source: ${r.source || ''}; type: ${r.type || ''}; date: ${r.date}; lexicon tone ${fmt(r.score, 2)} (${r.label}); your label: ${r.human || '–'}; ${r.url || ''}`})),
      segs: segs.map(s => ({...s, start: s.start + (docBy(s.doc).title || '').length + 2, end: s.end + (docBy(s.doc).title || '').length + 2})), memos: q.memos.map(m => ({title: m.title, text: m.text, at: m.at}))});
    q.codes.forEach(c => { const x = codes.find(k => k.id === c.id); if (x) c.guid = x.guid; }); await persist(true);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nepal-economic-news.qdpx'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500); toast(`Exported ${ds_.length} documents and ${segs.length} coded segments`); };
  $('#xQdc').onclick = () => download('codebook.qdc', TX.qdc(q.codes, 'Nepal Information Hub'), 'application/xml');
  $('#xSegs').onclick = () => { const {segs} = pick(); download('coded-segments.csv', ['document_id,date,title,source,theme,code,coder,start,end,text,comment', ...segs.map(s => { const d = docBy(s.doc), c = codeBy(s.code); return [s.doc, d.date, d.title, d.source, themeOf(c)?.name, c?.name, s.coder, s.start, s.end, (d.text || '').slice(s.start, s.end), s.note || ''].map(csvCell).join(','); })].join('\n'), 'text/csv'); };
  $('#xDocs').onclick = () => { const {ds_} = pick(); download('documents.csv', ['Name,Date,Source,Type,Language,Lexicon tone,Lexicon label,Your label,Model label,Link,Text', ...ds_.map(r => [`${r.date} ${r.title}`, r.date, r.source, r.type, r.lang, r.score, r.label, r.human, r.ml, r.url, r.text].map(csvCell).join(','))].join('\n'), 'text/csv'); };
  $('#xIdx').onclick = () => download('news-sentiment-index.csv', toCSV(ds('news_sentiment')), 'text/csv');
  $('#iFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try {
      const buf = await f.arrayBuffer(), coder = $('#iCoder').value.trim() || 'Imported', ddef = $('#iDate').value;
      const mapCodes = list => { const idMap = {}; list.forEach(c => { const ex = q.codes.find(k => k.guid === c.guid || (k.name === c.name && (k.parent || null) === (c.parent ? idMap[c.parent] || null : null)));
        if (ex) { idMap[c.id] = ex.id; ex.guid = ex.guid || c.guid; } else { const nid = 'c' + Math.random().toString(36).slice(2, 9); idMap[c.id] = nid; const par = c.parent ? idMap[c.parent] : null; q.codes.push({id: nid, guid: c.guid, name: c.name, parent: par, color: c.color || (par ? codeBy(par)?.color : THEME_COLORS[q.codes.length % 8]), desc: c.desc || '', incl: '', excl: '', kw: ''}); } }); return idMap; };
      if (/\.qdc$|\.xml$/i.test(f.name)) { const list = TX.readQdc(new TextDecoder().decode(buf)); mapCodes(list); await persist(true); msg('#iMsg', `${list.length} codes merged into the codebook.`, 'ok'); return; }
      const P = await TX.readQdpx(buf), idMap = mapCodes(P.codes), d = newsDs(), gmap = {};
      P.docs.forEach(x => { const date = /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : ddef; const id = 'Q' + (x.guid || TX.uuid()).slice(0, 8).toUpperCase(); gmap[x.guid] = id; if (!docBy(id)) d.rows.push({date, doc_id: id, title: x.name, source: P.name, type: 'Other', lang: /[ऀ-ॿ]/.test(x.text) ? 'ne' : 'en', url: null, text: x.text}); });
      let ns = 0; P.segs.forEach(s => { if (!gmap[s.docGuid] || !idMap[s.code]) return; q.segs.push({id: TX.uuid(), doc: gmap[s.docGuid], start: s.start, end: s.end, code: idMap[s.code], coder, note: s.note, at: new Date().toISOString()}); ns++; });
      P.memos.forEach(m => q.memos.push({id: TX.uuid(), type: 'project', ref: null, title: m.title, text: m.text, at: new Date().toISOString(), author: coder}));
      if (!q.coders.includes(coder)) q.coders.push(coder); sortRows(d); newsRefresh(false); logChange('Imported REFI-QDA project', 'news_docs', f.name); await persist(true); afterDataChange();
      msg('#iMsg', `Imported ${P.docs.length} documents, ${P.codes.length} codes, ${ns} coded segments and ${P.memos.length} memos from "${P.name}" (${P.origin || 'unknown program'}).`, 'ok');
    } catch (err) { msg('#iMsg', err.message, 'err'); } };
}
