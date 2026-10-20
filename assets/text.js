/* Text engine: tokenising (English + Nepali), economic-news sentiment lexicon with directional rules,
   naive Bayes classifier, word statistics, and REFI-QDA (NVivo / ATLAS.ti / MAXQDA) exchange files.
   Pure functions; loaded before app.js. */
'use strict';
const TX = (() => {
  const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'’\-]*|\d+(?:[.,]\d+)*%?/gu;
  const tokens = s => (String(s || '').match(WORD_RE) || []).map(w => w.toLowerCase().replace(/[’']s$/, '').replace(/[’']/g, ''));
  const sentences = s => { const out = []; const re = /(?:[^.!?।\n]|[.!?](?=[^\s.!?।])|(?<=\b(?:Rs|Mr|Mrs|Ms|Dr|No|Nos|vs|Govt|approx|Pvt|Ltd|Co|Inc|St))\.)+[.!?।]*[ \t]*\n*/g; let m; const t = String(s || '');
    while ((m = re.exec(t))) { const raw = m[0]; if (raw.trim()) out.push({start: m.index, end: m.index + raw.trimEnd().length, text: raw.trimEnd()}); if (m.index === re.lastIndex) re.lastIndex++; } return out; };

  const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours rs per cent percent said says also its it’s mr ms nepal nepali one two three first new year years month months day days week today yesterday according including amid while since within across total billion million crore lakh ' +
    'र को का की के मा ले लाई छ छन् हो भएको गरेको पनि यो त्यो यस उक्त एक भने तथा वा अनि गर्न हुने गरी रहेको सम्म बाट देखि भन्दा लागि भएका गर्ने थियो थिए गरे गर्दै भएर हुन भन्ने जना रहेका गरिएको').split(/\s+/));

  /* lexicon: weight > 0 positive, < 0 negative */
  const L = {};
  const add = (w, words) => words.split(/\s+/).filter(Boolean).forEach(x => L[x] = w);
  add(1, 'gain gains gained growth grew surplus profit profits profitable strong stronger strongest robust improve improved improves improvement improving recover recovered recovery recovering resume resumed resumes resumption boost boosted boosts expansion rally rallied upbeat optimism optimistic confidence confident stable stability stabilise stabilize stabilised success successful achieve achieved achievement exceed exceeded exceeds surpass surpassed accelerate accelerated efficient efficiency opportunity opportunities benefit benefits beneficial favourable favorable healthy attract attracted attractive upgrade upgraded record-high milestone approve approved approval launch launched launches support supported supports subsidy subsidies relief reform reforms reformed invest investment investments inflow inflows dividend dividends bonus rebound rebounded resilient resilience progress completed completion connects connected commissioned operational restored restore reopen reopened reopens easing waived waiver concession concessional grant grants pledge pledged assist assistance aid donate donated contribution contributed transparent transparency modernize modernise strengthen strengthened strengthening');
  add(-1, 'loss losses lose losing lost deficit deficits damage damaged damages destroy destroyed destruction flood floods flooding flooded landslide landslides disaster disasters crisis crises shortage shortages scarcity fraud fraudulent embezzlement penalty penalties penalize penalized penalise penalised fine fined default defaults defaulted bankrupt bankruptcy weak weaker weakness sluggish slump slumped slowdown stagnant stagnation concern concerns concerned worry worries worried fear fears protest protests strike strikes blockade blockades blocked block obstruct obstructed obstructing obstruction disrupt disrupted disruption disruptions suspend suspended suspension halt halted delay delayed delays shut shutdown closure closed collapse collapsed cancel cancelled canceled cancellation missing death deaths dead killed injured victims emergency threat threaten threatens threatened warn warns warned warning crash crashed overdue dumping smuggling smuggled illegal illegally corruption incomplete stalled hazard hazards earthquake avalanche stranded seized seize penalised bad-loan eviction evictions misconduct cartel cartelization black-marketing hike hikes shortfall shortfalls stress distress vulnerable vulnerability vulnerabilities outflow outflows depreciation depreciated recession downturn selling-pressure sell-off selloff');
  add(-1.5, 'plunge plunged plunges crashed devastating devastation catastrophic crisis-hit collapse');
  add(1.5, 'record surge-in-profit soared soaring');
  // Nepali terms
  add(1, 'वृद्धि नाफा सुधार लगानी सफल सफलता बलियो स्थिर स्थिरता राहत अनुदान विस्तार लाभ लाभांश बोनस प्रगति पुनर्स्थापना उत्साह सकारात्मक');
  add(-1, 'घाटा क्षति बाढी पहिरो संकट अभाव नोक्सानी कमजोर मन्दी ठगी भ्रष्टाचार जरिवाना अवरोध अवरुद्ध बन्द ढिलाइ जोखिम विपद् नकारात्मक गिरावट महँगी');
  const UP = new Set('rise rises rose risen rising increase increased increases increasing up gain gained gains surge surged surges surging jump jumped jumps climb climbed climbs soar soared soars spike spiked spikes hike hiked hikes higher grow grows grew growing expand expanded expands widen widened widens exceed exceeded accelerate accelerated bullish advance advanced advances बढ्यो बढेको बढ्दै वृद्धि उकालो'.split(' '));
  const DOWN = new Set('fall falls fell fallen falling decline declined declines declining drop dropped drops dropping decrease decreased decreases decreasing dip dipped dips slip slipped slips plunge plunged plunges slump slumped lower lowered cut cuts reduce reduced reduces reduction shrink shrank shrinks narrow narrowed narrows ease eased eases easing slide slid slides tumble tumbled bearish retreat retreated घट्यो घटेको घट्दै गिरावट ओरालो'.split(' '));
  const GOOD = new Set('nepse index indices market markets share shares stock stocks turnover profit profits earnings revenue revenues remittance remittances reserve reserves export exports growth gdp dividend dividends investment investments fdi deposits deposit capital income production generation arrivals tourists tourism sales demand capacity output collection collections liquidity valuation capitalization gainers confidence credit subscription subscriptions flows inflows नेप्से सेयर रेमिट्यान्स निर्यात राजस्व लगानी सञ्चिति कारोबार'.split(' '));
  const BAD = new Set('inflation price prices cost costs deficit deficits debt debts npl npls non-performing unemployment tariff tariffs losses loss damage damages claims shortage shortages defaults interest-rate rates rate spread decliners premium premiums fuel mudrasphiti मुद्रास्फीति महँगी घाटा ऋण मूल्य'.split(' '));
  const NEG = new Set('not no never without nor cannot cant dont doesnt didnt isnt wasnt arent werent hardly नभएको छैन होइन नगर्ने'.split(' '));
  const INTENS = new Set('sharp sharply record significant significantly steep steeply massive huge heavy heavily severe severely dramatic dramatically strong strongly'.split(' '));
  const UNC = new Set('uncertain uncertainty uncertainties may might could possibly possible risk risks risky volatile volatility unclear unpredictable speculation speculative doubt doubts pending tentative likely unlikely expected expects anticipate anticipated jitters caution cautious अनिश्चित अनिश्चितता जोखिम सम्भावना'.split(' '));
  const PHRASE = [[/rate cuts?|cut (?:in )?(?:the )?(?:policy |interest |lending )?rates?|lower(?:ed)? interest/g, 1], [/rate hikes?|hike (?:in )?(?:the )?(?:policy |interest )?rates?|tighten(?:ing|ed)? (?:monetary )?policy/g, -1],
    [/power cuts?|load[- ]shedding/g, -1], [/tax (?:cut|relief|exemption|waiver)s?/g, 1], [/excess liquidity|surplus liquidity/g, 0.5], [/liquidity (?:crunch|shortage|crisis)/g, -1.5], [/capital gains tax (?:cut|reduction)|reduced capital gains/g, 1], [/non-performing loans?|bad loans?/g, -1], [/selling pressure/g, -1], [/buying pressure|bullish/g, 1], [/bearish/g, -1], [/eas(?:e|es|ed|ing) (?:the )?(?:liquidity |inflationary |selling |price )?pressures?/g, 1], [/(?:rising|mounting|growing|increasing) pressures?/g, -1]];

  function scoreText(text, custom = {}) {
    const src = String(text || ''), lower = src.toLowerCase(); let pos = 0, neg = 0, unc = 0; const hits = [], covered = [];
    for (const [re, w] of PHRASE) { re.lastIndex = 0; let m; while ((m = re.exec(lower))) { (w > 0 ? (pos += w) : (neg -= w)); hits.push({t: m[0], w, i: m.index}); covered.push([m.index, m.index + m[0].length]); } }
    const inPhrase = i => covered.some(([a, b]) => i >= a && i < b);
    for (const s of sentences(src)) {
      const tk = [], re = new RegExp(WORD_RE.source, 'gu'); let m;
      while ((m = re.exec(s.text))) tk.push({w: m[0].toLowerCase().replace(/[’']s$/, '').replace(/[’']/g, ''), i: s.start + m.index});
      const W = tk.map(x => x.w); let negate = 0, boost = 1;
      tk.forEach(({w, i: at}, i) => {
        if (NEG.has(w)) { negate = 3; return; }
        if (INTENS.has(w)) { boost = 1.5; return; }
        if (inPhrase(at)) { if (negate > 0) negate--; return; }
        let v = w in custom ? custom[w] : L[w] ?? null;
        if (UP.has(w) || DOWN.has(w)) {   // direction: the nearest economic target within 5 words decides the sign
          let tgt = 0, best = 99; for (let j = Math.max(0, i - 5); j <= Math.min(W.length - 1, i + 5); j++) { if (j === i) continue; const d = Math.abs(j - i) + (j < i ? 0.1 : 0);
            if (d < best && (GOOD.has(W[j]) || BAD.has(W[j]))) { best = d; tgt = GOOD.has(W[j]) ? 1 : -1; } }
          if (tgt) v = (UP.has(w) ? 1 : -1) * tgt * (v != null ? Math.max(1, Math.abs(v)) : 1);
        }
        if (v != null && v !== 0) { v *= boost; if (negate > 0) v = -v; if (v > 0) pos += v; else neg -= v; hits.push({t: w, w: v, i: at}); }
        if (UNC.has(w)) unc++;
        if (negate > 0) negate--; boost = 1;
      });
    }
    const n = tokens(src).length || 1, tone = pos + neg > 0 ? (pos - neg) / (pos + neg) : 0;
    return {pos, neg, unc, n, tone, label: pos + neg === 0 ? 'Neutral' : tone > 0.2 ? 'Positive' : tone < -0.2 ? 'Negative' : 'Neutral', hits, intensity: (pos + neg) / n};
  }
  const polarityOf = w => { w = w.toLowerCase(); if (w in L) return L[w]; if (UNC.has(w)) return 0; return null; };

  /* word statistics */
  function wordFreq(texts, {minLen = 3, stem = false, bigrams = false, top = 60} = {}) {
    const c = new Map();
    const norm = w => stem && w.length > 4 && /[a-z]$/.test(w) ? w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '') : w;
    texts.forEach(t => { const tk = tokens(t).filter(w => w.length >= minLen && !STOP.has(w) && !/^\d/.test(w)).map(norm);
      (bigrams ? tk.slice(1).map((w, i) => tk[i] + ' ' + w) : tk).forEach(w => c.set(w, (c.get(w) || 0) + 1)); });
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  }
  function kwic(docs, q, width = 60) {
    if (!q.trim()) return [];
    const pat = q.trim().split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[\\p{L}\\p{M}\\p{N}]*')).join('\\s+');
    const re = new RegExp('(?<![\\p{L}\\p{M}])' + pat + '(?![\\p{L}\\p{M}])', 'giu'), out = [];
    docs.forEach(d => { const t = d.text || ''; let m; re.lastIndex = 0; while ((m = re.exec(t))) { out.push({doc: d, start: m.index, end: m.index + m[0].length, left: t.slice(Math.max(0, m.index - width), m.index), hit: m[0], right: t.slice(m.index + m[0].length, m.index + m[0].length + width)}); if (!m[0].length) re.lastIndex++; if (out.length > 2000) return; } });
    return out;
  }

  /* multinomial naive Bayes with 5-fold cross-validation */
  const feats = t => { const tk = tokens(t).filter(w => !STOP.has(w) && w.length > 2); return tk.concat(tk.slice(1).map((w, i) => tk[i] + '_' + w)); };
  function nbTrain(docs) { // docs: [{text, y}]
    const cls = [...new Set(docs.map(d => d.y))], prior = {}, cnt = {}, tot = {}, vocab = new Set();
    cls.forEach(c => { prior[c] = 0; cnt[c] = new Map(); tot[c] = 0; });
    docs.forEach(d => { prior[d.y]++; feats(d.text).forEach(f => { vocab.add(f); cnt[d.y].set(f, (cnt[d.y].get(f) || 0) + 1); tot[d.y]++; }); });
    return {cls, prior, cnt, tot, V: vocab.size, N: docs.length};
  }
  function nbPredict(m, text) { const f = feats(text), lp = {};
    m.cls.forEach(c => { let s = Math.log(m.prior[c] / m.N); f.forEach(w => s += Math.log(((m.cnt[c].get(w) || 0) + 1) / (m.tot[c] + m.V))); lp[c] = s; });
    const mx = Math.max(...Object.values(lp)); let z = 0; for (const c of m.cls) z += Math.exp(lp[c] - mx); const pr = {}; m.cls.forEach(c => pr[c] = Math.exp(lp[c] - mx) / z);
    const best = m.cls.reduce((a, b) => pr[a] >= pr[b] ? a : b); return {label: best, p: pr[best], probs: pr}; }
  function nbCV(docs, k = 5) { const idx = docs.map((_, i) => i).sort(() => Math.random() - 0.5), pred = [];
    for (let f = 0; f < k; f++) { const test = idx.filter((_, i) => i % k === f), tr = idx.filter((_, i) => i % k !== f); if (!test.length || !tr.length) continue; const m = nbTrain(tr.map(i => docs[i])); test.forEach(i => pred.push({y: docs[i].y, p: nbPredict(m, docs[i].text).label})); }
    return pred; }
  function agreement(pairs) { // [{y, p}] → accuracy, kappa, confusion, macro F1
    const cls = [...new Set(pairs.flatMap(x => [x.y, x.p]))].sort(), n = pairs.length; if (!n) return null;
    const M = cls.map(a => cls.map(b => pairs.filter(x => x.y === a && x.p === b).length)), po = cls.reduce((s, _, i) => s + M[i][i], 0) / n;
    const pe = cls.reduce((s, _, i) => s + (M[i].reduce((a, b) => a + b, 0) / n) * (M.reduce((a, r) => a + r[i], 0) / n), 0);
    const f1 = cls.map((_, i) => { const tp = M[i][i], fp = M.reduce((a, r) => a + r[i], 0) - tp, fn = M[i].reduce((a, b) => a + b, 0) - tp; return tp ? 2 * tp / (2 * tp + fp + fn) : 0; });
    return {cls, M, n, acc: po, kappa: pe < 1 ? (po - pe) / (1 - pe) : 1, f1: f1.reduce((a, b) => a + b, 0) / cls.length};
  }
  const kappaBinary = (a, b) => { const n = a.length; if (!n) return null; let n11 = 0, n10 = 0, n01 = 0, n00 = 0; a.forEach((x, i) => { const y = b[i]; if (x && y) n11++; else if (x) n10++; else if (y) n01++; else n00++; });
    const po = (n11 + n00) / n, pe = ((n11 + n10) / n) * ((n11 + n01) / n) + ((n01 + n00) / n) * ((n10 + n00) / n); return {kappa: pe < 1 ? (po - pe) / (1 - pe) : 1, agree: po, n11, n10, n01, n00, n}; };

  /* ---------------- REFI-QDA exchange ---------------- */
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const xesc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const cpIndex = (t, i) => Array.from(t.slice(0, i)).length;       // UTF-16 index → code-point index
  const u16Index = (t, cp) => Array.from(t).slice(0, cp).join('').length;
  let CRC; const crc32 = u8 => { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) { // [{name, data: string|Uint8Array}] → Blob (stored, UTF-8 names)
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    const d = new Date(), dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()), tm = (d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1));
    for (const f of files) { const nm = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + data.length; }
    const csize = cen.reduce((s, a) => s + a.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], {type: 'application/zip'});
  }
  async function unzip(buf) { // → Map(name → Uint8Array); supports stored and deflate (via DecompressionStream)
    const dv = new DataView(buf), u8 = new Uint8Array(buf); let e = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Not a zip file (.qdpx files are zip archives).');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = new Map(), dec = new TextDecoder();
    for (let k = 0; k < n; k++) { const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true), start = lo + 30 + lnl + lxl, raw = u8.subarray(start, start + csz);
      if (method === 0) out.set(name, raw.slice());
      else if (method === 8) { if (!('DecompressionStream' in window)) throw new Error('This browser cannot unpack compressed .qdpx files. Use a recent Chrome or Edge.');
        const s = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')); out.set(name, new Uint8Array(await new Response(s).arrayBuffer())); }
    }
    return out;
  }
  function codebookXML(codes, root, ns = 'project') {
    const kids = pid => codes.filter(c => (c.parent || null) === pid);
    const one = c => `<Code guid="${c.guid}" name="${xesc(c.name)}" isCodable="true" color="${xesc(c.color || '#888888')}">${c.desc || c.incl || c.excl ? `<Description>${xesc([c.desc, c.incl && 'Include: ' + c.incl, c.excl && 'Exclude: ' + c.excl].filter(Boolean).join('\n'))}</Description>` : ''}${kids(c.id).map(one).join('')}</Code>`;
    return `<Codes>${kids(root ?? null).map(one).join('')}</Codes>`;
  }
  function qdc(codes, origin) { codes.forEach(c => c.guid = c.guid || uuid()); return `<?xml version="1.0" encoding="utf-8"?>\n<CodeBook xmlns="urn:QDA-XML:codebook:1.0" origin="${xesc(origin)}">${codebookXML(codes)}</CodeBook>`; }
  function qdpx({name, origin, user, codes, docs, segs, memos}) {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), uG = uuid(); codes.forEach(c => c.guid = c.guid || uuid());
    const byId = Object.fromEntries(codes.map(c => [c.id, c])), files = [];
    const src = docs.map(d => { const g = d.guid || (d.guid = uuid()); const text = d.text || ''; files.push({name: `sources/${g}.txt`, data: text});
      const sel = segs.filter(s => s.doc === d.key && byId[s.code]).map(s => `<PlainTextSelection guid="${uuid()}" name="${xesc(text.slice(s.start, s.end).slice(0, 60))}" startPosition="${cpIndex(text, s.start)}" endPosition="${cpIndex(text, s.end)}" creatingUser="${uG}" creationDateTime="${xesc(s.at || now)}">${s.note ? `<Description>${xesc(s.note)}</Description>` : ''}<Coding guid="${uuid()}" creatingUser="${uG}" creationDateTime="${xesc(s.at || now)}"><CodeRef targetGUID="${byId[s.code].guid}"/></Coding></PlainTextSelection>`).join('');
      return `<TextSource guid="${g}" name="${xesc(d.name)}" plainTextPath="internal://${g}.txt" creatingUser="${uG}" creationDateTime="${now}"><Description>${xesc(d.desc || '')}</Description>${sel}</TextSource>`; }).join('');
    const notes = memos.map(m => `<Note guid="${uuid()}" name="${xesc(m.title || 'Memo')}" creatingUser="${uG}" creationDateTime="${xesc(m.at || now)}"><PlainTextContent>${xesc(m.text)}</PlainTextContent></Note>`).join('');
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<Project xmlns="urn:QDA-XML:project:1.0" name="${xesc(name)}" origin="${xesc(origin)}" creatingUserGUID="${uG}" creationDateTime="${now}"><Users><User guid="${uG}" name="${xesc(user)}"/></Users><CodeBook>${codebookXML(codes)}</CodeBook><Sources>${src}</Sources>${notes ? `<Notes>${notes}</Notes>` : ''}</Project>`;
    files.unshift({name: 'project.qde', data: xml});
    return zip(files);
  }
  const kidsNS = (el, tag) => Array.from(el.children).filter(c => c.localName === tag);
  function parseCodes(codesEl) { const out = []; const walk = (el, parent) => kidsNS(el, 'Code').forEach(c => { const id = c.getAttribute('guid') || uuid(); const d = kidsNS(c, 'Description')[0]?.textContent || '';
      out.push({id, guid: id, name: c.getAttribute('name') || 'Code', color: c.getAttribute('color') || null, parent, desc: d}); walk(c, id); }); if (codesEl) walk(codesEl, null); return out; }
  function readQdc(text) { const x = new DOMParser().parseFromString(text, 'application/xml'); const cb = x.getElementsByTagNameNS('*', 'Codes')[0]; if (!cb) throw new Error('No codes found in this file.'); return parseCodes(cb); }
  async function readQdpx(buf) {
    const files = await unzip(buf), dec = new TextDecoder(), projName = [...files.keys()].find(k => /\.qde$/i.test(k)); if (!projName) throw new Error('project.qde not found inside the .qdpx file.');
    const x = new DOMParser().parseFromString(dec.decode(files.get(projName)), 'application/xml'), P = x.documentElement;
    const cb = x.getElementsByTagNameNS('*', 'CodeBook')[0], codes = parseCodes(cb ? kidsNS(cb, 'Codes')[0] : null), docs = [], segs = [], memos = [];
    Array.from(x.getElementsByTagNameNS('*', 'TextSource')).forEach(s => {
      const g = s.getAttribute('guid'), path = s.getAttribute('plainTextPath') || '', inner = kidsNS(s, 'PlainTextContent')[0]?.textContent;
      let text = inner ?? ''; if (!inner && path) { const fn = path.replace(/^internal:\/\//, ''); const k = [...files.keys()].find(n => n.endsWith('/' + fn) || n === fn); if (k) text = dec.decode(files.get(k)); }
      const at = (s.getAttribute('creationDateTime') || '').slice(0, 10);
      docs.push({guid: g, name: s.getAttribute('name') || 'Document', text, date: at, desc: kidsNS(s, 'Description')[0]?.textContent || ''});
      kidsNS(s, 'PlainTextSelection').forEach(sel => { const st = +sel.getAttribute('startPosition'), en = +sel.getAttribute('endPosition'), note = kidsNS(sel, 'Description')[0]?.textContent || '';
        kidsNS(sel, 'Coding').forEach(c => { const ref = kidsNS(c, 'CodeRef')[0]?.getAttribute('targetGUID'); if (ref) segs.push({docGuid: g, start: u16Index(text, st), end: u16Index(text, en), code: ref, note}); }); });
    });
    Array.from(x.getElementsByTagNameNS('*', 'Note')).forEach(n => memos.push({title: n.getAttribute('name') || 'Memo', text: kidsNS(n, 'PlainTextContent')[0]?.textContent || ''}));
    return {name: P.getAttribute('name') || 'Imported project', origin: P.getAttribute('origin') || '', codes, docs, segs, memos};
  }
  return {tokens, sentences, STOP, scoreText, polarityOf, wordFreq, kwic, nbTrain, nbPredict, nbCV, agreement, kappaBinary, uuid, qdc, qdpx, readQdc, readQdpx, zip, lexiconSize: () => Object.keys(L).length + UP.size + DOWN.size};
})();
