import xg from './vendor/xterm-esm.js';
const Terminal = xg.Terminal;
const { FitAddon } = await import('./vendor/addon-fit-esm.js');

const enc = new TextEncoder(), dec = new TextDecoder();

let seq = 1;
const pending = new Map();      // reqId -> {resolve, reject}
let evtHandler = null;          // fn(evt) for pushed events
let sock = null;                // tauri channel id

async function rpc(cmd_obj) {
  const id = seq++;
  const line = JSON.stringify({ ...cmd_obj, _req: id });
  const p = new Promise((res, rej) => pending.set(id, { res, rej }));
  const { invoke } = window.__TAURI__.core;
  await invoke("send_line", { line });
  return p;
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

async function main() {
  if (!window.__TAURI__) throw new Error("Tauri global missing — is the daemon running? start with: `sentra serve`");
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  await listen("sentra-line", (e) => onLine(e.payload));
  sock = await invoke("connect");

  // --- state ---
  const state = { agents: new Map(), focus: null, panes: new Map() };
  // agents: id -> {id,name,argv,alive,exit_code}
  // panes: id -> {el, term, fit}

  // --- roster ---
  const rosterRows = document.getElementById('roster-rows');
  function renderRoster() {
    rosterRows.innerHTML = '';
    for (const a of [...state.agents.values()].sort((x, y) => x.id - y.id)) {
      const row = document.createElement('div');
      row.className = 'row' + (state.focus === a.id ? ' active' : '');
      row.innerHTML = `<span class="dot ${a.alive ? 'live' : 'dead'}"></span>` +
        `<span class="rname">${esc(a.name)}</span>` +
        `<span class="argv">${esc(a.argv.join(' '))}</span>` +
        `<span class="rid">#${a.id}</span>`;
      row.onclick = () => focusPane(a.id);
      row.oncontextmenu = (e) => { e.preventDefault(); openHandoff(a.id); };
      row.onauxclick = (e) => { if (e.button === 2) { e.preventDefault(); openHandoff(a.id); } };
      rosterRows.appendChild(row);
    }
    if (!state.agents.size) rosterRows.innerHTML = '<div class="row" style="color:var(--muted)">no agents — spawn one below</div>';
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // --- panes ---
  const panesEl = document.getElementById('panes');
  async function openPane(id) {
    if (state.panes.has(id)) return state.panes.get(id);
    const pane = document.createElement('div');
    pane.className = 'pane';
    pane.innerHTML = `<div class="ptitle"></div><div class="pdead"></div><div class="term"></div>`;
    panesEl.appendChild(pane);
    const term = new Terminal({ convertEol: false, cursorBlink: true, fontFamily: '"JetBrains Mono","Fira Code",monospace', fontSize: 12, theme: { background: '#101216', foreground: '#d6dde6', cursor: '#7aa2f7', selectionBackground: '#2a3447' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(pane.querySelector('.term'));
    const rec = { el: pane, term, fit, backfilled: false };
    state.panes.set(id, rec);
    // backfill from daemon ring
    const r = await rpc({ cmd: 'read', id: String(id), tail: 65536 });
    if (r.ok && r.chunk) term.write(r.chunk);
    rec.backfilled = true;
    term.onData((d) => rpc({ cmd: 'send', id: String(id), text: d, enter: false }));
    term.onResize(({ cols, rows }) => rpc({ cmd: 'resize', id: String(id), cols, rows }));
    pane.querySelector('.ptitle').onclick = () => focusPane(id);
    term.focus();
    refitAll();
    focusPane(id);
    return rec;
  }

  function closePane(id, keepInRoster) {
    const rec = state.panes.get(id);
    if (rec) { rec.term.dispose(); rec.el.remove(); state.panes.delete(id); }
    if (!keepInRoster) state.agents.delete(id);
    renderRoster();
    refitAll();
}

  function refitAll() {
    const n = state.panes.size;
    panesEl.className = n > 4 ? 'cols3' : n > 1 ? 'cols2' : 'cols1';
    for (const rec of state.panes.values()) { try { rec.fit.fit(); } catch {} }
    // refit again after layout settles
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

  // spawn via command bar → daemon returns id → openPane(id)
  // spawn: bare word = preset name, otherwise argv split on spaces
  async function spawnCmd(argvOrPreset) {
    const s = (argvOrPreset || '').trim();
    if (!s) return { ok: false, err: 'empty' };
    const body = /\s/.test(s)
      ? { cmd: 'spawn', argv: s.split(/\s+/), enter: false }
      : { cmd: 'spawn', preset: s };
    const r = await rpc(body);
    if (r.ok) await refreshList();
    return r;
  }

  async function spawnUi(argvOrPreset) {
    const r = await spawnCmd(argvOrPreset);
    if (r && r.ok) await openPane(r.id);
    return r;
  }
  window.spawnUi = spawnUi; // dev helper
  // wire command bar Enter
  document.getElementById('cmd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { spawnUi(e.target.value); }
  });
  // xterm keybindings
  panesEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && e.ctrlKey) { e.preventDefault(); cycleFocus(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'W') { killFocused(); }
    if (e.ctrlKey && e.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault(); splitFocused(e.key);
    }
  });

  async function killFocused() {
    if (state.focus == null) return;
    await rpc({ cmd: 'kill', id: String(state.focus) });
    // pane marked dead by exit event; keep pane open with red strip (S7)
  }

  // v1 splits = open a new pane of the same preset next to focus. No tiling algebra.
  function splitFocused(_dir) {
    const cur = state.agents.get(state.focus);
    const argv_or = cur && cur.argv.length ? cur.argv[0] : 'bash';
    spawnUi(argv_or);
  }

  // --- chips ---
  const chipsEl = document.getElementById('chips');
  state.presets = ['hermes', 'omp', 'claude', 'codex', 'bash'];
  for (const p of state.presets) {
    const c = document.createElement('div');
    c.className = 'chip';
    c.textContent = p;
    c.onclick = () => spawnUi(p);
    chipsEl.appendChild(c);
  }

  // --- live updates: one global watch feed drives roster + panes ---
  evtHandler = async (evt) => {
    if (evt.evt === 'out') {
      const rec = state.panes.get(evt.id);
      if (rec) rec.term.write(evt.chunk);
      markOutput(evt.id);
      return;
    }
    if (evt.evt === 'exit') {
      const a = state.agents.get(evt.id);
      if (a) { a.alive = false; a.exit_code = evt.code; }
      const rec = state.panes.get(evt.id);
      if (rec) { rec.el.classList.add('dead'); rec.el.querySelector('.pdead').textContent = `agent ${evt.name ?? ''} exited (code ${evt.code})`; }
      renderRoster();
      return;
    }
    if (evt.evt === 'spawned') { await refreshList(); await openPane(evt.id); return; }
  };
  window.__sentra = { killFocused, spawnUi, focusPane, state, hoMsg: (t) => { document.getElementById('ho-msg').value = t; }, hoTarget: (id) => { document.getElementById('ho-target').value = String(id); } };

  // Rust pump already subscribed the watch conn to the global feed
  await refreshList();
  // auto-open panes for existing agents (UI restart mid-flight)
  for (const id of [...state.agents.keys()].sort((a, b) => a - b).slice(0, 12)) await openPane(id);

  // --- handoff dialog ---
  let hoSrc = null, hoBusy = false;
  function openHandoff(srcId) {
    hoSrc = srcId;
    const sel = document.getElementById('ho-target');
    const st = document.getElementById('ho-status');
    st.textContent = '';
    sel.innerHTML = '';
    const targets = [...state.agents.values()].filter((a) => a.id !== srcId && a.alive);
    for (const t of targets) {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = `#${t.id} ${t.name}`;
      sel.appendChild(o);
    }
    if (!targets.length) { st.textContent = 'no other live agent to send to'; return; }
    document.getElementById('ho-msg').value = 'echo HANDOFF_PROOF_$((9*9))';
    document.getElementById('handoff').classList.remove('hidden');
    document.getElementById('ho-msg').focus();
  }
  function closeHandoff() { document.getElementById('handoff').classList.add('hidden'); document.getElementById('ho-status').textContent = ''; }
  async function sendHandoff() {
    if (hoBusy) return;
    const dst = Number(document.getElementById('ho-target').value);
    const msg = document.getElementById('ho-msg').value;
    if (!dst || !msg.trim()) return;
    hoBusy = true;
    const st = document.getElementById('ho-status');
    st.textContent = 'sending…';
    document.getElementById('ho-send').disabled = true;
    let ok = false;
    try {
      const r = await rpc({ cmd: 'send', id: String(dst), text: msg, enter: true });
      if (!r.ok) throw new Error(r.err || 'send failed');
      st.textContent = 'sent — waiting for idle…';
      const w = await rpc({ cmd: 'wait', id: String(dst), idle_ms: 4000 });
      if (!w.ok) throw new Error(w.err || 'wait failed');
      ok = true;
      st.textContent = 'done — idled';
    } catch (ex) { st.textContent = 'error: ' + String(ex.message || ex); }
    const btn = document.getElementById('ho-send');
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
  document.getElementById('ho-cancel').onclick = closeHandoff;
  document.getElementById('ho-send').onclick = sendHandoff;
  window.addEventListener('keydown', (e) => {
    if (!document.getElementById('handoff').classList.contains('hidden')) {
      if (e.key === 'Escape') closeHandoff();
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); sendHandoff(); }
    }
  });
  window.__sentra.sendHandoff = sendHandoff;
}

main().catch((e) => {
  document.body.innerHTML = `<div style="padding:24px;color:#f7768e;font-family:monospace">sentra-ui: ${String(e)}<br>is the daemon running? start with: <code>sentra serve</code></div>`;
});
