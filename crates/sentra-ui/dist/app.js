import xg from './vendor/xterm-esm.js';
const Terminal = xg.Terminal;
const { FitAddon } = await import('./vendor/addon-fit-esm.js');
const { CanvasAddon } = await import('./vendor/addon-canvas-esm.js');

const XTERM_LIGHT = {
  background: '#ffffff', foreground: '#101014', cursor: '#2d81ff', cursorAccent: '#ffffff',
  selectionBackground: '#2d81ff33',
  black: '#101014', red: '#d94b4b', green: '#1a7f37', yellow: '#9a6700',
  blue: '#2d81ff', magenta: '#a0309a', cyan: '#0f7f8c', white: '#a3a3ab',
  brightBlack: '#73737c', brightRed: '#e05252', brightGreen: '#22863a', brightYellow: '#b08800',
  brightBlue: '#4c94ff', brightMagenta: '#bc4cba', brightCyan: '#189aa9', brightWhite: '#101014',
};
const XTERM_DARK = {
  background: '#17171C', foreground: '#F2F1EE', cursor: '#2D81FF', cursorAccent: '#101014',
  selectionBackground: '#2D81FF44',
  black: '#101014', red: '#F87171', green: '#32D583', yellow: '#FDB022',
  blue: '#2D81FF', magenta: '#B692F6', cyan: '#53B1FD', white: '#B9B9C2',
  brightBlack: '#858D9D', brightRed: '#F87171', brightGreen: '#32D583', brightYellow: '#FDB022',
  brightBlue: '#53B1FD', brightMagenta: '#B692F6', brightCyan: '#53B1FD', brightWhite: '#F2F1EE',
};

let seq = 1;
const pending = new Map();      // reqId -> {resolve, reject}
let evtHandler = null;          // fn(evt) for pushed events

const USE_TAURI = typeof window !== 'undefined' && !!window.__TAURI__;
async function rpc(cmd_obj) {
  if (USE_TAURI) {
    const id = seq++;
    const line = JSON.stringify({ ...cmd_obj, _req: id });
    const p = new Promise((res, rej) => pending.set(id, { res, rej }));
    const { invoke } = window.__TAURI__.core;
    await invoke('send_line', { line });
    return p;
  }
  // browser fallback: POST /api, response carries no _req
  const r = await fetch('/api', { method: 'POST', body: JSON.stringify(cmd_obj) });
  return r.json();
}
// Tauri side pushes every line from the conn as event://sentra-line
function onLine(line) {
  let v;
  try { v = JSON.parse(line); } catch { return; }
  if (v._req != null && pending.has(v._req)) {
    const { res } = pending.get(v._req);
    pending.delete(v._req);
    res(v);
    return;
  }
  if (v.evt && evtHandler) evtHandler(v);
}
if (USE_TAURI) window.__TAURI__.event.listen('sentra-line', (e) => onLine(e.payload));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function main() {
  if (USE_TAURI) await window.__TAURI__.core.invoke('connect');
  else { const es = new EventSource('/events'); es.onmessage = (e) => onLine(e.data); }

  // --- state ---
  const state = { agents: new Map(), focus: null, panes: new Map(), lastOut: new Map() };
  // agents: id -> {id,name,argv,alive,exit_code,role} · panes: id -> {el, term, fit}
  const $ = (id) => document.getElementById(id);
  const harnessEl = $('harness'), appEl = $('app');

  document.fonts.ready.then(() => { for (const p of state.panes.values()) p.fit && p.fit.fit(); });

  // ===== handrail (activity rail under the grid, from mock) =====
  const rail = $('handrail'), railText = $('hr-text');
  let railTimer = null;
  function railShow(text, cls) {
    rail.classList.remove('hidden');
    rail.className = cls || '';
    railText.textContent = text;
    clearTimeout(railTimer);
    railTimer = setTimeout(() => rail.classList.add('hidden'), 6000);
  }

  // ===== harness launcher =====
  function parseHarness(s) {
    // "@hermes handle ui  @claude front end" → [{preset:'hermes',task:'handle ui'},…]
    const out = [];
    const re = /@([A-Za-z0-9_-]+)((?:\s+(?!@[A-Za-z0-9_-]+)[^\s@][^@]*)?)/g;
    for (const m of s.matchAll(re)) {
      const preset = m[1].toLowerCase();
      const task = (m[2] || '').trim();
      if (preset) out.push({ preset, task });
    }
    return out;
  }
  async function launchHarness(specs) {
    if (!specs.length) return;
    harnessEl.hidden = true;
    appEl.hidden = false;
    const ids = [];
    for (const sp of specs) {
      const r = await spawnCmd(sp.preset);
      if (r.ok) {
        await openPane(r.id, sp.preset);
        ids.push(r.id);
        if (sp.task) await rpc({ cmd: 'send', id: String(r.id), text: sp.task, enter: true });
      } else {
        railShow(`spawn ${sp.preset} gagal: ${r.err || '?'}`, 'err');
      }
    }
    if (ids.length) focusPane(ids[0]);
    refitAll();
  }
  $('hform').addEventListener('submit', (e) => {
    e.preventDefault();
    launchHarness(parseHarness($('hinput').value));
  });
  for (const b of document.querySelectorAll('.h-chips button[data-p]')) {
    b.onclick = () => launchHarness([{ preset: b.dataset.p, task: '' }]);
  }
  const pendingHarness = sessionStorage.getItem('sentra-harness');
  if (pendingHarness) { sessionStorage.removeItem('sentra-harness'); launchHarness(JSON.parse(pendingHarness)); }
  // profile chips (from daemon `profiles`) → spawn personas with preamble
  (async () => {
    const hp = $('hprofiles');
    const r = await rpc({ cmd: 'profiles' }).catch(() => null);
    if (!r || !r.ok || !hp) return;
    for (const [name, p] of Object.entries(r.profiles || {})) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '@' + name;
      b.title = (p.role || '') + ' · preset ' + (p.preset || '?');
      b.onclick = () => launchHarness([{ preset: name, task: '' }]);
      hp.appendChild(b);
    }
  })();

  // theme
  const rm = $('roster-rows');
  const htmlEl = document.documentElement;
  function applyTheme(dark) {
    htmlEl.classList.toggle('dark', dark);
    localStorage.setItem('sentra-theme', dark ? 'dark' : 'light');
    for (const p of state.panes.values()) { try { p.term.option('theme', dark ? XTERM_DARK : XTERM_LIGHT); } catch {} }
  }
  $('thmbtn').onclick = () => applyTheme(!htmlEl.classList.contains('dark'));
  const savedTheme = localStorage.getItem('sentra-theme');
  applyTheme(savedTheme ? savedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  $('setbtn').onclick = () => { appEl.hidden = false; $('cmd').focus(); };

  // ===== roster: grouped by workspace cwd =====
  const collapsed = new Map(); // cwd -> bool
  const base = (p) => p.replace(/\/+$/, '').split('/').pop() || p || '?';
  function agentRow(a) {
    const row = document.createElement('div');
    row.className = 'row' + (state.focus === a.id ? ' active' : '');
    row.innerHTML = `<span class="dot ${a.alive ? 'live' : 'dead'}"></span>` +
      `<span class="rname">${esc(a.name)}</span>` +
      (a.role ? `<span class="role">${esc(a.role)}</span>` : '') +
      `<span class="argv">${esc(a.argv.join(' '))}</span>` +
      `<span class="rid">#${a.id}</span>`;
    row.onclick = () => focusPane(a.id);
    row.oncontextmenu = (e) => { e.preventDefault(); openHandoff(a.id); };
    row.onauxclick = (e) => { if (e.button === 2) { e.preventDefault(); openHandoff(a.id); } };
    return row;
  }
  function syncEmpty() {
    const es = $('empty-state');
    if (!es) return;
    es.classList.toggle('hidden', state.agents.size > 0);
    gridEl.classList.toggle('es', state.agents.size === 0);
  }
  function renderRoster() {
    rm.innerHTML = '';
    const groups = new Map();
    for (const a of state.agents.values()) {
      const cwd = a.cwd || '?';
      if (!groups.has(cwd)) groups.set(cwd, []);
      groups.get(cwd).push(a);
    }
    const cwds = [...groups.keys()].sort((x, y) =>
      ((x === '?' ? 1 : x.split('/').length) - (y === '?' ? 1 : y.split('/').length)) || x.localeCompare(y));
    for (const cwd of cwds) {
      const list = groups.get(cwd);
      const block = document.createElement('div');
      block.className = 'ws-block';
      const head = document.createElement('div');
      head.className = 'ws-head';
      const liveN = list.filter((a) => a.alive).length;
      head.innerHTML = `<span class="ws-caret">${collapsed.get(cwd) ? '▸' : '▾'}</span>` +
        `<span class="ws-name">${esc(base(cwd))}</span>` +
        `<span class="ws-path">${esc(cwd)}</span>` +
        `<span class="ws-badge">${list.length} agentes · ${liveN} live</span>`;
      head.onclick = () => { collapsed.set(cwd, !collapsed.get(cwd)); renderRoster(); };
      block.appendChild(head);
      if (!collapsed.get(cwd)) {
        const wrap = document.createElement('div');
        wrap.className = 'ws-agents';
        for (const a of list.sort((x, y) => x.id - y.id)) wrap.appendChild(agentRow(a));
        block.appendChild(wrap);
      }
      rm.appendChild(block);
    }
    if (!state.agents.size) rm.innerHTML = '<div class="row" style="color:var(--muted)">no agents - spawn below</div>';
    syncEmpty();
    const live = [...state.agents.values()].filter((a) => a.alive).length;
    const foc = state.focus != null ? state.agents.get(state.focus) : null;
    const cwdShow = (foc && foc.cwd) || cwds.find((c) => c !== '?') || '/';
    { const f = $('es-foot'); if (f && state.agents.size === 0) f.textContent = `PROJECT: ${cwdShow} · DAEMON RUNNING`; }
    $('tstat').textContent = `${live}/${state.agents.size} LIVE · ${cwdShow}`;
  }
  // ponytail: telemetry chips (tokens/RSS/cost) skipped — daemon list payload lacks them; add when daemon exposes per-agent rss/cost.

  // ===== panes =====
  const gridEl = $('grid');
  async function openPane(id, presetName) {
    if (state.panes.has(id)) return state.panes.get(id);
    const pane = document.createElement('div');
    pane.className = 'gpane';
    const a = state.agents.get(id) || {};
    pane.innerHTML = `<div class="gtitle"><span class="dot live"></span>` +
      `<span class="gname">${esc(a.name || presetName || ('agent ' + id))}</span>` +
      `<span class="gargv">${esc((a.argv || []).join(' '))}</span>` +
      `<span class="gkill" title="kill (ctrl-shift-W)">✕</span></div>` +
      `<div class="gdead"></div><div class="gterm"></div>`;
    gridEl.appendChild(pane);
    const term = new Terminal({ convertEol: false, cursorBlink: true, fontFamily: '"Geist Mono","JetBrains Mono",monospace', fontSize: 12.5, theme: htmlEl.classList.contains('dark') ? XTERM_DARK : XTERM_LIGHT });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(pane.querySelector('.gterm'));
    try { term.loadAddon(new CanvasAddon()); } catch {}
    const rec = { el: pane, term, fit };
    state.panes.set(id, rec);
    // backfill from daemon ring
    const r = await rpc({ cmd: 'read', id: String(id), tail: 65536 });
    if (r.ok && r.chunk) term.write(r.chunk);
    term.onData((d) => rpc({ cmd: 'send', id: String(id), text: d, enter: false }));
    term.onResize(({ cols, rows }) => rpc({ cmd: 'resize', id: String(id), cols, rows }));
    pane.querySelector('.gtitle').onclick = () => focusPane(id);
    pane.querySelector('.gtitle').oncontextmenu = (e) => { e.preventDefault(); focusPane(id); openHandoff(id); };
    pane.querySelector('.gkill').onclick = (e) => { e.stopPropagation(); rpc({ cmd: 'kill', id: String(id) }); };
    refitAll();
    focusPane(id);
    return rec;
  }

  function refitAll() {
    const n = state.panes.size;
    gridEl.className = n > 4 ? 'c2' : n === 3 || n === 4 ? 'c2' : n === 2 ? 'c2' : 'c1';
    for (const rec of state.panes.values()) { try { rec.fit.fit(); } catch {} }
    requestAnimationFrame(() => { for (const rec of state.panes.values()) { try { rec.fit.fit(); } catch {} } });
  }

  function focusPane(id) {
    state.focus = id;
    for (const [pid, rec] of state.panes) rec.el.classList.toggle('focused', pid === id);
    const rec = state.panes.get(id);
    if (rec) { rec.term.focus(); rec.el.scrollIntoView({ block: 'nearest' }); }
    renderRoster();
  }

  function cycleFocus() {
    const ids = [...state.agents.keys()].sort((a, b) => a - b);
    if (!ids.length) return;
    const i = ids.indexOf(state.focus);
    focusPane(ids[(i + 1) % ids.length]);
  }

  function closePane(id, keepInRoster) {
    const rec = state.panes.get(id);
    if (rec) { rec.term.dispose(); rec.el.remove(); state.panes.delete(id); }
    if (!keepInRoster) state.agents.delete(id);
    renderRoster();
    refitAll();
  }

  async function refreshList() {
    const r = await rpc({ cmd: 'list' });
    if (!r.ok) return;
    state.agents.clear();
    for (const a of r.agents) state.agents.set(a.id, a);
    renderRoster();
  }

  // spawn: bare word = preset name, otherwise argv split on spaces
  async function spawnCmd(argvOrPreset) {
    const s = (argvOrPreset || '').trim();
    if (!s) return { ok: false, err: 'empty' };
    const body = /\s/.test(s)
      ? { cmd: 'spawn', argv: s.split(/\s+/) }
      : s.startsWith('@')
        ? { cmd: 'spawn', profile: s.slice(1), fallback: s.slice(1) }
        : { cmd: 'spawn', preset: s };
    const r = await rpc(body);
    if (r.ok) await refreshList();
    return r;
  }
  async function spawnUi(argvOrPreset) {
    const r = await spawnCmd(argvOrPreset);
    if (r && r.ok) await openPane(r.id);
    else railShow('spawn gagal: ' + (r.err || '?'), 'err');
    return r;
  }
  window.spawnUi = spawnUi; // dev helper
  // wire command bar
  $('bar').addEventListener('submit', (e) => { e.preventDefault(); spawnUi($('cmd').value); $('cmd').value = ''; });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'W') { killFocused(); }
    if (e.ctrlKey && e.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault(); splitFocused(e.key);
    }
    if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); cycleFocus(); }
  });
  async function killFocused() {
    if (state.focus == null) return;
    await rpc({ cmd: 'kill', id: String(state.focus) });
  }
  // v1 splits = open a new pane of the same preset next to focus. No tiling algebra.
  function splitFocused(_dir) {
    const cur = state.agents.get(state.focus);
    const argv_or = cur && cur.argv.length ? cur.argv[0] : 'bash';
    spawnUi(argv_or);
  }

  // ===== preset chips (sidebar + cmdbar) =====
  const presets = ['hermes', 'omp', 'claude', 'codex', 'bash'];
  for (const p of presets) {
    // sidebar preset chips
    const rc = document.createElement('div');
    rc.className = 'row preset-row';
    rc.innerHTML = `<span class="pchip">+</span><span class="rname">@${esc(p)}</span>`;
    rc.onclick = () => spawnUi(p);
    $('roster-presets').appendChild(rc);
    // cmdbar chips
    const c = document.createElement('div');
    c.className = 'chip';
    c.textContent = p;
    c.onclick = () => spawnUi(p);
    $('chips').appendChild(c);
  }

  // ===== auto-learn strip =====
  function showSuggest(id, code) {
    const el = $('suggest');
    if (!el) return;
    const a = state.agents.get(id);
    el.innerHTML = '';
    el.appendChild(Object.assign(document.createElement('span'), { className: 's-tag', textContent: 'auto-learn' }));
    const note = document.createElement('span');
    note.textContent = `agent ${a ? a.name : '#' + id} exited (code ${code}) —`;
    el.appendChild(note);
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.onclick = fn;
      el.appendChild(b);
    };
    mk('save last output as lesson', async () => {
      const r = await rpc({ cmd: 'read', id: String(id), tail: 4000 });
      if (r.ok) {
        const key = a ? a.name.replace(/[^\w-]/g, '_') : String(id);
        await rpc({ cmd: 'lessons', key, text: r.chunk.trim().slice(-4000) || '(kosong)' });
        note.textContent = 'lesson disimpan.';
      }
    });
    if (a) mk('respawn ' + a.name, async () => {
      const r = await spawnCmd(a.argv.join(' '));
      if (r.ok) { hideSuggest(); await openPane(r.id); }
    });
    mk('dismiss', hideSuggest);
    el.hidden = false;
  }
  function hideSuggest() { const el = $('suggest'); if (el) el.hidden = true; }

  // ===== live updates: one global watch feed drives roster + panes =====
  evtHandler = (evt) => {
    if (evt.evt === 'out') {
      const rec = state.panes.get(evt.id);
      if (rec) rec.term.write(evt.chunk);
      if (evt.id === state.focus) markRail(evt.id, evt.chunk);
      return;
    }
    if (evt.evt === 'exit') {
      const a = state.agents.get(evt.id);
      if (a) { a.alive = false; a.exit_code = evt.code; }
      const rec = state.panes.get(evt.id);
      if (rec) { rec.el.classList.add('dead'); rec.el.querySelector('.gdead').textContent = `agent ${evt.name ?? ''} exited (code ${evt.code})`; }
      renderRoster();
      showSuggest(evt.id, evt.code);
      return;
    }
    if (evt.evt === 'spawned') { refreshList().then(() => openPane(evt.id)); return; }
  };
  const _lastRail = new Map();
  function markRail(id, chunk) {
    const t = (chunk || '').replace(/\s+/g, ' ').trim().slice(-160);
    if (!t) return;
    railShow(`#${id} ▸ ${t.slice(-140)}`);
  }

  // Rust pump already subscribed the watch conn to the global feed
  await refreshList();
  const anyAlive = [...state.agents.values()].some((a) => a.alive);
  harnessEl.hidden = true; appEl.hidden = false;
  renderRoster();
  // auto-open panes for existing agents (UI restart mid-flight)
  for (const id of [...state.agents.keys()].sort((a, b) => a - b).slice(0, 4)) await openPane(id);

  // handoff rail card (right column): shows last send→wait→read flow summary
  const railCard = $('handrail-card'), hcFlow = $('hc-flow');
  function showFlow(srcId, dstId, msg, status) {
    const src = state.agents.get(srcId), dst = state.agents.get(dstId);
    railCard.classList.remove('hidden');
    hcFlow.innerHTML =
      `<span class="flow-from">#${srcId} ${esc(src ? src.name : '')} → #${dstId} ${esc(dst ? dst.name : '')}</span>` +
      `<span class="flow-msg">${esc(msg.slice(0, 220))}</span>` +
      `<span class="flow-status">${esc(status)}</span>`;
  }
  $('hc-copy').onclick = async () => {
    const dst = railCard.dataset.dst;
    if (!dst) return;
    const rr = await rpc({ cmd: 'read', id: dst, tail: 8192 });
    const txt = (rr.ok && rr.chunk) ? rr.chunk.trimEnd().split('\n').pop() : '(no output)';
    try { await navigator.clipboard.writeText(txt); $('hc-copy').textContent = 'COPIED ✓'; }
    catch { $('hc-copy').textContent = 'SEE PANE'; }
    setTimeout(() => { $('hc-copy').textContent = 'COPY OUTPUT'; }, 1500);
  };

  // ===== handoff dialog =====
  let hoSrc = null, hoBusy = false;
  function openHandoff(srcId) {
    hoSrc = srcId;
    const sel = $('ho-target');
    const st = $('ho-status');
    st.textContent = '';
    sel.innerHTML = '';
    const targets = [...state.agents.values()].filter((a) => a.id !== srcId && a.alive);
    for (const t of targets) {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = `#${t.id} ${t.name}`;
      sel.appendChild(o);
    }
    if (!targets.length) { st.textContent = 'no other live agent to send to'; }
    $('ho-msg').value = '';
    $('handoff').classList.remove('hidden');
    if (targets.length) $('ho-msg').focus();
  }
  function closeHandoff() { $('handoff').classList.add('hidden'); $('ho-status').textContent = ''; }
  async function sendHandoff() {
    if (hoBusy) return;
    const dst = Number($('ho-target').value);
    const msg = $('ho-msg').value;
    if (!dst || !msg.trim()) return;
    hoBusy = true;
    const st = $('ho-status');
    st.textContent = 'sending…';
    $('ho-send').disabled = true;
    let ok = false;
    try {
      const r = await rpc({ cmd: 'send', id: String(dst), text: msg, enter: true });
    st.textContent = 'sent — waiting for idle…';
    showFlow(hoSrc, dst, msg, 'waiting idle…');
    railCard.dataset.dst = String(dst);
    const w = await rpc({ cmd: 'wait', id: String(dst), idle_ms: 4000 });
    if (!w.ok) { showFlow(hoSrc, dst, msg, 'wait failed: ' + (w.err || '?')); throw new Error(w.err || 'wait failed'); }
    ok = true;
    st.textContent = 'done — idled';
    showFlow(hoSrc, dst, msg, 'idle ✓ — output ready');
    $('hc-copy').hidden = false;
    } catch (ex) { st.textContent = 'error: ' + String(ex.message || ex); }
    const btn = $('ho-send');
    btn.disabled = false; hoBusy = false;
    if (ok) {
      btn.textContent = 'copy last output';
      btn.onclick = async () => {
        const rr = await rpc({ cmd: 'read', id: String(dst), tail: 8192 });
        const txt = (rr.ok && rr.chunk) ? rr.chunk.trimEnd().split('\n').pop() : '(no output)';
        st.textContent = '> ' + txt;
        try { await navigator.clipboard.writeText(txt); st.textContent += ' — copied'; }
        catch { st.textContent += ' — clipboard blocked; output shown above'; }
      };
    }
  }
  $('ho-cancel').onclick = closeHandoff;
  $('ho-send').onclick = sendHandoff;
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      if ($('switcher').classList.contains('hidden')) swOpen(); else swClose();
      return;
    }
    if (e.key === 'Escape' && !$('switcher').classList.contains('hidden')) { swClose(); return; }
    if (!$('handoff').classList.contains('hidden')) {
      if (e.key === 'Escape') closeHandoff();
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); sendHandoff(); }
    }
  });

  // ===== quick switcher (⌘O / Ctrl+O) =====
  const swEl = $('switcher'), swInput = $('sw-input'), swList = $('sw-list');
  let swRows = [], swSel = 0;
  function swBuild(filter) {
    swList.innerHTML = '';
    const f = (filter || '').toLowerCase();
    const cwds = [...new Set([...state.agents.values()].map((a) => a.cwd || '?'))]
      .sort((x, y) => (x.split('/').length - y.split('/').length) || x.localeCompare(y));
    swRows = [];
    for (const cwd of cwds) {
      const list = [...state.agents.values()].filter((a) => (a.cwd || '?') === cwd);
      const live = list.filter((a) => a.alive).length;
      swRows.push({ kind: 'ws', id: cwd, label: base(cwd), sub: cwd, badge: `${live}/${list.length} live` });
    }
    for (const p of presets) swRows.push({ kind: 'preset', id: p, label: '@' + p, sub: 'preset', badge: '' });
    swRows = swRows.filter((r) => (r.label + ' ' + r.sub).toLowerCase().includes(f));
    swSel = Math.min(swSel, Math.max(0, swRows.length - 1));
    swRows.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'sw-row' + (i === swSel ? ' sel' : '');
      d.dataset.kind = r.kind; d.dataset.id = r.id;
      d.innerHTML = `<span class="sw-kind">${r.kind === 'ws' ? 'DIR' : 'PRESET'}</span>` +
        `<span class="sw-label">${esc(r.label)}</span>` +
        (r.sub ? `<span class="ws-path">${esc(r.sub)}</span>` : '') +
        (r.badge ? `<span class="ws-badge">${esc(r.badge)}</span>` : '');
      d.onclick = () => swAct(r);
      swList.appendChild(d);
    });
  }
  function swAct(r) {
    swClose();
    if (!r) return;
    if (r.kind === 'ws') {
      const a = [...state.agents.values()].filter((x) => (x.cwd || '?') === r.id && x.alive).sort((x, y) => x.id - y.id)[0];
      if (a) focusPane(a.id); else refreshList();
    } else spawnUi(r.id);
  }
  function swOpen() {
    swEl.classList.remove('hidden');
    swInput.value = ''; swSel = 0; swBuild('');
    swInput.focus();
  }
  function swClose() { swEl.classList.add('hidden'); }
  $('sw-open').onclick = swOpen;
  swInput.oninput = () => { swSel = 0; swBuild(swInput.value); };
  swInput.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); swSel = Math.min(swSel + 1, swRows.length - 1); swBuild(swInput.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); swSel = Math.max(swSel - 1, 0); swBuild(swInput.value); }
    else if (e.key === 'Enter') { e.preventDefault(); swAct(swRows[swSel]); }
  };
  // ===== empty state =====
  const esForm = $('es-form');
  if (esForm) esForm.addEventListener('submit', (e) => {
    e.preventDefault();
    spawnUi($('es-input').value); $('es-input').value = '';
    hideSuggest();
  });
  for (const b of document.querySelectorAll('.es-chips button[data-p]')) {
    b.onclick = () => launchHarness([{ preset: b.dataset.p, task: '' }]);
  }
  window.__sentra = { killFocused, spawnUi, focusPane, state, sendHandoff, openHandoff };
}

main().catch((e) => {
  document.body.innerHTML = `<div class="boot-error"><h1>Sentra can't reach the daemon</h1><p>start it with <code>sentra serve</code>, then reload</p><code>${String(e)}</code></div>`;
});
