/* Nepal Information Hub — Nepali text support for report reading.
   • Converts legacy Preeti-font text (as extracted from PDFs/Excel: ";+:yf", "a}+s", "!@,#$%") to Unicode Devanagari.
   • Detects whether a line is English, Preeti-encoded Nepali or Unicode Nepali.
   • Maps Nepali financial-statement, hydropower, insurance, actuarial and audit terms to the English labels the
     statement parser understands, and Devanagari digits to ASCII digits.
   Written for this app; no third-party code. */
'use strict';
const NP = (() => {
  const MAP = {
    a: 'ब', b: 'द', c: 'अ', d: 'म', e: 'भ', f: 'ा', g: 'न', h: 'ज', i: 'ष्', j: 'व', k: 'प', l: 'ि', m: 'ः', n: 'ल', o: 'य', p: 'उ', q: 'त्र', r: 'च', s: 'क', t: 'त', u: 'ग', v: 'ख', w: 'ध', x: 'ह', y: 'थ', z: 'श',
    A: 'ब्', B: 'द्य', C: 'ऋ', D: 'म्', E: 'भ्', F: 'ँ', G: 'न्', H: 'ज्', I: 'क्ष्', J: 'व्', K: 'प्', L: 'ी', M: 'ः', N: 'ल्', O: 'इ', P: 'ए', Q: 'त्त', R: 'च्', S: 'क्', T: 'त्', U: 'ग्', V: 'ख्', W: 'ध्', X: 'ह्', Y: 'थ्', Z: 'श्',
    1: 'ज्ञ', 2: 'द्द', 3: 'घ', 4: 'द्ध', 5: 'छ', 6: 'ट', 7: 'ठ', 8: 'ड', 9: 'ढ', 0: 'ण्',
    '!': '१', '@': '२', '#': '३', '$': '४', '%': '५', '^': '६', '&': '७', '*': '८', '(': '९', ')': '०',
    '-': '(', _: ')', '=': '.', '+': 'ं', '[': 'ृ', ']': 'े', '': '', '}': 'ै', '\\': '्', '|': '्र', ';': 'स', ':': 'स्', "'": 'ु', '"': 'ू', '<': '?', '.': '।', '>': 'श्र', '/': 'र', '?': 'रु', '`': 'ञ', '~': 'ञ्',
    '÷': '/', 'ç': 'ॐ', 'ß': 'द्म', 'Û': '!', 'Ë': 'ङ्ग', '¿': 'रू', '§': 'ट्ट', '£': 'घ्', '•': 'ड्ड', '«': '्र', 'Í': 'ङ्क', 'Ì': 'न्न', 'Ø': '्य', '´': 'झ', '¶': 'ठ्ठ', 'å': 'द्व', 'Ú': '’', 'Æ': '”', 'æ': '“',
    'Ý': 'ट्ठ', 'Œ': 'त्त्', '‘': 'ॅ', 'ˆ': 'फ्', 'Š': 'ड्ढ', '›': 'द्र', 'œ': 'त्र्', '¡': 'ज्ञ्', '¢': 'द्घ', '¤': 'झ्', '¥': 'र्‍', '©': 'र', '®': '+', 'Á': 'प्त', 'Ö': '=', 'Ù': ';', '‹': 'ङ्घ', '°': 'ङ्ख', 'Ò': '¨', 'ª': 'ङ', 'Ê': 'ज़', 'Ü': '%', 'Ç': 'ञ्च', '¬': '…', 'Î': 'ङ्ख'};
  const CONS = 'क-ह', MATRA = 'ािीुूृेैोौंःँ';
  function preetiToUnicode(src) {
    let s = String(src ?? '');
    // keystroke pairs that form other letters
    s = s.replace(/O\{/g, 'ई').replace(/([kK])m/g, (m, a) => a === 'k' ? '' : '').replace(/([eE])m/g, (m, a) => a === 'e' ? '' : '').replace(/pm/g, 'ऊ').replace(/qm/g, '').replace(/Qm/g, '').replace(/\{/g, '');
    let o = ''; for (const ch of s) o += MAP[ch] ?? ch;
    o = o.replace(//g, 'फ').replace(//g, 'फ्').replace(//g, 'झ').replace(//g, 'झ्').replace(//g, 'क्र').replace(//g, 'क्त');
    o = o.replace(/्ा/g, '');                                                         // half letter + ा = full letter
    o = o.replace(new RegExp(`ि((?:[${CONS}]्)*[${CONS}](?:्र|्य)?)`, 'g'), '$1ि');   // short-i is typed before its consonant cluster
    o = o.replace(new RegExp(`((?:[${CONS}]्)*[${CONS}](?:्र|्य)?[${MATRA}]*)`, 'g'), 'र्$1');   // reph is typed after its syllable
    o = o.replace(//g, 'र्');
    o = o.replace(/([ंँ])([ािीुूृेैोौ]+)/g, '$2$1').replace(/ंं/g, 'ं').replace(/ँँ/g, 'ँ').replace(/ेे/g, 'े').replace(/ुु/g, 'ु');
    o = o.replace(/ेा/g, 'ाे').replace(/ैा/g, 'ाै').replace(/अाे/g, 'ओ').replace(/अाै/g, 'औ').replace(/अा/g, 'आ').replace(/एे/g, 'ऐ').replace(/ाे/g, 'ो').replace(/ाै/g, 'ौ');
    return o;
  }
  const DEV = '०१२३४५६७८९';
  const digitsToAscii = s => String(s).replace(/[०-९]/g, d => String(DEV.indexOf(d)));
  // convert a Preeti line but keep tokens that are plainly ASCII numbers (typed in an English font)
  const NUMTOK = /^[(]?-?\d[\d,]*(\.\d+)?[)]?%?$/;
  function convertLine(line) { return line.split(/(\s+)/).map(tok => /^\s+$/.test(tok) || NUMTOK.test(tok) ? tok : digitsToAscii(preetiToUnicode(tok)).replace(/(\d)।(?=\d)/g, '$1.')).join(''); }
  // ---- detection ----
  const EN = new Set('the of and to in for on at by as is are was be or from with total net income profit loss assets asset liabilities equity cash bank banks share capital year previous current note notes rs npr amount statement financial position other expenses expense revenue interest tax deposits loans advances reserve reserves fund funds limited ltd company group particulars this that sales cost operating investment investments insurance premium claims depreciation per basic diluted dividend paid received balance opening closing period ended july ashad gross charge provision fair value through comprehensive sub schedule as at'.split(' '));
  function lineKind(text) {
    const t = String(text || ''); if (/[ऀ-ॿ]/.test(t)) return 'unicode';
    const toks = t.trim().split(/\s+/).filter(Boolean); if (toks.length && toks.every(w => /^-?[!@#$%^&*()][!@#$%^&*(),=]*_?$/.test(w) && /[!@#$%^&*]/.test(w))) return 'preeti';
    const words = t.split(/\s+/).filter(w => /[A-Za-z;'\[\]{}\/|\\]/.test(w) && !NUMTOK.test(w)); if (!words.length) return 'en';
    let en = 0, pr = 0; for (const w of words) { const lw = w.toLowerCase().replace(/[^a-z]/g, ''); if (EN.has(lw) || (/^[A-Za-z][a-z]+[.,:]?$/.test(w) && /[aeiou]/.test(lw) && lw.length > 3 && !/f$|[^aeiou]{4}/.test(lw))) en++;
      if (/[\[\]{}|\\+]/.test(w) || /;(?=\S)/.test(w) || /\/[a-z]/i.test(w) || /[a-z]f[\]}]?$/.test(w) || /^-?[!@#$%^&*()][!@#$%^&*(),=]*_?$/.test(w) || /[a-z]'[a-z]/.test(w)) pr++; }
    return pr >= Math.max(1, words.length * 0.35) && en <= words.length * 0.4 ? 'preeti' : 'en';
  }
  // ---- Nepali → English label lexicon (matched on a normalised spelling) ----
  const norm = s => String(s || '').normalize('NFC').replace(/[‌‍़]/g, '').replace(/ँ/g, 'ं').replace(/ी/g, 'ि').replace(/ू/g, 'ु').replace(/[शष]/g, 'स').replace(/व/g, 'ब').replace(/ञ्|ङ्|ण्/g, 'न्').replace(/ॅ/g, '').replace(/[।,:;()\-–—'"‘’“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const LEX = [
    // statement headings
    ['वित्तीय अवस्थाको विवरण', 'statement of financial position'], ['वासलात', 'balance sheet'], ['नाफा वा नोक्सानको विवरण', 'statement of profit or loss'], ['नाफा नोक्सान हिसाब', 'statement of profit or loss'], ['नाफा नोक्सानको विवरण', 'statement of profit or loss'], ['आय विवरण', 'income statement'],
    ['इक्विटीमा भएको परिवर्तनको विवरण', 'statement of changes in equity'], ['इक्विटीमा भएको परिवर्तन', 'statement of changes in equity'], ['नगद प्रवाह विवरण', 'statement of cash flows'], ['नगद प्रवाहको विवरण', 'statement of cash flows'],
    // assets
    ['नगद तथा नगद सरह', 'cash and cash equivalents'], ['नगद तथा नगद समान', 'cash and cash equivalents'], ['नगद तथा बैंक मौज्दात', 'cash and bank'], ['नेपाल राष्ट्र बैंकमा रहेको मौज्दात', 'balance with nrb'], ['नेपाल राष्ट्र बैंकमा मौज्दात', 'balance with nrb'],
    ['बैंक तथा वित्तीय संस्थामा रहेको मौज्दात', 'placements with banks'], ['बैंक तथा वित्तीय संस्थामा लगानी', 'placements with banks'], ['ग्राहकलाई कर्जा तथा सापटी', 'loans and advances to customers'], ['कर्जा तथा सापटी', 'loans and advances to customers'], ['कर्जा सापट', 'loans and advances to customers'],
    ['धितोपत्रमा लगानी', 'investment securities'], ['लगानीहरु', 'investments'], ['मालसामान मौज्दात', 'inventories'], ['जिन्सी मौज्दात', 'inventories'], ['व्यापारिक प्राप्य', 'trade and other receivables'], ['प्राप्त हुन बाँकी', 'trade and other receivables'], ['आसामी', 'trade receivables'],
    ['चालु सम्पत्ति', 'total current assets'], ['सम्पत्ति तथा उपकरण', 'property, plant and equipment'], ['स्थिर सम्पत्ति', 'fixed assets'], ['कुल सम्पत्ति', 'total assets'], ['जम्मा सम्पत्ति', 'total assets'], ['कुल जायजेथा', 'total assets'],
    // liabilities and equity
    ['बैंक तथा वित्तीय संस्थालाई तिर्न बाँकी', 'due to banks'], ['ग्राहकको निक्षेप', 'deposits from customers'], ['निक्षेप दायित्व', 'deposits from customers'], ['निक्षेप', 'deposits'], ['ऋणपत्र', 'debentures'], ['ऋण तथा सापटी', 'borrowings'], ['सापटी', 'borrowings'], ['दीर्घकालीन ऋण', 'long term loans'],
    ['भुक्तानी दिन बाँकी', 'trade and other payables'], ['व्यापारिक देय', 'trade and other payables'], ['चालु दायित्व', 'total current liabilities'], ['बीमा करार दायित्व', 'insurance contract liabilities'], ['बीमा कोष', 'technical reserves'], ['जीवन बीमा कोष', 'technical reserves'],
    ['कुल दायित्व', 'total liabilities'], ['जम्मा दायित्व', 'total liabilities'], ['शेयर पूंजी', 'share capital'], ['चुक्ता पूंजी', 'share capital'], ['संचित नाफा', 'retained earnings'], ['सञ्चित नाफा', 'retained earnings'], ['संचित मुनाफा', 'retained earnings'], ['सञ्चित मुनाफा', 'retained earnings'],
    ['कुल इक्विटी', 'total equity'], ['जम्मा इक्विटी', 'total equity'], ['कुल पूंजी', 'total equity'], ['शेयरधनी कोष', "shareholders' equity"], ['शेयरधनीको कोष', "shareholders' equity"],
    // profit or loss
    ['खुद ब्याज आम्दानी', 'net interest income'], ['ब्याज आम्दानी', 'interest income'], ['ब्याज खर्च', 'interest expense'], ['शुल्क तथा कमिसन आम्दानी', 'fee and commission income'], ['कमिसन तथा डिस्काउन्ट', 'fee and commission income'], ['कुल सञ्चालन आम्दानी', 'total operating income'], ['कुल सञ्चालन आय', 'total operating income'],
    ['सम्भावित नोक्सानी व्यवस्था', 'impairment charge'], ['कर्जा नोक्सानी व्यवस्था', 'impairment charge'], ['कर्मचारी खर्च', 'personnel expenses'], ['अन्य सञ्चालन खर्च', 'other operating expenses'], ['विद्युत बिक्रीबाट आम्दानी', 'income from sale of electricity'], ['विद्युत बिक्री', 'income from sale of electricity'], ['बिजुली बिक्री', 'income from sale of electricity'],
    ['बिक्री लागत', 'cost of sales'], ['बिक्री गरिएको मालको लागत', 'cost of sales'], ['खुद बिक्री', 'net sales'], ['बिक्री आम्दानी', 'revenue'], ['कुल मुनाफा', 'gross profit'], ['ह्रास कट्टी', 'depreciation'], ['ह्रास खर्च', 'depreciation'], ['वित्तीय खर्च', 'finance costs'], ['सञ्चालन मुनाफा', 'operating profit'], ['सञ्चालन नाफा', 'operating profit'],
    ['आयकर अघिको मुनाफा', 'profit before tax'], ['आयकर अघिको नाफा', 'profit before tax'], ['कर अघिको नाफा', 'profit before tax'], ['कर अघिको मुनाफा', 'profit before tax'], ['कर अगाडिको नाफा', 'profit before tax'], ['आयकर खर्च', 'income tax expense'],
    ['यस वर्षको खुद नाफा', 'profit for the year'], ['यस वर्षको नाफा', 'profit for the year'], ['यस वर्षको मुनाफा', 'profit for the year'], ['खुद नाफा', 'profit for the year'], ['खुद मुनाफा', 'profit for the year'], ['कर पछिको नाफा', 'profit after tax'], ['प्रति शेयर आम्दानी', 'basic earnings per share'], ['प्रतिशेयर आम्दानी', 'basic earnings per share'],
    ['खुद बीमाशुल्क', 'net earned premium'], ['कुल बीमाशुल्क', 'gross written premium'], ['बीमाशुल्क आम्दानी', 'gross written premium'], ['बीमा शुल्क', 'gross written premium'], ['खुद दाबी', 'net claims incurred'], ['दाबी भुक्तानी', 'claims paid'], ['लगानीबाट आम्दानी', 'investment income'], ['लगानी आम्दानी', 'investment income'],
    // cash flows
    ['सञ्चालन गतिविधिबाट खुद नगद प्रवाह', 'net cash from operating activities'], ['कारोबार सञ्चालनबाट नगद प्रवाह', 'net cash from operating activities'], ['लगानी गतिविधिबाट खुद नगद प्रवाह', 'net cash from investing activities'], ['वित्तीय गतिविधिबाट खुद नगद प्रवाह', 'net cash from financing activities'], ['लाभांश भुक्तानी', 'dividends paid'], ['स्थिर सम्पत्ति खरिद', 'purchase of property'],
    // ratios and disclosures
    ['पूंजीकोष अनुपात', 'capital adequacy ratio'], ['पूंजी पर्याप्तता अनुपात', 'capital adequacy ratio'], ['निष्क्रिय कर्जा', 'non-performing loan'], ['आधार दर', 'base rate'], ['कोषको लागत', 'cost of funds'], ['नगद लाभांश', 'cash dividend'], ['बोनस शेयर', 'bonus shares'], ['सोल्भेन्सी', 'solvency margin'], ['ब्याजदर अन्तर', 'interest spread'],
    // hydropower
    ['जलविद्युत आयोजना', 'hydroelectric project'], ['मेगावाट', 'MW'], ['गिगावाट घण्टा', 'GWh'], ['व्यापारिक उत्पादन मिति', 'commercial operation date'], ['व्यावसायिक उत्पादन', 'commercial operation'], ['विद्युत खरिद बिक्री सम्झौता', 'power purchase agreement'], ['जलाधार क्षेत्र', 'catchment area'], ['डिजाइन डिस्चार्ज', 'design discharge'], ['वार्षिक ऊर्जा', 'annual energy'], ['उत्पादन अनुमतिपत्र', 'generation license'],
    // audit and actuarial
    ['लेखापरीक्षकको प्रतिवेदन', "independent auditor's report"], ['सशर्त राय', 'qualified opinion'], ['प्रतिकूल राय', 'adverse opinion'], ['राय दिन असमर्थ', 'disclaimer of opinion'], ['प्रमुख लेखापरीक्षण विषय', 'key audit matters'], ['ध्यानाकर्षण', 'emphasis of matter'],
    ['बीमांकीय मूल्याङ्कन', 'actuarial valuation'], ['बीमांकीय', 'actuarial'], ['बोनस दर', 'bonus rate'], ['चालु बीमालेख', 'policies in force'], ['बीमाङ्क', 'sum assured'], ['प्रथम वर्षको बीमाशुल्क', 'first year premium'], ['नवीकरण बीमाशुल्क', 'renewal premium']
  ].map(([np, en]) => [norm(np), en]).sort((a, b) => b[0].length - a[0].length);
  function englishLabel(uni) { const n = norm(uni); for (const [k, en] of LEX) if (n.includes(k)) return en; return null; }
  // translate every lexicon term inside a longer Nepali text (for keyword mining)
  function translateTerms(uni) { let n = norm(uni); for (const [k, en] of LEX) n = n.split(k).join(' ' + en + ' '); return n; }
  /* prepare one extracted line: returns {text, kind}. lang: 'auto' | 'en' | 'preeti' | 'unicode' */
  function prepare(text, lang = 'auto', docKind = null) {
    let kind = lang === 'auto' ? lineKind(text) : lang === 'unicode' ? (/[ऀ-ॿ]/.test(text) ? 'unicode' : 'en') : lang;
    if (lang === 'auto' && kind === 'en' && docKind === 'preeti' && !/[a-z]{4,}/i.test(text.replace(/[^A-Za-z ]/g, ' ').split(' ').filter(w => EN.has(w.toLowerCase())).join(' ')) && /[;'\[\]{}\/|\\+]|[a-z]f\b/.test(text)) kind = 'preeti';
    if (kind === 'preeti') { const u = convertLine(text); const en = englishLabel(u); return {text: u + (en ? `  [${en}]` : ''), kind, en}; }
    if (kind === 'unicode') { const u = digitsToAscii(text); const en = englishLabel(u); return {text: u + (en ? `  [${en}]` : ''), kind, en}; }
    return {text, kind: 'en', en: null};
  }
  return {preetiToUnicode, convertLine, digitsToAscii, lineKind, englishLabel, translateTerms, prepare, norm};
})();
if (typeof module !== 'undefined') module.exports = NP;
