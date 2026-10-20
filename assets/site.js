/* Nepal Information Hub — roles, admin sign-in, file store, editable menus and custom pages.
   One codebase serves two dashboards:
     index.html            → the public USER dashboard (read-only: no data entry or uploads)
     admin.html (→ ?admin) → the ADMIN dashboard (upload data, files, notices, publications; edit menus and pages)
   Both read the same database (data/db.json through server.py, or this browser's storage when opened as a file),
   so whatever the admin publishes appears on the user dashboard. Loaded before app.js. */
'use strict';
const ROLE = new URLSearchParams(location.search).has('admin') ? 'admin' : 'user';
const IS_ADMIN = ROLE === 'admin';
document.documentElement.dataset.role = ROLE;

/* ------------------------------ admin session ------------------------------ */
const Admin = {token: null, ok: false};
try { Admin.token = sessionStorage.getItem('nih-admin-token'); } catch (e) {}
function authHeaders(h = {}) { return Admin.token ? {...h, 'X-Admin-Token': Admin.token} : h; }
async function apiJson(url, body, method = 'POST') { const r = await fetch(url, {method, headers: authHeaders({'Content-Type': 'application/json'}), body: body === undefined ? undefined : JSON.stringify(body)}); let j = {}; try { j = await r.json(); } catch (e) { j = {ok: false, error: 'HTTP ' + r.status}; } if (r.status === 401 && j.auth) { Admin.ok = false; adminGate(true); } return j; }
const sha256 = async t => { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return 'x' + (h >>> 0).toString(16); } };
/* resolves when the admin is signed in (server: password checked by server.py; file mode: a local password) */
function adminGate(force) {
  if (Store.mode === 'github') return ghGate(force);
  return new Promise(async resolve => {
    let configured = false;
    if (Store.mode === 'server') { try { const j = await (await fetch('api/admin/status', {headers: authHeaders(), cache: 'no-store'})).json(); configured = j.configured; if (j.admin && !force) { Admin.ok = true; return resolve(); } } catch (e) {} }
    else { let h = null; try { h = localStorage.getItem('nih-admin-local'); } catch (e) {} configured = !!h; if (configured && sessionStorage.getItem('nih-admin-local-ok') === '1' && !force) { Admin.ok = true; return resolve(); } }
    const g = document.createElement('div'); g.className = 'gate'; g.id = 'adminGate';
    g.innerHTML = `<form class="card gatecard" autocomplete="off"><div class="brand"><span class="logo" role="img" aria-label="logo"><span class="ink"></span><img src="assets/logo-colour.png" alt=""></span><div><h2 style="margin:0">Admin dashboard</h2><p class="sub">Nepal Information Hub</p></div></div>
      <p class="sub">${configured ? 'Sign in to upload data, files, notices and publications, and to edit menus and pages.' : 'Create the admin password. Only people with this password can change what users see.'}${Store.mode === 'server' ? '' : ' <b>File mode:</b> this password is kept in this browser only; run server.py for real protection and to share the dashboard.'}</p>
      <div class="form" style="grid-template-columns:1fr"><div class="f"><label for="gPw">${configured ? 'Password' : 'New password (6+ characters)'}</label><input id="gPw" type="password" autocomplete="${configured ? 'current-password' : 'new-password'}"></div>${configured ? '' : '<div class="f"><label for="gPw2">Repeat password</label><input id="gPw2" type="password" autocomplete="new-password"></div>'}</div>
      <div class="actions"><button class="btn primary" type="submit">${configured ? 'Sign in' : 'Create password'}</button><a class="btn" href="index.html">Open the user dashboard</a><span id="gMsg"></span></div></form>`;
    document.body.appendChild(g); $('#gPw').focus();
    g.querySelector('form').onsubmit = async e => { e.preventDefault(); const pw = $('#gPw').value;
      if (!configured) { if (pw.length < 6) return msg('#gMsg', 'Use at least 6 characters.', 'err'); if (pw !== $('#gPw2').value) return msg('#gMsg', 'The two passwords differ.', 'err'); }
      if (Store.mode === 'server') { const j = await apiJson(configured ? 'api/admin/login' : 'api/admin/setup', {password: pw}); if (!j.ok) return msg('#gMsg', j.error || 'Sign-in failed', 'err'); Admin.token = j.token; try { sessionStorage.setItem('nih-admin-token', j.token); } catch (er) {} }
      else { const h = await sha256('nih|' + pw); if (configured) { if (h !== localStorage.getItem('nih-admin-local')) return msg('#gMsg', 'Wrong password.', 'err'); } else localStorage.setItem('nih-admin-local', h); sessionStorage.setItem('nih-admin-local-ok', '1'); }
      Admin.ok = true; g.remove(); resolve(); };
  });
}
async function adminLogout() { if (Store.mode === 'github') { if (GH.pending()) await GH.flush(); GH.forget(); location.reload(); return; } if (Store.mode === 'server') await apiJson('api/admin/logout', {}); try { sessionStorage.removeItem('nih-admin-token'); sessionStorage.removeItem('nih-admin-local-ok'); } catch (e) {} location.reload(); }

/* ------------------------------ file store (PDFs, images, data files, floorsheets) ------------------------------
   server mode: data/files/ through server.py; file mode: IndexedDB in this browser. A file is referenced by its meta
   {id, name, size, type, url?, local?}. */
const IDB = {db: null, open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('nih-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async put(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(k) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('f').objectStore('f').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async del(k) { const d = await this.open(); return new Promise(res => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').delete(k); t.oncomplete = res; }); }};
const Files = {
  async put(file, name) { name = name || file.name || 'file';
    if (Store.mode === 'server') { const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
      const j = await apiJson('api/files', {name, type: file.type, b64}); if (!j.ok) throw new Error(j.error || 'Upload failed'); return {id: j.id, name, size: j.size, type: j.type || file.type, url: j.url}; }
    if (Store.mode === 'github') { const ext = ((name.match(/\.[a-z0-9]{1,6}$/i) || ['.bin'])[0]).toLowerCase(), id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(16).slice(2, 14) + ext;
      if (file.size > 50 * 1048576) throw new Error('Files over 50 MB cannot be stored in GitHub. Link to them instead.'); await GH.commit([{path: 'files/' + id, b64: await b64Of(file)}], 'Upload ' + name); return {id, name, size: file.size, type: file.type, url: 'files/' + id}; }
    const id = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); await IDB.put(id, file); return {id, name, size: file.size, type: file.type, local: true}; },
  async blob(meta) { if (!meta) return null; if (meta.local) { const b = await IDB.get(meta.id); if (!b) throw new Error('This file is stored in another browser (file mode). Re-upload it here or run server.py.'); return b; } let r = await fetch(meta.url, {cache: 'force-cache'}); if (!r.ok && Store.mode === 'github') r = (await GH.raw(meta.url)) || r; if (!r.ok) throw new Error('File not found on the server: ' + meta.name); return r.blob(); },
  async url(meta) { if (!meta) return null; if (meta.local) return URL.createObjectURL(await this.blob(meta)); return meta.url; },
  async del(meta) { if (!meta) return; if (meta.local) return IDB.del(meta.id); if (Store.mode === 'server') await apiJson('api/files/delete', {id: meta.id}); if (Store.mode === 'github' && meta.url) await GH.commit([{path: meta.url, delete: true}], 'Delete ' + (meta.name || meta.id)).catch(e => toast(e.message)); },
  async file(meta) { const b = await this.blob(meta); return new File([b], meta.name, {type: meta.type || b.type}); }};
const fmtSize = n => !isNum(n) ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function openFileMeta(meta) { try { const u = await Files.url(meta); window.open(u, '_blank', 'noopener'); } catch (e) { toast(e.message); } }
const uid = p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ------------------------------ site config: menus, pages, brand ------------------------------ */
const BUILTIN = {ov: 'Overview', real: 'Growth & output', demo: 'Demographics', px: 'Prices & wages', ext: 'External sector', fis: 'Public finance', bank: 'Banking & money', pay: 'Digital payments',
  'stk-market': 'Market overview', 'stk-daily': "Today's market", 'stk-ta': 'Technical', 'stk-fa': 'Fundamental', 'stk-val': 'Valuation', 'stk-rep': 'Annual reports', 'stk-broker': 'Broker analysis', 'stk-notice': 'Notices',
  blog: 'Blog', articles: 'Articles', about: 'About Us', analysis: 'Data analysis', study: 'Research workflow', quant: 'Quant lab', opt: 'Optimization lab', sem: 'Factor & SEM', cmp: 'Compare', news: 'News & sentiment', fg: 'Fear & Greed'};
const MACRO_KEYS = ['real', 'demo', 'px', 'ext', 'fis', 'bank', 'pay'];
const GROUP_IDS = ['macro', 'stock', 'pubs', 'lab'];
const DEFAULT_MENU = () => [
  {id: 'ov', key: 'ov'},
  {id: 'macro', label: 'Macroeconomic Indicators', children: MACRO_KEYS.map(k => ({id: k, key: k}))},
  {id: 'stock', label: 'Stock market', children: ['stk-market', 'stk-daily', 'stk-ta', 'stk-fa', 'stk-val', 'stk-rep', 'stk-broker', 'stk-notice'].map(k => ({id: k, key: k}))},
  {id: 'pubs', label: 'Research & Publications', children: [{id: 'blog', key: 'blog'}, {id: 'articles', key: 'articles'}]},
  {id: 'lab', label: 'Research lab', tool: true, children: ['analysis', 'study', 'quant', 'opt', 'sem', 'cmp', 'news', 'fg'].map(k => ({id: k, key: k}))},
  {id: 'about', key: 'about'}];
const ADMIN_MENU = [
  {id: 'ahome', label: 'Admin home', key: 'ahome'},
  {id: 'adata', label: 'Data', children: [{id: 'amarket', key: 'amarket', label: 'Stock market daily data'}, {id: 'imp', key: 'imp', label: 'Import files & folders'}, {id: 'anrb', key: 'anrb', label: 'NRB folder update'}, {id: 'entry', key: 'entry', label: 'Data entry'}, {id: 'data', key: 'data', label: 'All data'}, {id: 'sdata', key: 'sdata', label: 'Stock prices & screener'}, {id: 'afloor', key: 'afloor', label: 'Floorsheet (brokers)'}, {id: 'qseries', key: 'qseries', label: 'Quant series'}]},
  {id: 'acontent', label: 'Content', children: [{id: 'amenu', key: 'amenu', label: 'Menus & pages'}, {id: 'anotice', key: 'anotice', label: 'Notices'}, {id: 'apubs', key: 'apubs', label: 'Research & Publications'}, {id: 'aabout', key: 'aabout', label: 'About Us'}, {id: 'alib', key: 'alib', label: 'File library'}]},
  {id: 'aset', label: 'Settings', key: 'aset'}];
function siteDb() { const db = Store.db; db.site = db.site || {}; const s = db.site; s.pages = s.pages || {}; s.brand = s.brand || {}; db.notices = db.notices || []; db.pubs = db.pubs || []; db.library = db.library || []; db.floor = db.floor || []; s.brokers = s.brokers || {};
  if (!Array.isArray(s.menu) || !s.menu.length) s.menu = DEFAULT_MENU();
  if ((s.menuVer || 1) < 2) {   // v2: the seven statistics pages live under one "Macroeconomic Indicators" menu
    if (!s.menu.some(x => x.id === 'macro')) { const moved = [], at = s.menu.findIndex(x => MACRO_KEYS.includes(x.key) && !(x.children || []).length);
      s.menu = s.menu.filter(x => { if (MACRO_KEYS.includes(x.key) && !(x.children || []).length) { moved.push(x); return false; } return true; });
      MACRO_KEYS.forEach(k => { if (!moved.some(x => x.key === k) && !JSON.stringify(s.menu).includes(`"key":"${k}"`)) moved.push({id: k, key: k}); }); moved.sort((a, b) => MACRO_KEYS.indexOf(a.key) - MACRO_KEYS.indexOf(b.key));
      s.menu.splice(Math.max(0, Math.min(at < 0 ? 1 : at, s.menu.length)), 0, {id: 'macro', label: 'Macroeconomic Indicators', children: moved}); }
    s.menuVer = 2; }
  // make sure every built-in page exists somewhere (new versions may add some); never re-add custom items
  const have = new Set(); const walk = l => l.forEach(x => { if (x.key) have.add(x.key); (x.children || []).forEach(c => { if (c.key) have.add(c.key); }); }); walk(s.menu);
  DEFAULT_MENU().forEach(top => { if (top.key && !have.has(top.key)) s.menu.push(top); (top.children || []).forEach(c => { if (!have.has(c.key)) { let parent = s.menu.find(x => x.id === top.id); if (!parent) { parent = {id: top.id, label: top.label, children: [], tool: top.tool}; s.menu.push(parent); } (parent.children = parent.children || []).push(c); } }); });
  return s; }
const navLabel = x => x.label || BUILTIN[x.key] || (x.page && Store.db.site.pages[x.page]?.title) || 'Untitled';
const itemKey = x => x.key || (x.page ? 'page:' + x.page : null);
function menuTree() { return IS_ADMIN ? ADMIN_MENU : siteDb().menu; }
const visibleKids = top => (top.children || []).filter(c => IS_ADMIN || !c.hidden);
// the keys a top item can show; first one is its landing page
function topKeys(top) { const ks = []; if (itemKey(top)) ks.push(itemKey(top)); visibleKids(top).forEach(c => { const k = itemKey(c); if (k) ks.push(k); }); return ks; }
function findTop(k) { return menuTree().find(t => topKeys(t).includes(k)); }
function siteResolve(k) {
  const tree = menuTree();
  if (GROUP_IDS.includes(k) || tree.some(x => x.id === k && !itemKey(x) && (x.children || []).length)) { const t = tree.find(x => x.id === k); if (t) { let l = null; try { l = localStorage.getItem('nih-sub-' + k); } catch (e) {} const ks = topKeys(t); return ks.includes(l) ? l : ks[0]; } }
  if (!IS_ADMIN && ADMIN_ONLY.has(k)) return tree.find(t => !t.hidden && topKeys(t).length) ? topKeys(tree.find(t => !t.hidden && topKeys(t).length))[0] : 'ov';
  const t = findTop(k); if (t && (IS_ADMIN || !t.hidden)) return k;
  if (k && k.startsWith('page:') && Store.db.site?.pages?.[k.slice(5)]) return k;   // a page not in the menu (linked from another page)
  const first = tree.find(x => !x.hidden && topKeys(x).length); return first ? topKeys(first)[0] : 'ov'; }
const ADMIN_ONLY = new Set(['aabout', 'amarket', 'data', 'entry', 'imp', 'ahome', 'amenu', 'anotice', 'apubs', 'afloor', 'alib', 'aset', 'anrb', 'sdata', 'qseries']);
function buildNav() {
  const tabs = $('#tabs'), tree = menuTree();
  tabs.innerHTML = tree.filter(t => IS_ADMIN || !t.hidden).map(t => t.url ? `<button role="tab" data-url="${esc(t.url)}">${esc(navLabel(t))} ↗</button>` : `<button role="tab" data-top="${esc(t.id)}" class="${t.tool ? 'tool' : ''}">${esc(navLabel(t))}</button>`).join('')
    + (IS_ADMIN ? `<a class="navlink" href="index.html" target="_blank" rel="noopener">Open user dashboard ↗</a>` : '');
}
function highlightNav(k) {
  const t = findTop(k); $$('#tabs button').forEach(b => b.setAttribute('aria-selected', !!t && b.dataset.top === t.id));
  const sub = $('#labNav'), kids = t ? topKeys(t) : [];
  if (t && kids.length > 1) { sub.hidden = false; sub.innerHTML = `<div class="lgrp">${(itemKey(t) ? [t] : []).concat(visibleKids(t)).map(c => c.url ? `<button data-url="${esc(c.url)}">${esc(navLabel(c))} ↗</button>` : `<button data-t="${esc(itemKey(c))}" aria-selected="${itemKey(c) === k}">${esc(itemKey(c) === itemKey(t) && t.overview ? t.overview : navLabel(c))}</button>`).join('')}</div>`; try { localStorage.setItem('nih-sub-' + t.id, k); } catch (e) {} }
  else { sub.hidden = true; sub.innerHTML = ''; }
}
function onNavClick(e) { const b = e.target.closest('button'); if (!b) return; if (b.dataset.url) { window.open(b.dataset.url, '_blank', 'noopener'); return; }
  if (b.dataset.t) return show(b.dataset.t); const t = menuTree().find(x => x.id === b.dataset.top); if (!t) return; let l = null; try { l = localStorage.getItem('nih-sub-' + t.id); } catch (er) {} const ks = topKeys(t); show(ks.includes(l) ? l : ks[0]); }
function paneFor(k) { if (k.startsWith('page:')) return 'p-page'; if (k.startsWith('stk-')) return 'p-stock'; if (k === 'blog' || k === 'articles') return 'p-pubs'; return 'p-' + k; }
function ensurePane(id) { if (!document.getElementById(id)) { const s = document.createElement('section'); s.className = 'pane'; s.id = id; s.hidden = true; const f = document.querySelector('footer'); f.parentNode.insertBefore(s, f); } }
function applyBrand() { const cy = $('#cYear'); if (cy) cy.textContent = new Date().getFullYear(); const b = Store.db.site?.brand || {}; const h1 = $('.brandtxt h1'), tg = $('.brandtxt .tagline'), so = $('#siteSources');
  if (b.title) h1.textContent = b.title; if (b.tagline) tg.textContent = b.tagline; if (so) so.textContent = b.sources || 'Sources: NRB · MoF · NSO · NEPSE';
  if (IS_ADMIN) { h1.innerHTML = esc(b.title || 'Nepal Information Hub') + ' <span class="pill custom" style="vertical-align:middle">Admin</span>'; document.title = (b.title || 'Nepal Information Hub') + ' — Admin'; } else if (b.title) document.title = b.title; }

/* ------------------------------ user mode: no uploads — pick admin-published files instead ------------------------------ */
function libMatches(accept) { const lib = Store.db.library || []; if (!accept) return lib; const parts = accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return lib.filter(f => { const n = (f.name || '').toLowerCase(), t = (f.type || '').toLowerCase(); return parts.some(p => p.startsWith('.') ? n.endsWith(p) : p.endsWith('/*') ? t.startsWith(p.slice(0, -1)) : t === p); }); }
function userFileShim(root) {
  if (IS_ADMIN) return;
  root.querySelectorAll('input[type=file]:not([data-lib])').forEach(inp => {
    inp.dataset.lib = '1'; const host = inp.closest('label.drop') || (inp.id && document.querySelector(`label[for="${CSS.escape(inp.id)}"]`)) || inp; const opts = libMatches(inp.accept);
    const box = document.createElement('div'); box.className = 'libpick';
    box.innerHTML = opts.length ? `<label class="sub">Published file (uploads are done in the admin dashboard)</label><select><option value="">Choose a published file…</option>${opts.map(f => `<option value="${esc(f.id)}">${esc(f.title || f.name)}${f.cat ? ' · ' + esc(f.cat) : ''}</option>`).join('')}</select>` : `<span class="sub">No published files of this type yet. The admin can add them under <b>Content › File library</b>.</span>`;
    host.style.display = 'none'; if (host !== inp) inp.style.display = 'none'; host.parentNode.insertBefore(box, host.nextSibling);
    const sel = box.querySelector('select'); if (sel) sel.onchange = async () => { const f = (Store.db.library || []).find(x => x.id === sel.value); if (!f) return; try { const file = await Files.file(f); const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change', {bubbles: true})); } catch (e) { toast(e.message); } };
  });
}
if (!IS_ADMIN) new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('input[type=file]') || n.querySelector?.('input[type=file]'))) userFileShim(n.parentNode || n); }).observe(document.documentElement, {childList: true, subtree: true});

/* ------------------------------ live link between admin and user dashboards ------------------------------ */
async function syncCheck() {
  if (IS_ADMIN || document.hidden) return;
  try { if (Store.mode === 'server') { const j = await (await fetch('api/db/version', {cache: 'no-store'})).json(), m = await (await fetch('api/market/version', {cache: 'no-store'})).json(); if ((j.ok && j.version && j.version !== Store.version) || (m.ok && m.version !== Market.version)) await reloadPublished(true); } } catch (e) {}
}
async function reloadPublished(force) { const old = Store.version, oldU = Store.db?.updated, oldM = Market.version; await loadDb(); await marketLoad(); marketInject(); if (force || (old && Store.version !== old) || Market.version !== oldM || (Store.mode !== 'server' && Store.db.updated !== oldU)) { afterDataChange(); buildNav(); applyBrand(); show(cur); toast('The dashboard was updated by the admin.'); } }
setInterval(syncCheck, 30000); document.addEventListener('visibilitychange', syncCheck);
window.addEventListener('storage', e => { if (!IS_ADMIN && e.key === LS_KEY && Store.mode !== 'server') reloadPublished(); });

/* ------------------------------ small markdown renderer (blog, articles, page text) ------------------------------ */
function mdToHtml(md) {
  const inl = s => esc(s).replace(/!\[([^\]]*)\]\(((?:https?:\/\/|files\/)[^)\s]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">').replace(/\[([^\]]+)\]\(((?:https?:\/\/|files\/|#|mailto:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [], lines = String(md || '').replace(/\r/g, '').split('\n'); let list = null, para = [];
  const flush = () => { if (para.length) { out.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; } if (list) { out.push(`</${list}>`); list = null; } };
  for (const ln of lines) { let m;
    if (!ln.trim()) { flush(); continue; }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(ln))) { flush(); const n = Math.min(4, m[1].length + 1); out.push(`<h${n}>${inl(m[2])}</h${n}>`); continue; }
    if (/^---+$/.test(ln.trim())) { flush(); out.push('<hr>'); continue; }
    if ((m = /^>\s?(.*)$/.exec(ln))) { flush(); out.push('<blockquote>' + inl(m[1]) + '</blockquote>'); continue; }
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(ln)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { const t = /^\s*\d/.test(ln) ? 'ol' : 'ul'; if (para.length) { out.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; } if (list !== t) { if (list) out.push(`</${list}>`); out.push(`<${t}>`); list = t; } out.push('<li>' + inl(m[1]) + '</li>'); continue; }
    if (list) { out.push(`</${list}>`); list = null; } para.push(ln.trim()); }
  flush(); return out.join('\n');
}

/* ------------------------------ custom pages (user view) ------------------------------ */
function renderCustomPage(id) {
  const p = $('#p-page'), pg = Store.db.site.pages[id];
  if (!pg) { p.innerHTML = '<div class="card"><div class="empty">This page no longer exists.</div></div>'; return; }
  p.innerHTML = `<div class="card wide"><h2 style="font-size:24px">${esc(pg.title || 'Untitled page')}</h2>${pg.intro ? `<div class="mdtext">${mdToHtml(pg.intro)}</div>` : ''}${IS_ADMIN ? `<div class="actions"><button class="btn small" onclick="AM.page='${esc(id)}';show('amenu')">Edit this page</button></div>` : ''}</div><div class="cpgrid" id="cpBody"></div>`;
  const body = $('#cpBody');
  (pg.blocks || []).forEach((b, i) => { const el = document.createElement('div'); el.className = 'card' + (b.wide === false ? '' : ' wide'); body.appendChild(el); try { renderBlock(b, el, 'cp' + i); } catch (e) { el.innerHTML = `<p class="sub">This block could not be drawn: ${esc(e.message)}</p>`; } });
  if (!(pg.blocks || []).length) body.innerHTML = '<div class="card wide"><div class="empty">This page has no content yet.</div></div>';
}
function blockRows(b) { const d = ds(b.ds); if (!d) throw new Error('dataset “' + b.ds + '” not found'); let rows = d.rows.filter(r => !b.cat || catLabel(d, r) === b.cat); if (b.last > 0) rows = rows.slice(-b.last); return {d, rows}; }
function renderBlock(b, el, cid) {
  const t = T(), title = b.title ? `<h2>${esc(b.title)}</h2>` : '', note = b.note ? `<p class="src">${esc(b.note)}</p>` : '';
  if (b.type === 'heading') { el.className = 'cphead wide'; el.innerHTML = `<h2 style="font-size:22px">${esc(b.text || '')}</h2>`; return; }
  if (b.type === 'text') { el.innerHTML = title + `<div class="mdtext">${mdToHtml(b.md)}</div>`; return; }
  if (b.type === 'chart') { const {d, rows} = blockRows(b), cols = (b.cols || []).filter(k => d.cols.some(c => c.k === k)); if (!cols.length) throw new Error('choose at least one column');
    el.innerHTML = title + `<div class="cv"><canvas id="${cid}"></canvas></div>` + `<p class="src">Source: ${esc(d.source || d.title)}${b.note ? ' · ' + esc(b.note) : ''}</p>`;
    mk(cid, {type: b.kind === 'bar' ? 'bar' : 'line', data: {labels: rows.map(r => plabel(d, r)), datasets: cols.map((k, i) => ({label: d.cols.find(c => c.k === k).label, data: rows.map(r => r[k] ?? null), borderColor: t.s[i % 8], backgroundColor: t.s[i % 8], pointRadius: rows.length > 40 ? 0 : 2, borderWidth: 2, spanGaps: true}))}, options: {plugins: {legend: {display: cols.length > 1}}, scales: {x: {ticks: {maxTicksLimit: 10}}, y: {}}}}); return; }
  if (b.type === 'table') { const {d, rows} = blockRows(b), cols = (b.cols && b.cols.length ? b.cols : d.cols.map(c => c.k)).map(k => d.cols.find(c => c.k === k)).filter(Boolean);
    el.innerHTML = title + `<div class="tbl scroll" style="max-height:480px"><table><thead><tr>${cols.map(c => `<th class="${c.t !== 'num' ? 'txt' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.slice().reverse().map(r => `<tr>${cols.map(c => c.t === 'num' ? `<td class="num">${fmtAuto(r[c.k])}</td>` : `<td class="txt">${esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="src">Source: ${esc(d.source || d.title)}</p>` + note; return; }
  if (b.type === 'kpi') { const {d, rows} = blockRows(b), cols = (b.cols || []).map(k => d.cols.find(c => c.k === k)).filter(Boolean);
    el.innerHTML = title + `<div class="kpis" style="margin:0">${cols.map(c => { const v = rows.filter(r => isNum(r[c.k])), a = v[v.length - 1], p = v[v.length - 2]; return `<div class="kpi"><div class="k">${esc(c.label)}</div><div class="v">${a ? fmtAuto(a[c.k]) : '–'}</div><div class="d">${a ? esc(plabel(d, a)) : ''}${a && p ? ` · ${a[c.k] >= p[c.k] ? '▲' : '▼'} ${fmtAuto(Math.abs(a[c.k] - p[c.k]))}` : ''}</div></div>`; }).join('')}</div>` + note; return; }
  if (b.type === 'file') { el.innerHTML = title + (b.file ? `<div class="actions"><button class="btn accent" data-open>Open ${esc(b.label || b.file.name)}</button><span class="sub">${esc(b.file.name)} · ${fmtSize(b.file.size)}</span></div>${b.embed && /pdf/i.test(b.file.type || b.file.name) ? '<div class="pdfbox" data-embed></div>' : ''}` : '<p class="sub">No file attached.</p>') + note;
    const o = el.querySelector('[data-open]'); if (o) o.onclick = () => openFileMeta(b.file); const em = el.querySelector('[data-embed]'); if (em) Files.url(b.file).then(u => { em.innerHTML = `<iframe src="${u}" title="${esc(b.file.name)}"></iframe>`; }).catch(e => { em.innerHTML = `<p class="sub">${esc(e.message)}</p>`; }); return; }
  if (b.type === 'image') { el.innerHTML = title + (b.file ? '<figure style="margin:0"><img data-img alt="" style="max-width:100%;border-radius:8px">' + (b.caption ? `<figcaption class="sub">${esc(b.caption)}</figcaption>` : '') + '</figure>' : '<p class="sub">No image.</p>'); if (b.file) Files.url(b.file).then(u => { el.querySelector('[data-img]').src = u; }); return; }
  if (b.type === 'link') { el.innerHTML = title + `<div class="actions">${(b.links || []).map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)} ↗</a>`).join('') || '<span class="sub">No links.</span>'}</div>` + note; return; }
  if (b.type === 'notices') { el.innerHTML = title + '<div data-nl></div>'; noticeListHtml(el.querySelector('[data-nl]'), {section: b.section, n: b.n || 8}); return; }
  if (b.type === 'pubs') { el.innerHTML = title + '<div data-pl></div>'; pubListHtml(el.querySelector('[data-pl]'), {kind: b.kind, n: b.n || 6}); return; }
  el.innerHTML = '<p class="sub">Unknown block.</p>';
}

/* ------------------------------ admin: menus & pages editor ------------------------------ */
const AM = {page: null};
let amSaveT = null; const amSave = (now) => { clearTimeout(amSaveT); const go = async () => { logChange('Edited menus/pages', 'smi', ''); await persist(true); buildNavIfUser(); msg('#amMsg', 'Saved · live on the user dashboard', 'ok'); }; if (now) return go(); amSaveT = setTimeout(go, 500); };
const buildNavIfUser = () => {};
const BLOCKS = [['heading', 'Heading'], ['text', 'Text (markdown)'], ['chart', 'Chart from a dataset'], ['table', 'Table from a dataset'], ['kpi', 'Latest values (KPI cards)'], ['file', 'PDF / file'], ['image', 'Image'], ['link', 'Links'], ['notices', 'Notice list'], ['pubs', 'Blog / article list']];
function renderMenuEditor() {
  const p = $('#p-amenu'), s = siteDb();
  if (AM.page && !s.pages[AM.page]) AM.page = null;
  const row = (x, path, depth) => { const k = itemKey(x), custom = !x.key && !GROUP_IDS.includes(x.id), kids = x.children || [];
    return `<div class="mrow" style="margin-left:${depth * 26}px"><span class="mgrip">${depth ? '↳' : '▤'}</span>
      <input class="mlabel" data-path="${path}" value="${esc(navLabel(x))}" aria-label="Menu label">
      <span class="pill ${custom ? 'custom' : ''}">${x.url ? 'link' : x.page ? 'custom page' : x.key ? 'built-in' : 'menu group'}</span>
      <label class="sub"><input type="checkbox" data-vis="${path}" ${x.hidden ? '' : 'checked'}> visible</label>
      <span class="mbtns"><button class="btn small" data-up="${path}" title="Move up">▲</button><button class="btn small" data-down="${path}" title="Move down">▼</button>
      ${depth === 0 ? `<button class="btn small" data-addsub="${path}">+ Sub-heading</button>` : ''}
      ${x.page ? `<button class="btn small accent" data-edit="${esc(x.page)}">Edit page</button>` : ''}${x.url ? `<input class="murl" data-url="${path}" value="${esc(x.url)}" aria-label="Link URL">` : ''}
      ${k && !x.url ? `<a class="btn small" href="index.html#${esc(k)}" target="_blank" rel="noopener">View ↗</a>` : ''}
      ${custom ? `<button class="btn small danger" data-del="${path}">Delete</button>` : ''}</span></div>` + kids.map((c, j) => row(c, path + '.' + j, depth + 1)).join(''); };
  p.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Menus &amp; pages</h2><p class="sub">Everything here is what users see on the user dashboard. Rename any menu or sub-heading, hide it, move it, add new menus and sub-headings, and build your own pages from blocks (text, charts and tables from any dataset, PDFs, images, links, notice and publication lists). Changes save automatically and appear on the user dashboard within seconds.</p></div>
      <div class="ctrls"><button class="btn" id="amAddPage">+ New menu (page)</button><button class="btn" id="amAddLink">+ New menu (link)</button><button class="btn" id="amAddGroup">+ New menu group</button><button class="btn danger small" id="amReset">Reset menus</button></div></div>
      <div class="mtree">${s.menu.map((x, i) => row(x, String(i), 0)).join('')}</div><div class="actions"><span id="amMsg"></span></div></div>
    <div id="amPage"></div>`;
  const at = path => { const ix = path.split('.').map(Number); let list = s.menu, item = null, parent = null; ix.forEach((n, d) => { item = list[n]; if (d < ix.length - 1) { parent = item; list = item.children; } }); return {list, item, i: ix[ix.length - 1], parent}; };
  p.querySelectorAll('.mlabel').forEach(inp => inp.onchange = () => { const {item} = at(inp.dataset.path); const v = inp.value.trim(); if (item.key && v === BUILTIN[item.key]) delete item.label; else item.label = v || item.label; if (item.page && v) s.pages[item.page].title = v; amSave(); });
  p.querySelectorAll('[data-vis]').forEach(cb => cb.onchange = () => { const {item} = at(cb.dataset.vis); item.hidden = !cb.checked; amSave(); });
  p.querySelectorAll('[data-url]').forEach(inp => inp.onchange = () => { at(inp.dataset.url).item.url = inp.value.trim(); amSave(); });
  const move = (path, dir) => { const {list, i} = at(path), j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; amSave(); renderMenuEditor(); };
  p.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1)); p.querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(b.dataset.down, 1));
  p.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { const {list, i, item} = at(b.dataset.del); if (item.children?.some(c => c.key)) return toast('Move or hide its built-in sub-headings first (they cannot be deleted).');
    if (!(await confirmBox('Delete “' + navLabel(item) + '”?', item.page ? 'The page and its blocks are removed too.' : 'The menu entry is removed.', 'Delete'))) return; const drop = x => { if (x.page) delete s.pages[x.page]; (x.children || []).forEach(drop); }; drop(item); list.splice(i, 1); amSave(true); renderMenuEditor(); });
  p.querySelectorAll('[data-addsub]').forEach(b => b.onclick = () => { const {item} = at(b.dataset.addsub); addItem(item.children = item.children || [], item); });
  p.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { AM.page = b.dataset.edit; renderMenuEditor(); $('#amPage').scrollIntoView({behavior: 'smooth'}); });
  const addItem = async (list, parent) => { const kind = await choiceBox(parent ? `Add a sub-heading under “${navLabel(parent)}”` : 'Add a top menu', [['page', 'A new page I build from blocks'], ['link', 'A link to a website or document']]); if (!kind) return;
    if (kind === 'page') { const id = uid('pg'); s.pages[id] = {title: parent ? 'New sub-page' : 'New page', intro: '', blocks: [{type: 'text', md: 'Write here…'}]}; list.push({id: uid('m'), page: id}); AM.page = id; }
    else list.push({id: uid('m'), label: 'New link', url: 'https://'}); amSave(true); renderMenuEditor(); };
  $('#amAddPage').onclick = () => { const id = uid('pg'); s.pages[id] = {title: 'New page', intro: '', blocks: [{type: 'text', md: 'Write here…'}]}; s.menu.push({id: uid('m'), page: id}); AM.page = id; amSave(true); renderMenuEditor(); };
  $('#amAddLink').onclick = () => { s.menu.push({id: uid('m'), label: 'New link', url: 'https://'}); amSave(true); renderMenuEditor(); };
  $('#amAddGroup').onclick = () => { const id = uid('pg'); s.pages[id] = {title: 'Overview', intro: '', blocks: []}; s.menu.push({id: uid('m'), label: 'New menu', children: [{id: uid('m'), page: id}]}); amSave(true); renderMenuEditor(); };
  $('#amReset').onclick = async () => { if (!(await confirmBox('Reset all menus?', 'Menus go back to the default order and names. Your custom pages are kept but removed from the menu (re-add them as needed).', 'Reset'))) return; s.menu = DEFAULT_MENU(); amSave(true); renderMenuEditor(); };
  if (AM.page) renderPageEditor(AM.page);
}
function choiceBox(title, opts) { return new Promise(res => { const root = document.createElement('div'); root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div style="display:grid;gap:8px">${opts.map(([k, l]) => `<button class="btn" data-k="${esc(k)}">${esc(l)}</button>`).join('')}</div><div class="actions"><button class="btn" data-k="">Cancel</button></div></div></div>`; document.body.appendChild(root); root.onclick = e => { const b = e.target.closest('button[data-k]'); if (b || e.target.classList.contains('modal-bg')) { root.remove(); res(b ? b.dataset.k || null : null); } }; }); }
function dsOptions(sel) { return uniq(allDs().map(d => d.group)).map(g => `<optgroup label="${esc(g)}">${allDs().filter(d => d.group === g).map(d => `<option value="${esc(d.id)}" ${d.id === sel ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</optgroup>`).join(''); }
function renderPageEditor(id) {
  const host = $('#amPage'), s = siteDb(), pg = s.pages[id]; if (!pg) return;
  const blockForm = (b, i) => { const d = ds(b.ds), cats = d && catKeys(d).length ? uniq(d.rows.map(r => catLabel(d, r))) : [];
    const dsF = ['chart', 'table', 'kpi'].includes(b.type) ? `<div class="f"><label>Dataset</label><select data-f="ds">${dsOptions(b.ds)}</select></div>${cats.length ? `<div class="f"><label>Category</label><select data-f="cat"><option value="">(all)</option>${cats.map(c => `<option ${c === b.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>` : ''}<div class="f"><label>Last N rows (0 = all)</label><input data-f="last" value="${b.last || 0}"></div>
      <div class="f" style="grid-column:1/-1"><label>Columns</label><div class="opchk">${(d ? (b.type === 'table' ? d.cols : numCols(d)) : []).map(c => `<label><input type="checkbox" data-col="${esc(c.k)}" ${(b.cols || []).includes(c.k) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('')}</div></div>` : '';
    const f = {heading: `<div class="f" style="grid-column:1/-1"><label>Heading text</label><input data-f="text" value="${esc(b.text || '')}"></div>`,
      text: `<div class="f" style="grid-column:1/-1"><label>Text — markdown: # heading, **bold**, *italic*, - list, [link](https://…)</label><textarea data-f="md" rows="6">${esc(b.md || '')}</textarea></div>`,
      chart: `<div class="f"><label>Chart type</label><select data-f="kind"><option value="line" ${b.kind !== 'bar' ? 'selected' : ''}>Line</option><option value="bar" ${b.kind === 'bar' ? 'selected' : ''}>Bars</option></select></div>` + dsF,
      table: dsF, kpi: dsF,
      file: `<div class="f" style="grid-column:span 2"><label>PDF or file</label><input type="file" data-up="file"></div><div class="f"><label>Button label</label><input data-f="label" value="${esc(b.label || '')}"></div><div class="f"><label><input type="checkbox" data-f="embed" ${b.embed ? 'checked' : ''}> Show PDF on the page</label></div>${b.file ? `<p class="sub" style="grid-column:1/-1">Attached: ${esc(b.file.name)} (${fmtSize(b.file.size)})</p>` : ''}`,
      image: `<div class="f" style="grid-column:span 2"><label>Image</label><input type="file" accept="image/*" data-up="file"></div><div class="f" style="grid-column:span 2"><label>Caption</label><input data-f="caption" value="${esc(b.caption || '')}"></div>${b.file ? `<p class="sub" style="grid-column:1/-1">Attached: ${esc(b.file.name)}</p>` : ''}`,
      link: `<div class="f" style="grid-column:1/-1"><label>Links, one per line: Label | https://…</label><textarea data-f="links" rows="4">${esc((b.links || []).map(l => (l.label || '') + ' | ' + l.url).join('\n'))}</textarea></div>`,
      notices: `<div class="f"><label>Notice section</label><select data-f="section"><option value="">(all)</option>${NOTICE_SECTIONS.map(([k, l]) => `<option value="${k}" ${b.section === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div><div class="f"><label>How many</label><input data-f="n" value="${b.n || 8}"></div>`,
      pubs: `<div class="f"><label>Show</label><select data-f="kind"><option value="">Blog and articles</option><option value="blog" ${b.kind === 'blog' ? 'selected' : ''}>Blog</option><option value="article" ${b.kind === 'article' ? 'selected' : ''}>Articles</option></select></div><div class="f"><label>How many</label><input data-f="n" value="${b.n || 6}"></div>`}[b.type] || '';
    return `<div class="blk" data-i="${i}"><div class="chead"><b>${i + 1}. ${esc((BLOCKS.find(x => x[0] === b.type) || [, b.type])[1])}</b><span class="mbtns"><button class="btn small" data-bup="${i}">▲</button><button class="btn small" data-bdown="${i}">▼</button><label class="sub"><input type="checkbox" data-f="half" ${b.wide === false ? 'checked' : ''}> half width</label><button class="btn small danger" data-bdel="${i}">Remove</button></span></div>
      <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${b.type !== 'heading' ? `<div class="f" style="grid-column:1/-1"><label>Block title (optional)</label><input data-f="title" value="${esc(b.title || '')}"></div>` : ''}${f}${['chart', 'table', 'kpi', 'file', 'link'].includes(b.type) ? `<div class="f" style="grid-column:1/-1"><label>Note / source line (optional)</label><input data-f="note" value="${esc(b.note || '')}"></div>` : ''}</div></div>`; };
  host.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Edit page: ${esc(pg.title || 'Untitled')}</h2><p class="sub">Blocks appear on the page in this order. Saved automatically.</p></div><div class="ctrls"><a class="btn small" href="index.html#page:${esc(id)}" target="_blank" rel="noopener">View on user dashboard ↗</a><button class="btn small" id="peClose">Close editor</button></div></div>
    <div class="form" style="grid-template-columns:1fr"><div class="f"><label for="peTitle">Page title</label><input id="peTitle" value="${esc(pg.title || '')}"></div><div class="f"><label for="peIntro">Introduction (markdown, optional)</label><textarea id="peIntro" rows="3">${esc(pg.intro || '')}</textarea></div></div>
    <div id="peBlocks" style="display:grid;gap:12px">${(pg.blocks || []).map(blockForm).join('')}</div>
    <div class="actions"><select id="peType">${BLOCKS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn accent" id="peAdd">+ Add block</button><span id="peMsg"></span></div></div>`;
  const save = () => { amSave(); msg('#peMsg', 'Saved', 'ok'); };
  $('#peTitle').onchange = e => { pg.title = e.target.value; const it = (function f(l) { for (const x of l) { if (x.page === id) return x; const r = f(x.children || []); if (r) return r; } })(s.menu); if (it) delete it.label; save(); renderMenuEditor(); };
  $('#peIntro').onchange = e => { pg.intro = e.target.value; save(); };
  $('#peClose').onclick = () => { AM.page = null; host.innerHTML = ''; };
  $('#peAdd').onclick = () => { const type = $('#peType').value, b = {type}; if (['chart', 'table', 'kpi'].includes(type)) { b.ds = 'smi'; b.cols = numCols(ds('smi')).slice(0, 2).map(c => c.k); b.last = 0; } if (type === 'text') b.md = ''; if (type === 'link') b.links = []; (pg.blocks = pg.blocks || []).push(b); save(); renderPageEditor(id); };
  host.querySelectorAll('.blk').forEach(el => { const i = +el.dataset.i, b = pg.blocks[i];
    el.querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => { const k = inp.dataset.f; let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (k === 'half') { b.wide = !inp.checked; return save(); } if (k === 'last' || k === 'n') v = parseInt(v, 10) || 0;
      if (k === 'links') v = String(v).split('\n').map(l => { const [a, u] = l.includes('|') ? l.split('|') : ['', l]; return {label: a.trim(), url: (u || '').trim()}; }).filter(l => /^(https?:|files\/|#)/.test(l.url));
      b[k] = v; if (k === 'ds') { b.cols = []; b.cat = ''; } save(); if (['ds', 'kind'].includes(k)) renderPageEditor(id); });
    el.querySelectorAll('[data-col]').forEach(cb => cb.onchange = () => { b.cols = [...el.querySelectorAll('[data-col]:checked')].map(x => x.dataset.col); save(); });
    const up = el.querySelector('[data-up]'); if (up) up.onchange = async () => { const f = up.files[0]; if (!f) return; msg('#peMsg', 'Uploading…'); try { if (b.file) await Files.del(b.file); b.file = await Files.put(f); save(); renderPageEditor(id); } catch (e) { msg('#peMsg', e.message, 'err'); } };
  });
  const mv = (i, d) => { const j = i + d; if (j < 0 || j >= pg.blocks.length) return; [pg.blocks[i], pg.blocks[j]] = [pg.blocks[j], pg.blocks[i]]; save(); renderPageEditor(id); };
  host.querySelectorAll('[data-bup]').forEach(x => x.onclick = () => mv(+x.dataset.bup, -1)); host.querySelectorAll('[data-bdown]').forEach(x => x.onclick = () => mv(+x.dataset.bdown, 1));
  host.querySelectorAll('[data-bdel]').forEach(x => x.onclick = async () => { const b = pg.blocks[+x.dataset.bdel]; if (b.file) await Files.del(b.file); pg.blocks.splice(+x.dataset.bdel, 1); save(); renderPageEditor(id); });
}

/* ------------------------------ admin: file library ------------------------------ */
const LIB_CATS = ['Data file', 'Annual report', 'Audit report', 'Actuarial report', 'Research PDF', 'Policy / directive', 'Image', 'Other'];
function renderLibrary() {
  const p = $('#p-alib'), lib = siteDb() && Store.db.library;
  p.innerHTML = `<div class="card wide"><h2>File library</h2><p class="sub">Files published to users. On the user dashboard every place that used to have an upload button (annual-report reader, valuation, data analysis, research tools) instead lets users pick one of these files. Notices, publications and page blocks keep their own attachments.</p>
    <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class="f" style="grid-column:span 2"><label for="lbFiles">Files (PDF, Excel, CSV, images…)</label><input id="lbFiles" type="file" multiple></div><div class="f"><label for="lbCat">Category</label><select id="lbCat">${LIB_CATS.map(c => `<option>${c}</option>`).join('')}</select></div><div class="f"><label for="lbTitle">Title (optional; one file)</label><input id="lbTitle" placeholder="e.g. NABIL Annual Report 2081/82"></div></div>
    <div class="actions"><button class="btn primary" id="lbGo">Upload &amp; publish</button><span id="lbMsg"></span></div></div>
    <div class="card wide"><h2>Published files (${lib.length})</h2>${lib.length ? `<div class="tbl"><table><thead><tr><th class="txt">Title</th><th class="txt">File</th><th class="txt">Category</th><th>Size</th><th class="txt">Added</th><th>Actions</th></tr></thead><tbody>${lib.map((f, i) => `<tr><td class="txt"><input data-lt="${i}" value="${esc(f.title || '')}" placeholder="${esc(f.name)}"></td><td class="txt">${esc(f.name)}</td><td class="txt"><select data-lc="${i}">${LIB_CATS.map(c => `<option ${c === f.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></td><td class="num">${fmtSize(f.size)}</td><td class="txt">${esc((f.added || '').slice(0, 10))}</td><td><button class="btn small" data-lo="${i}">Open</button> <button class="btn small danger" data-ld="${i}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No files yet.</div>'}</div>`;
  $('#lbGo').onclick = async () => { const fs = [...$('#lbFiles').files]; if (!fs.length) return msg('#lbMsg', 'Choose files first.', 'err'); msg('#lbMsg', 'Uploading…');
    try { for (const f of fs) { const m = await Files.put(f); lib.unshift({...m, cat: $('#lbCat').value, title: fs.length === 1 ? $('#lbTitle').value.trim() : '', added: new Date().toISOString()}); } logChange('Published files', 'smi', fs.map(f => f.name).join(', ')); await persist(true); renderLibrary(); toast(fs.length + ' file(s) published'); } catch (e) { msg('#lbMsg', e.message, 'err'); } };
  p.querySelectorAll('[data-lt]').forEach(i => i.onchange = async () => { lib[+i.dataset.lt].title = i.value.trim(); await persist(true); });
  p.querySelectorAll('[data-lc]').forEach(i => i.onchange = async () => { lib[+i.dataset.lc].cat = i.value; await persist(true); });
  p.querySelectorAll('[data-lo]').forEach(b => b.onclick = () => openFileMeta(lib[+b.dataset.lo]));
  p.querySelectorAll('[data-ld]').forEach(b => b.onclick = async () => { const f = lib[+b.dataset.ld]; if (!(await confirmBox('Delete this file?', esc(f.title || f.name) + ' is removed from the user dashboard.', 'Delete'))) return; await Files.del(f); lib.splice(+b.dataset.ld, 1); await persist(true); renderLibrary(); });
}

/* ------------------------------ admin: home & settings ------------------------------ */
function renderAdminHome() {
  const p = $('#p-ahome'), db = Store.db, s = siteDb(), nds = allDs().length, nrows = allDs().reduce((a, d) => a + d.rows.length, 0);
  const tiles = [['Trading days of prices', mktDates().length, mktDates().length ? 'latest ' + last(mktDates()) : 'upload daily price files', 'amarket'], ['Datasets', nds, `${fmt(nrows, 0)} rows`, 'data'], ['Notices', db.notices.length, 'policies, reports, approvals', 'anotice'], ['Blog & articles', db.pubs.length, db.pubs.filter(x => x.published !== false).length + ' published', 'apubs'], ['Library files', db.library.length, 'published files', 'alib'], ['Floorsheets', db.floor.length, 'broker data uploads', 'afloor'], ['Custom pages', Object.keys(s.pages).length, 'in Menus & pages', 'amenu']];
  p.innerHTML = `<div class="card wide"><div class="chead"><div><h2>Admin dashboard</h2><p class="sub">Everything users see is published from here. Upload data and files, write notices and publications, and edit the menus. The user dashboard (<a href="index.html" target="_blank" rel="noopener">index.html</a>) is read-only and refreshes itself when you save.</p></div><div class="ctrls"><a class="btn accent" href="index.html" target="_blank" rel="noopener">Open user dashboard ↗</a><button class="btn" id="ahOut">Sign out</button></div></div>
    <div class="kpis" style="margin:0">${tiles.map(([l, v, sub, k]) => `<button class="kpi kpibtn" data-go="${k}"><div class="k">${l}</div><div class="v">${fmt(v, 0)}</div><div class="d">${esc(sub)}</div></button>`).join('')}</div></div>
    <div class="grid2"><div class="card"><h2>Common tasks</h2><div class="tasks">${[['amarket', 'Upload today’s share prices', 'Drop the daily Today’s price workbook (one sheet per day) — new days are added, the same day is replaced.'], ['anrb', 'Update from a new NRB folder', 'Drop the new Current Macroeconomic, BFS and other Excel files — the tables are recognised automatically.'], ['imp', 'Import other files', 'Price exports, screeners, news, CSVs, backups, or any table with column mapping.'], ['afloor', 'Upload a floorsheet', 'SN, Contract No., Buyer, Seller, Quantity, Rate, Amount → broker Sankey for users.'], ['anotice', 'Publish a notice', 'Policies, summary reports, IPO/FPO/right/bonus approvals, with PDF or link.'], ['apubs', 'Write a blog post or article', 'Text, PDF attachment, tags; shown under Research & Publications.'], ['amenu', 'Edit menus and pages', 'Rename, hide, reorder; add menus, sub-headings and pages.']].map(([k, t, d]) => `<button class="task" data-go="${k}"><b>${t}</b><span>${d}</span></button>`).join('')}</div></div>
    <div class="card"><h2>Recent changes</h2><div class="log">${db.log.slice(0, 25).map(l => `<div><time>${esc(l.t.replace('T', ' ').slice(0, 16))}</time><span>${esc(l.action)} · ${esc(ds(l.ds)?.title || l.ds)}${l.detail ? ' · ' + esc(String(l.detail).slice(0, 120)) : ''}</span></div>`).join('') || '<div>No changes yet.</div>'}</div></div></div>`;
  p.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go)); $('#ahOut').onclick = adminLogout;
}
function renderAdminSettings() {
  const p = $('#p-aset'), b = siteDb().brand;
  p.innerHTML = `${Store.mode === 'github' ? ghSettingsCard() : ''}<div class="card wide"><h2>Site settings</h2><p class="sub">Header and footer text shown on both dashboards.</p><div class="form"><div class="f"><label for="stT">Title</label><input id="stT" value="${esc(b.title || '')}" placeholder="Nepal Information Hub"></div><div class="f"><label for="stG">Tagline</label><input id="stG" value="${esc(b.tagline || '')}" placeholder="A Macroeconomic Dashboard of the Nepalese Economy"></div><div class="f"><label for="stS">Footer sources line</label><input id="stS" value="${esc(b.sources || '')}" placeholder="Sources: NRB · MoF · NSO · NEPSE"></div></div><div class="actions"><button class="btn primary" id="stSave">Save</button><span id="stMsg"></span></div></div>
    <div class="grid2"><div class="card"><h2>Admin password</h2>${Store.mode === 'server' ? `<div class="form" style="grid-template-columns:1fr"><div class="f"><label for="pwO">Current password</label><input id="pwO" type="password" autocomplete="current-password"></div><div class="f"><label for="pwN">New password</label><input id="pwN" type="password" autocomplete="new-password"></div></div><div class="actions"><button class="btn" id="pwGo">Change password</button><span id="pwMsg"></span></div><p class="sub">Forgot it? Stop the server, delete <code>admin_hash</code> from <code>data/secrets.json</code>, restart and create a new one.</p>` : '<p class="sub">File mode: the password is stored in this browser. <button class="btn small" id="pwLocal">Reset local password</button></p>'}</div>
    <div class="card"><h2>AI assistant (live search)</h2><p class="sub">The “Ask” chatbot on both dashboards uses this key. It is stored only in <code>data/secrets.json</code> on this computer.</p><div class="actions"><button class="btn" id="stChat">Set API key and model…</button></div></div>
    <div class="card"><h2>Backup</h2><p class="sub">Everything (data, menus, pages, notices, publications, library index) is in one database file.</p><div class="actions"><button class="btn" id="stBk">Download full backup (JSON)</button></div><p class="sub">${Store.mode === 'server' ? 'Uploaded files themselves are in <code>data/files/</code> — copy that folder too.' : 'File mode: uploaded files live in this browser’s storage.'}</p></div></div>
    <div class="card wide"><h2>Publish website (Vercel)</h2><p class="sub">Writes the public website into the <code>website</code> folder next to <code>server.py</code>: user dashboard, chart page and everything published here (data, stock prices, About Us, notices, publications and their files). The admin portal, password and API key are never included. Run this after each update, then deploy the folder again (see README: VERCEL).</p>
      ${Store.mode === 'server' ? `<div class="actions"><button class="btn primary" id="pubGo">Publish website</button><span id="pubMsg">${Store.db.site?.lastPublish ? 'Last published ' + esc(Store.db.site.lastPublish.replace('T', ' ')) : ''}</span></div>` : '<p class="sub">Needs the local server (start-admin-windows.bat).</p>'}</div>
    <div class="card wide"><h2>Reset admin dashboard</h2><p class="sub">Returns the dashboard to a clean install: the original seed data, default menus (with <i>Macroeconomic Indicators</i>), no custom pages, notices, publications or floorsheets. ${Store.mode === 'server' ? 'A copy of everything removed is kept in <code>data/backups/reset-…</code> first.' : 'File mode: this clears what is saved in this browser.'}</p>
      <div class="form"><label class="opchk"><input type="checkbox" id="rsMkt"> Also remove stock market daily data</label><label class="opchk"><input type="checkbox" id="rsFiles"> Also remove uploaded files (PDFs, images)</label><label class="opchk"><input type="checkbox" id="rsPw"> Also clear the admin password (a new one is set on next visit)</label>
      ${Store.mode === 'server' ? '<div class="f"><label for="rsPass">Admin password</label><input id="rsPass" type="password" autocomplete="current-password"></div>' : ''}<div class="f"><label for="rsConf">Type RESET to confirm</label><input id="rsConf" autocomplete="off"></div></div>
      <div class="actions"><button class="btn danger" id="rsGo">Reset admin dashboard</button><span id="rsMsg"></span></div></div>`;
  $('#stSave').onclick = async () => { Object.assign(b, {title: $('#stT').value.trim(), tagline: $('#stG').value.trim(), sources: $('#stS').value.trim()}); logChange('Edited site header', 'smi', ''); await persist(true); applyBrand(); msg('#stMsg', 'Saved', 'ok'); };
  if ($('#pwGo')) $('#pwGo').onclick = async () => { const j = await apiJson('api/admin/password', {old: $('#pwO').value, new: $('#pwN').value}); msg('#pwMsg', j.ok ? 'Password changed.' : j.error, j.ok ? 'ok' : 'err'); };
  if ($('#pwLocal')) $('#pwLocal').onclick = () => { localStorage.removeItem('nih-admin-local'); sessionStorage.removeItem('nih-admin-local-ok'); location.reload(); };
  $('#stChat').onclick = () => { if (typeof chatSettings === 'function') { $('#chatBox').hidden = false; chatSettings(); } };
  if ($('#pubGo')) $('#pubGo').onclick = async () => { $('#pubGo').disabled = true; msg('#pubMsg', 'Publishing…');
    try { const j = await apiJson('api/admin/publish', {}); if (!j.ok) throw new Error(j.error || 'Publish failed'); Store.db.site.lastPublish = j.published; await persist(true);
      msg('#pubMsg', `Done: ${j.folder} folder · ${j.size_mb} MB · ${j.market_days} trading days · ${j.files} files (${j.seconds}s). Now deploy it to Vercel.`, 'ok'); } catch (e) { msg('#pubMsg', e.message, 'err'); } $('#pubGo').disabled = false; };
  $('#rsGo').onclick = async () => { if ($('#rsConf').value.trim() !== 'RESET') { msg('#rsMsg', 'Type RESET to confirm.', 'err'); return; } const mk = $('#rsMkt').checked, fl = $('#rsFiles').checked, pw = $('#rsPw').checked;
    $('#rsGo').disabled = true; msg('#rsMsg', 'Resetting…');
    try { if (Store.mode === 'server') { const j = await apiJson('api/admin/reset', {password: $('#rsPass').value, market: mk, files: fl, clearPassword: pw}); if (!j.ok) throw new Error(j.error || 'Reset failed');
        msg('#rsMsg', `Done. Backup: ${j.backup}. Reloading…`, 'ok'); if (pw) try { sessionStorage.clear(); } catch (e) {} }
      else { localStorage.removeItem(LS_KEY); if (mk) await IDB.del('market:store'); if (fl) for (const f of Store.db.library || []) if (f.local && f.id) await IDB.del(f.id); if (pw) { localStorage.removeItem('nih-admin-local'); sessionStorage.removeItem('nih-admin-local-ok'); } msg('#rsMsg', 'Done. Reloading…', 'ok'); }
      ['nih-sub-macro', 'nih-sub-stock', 'nih-sub-pubs', 'nih-sub-lab', 'nmm-stock-sub'].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
      setTimeout(() => location.replace('index.html?admin=1'), 900); } catch (e) { msg('#rsMsg', e.message, 'err'); $('#rsGo').disabled = false; } };
  $('#stBk').onclick = () => download('nepal-information-hub-backup-' + new Date().toISOString().slice(0, 10) + '.json', dbJson(Store.db), 'application/json');
  if (Store.mode === 'github') { wireGhSettings(); p.querySelectorAll('.card h2').forEach(h => { if (/^(Admin password|Publish website|Reset admin dashboard|AI assistant)/.test(h.textContent)) h.closest('.card').remove(); }); }
}
