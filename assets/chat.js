/* "Ask" assistant: a floating chat for the latest information.
   With an Anthropic API key saved in server.py it answers with live web search (cited); without one it answers
   from the app's own data (latest prices, Fear & Greed, macro tables, latest news headlines). */
'use strict';
const CH = {open: false, msgs: [], key: null, model: 'claude-sonnet-5', busy: false};
function chatInit() {
  if ($('#chatFab')) return;
  document.body.insertAdjacentHTML('beforeend', `<button class="chatfab" id="chatFab" aria-label="Ask for the latest information">Ask</button>
  <section class="chatbox" id="chatBox" hidden aria-label="Assistant"><div class="chathead"><div><b>Ask about Nepal's economy and NEPSE</b><div class="sub" id="chatMode">checking…</div></div><div style="display:flex;gap:6px"><button class="btn small" id="chatSet" title="Settings">⚙</button><button class="btn small" id="chatX" aria-label="Close">×</button></div></div>
    <div class="chatlog" id="chatLog"></div><form class="chatin" id="chatForm"><textarea id="chatIn" rows="2" placeholder="e.g. What did NRB announce this week?  ·  NABIL price  ·  latest news"></textarea><button class="btn primary" type="submit">Send</button></form></section>`);
  $('#chatFab').onclick = () => { CH.open = !CH.open; $('#chatBox').hidden = !CH.open; if (CH.open) { chatStatus(); if (!CH.msgs.length) chatPush('a', 'Namaste! Ask me for the latest market, economic or policy news. I can also read the numbers already in this app: NEPSE and stock prices, Fear & Greed, inflation, interest rates, reserves and the latest headlines.'); $('#chatIn').focus(); } };
  $('#chatX').onclick = () => { CH.open = false; $('#chatBox').hidden = true; };
  $('#chatSet').onclick = () => chatSettings();
  $('#chatForm').onsubmit = e => { e.preventDefault(); const q = $('#chatIn').value.trim(); if (!q || CH.busy) return; $('#chatIn').value = ''; chatAsk(q); };
  $('#chatIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } };
}
async function chatStatus() { try { const j = await (await fetch('api/settings')).json(); CH.key = j.hasKey; CH.model = j.model; } catch (e) { CH.key = null; }
  $('#chatMode').textContent = CH.key ? `Live web search on (${CH.model})` : CH.key === false ? 'Offline mode: answers from app data. Add an API key (⚙) for live web search.' : 'Offline mode (open the app through server.py for live answers).'; }
function chatPush(who, text, sources) { CH.msgs.push({role: who === 'u' ? 'user' : 'assistant', content: text}); const el = document.createElement('div'); el.className = 'msgb ' + who; el.innerHTML = chatFmt(text) + (sources && sources.length ? `<div class="sub" style="margin-top:6px">Sources: ${sources.slice(0, 8).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title.slice(0, 60))}</a>`).join(' · ')}</div>` : ''); $('#chatLog').appendChild(el); el.scrollIntoView({block: 'end'}); return el; }
function chatFmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/^#+\s*(.+)$/gm, '<b>$1</b>'); }
function chatContext() {
  const lines = [], px = s => { if (!symbols().includes(s)) return null; const P = priceSeries(s); const n = P.c.length; return n ? {d: P.date[n - 1], c: P.c[n - 1], ch: n > 1 ? (P.c[n - 1] / P.c[n - 2] - 1) * 100 : null} : null; };
  const nep = px('NEPSE'); if (nep) lines.push(`NEPSE ${fmt(nep.c, 2)} on ${nep.d} (${nep.ch >= 0 ? '+' : ''}${fmt(nep.ch, 2)}%)`);
  try { if (!FG.lastCalc) { const R = fgCompute(); const i = R.index.length - 1 - R.index.slice().reverse().findIndex(isNum); FG.lastCalc = {value: R.index[i], label: fgLabel(R.index[i]), date: R.d[i]}; } lines.push(`Fear & Greed ${fmt(FG.lastCalc.value, 0)} (${FG.lastCalc.label}) on ${FG.lastCalc.date}`); } catch (e) {}
  const lastRow = (id, col) => { const d = ds(id); const r = d ? [...d.rows].reverse().find(x => isNum(x[col])) : null; return r ? {v: r[col], p: plabel(d, r)} : null; };
  [['inflation_monthly', 'cpi', 'CPI inflation y/y %'], ['rates_monthly', 'interbank', 'Interbank rate %'], ['rates_monthly', 'tbill91', '91-day T-bill %'], ['rates_monthly', 'lending', 'Average lending rate %'], ['reserves_monthly', 'usd_mn', 'FX reserves USD mn'], ['fx_monthly', 'npr_usd', 'NPR per USD'], ['bank_monthly', 'npl', 'NPL %']].forEach(([id, c, l]) => { const x = lastRow(id, c); if (x) lines.push(`${l}: ${fmt(x.v, 2)} (${x.p})`); });
  const news = (ds('news_docs')?.rows || []).filter(r => r.date).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 12); if (news.length) lines.push('Latest headlines in the app:\n' + news.map(r => `- ${r.date} ${r.title} [${r.source || ''}] tone ${isNum(r.score) ? fmt(r.score, 2) : ''}${r.url ? ' ' + r.url : ''}`).join('\n'));
  return lines.join('\n');
}
async function chatAsk(q) {
  chatPush('u', q); CH.busy = true; const wait = chatPush('a', '…');
  try {
    if (/refresh|latest news|fetch news/i.test(q) && Store.mode === 'server') { const r = await newsFetchAll(); wait.innerHTML = chatFmt(`Fetched ${r.added} new news items.`); }
    if (CH.key) { const sys = `You are the research assistant inside "Nepal Information Hub", a local app for Nepal's economy and the NEPSE stock market. Today is ${new Date().toISOString().slice(0, 10)}. Use web search for anything recent (news, prices, policy, NRB circulars, SEBON, budgets) and cite sources. Prefer primary sources (nrb.org.np, sebon.gov.np, nepalstock.com, mof.gov.np) and reputable Nepali media. Be concise and factual; give numbers with dates; say when something could not be verified. Not investment advice. The user may write in English, Nepali or romanized Nepali: reply in the same language.\n\nData already in the app:\n${chatContext()}`;
      const r = await fetch('api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({system: sys, messages: CH.msgs.filter(m => m.content !== '…').slice(-10)})}); const j = await r.json();
      if (!j.ok) throw new Error(j.error === 'nokey' ? 'No API key saved.' : j.error); wait.remove(); CH.msgs.pop(); chatPush('a', j.text || '(no answer)', j.sources); }
    else { wait.remove(); CH.msgs.pop(); chatPush('a', chatOffline(q)); }
  } catch (e) { wait.remove(); CH.msgs.pop(); chatPush('a', `Could not get a live answer (${e.message}). From the app's data:\n\n` + chatOffline(q)); }
  finally { CH.busy = false; }
}
function chatOffline(q) {
  const s = q.toUpperCase(), syms = symbols().filter(x => new RegExp('\\b' + x + '\\b').test(s)), out = [];
  syms.forEach(x => { const P = priceSeries(x), n = P.c.length; if (!n) return; const c = P.c[n - 1], ch = n > 1 ? (c / P.c[n - 2] - 1) * 100 : null, w = n > 240 ? (c / P.c[n - 241] - 1) * 100 : null; out.push(`**${x}** ${fmt(c, 2)} on ${P.date[n - 1]} (${ch >= 0 ? '+' : ''}${fmt(ch, 2)}% on the day${isNum(w) ? `, ${w >= 0 ? '+' : ''}${fmt(w, 1)}% over a year` : ''}).`); });
  if (/fear|greed|sentiment|mood/i.test(q)) { try { const R = fgCompute(), i = R.index.length - 1 - R.index.slice().reverse().findIndex(isNum); out.push(`Fear & Greed index: **${fmt(R.index[i], 0)} (${fgLabel(R.index[i])})** on ${R.d[i]}.`); } catch (e) {} }
  if (/news|headline|khabar|samachar|latest/i.test(q)) { const news = (ds('news_docs')?.rows || []).filter(r => r.date).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 8); if (news.length) out.push('Latest headlines in the app:\n' + news.map(r => `• ${r.date} — ${r.title}${r.url ? ' ' + r.url : ''}`).join('\n')); }
  const ctx = chatContext().split('\n').filter(l => !l.startsWith('-') && !/headlines/.test(l));
  const pick = [[/inflation|cpi|mahangi|price/i, 'CPI'], [/interest|rate|byaj|t-?bill|interbank|lending/i, 'rate'], [/reserve|forex|sanchiti/i, 'reserves'], [/dollar|usd|exchange/i, 'NPR per USD'], [/npl|bad loan/i, 'NPL'], [/nepse|market|index|bazar/i, 'NEPSE']];
  pick.forEach(([re, key]) => { if (re.test(q)) ctx.filter(l => l.toLowerCase().includes(key.toLowerCase())).forEach(l => { if (!out.includes(l)) out.push(l); }); });
  if (!out.length) out.push('In offline mode I can answer from the data in this app: try "NEPSE", a symbol such as "NABIL", "fear and greed", "inflation", "interest rates", "reserves" or "latest news". For live web answers add an Anthropic API key with ⚙ (the app must run through server.py).\n\nCurrent snapshot:\n' + ctx.slice(0, 8).join('\n'));
  return out.join('\n\n');
}
function chatSettings() {
  const log = $('#chatLog'); const el = document.createElement('div'); el.className = 'msgb a';
  el.innerHTML = `<b>Live answers with web search</b><p class="sub">Paste an Anthropic API key (from console.anthropic.com). It is saved only on this computer in <code>data/secrets.json</code> by server.py and is never sent anywhere except api.anthropic.com. Web searches are billed to your API account.</p>
    <input id="chKey" type="password" placeholder="sk-ant-…" style="width:100%"><div style="margin-top:6px"><label class="sub">Model</label> <select id="chModel"><option value="claude-sonnet-5">claude-sonnet-5 (fast)</option><option value="claude-opus-5-5">claude-opus-5-5 (deepest)</option><option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (cheapest)</option></select></div>
    <div class="actions"><button class="btn primary small" id="chSave">Save</button><button class="btn small danger" id="chDel">Remove key</button><span id="chMsg"></span></div>`;
  log.appendChild(el); el.scrollIntoView({block: 'end'}); $('#chModel').value = CH.model;
  const save = async body => { try { const r = await fetch('api/settings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); const j = await r.json(); if (!j.ok) throw new Error(j.error); msg('#chMsg', j.hasKey ? 'Saved. Live search is on.' : 'Removed.', 'ok'); chatStatus(); } catch (e) { msg('#chMsg', 'Needs the app running through server.py: ' + e.message, 'err'); } };
  $('#chSave').onclick = () => save({anthropic_api_key: $('#chKey').value.trim() || undefined, model: $('#chModel').value}); $('#chDel').onclick = () => save({anthropic_api_key: ''});
}
