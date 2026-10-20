/* Online admin on a free static host (Vercel / Netlify / Cloudflare Pages / GitHub Pages).
   The admin portal runs in the browser and saves to the website's GitHub repository through the GitHub API;
   the host redeploys on every push. The GitHub token is kept only in this browser (localStorage) and is never
   written to the repository. Layout in the repo (inside the optional folder):
     data/site.json            everything except daily prices
     data/market/index.json    {fields, months[]}
     data/market/YYYY-MM.json  {fields, days{date: rows}}
     files/<id>                uploaded PDFs / images */
'use strict';
const GH = {
  cfg: null, dirtyDb: false, months: new Set(), timer: null, busy: false, lastCommit: null, legacyMarket: false, DELAY: 20000,
  load() { try { this.cfg = JSON.parse(localStorage.getItem('nih-gh') || 'null'); } catch (e) { this.cfg = null; } return this.cfg; },
  store(c) { this.cfg = c; try { localStorage.setItem('nih-gh', JSON.stringify(c)); } catch (e) {} },
  forget() { this.cfg = null; try { localStorage.removeItem('nih-gh'); } catch (e) {} },
  p(path) { const d = (this.cfg.dir || '').replace(/^\/+|\/+$/g, ''); return d ? d + '/' + path : path; },
  enc: path => path.split('/').map(encodeURIComponent).join('/'),
  async api(path, opt = {}) {
    const c = this.cfg, r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}${path}`, {method: opt.method || 'GET', cache: 'no-store', body: opt.body,
      headers: {Authorization: 'Bearer ' + c.token, Accept: opt.accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.body ? {'Content-Type': 'application/json'} : {})}});
    if (opt.rawResponse) return r;
    if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (e) {} const er = new Error(`GitHub ${r.status}: ${m || r.statusText}`); er.status = r.status; throw er; }
    return r.status === 204 ? null : r.json();
  },
  async raw(path) { const r = await this.api(`/contents/${this.enc(this.p(path))}?ref=${encodeURIComponent(this.cfg.branch)}`, {accept: 'application/vnd.github.raw+json', rawResponse: true});
    if (r.status === 404) return null; if (!r.ok) throw new Error(`GitHub ${r.status} reading ${path}`); return r; },
  async json(path) { const r = await this.raw(path); return r ? r.json() : null; },
  async check() { const j = await this.api(''); if (!j.permissions?.push) throw new Error('This token cannot write to the repository. Give it “Contents: Read and write”.');
    await this.api(`/git/ref/heads/${encodeURIComponent(this.cfg.branch)}`); return j; },
  /* one commit with any number of changes: {path, content} (text) | {path, b64} (binary) | {path, delete: true} */
  async commit(changes, message) {
    for (let attempt = 0; ; attempt++) {
      const br = encodeURIComponent(this.cfg.branch), ref = await this.api(`/git/ref/heads/${br}`), base = ref.object.sha, bc = await this.api(`/git/commits/${base}`), tree = [];
      for (const ch of changes) { if (ch.delete) { tree.push({path: this.p(ch.path), mode: '100644', type: 'blob', sha: null}); continue; }
        const b = await this.api('/git/blobs', {method: 'POST', body: JSON.stringify(ch.b64 != null ? {content: ch.b64, encoding: 'base64'} : {content: ch.content, encoding: 'utf-8'})});
        tree.push({path: this.p(ch.path), mode: '100644', type: 'blob', sha: b.sha}); }
      const t = await this.api('/git/trees', {method: 'POST', body: JSON.stringify({base_tree: bc.tree.sha, tree})});
      const cm = await this.api('/git/commits', {method: 'POST', body: JSON.stringify({message, tree: t.sha, parents: [base]})});
      try { await this.api(`/git/refs/heads/${br}`, {method: 'PATCH', body: JSON.stringify({sha: cm.sha})}); this.lastCommit = new Date(); return cm.sha; }
      catch (e) { if (e.status === 422 && attempt < 2) continue; throw e; }
    }
  },
  /* queue: the database and changed price months go out together, 20 s after the last change (each push = one redeploy) */
  queue() { this.dirtyDb = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), this.DELAY); ghStatus(); },
  pending() { return this.dirtyDb || this.months.size > 0; },
  siteJson() { return dbJson({...Store.db, imports: undefined, published: new Date().toISOString()}); },
  async flush(message) {
    clearTimeout(this.timer); if (this.busy) { this.timer = setTimeout(() => this.flush(message), 3000); return; } if (!this.pending()) return;
    this.busy = true; ghStatus('Publishing to GitHub…');
    const months = [...this.months], ch = [{path: 'data/site.json', content: this.siteJson()}]; this.dirtyDb = false; this.months.clear();
    try {
      if (months.length) { const m = Market.data || {days: {}}, all = [...new Set(Object.keys(m.days).map(d => d.slice(0, 7)))].sort();
        months.forEach(k => { const days = Object.fromEntries(Object.entries(m.days).filter(([d]) => d.startsWith(k)).sort()); ch.push(Object.keys(days).length ? {path: `data/market/${k}.json`, content: JSON.stringify({v: 1, fields: MKT_FIELDS, days})} : {path: `data/market/${k}.json`, delete: true}); });
        ch.push({path: 'data/market/index.json', content: JSON.stringify({v: 1, fields: MKT_FIELDS, months: all, updated: new Date().toISOString()})});
        if (this.legacyMarket) { ch.push({path: 'data/market.json', delete: true}); this.legacyMarket = false; } }
      await this.commit(ch, message || `Admin update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
      Store.lastSaved = new Date(); this.busy = false; ghStatus(); toast('Published. The website updates in about a minute.');
    } catch (e) { this.dirtyDb = true; months.forEach(k => this.months.add(k)); this.busy = false; ghStatus('err', 'Not published: ' + e.message); toast('Could not publish to GitHub. ' + e.message); }
  },
  async loadMarket() {
    const idx = await this.json('data/market/index.json');
    if (idx && idx.months) { const parts = await Promise.all(idx.months.map(k => this.json(`data/market/${k}.json`))); const days = {}; parts.forEach(p => p && Object.assign(days, p.days)); this.legacyMarket = await this.api(`/contents/${this.enc(this.p('data/market.json'))}?ref=${encodeURIComponent(this.cfg.branch)}`).then(() => true).catch(() => false); return {v: 1, fields: idx.fields || MKT_FIELDS, days}; }
    const old = await this.json('data/market.json'); if (old) { this.legacyMarket = true; Object.keys(old.days || {}).forEach(d => this.months.add(d.slice(0, 7))); } return old;   // split on the next publish
  },
};
const b64Of = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
async function serverAlive() { try { const r = await fetch('api/admin/status', {cache: 'no-store'}); if (!r.ok) return false; const j = await r.json(); return j && j.ok === true; } catch (e) { return false; } }
function ghStatus(state, text) { if (typeof showStore !== 'function' || !$('#storeDot')) return; if (state === 'err') return showStore('err', text); if (state) return showStore(state); showStore(); }
window.addEventListener('beforeunload', e => { if (Store.mode === 'github' && GH.pending()) { e.preventDefault(); e.returnValue = ''; } });

/* connect screen */
function ghGate(force) {
  return new Promise(async resolve => {
    const c = GH.load();
    if (c && !force) { try { await GH.check(); Admin.ok = true; return resolve(); } catch (e) { if (e.status !== 401 && e.status !== 403 && e.status !== 404) { toast('GitHub: ' + e.message); Admin.ok = true; return resolve(); } } }
    const g = document.createElement('div'); g.className = 'gate'; g.id = 'adminGate';
    const guess = (() => { const h = location.hostname; const m = h.match(/^([a-z0-9-]+)\.github\.io$/i); return m ? {owner: m[1], repo: location.pathname.split('/')[1] || ''} : {}; })(), v = {...guess, branch: 'main', dir: '', ...(c || {})};
    g.innerHTML = `<form class="card gatecard" autocomplete="off" style="max-width:560px"><div class="brand"><span class="logo" role="img" aria-label="logo"><span class="ink"></span><img src="assets/logo-colour.png" alt=""></span><div><h2 style="margin:0">Admin dashboard</h2><p class="sub">Nepal Information Hub · online</p></div></div>
      <p class="sub">Changes are saved to the website's GitHub repository and go live about a minute later. Sign in with a GitHub access token that can write to that repository. The token stays in this browser only.</p>
      <div class="form" style="grid-template-columns:1fr 1fr"><div class="f"><label for="ghO">GitHub user / organisation</label><input id="ghO" value="${esc(v.owner || '')}" placeholder="e.g. maheshkhatri"></div><div class="f"><label for="ghR">Repository</label><input id="ghR" value="${esc(v.repo || '')}" placeholder="e.g. nepal-information-hub"></div>
      <div class="f"><label for="ghB">Branch</label><input id="ghB" value="${esc(v.branch || 'main')}"></div><div class="f"><label for="ghD">Website folder in the repo</label><input id="ghD" value="${esc(v.dir || '')}" placeholder="blank = repo root"></div>
      <div class="f" style="grid-column:1/-1"><label for="ghT">Access token (fine-grained, Contents: read and write)</label><input id="ghT" type="password" value="" placeholder="github_pat_…" autocomplete="off"></div></div>
      <div class="actions"><button class="btn primary" type="submit">Connect</button><a class="btn" href="index.html">Open the website</a><span id="gMsg"></span></div>
      <p class="sub"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a token on GitHub ↗</a> · Never share the token; anyone with it can change the website.</p></form>`;
    document.body.appendChild(g); (v.owner ? $('#ghT') : $('#ghO')).focus();
    g.querySelector('form').onsubmit = async e => { e.preventDefault();
      const n = {owner: $('#ghO').value.trim(), repo: $('#ghR').value.trim().replace(/\.git$/, ''), branch: $('#ghB').value.trim() || 'main', dir: $('#ghD').value.trim(), token: $('#ghT').value.trim() || c?.token || ''};
      if (!n.owner || !n.repo || !n.token) return msg('#gMsg', 'Fill in user, repository and token.', 'err');
      msg('#gMsg', 'Checking…'); GH.cfg = n;
      try { await GH.check(); if (!(await GH.raw('index.html'))) throw new Error(`index.html not found in ${n.repo}${n.dir ? '/' + n.dir : ''} on branch ${n.branch}. Check the folder name.`); }
      catch (er) { GH.cfg = c; return msg('#gMsg', er.message, 'err'); }
      GH.store(n); Admin.ok = true; g.remove(); resolve(); };
  });
}
function ghSettingsCard() {
  const c = GH.cfg || {};
  return `<div class="card wide"><h2>Online publishing (GitHub)</h2><p class="sub">This admin dashboard saves to <b>${esc(c.owner)}/${esc(c.repo)}</b> (branch ${esc(c.branch)}${c.dir ? ', folder ' + esc(c.dir) : ''}). Changes are grouped and pushed 20 seconds after your last edit; the host redeploys in about a minute.</p>
    <div class="actions"><button class="btn primary" id="ghNow">Publish now</button><a class="btn" href="https://github.com/${esc(c.owner)}/${esc(c.repo)}/commits/${esc(c.branch)}" target="_blank" rel="noopener">History on GitHub ↗</a><button class="btn" id="ghBk">Download backup (JSON)</button><button class="btn danger small" id="ghOut">Sign out (forget token)</button><span id="ghMsg">${GH.lastCommit ? 'Last push ' + GH.lastCommit.toLocaleTimeString() : ''}</span></div>
    <p class="sub">To undo a mistake, open the history on GitHub and revert that commit; the website goes back with it.</p></div>`;
}
function wireGhSettings() {
  if (!$('#ghNow')) return;
  $('#ghNow').onclick = async () => { GH.dirtyDb = true; await GH.flush('Publish from admin settings'); msg('#ghMsg', GH.pending() ? 'Not published, see the message above.' : 'Published ' + new Date().toLocaleTimeString(), GH.pending() ? 'err' : 'ok'); };
  $('#ghBk').onclick = () => download('nepal-information-hub-backup-' + new Date().toISOString().slice(0, 10) + '.json', dbJson(Store.db), 'application/json');
  $('#ghOut').onclick = async () => { if (GH.pending()) await GH.flush(); GH.forget(); location.reload(); };
}
