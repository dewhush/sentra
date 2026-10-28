import xg from './vendor/xterm-esm.js';
const Terminal = xg.Terminal;
const { FitAddon } = await import('./vendor/addon-fit-esm.js');
// CanvasAddon's dispose() throws against this xterm build (onShowLinkUnderline),
// which aborted pane teardown and left dead panes stuck on screen. DOM renderer
// is slower but correct, so don't load it.

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

const ICON = { claude: '/icons/claude.svg', omp: '/icons/omp.svg', codex: '/icons/codex.svg', hermes: '/icons/hermes.svg', bash: '/icons/bash.svg', openai: '/icons/openai.svg' };
function iconFor(name) {
  const s = String(name || '').toLowerCase();
  for (const [k, v] of Object.entries(ICON)) if (s.includes(k)) return v;
  return '/icons/bash.svg';
}
const PICON = (name) => `<img class="picon" src="${iconFor(name)}" alt="" data-preset="${esc(name)}" onerror="this.remove()">`;
async function main() {
  if (USE_TAURI) await window.__TAURI__.core.invoke('connect');
  else { const es = new EventSource('/events'); es.onmessage = (e) => onLine(e.data); }

  // --- state ---
  const state = { agents: new Map(), focus: null, panes: new Map(), lastOut: new Map(), cwd: localStorage.getItem('sentra-cwd') || '', brief: localStorage.getItem('sentra-brief') || '', contextNote: '', home: '', daemonOnline: false, daemonRssKb: null, profiles: {}, presetProbe: [] };
  // Built-in fallback list; replaced by the daemon's live probe at boot so a
  // custom presets.json is not silently ignored by chips/settings.
  let presets = ['hermes', 'omp', 'claude', 'codex', 'bash'];
  // user-initiated kills shouldn't surface as red "[ERROR] exited" rails
  const intentionalKills = new Map();
  const markIntentional = (id) => intentionalKills.set(id, Date.now() + 10000);
  function isIntentional(id) {
    const t = intentionalKills.get(id);
    if (!t) return false;
    if (Date.now() > t) { intentionalKills.delete(id); return false; }
    return true;
  }
  // agents: id -> {id,name,argv,alive,exit_code,role} · panes: id -> {el, term, fit}
  const $ = (id) => document.getElementById(id);
  const harnessEl = $('harness'), appEl = $('app');
  // A persisted brief must survive a reload visibly, not just in localStorage:
  // prefill the launcher field so the next launch does not overwrite it with ''.
  if (state.brief) {
    const bi = $('ctx-brief');
    if (bi) bi.value = state.brief;
  }

  // ===== AUDIT LAYER: one marker per design screen 00-10 =====
  // Every screen transition logs `[SENTRA-AUDIT] S<code> ...` and records which
  // required nodes are present, so an audit can prove what the frontend shows.
  const SCREENS = {
    '00': 'first-run setup',
    '01': 'empty launcher (hero)',
    '02': 'context set + spawn 1',
    '03': '1-agent workspace',
    '04': '2-agent workspace',
    '05': '3-agent workspace',
    '05b': 'drag & drop overlay',
    '06': '4+ agent grid',
    '07': 'settings',
    '08': 'sidebar dispatch',
    '09': 'quick switcher',
    '10': 'empty folder',
  };
  const REQUIRED = {
    '00': ['#firstrun', '.h-topbar', '.fr-kicker', '#fr-rows', '#fr-cwd', '#fr-rescan', '#fr-skip', '#fr-go', '#fr-daemon'],
    '01': ['#harness', '.h-brand h1', '#hform', '#hinput', '.h-hint', '#hchips', '.ctx-brief-card', '#ctx-drop', '#hstatus'],
    '02': ['#topbar', '#context-strip', '#roster', '#grid', '#grid.c1', '.gpane.pending', '#cmdbar', '#bar', '#cmd', '#spbtn'],
    '03': ['#topbar', '#context-strip', '#roster', '#grid', '#grid.c1', '.gpane', '#cmdbar', '#bar', '#cmd', '#spbtn'],
    '04': ['#topbar', '#context-strip', '#roster', '#grid', '#grid.c2', '.gpane', '#cmdbar', '#bar', '#cmd', '#spbtn'],
    '05': ['#topbar', '#context-strip', '#roster', '#grid', '#grid.c3', '.gpane', '#cmdbar', '#bar', '#cmd', '#spbtn'],
    '06': ['#topbar', '#context-strip', '#roster', '#grid', '#grid.c4, #grid.c6, #grid.c8', '.gpane', '#cmdbar', '#bar', '#cmd', '#spbtn'],
    '05b': ['#drop-overlay', '.drop-box', '#drop-target-agent', '.drop-hint'],
    '07': ['#settings', '.mo-box', '.mo-head', '.mo-tabs', '.mo-body', '.mo-foot', '#set-done'],
    '09': ['#switcher', '.sw-box', '#sw-input', '#sw-list'],
    '10': ['#empty-state', '.es-card', '.es-cta', '.es-presets', '#es-foot'],
  };
  const AUDIT = window.__sentraAudit = {
    current: null, history: [], checks: {}, startedAt: new Date().toISOString(),
  };
  const auditOn = new URLSearchParams(location.search).has('audit') || localStorage.getItem('sentra-audit') === '1';
  const badge = $('audit-badge');
  function visible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  }
  function checkScreen(code) {
    const req = REQUIRED[code] || [];
    // A selector is satisfied by ANY visible match. The document contains two
    // `.es-cta` buttons (first-run and empty-folder); the first one is hidden,
    // so checking only querySelector made S10 report a visible button as
    // invisible. Presence alone is the same trap.
    const has = (sel) => !!document.querySelector(sel);
    const shown = (sel) => [...document.querySelectorAll(sel)].some(visible);
    const missing = req.filter((sel) => !has(sel));
    const invisible = req.filter((sel) => has(sel) && !shown(sel));
    // Invariants, not just node presence. A screen can have every required
    // element and still be lying about the workspace (wrong pane count, two
    // focused panes, a grid that overflows horizontally).
    const violations = [];
    const gridScreens = ['03', '04', '05', '06'];
    if (gridScreens.includes(code)) {
      const n = state.panes.size;
      const want = { '03': 1, '04': 2, '05': 3 }[code];
      if (want != null && n !== want) violations.push(`panes ${n}≠${want}`);
      if (code === '06' && n < 4) violations.push(`panes ${n}<4`);
      if (n && document.querySelectorAll('.gpane').length !== n) violations.push('DOM panes≠state');
      if (n && document.querySelectorAll('.gpane.focused').length !== 1) violations.push('focused≠1');
      const cls = code === '06' ? (n <= 4 ? 'c4' : n <= 6 ? 'c6' : 'c8') : { '03': 'c1', '04': 'c2', '05': 'c3' }[code];
      if (cls && !$('grid').classList.contains(cls)) violations.push(`grid !${cls}`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) violations.push('h-overflow');
    // A screen with no required nodes is unverified, not passing. "0/0 ✓" is
    // the audit lying to itself.
    return { code, required: req.length, present: req.length - missing.length, missing, invisible, violations, ok: req.length > 0 && !missing.length && !invisible.length && !violations.length };
  }
  function setScreen(code, detail) {
    if (!SCREENS[code]) return AUDIT.checks[code];
    const changed = AUDIT.current !== code;
    AUDIT.current = code;
    const r = checkScreen(code);
    AUDIT.checks[code] = r;
    document.body.setAttribute('data-screen', code);
    if (changed) {
      AUDIT.history.push({ code, at: new Date().toISOString(), detail: detail || '', ok: r.ok });
      if (AUDIT.history.length > 200) AUDIT.history.shift();
      console.info(`[SENTRA-AUDIT] S${code} ${SCREENS[code]}${detail ? ' · ' + detail : ''} · nodes ${r.present}/${r.required}${r.missing.length ? ' · MISSING ' + r.missing.join(',') : ''}${r.invisible.length ? ' · HIDDEN ' + r.invisible.join(',') : ''}`);
    }
    if (auditOn && badge) {
      badge.classList.remove('hidden');
      if (!r.required) {
        badge.textContent = `S${code} ${SCREENS[code]} · unverified`;
        badge.style.borderColor = 'var(--warn)';
      } else {
        const bad = r.violations.length ? ' ✕ ' + r.violations[0] : r.missing.length ? ' ✕ ' + r.missing[0] : r.invisible.length ? ' ✕ hidden ' + r.invisible[0] : ' ✓';
        badge.textContent = `S${code} ${SCREENS[code]} · ${r.present}/${r.required}${bad}`;
        badge.style.borderColor = r.ok ? 'var(--good)' : 'var(--err)';
      }
    }
    return r;
  }
  // source of truth is the DOM: whatever is actually visible wins
  let booting = true;
  function resolveScreen(detail) {
    if (booting) return { code: AUDIT.current, booting: true };
    if (visible($('settings'))) return setScreen('07', detail);
    if (visible($('drop-overlay'))) return setScreen('05b', detail);
    if (visible($('switcher'))) return setScreen('09', detail);
    if (visible($('firstrun'))) return setScreen('00', detail);
    if (visible($('harness'))) return setScreen('01', detail);
    if (visible($('app'))) {
      // spawning the first agent: stay on S02 instead of flashing the empty state
      if (spawnPending > 0 && state.panes.size === 0) return setScreen('02', detail || 'spawning…');
      if (visible($('empty-state')) || state.panes.size === 0) return setScreen('10', detail);
      const n = state.panes.size;
      return setScreen(n === 1 ? '03' : n === 2 ? '04' : n === 3 ? '05' : '06', detail);
    }
    return setScreen('01', detail || 'fallback: nothing visible');
  }
  function auditDump() {
    return { current: AUDIT.current, history: AUDIT.history.slice(-30), checks: AUDIT.checks, screens: SCREENS };
  }
  window.__sentraAuditDump = auditDump;
  window.__sentraScreen = (code, detail) => setScreen(code, detail);

  // ===== P0 #1: focus trap + aria-modal for every overlay =====
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const overlayStack = [];
  let lastFocus = null;
  function dialogBox(id) {
    const el = $(id);
    return (el && (el.querySelector('[role="dialog"]') || el)) || null;
  }
  function openOverlay(id) {
    const el = $(id);
    if (!el) return;
    lastFocus = document.activeElement;
    el.classList.remove('hidden');
    if (!overlayStack.includes(id)) overlayStack.push(id);
    const box = dialogBox(id);
    const first = box && box.querySelector(FOCUSABLE);
    if (first) first.focus();
    resolveScreen();
  }
  function closeOverlay(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add('hidden');
    const i = overlayStack.lastIndexOf(id);
    if (i >= 0) overlayStack.splice(i, 1);
    if (lastFocus && typeof lastFocus.focus === 'function') { try { lastFocus.focus(); } catch {} }
    resolveScreen();
  }
  function topOverlay() { return overlayStack[overlayStack.length - 1] || null; }
  function trapTab(e) {
    if (e.key !== 'Tab') return false;
    const id = topOverlay();
    if (!id) return false;
    const box = dialogBox(id);
    if (!box) return false;
    const nodes = [...box.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!nodes.length) return false;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); return true; }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); return true; }
    return false;
  }
  // ===== P0 #5: focus the right field after a screen switch =====
  function focusForScreen(code) {
    const target = code === '00' ? $('fr-cwd')
      : code === '01' ? $('hinput')
      : code === '09' ? $('sw-input')
      : code === '07' ? document.querySelector('.mo-tab.active')
      : code === '05b' ? $('drop-target-agent')
      : null;
    if (target && typeof target.focus === 'function') target.focus();
  }

  document.fonts.ready.then(() => { for (const p of state.panes.values()) p.fit && p.fit.fit(); });

  // ===== handrail (activity rail under the grid) =====
  const rail = $('handrail'), railText = $('hr-text');
  const stripAnsi = (s) => String(s || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/[\x00-\x08\x0b-\x1f]/g, '');
  let railTimer = null;
  function railShow(text, cls) {
    if (!rail || !railText) return;
    rail.classList.remove('hidden');
    rail.className = cls || '';
    const full = stripAnsi(text);
    railText.textContent = full.slice(0, 300);
    railText.title = full;
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
  // ===== P0 #2: single-flight spawn guard + timeout =====
  let spawnBusy = false;
  let spawnPending = 0;
  async function guardSpawn(btn, fn) {
    if (spawnBusy) return { ok: false, err: 'spawn already in progress' };
    spawnBusy = true;
    spawnPending++;
    const label = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.dataset.busy = '1'; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Starting…'; }
    let timer = null;
    try {
      return await Promise.race([
        fn(),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('spawn timeout after 8s')), 8000); }),
      ]);
    } catch (e) {
      const msg = String(e && e.message || e);
      clearPendingPane();
      railShow('spawn failed: ' + msg, 'err');
      heroFail('spawn failed: ' + msg);
      return { ok: false, err: msg };
    } finally {
      clearTimeout(timer);
      spawnBusy = false;
      spawnPending = Math.max(0, spawnPending - 1);
      if (btn) { delete btn.dataset.busy; btn.removeAttribute('aria-busy'); btn.disabled = false; btn.textContent = label || 'Spawn Agent ↵'; }
    }
  }

  async function launchHarness(specs) {
    if (!specs.length) return;
    // The launcher's brief is real user input; keep it for the context strip
    // (design 02/03) instead of discarding it with the launcher.
    const briefEl = $('ctx-brief');
    const brief = briefEl ? briefEl.value.trim() : '';
    state.brief = brief;
    if (brief) localStorage.setItem('sentra-brief', brief);
    else localStorage.removeItem('sentra-brief');
    // Full context (repo + brief + files), injected without Enter; only an
    // explicit `@preset task` adds the submitting newline.
    state.contextNote = heroContext();
    harnessEl.classList.add('hidden');
    appEl.classList.remove('hidden');
    const ids = [];
    for (const sp of specs) {
      // Every launcher/hero handle goes through the profile path with the
      // name as fallback: the daemon knows the profile table, so a persona is
      // not lost when the UI's async `profiles` cache is still empty.
      const r = await spawnCmd('@' + sp.preset);
      if (r.ok) {
        await openPane(r.id, sp.preset);
        ids.push(r.id);
        if (sp.task) await rpc({ cmd: 'send', id: String(r.id), text: dispatchText(sp.task, sp.preset), enter: true });
        else await injectBrief(r.id);
      } else {
        clearPendingPane();
        railShow(`spawn ${sp.preset} failed: ${r.err || '?'}`, 'err');
      }
    }
    if (ids.length) focusPane(ids[0]);
    refitAll();
    resolveScreen('launchHarness: ' + specs.map((s) => s.preset).join(','));
    focusForScreen('03');
  }
  const lsetBtn = document.querySelector('.launcher-setbtn');
  if (lsetBtn) lsetBtn.onclick = () => openSettings();

  // ===== P0 #4 + #7: attach dropped/picked files to the launcher context =====
  const ACCEPT_EXT = /\.(pdf|txt|md|markdown|json)$/i;
  const MAX_FILE = 10 * 1024 * 1024;
  state.contextFiles = [];
  function classifyFile(name, size) {
    if (!ACCEPT_EXT.test(name)) return { ok: false, why: 'unsupported type' };
    if (size > MAX_FILE) return { ok: false, why: (size / 1048576).toFixed(1) + 'MB — over 10MB' };
    return { ok: true };
  }
  function rejectFiles(rejected) {
    if (!rejected.length) return;
    const msg = rejected.map((r) => `${r.name} · ${r.why}`).join(', ');
    heroFail(`${rejected.length} file(s) rejected: ${msg}`);
    railShow(`${rejected.length} file(s) rejected — ${msg}`, 'err');
  }
  function renderCtxFiles() {
    if (!ctxDrop) return;
    const label = ctxDrop.querySelector('.ctx-dz-label');
    const n = state.contextFiles.length;
    if (!label) return;
    if (!n) {
      label.textContent = 'DROP FILES OR FOLDERS HERE · OR CLICK TO BROWSE';
      ctxDrop.style.borderColor = '';
      return;
    }
    label.textContent = `${n} FILE(S) ATTACHED · ` + state.contextFiles.slice(0, 3).map((f) => f.name).join(', ') + (n > 3 ? ' …' : '');
    ctxDrop.style.borderColor = 'var(--good)';
  }
  function addContextFiles(list) {
    const rejected = [];
    for (const f of list) {
      const v = classifyFile(f.name, f.size || 0);
      if (!v.ok) { rejected.push({ name: f.name, why: v.why }); continue; }
      if (!state.contextFiles.some((x) => x.path === f.path && x.name === f.name)) state.contextFiles.push(f);
    }
    rejectFiles(rejected);
    renderCtxFiles();
    return state.contextFiles.length;
  }
  // dataTransfer.items + webkitGetAsEntry so dropped directories are walked
  async function entriesFromDataTransfer(dt) {
    const items = dt && dt.items ? [...dt.items] : [];
    const roots = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
    const out = [];
    if (!roots.length) {
      for (const f of [...((dt && dt.files) || [])]) out.push({ name: f.name, size: f.size, path: f.path || f.name, file: f });
      return out;
    }
    const walk = async (entry, prefix) => {
      if (entry.isFile) {
        const file = await new Promise((res) => entry.file(res, () => res(null)));
        if (file) out.push({ name: file.name, size: file.size, path: prefix + entry.name, file });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const kids = await new Promise((res) => reader.readEntries(res, () => res([])));
        for (const k of kids) await walk(k, prefix + entry.name + '/');
      }
    };
    for (const r of roots) await walk(r, '');
    return out;
  }
  const ctxDrop = $('ctx-drop');
  if (ctxDrop) {
    ctxDrop.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = '.pdf,.txt,.md,.markdown,.json';
      inp.onchange = () => addContextFiles([...inp.files || []].map((f) => ({ name: f.name, size: f.size, path: f.path || f.name, file: f })));
      inp.click();
    };
    ctxDrop.ondragover = (e) => { e.preventDefault(); ctxDrop.style.borderColor = 'var(--acc)'; };
    ctxDrop.ondragleave = () => { ctxDrop.style.borderColor = state.contextFiles.length ? 'var(--good)' : ''; };
    ctxDrop.ondrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      addContextFiles(await entriesFromDataTransfer(e.dataTransfer));
    };
  }

  function heroContext() {
    const repoVal = $('ctx-repo') ? $('ctx-repo').value.trim() : '';
    const briefVal = $('ctx-brief') ? $('ctx-brief').value.trim() : '';
    const filesVal = state.contextFiles.length ? 'Files: ' + state.contextFiles.map((f) => f.path || f.name).join(', ') : '';
    // Human-readable context, injected without Enter. The old `repo:… context:…`
    // string was sent as an executable task, so a bash agent tried to run it.
    return [repoVal && `Repo: ${repoVal}`, briefVal && `Brief: ${briefVal}`, filesVal].filter(Boolean).join(' · ');
  }
  function heroFail(msg) {
    const el = $('h-err');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }
  async function heroSpawn(raw) {
    const s = (raw || '').trim();
    heroFail('');
    if (!s) { heroFail('Type a preset or a command.'); return { ok: false, err: 'empty' }; }
    if (spawnBusy) return { ok: false, err: 'spawn already in progress' };
    const parsed = s.startsWith('@') ? parseHarness(s) : [];
    if (parsed.length) {
      return guardSpawn(document.querySelector('#hchips button'), () => {
        showPendingPane(parsed[0].preset);
        return launchHarness(parsed);
      });
    }
    return guardSpawn($('spbtn'), async () => {
      showPendingPane(s);
      const r = await spawnUi(s);
      if (!r || !r.ok) heroFail('spawn failed: ' + ((r && r.err) || '?'));
      resolveScreen('raw argv spawn');
      return r;
    });
  }
  $('hform').addEventListener('submit', (e) => {
    e.preventDefault();
    if (spawnBusy) { heroFail('Still spawning the previous agent — wait a moment.'); return; }
    heroSpawn($('hinput').value);
  });
  for (const b of document.querySelectorAll('.h-chips button[data-p]')) {
    b.onclick = () => {
      if (spawnBusy) return;
      guardSpawn(b, () => {
        showPendingPane(b.dataset.p);
        return launchHarness([{ preset: b.dataset.p }]);
      });
    };
  }
  const pendingHarness = sessionStorage.getItem('sentra-harness');
  if (pendingHarness) { sessionStorage.removeItem('sentra-harness'); launchHarness(JSON.parse(pendingHarness)); }
  // configure the settings list and Tab completion from the daemon's real
  // probe (custom presets included), not only the five bundled defaults
  (async () => {
    const r = await rpc({ cmd: 'presets' }).catch(() => null);
    if (!r || !r.ok) return;
    state.presetProbe = r.presets || [];
    const names = state.presetProbe.map((p) => p.name).filter(Boolean);
    if (names.length) presets = names;
  })();
  // profile chips (from daemon `profiles`) → spawn personas with preamble
  (async () => {
    const hp = $('hprofiles');
    const r = await rpc({ cmd: 'profiles' }).catch(() => null);
    if (!r || !r.ok || !hp) return;
    state.profiles = r.profiles || {};
    for (const [name, p] of Object.entries(r.profiles || {})) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '@' + name;
      b.title = (p.role || '') + ' · preset ' + (p.preset || '?');
      b.onclick = () => {
        if (spawnBusy) return;
        guardSpawn(b, () => {
          showPendingPane(name);
          return launchHarness([{ preset: name, task: '' }]);
        });
      };
      hp.appendChild(b);
    }
  })();

  // theme
  const rm = $('roster-rows');
  const htmlEl = document.documentElement;
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg>';
  function syncThemeIcon() {
    const b = $('thmbtn');
    if (!b) return;
    const dark = htmlEl.classList.contains('dark');
    b.innerHTML = dark ? ICON_SUN : ICON_MOON;
    b.title = dark ? 'switch to light theme' : 'switch to dark theme';
    b.setAttribute('aria-label', b.title);
  }
  function applyTheme(dark) {
    htmlEl.classList.toggle('dark', dark);
    localStorage.setItem('sentra-theme', dark ? 'dark' : 'light');
    for (const p of state.panes.values()) { try { p.term.options.theme = dark ? XTERM_DARK : XTERM_LIGHT; } catch {} }
    syncThemeIcon();
    themeNotice();
  }
  // Honesty: changing the xterm palette does not repaint a TUI that draws its
  // own background (Codex's light composer is the obvious one). Say so when a
  // live pane is on screen instead of implying the whole app changed.
  function themeNotice() {
    const livePane = [...state.panes.keys()].some((id) => {
      const a = state.agents.get(id);
      return a && a.alive;
    });
    if (livePane) railShow('theme changed: Sentra chrome + terminal palette; live TUIs keep their own colours', '');
  }
  // Boot must restore the variant (cyberpunk/sepia are not just "dark"), not
  // only the legacy light/dark flag — otherwise the theme reverts on reload.
  const savedTheme = localStorage.getItem('sentra-theme');
  const savedVariant = localStorage.getItem('sentra-theme-variant');
  if (savedVariant) applyThemeVariant(savedVariant);
  else applyTheme(savedTheme ? savedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  $('setbtn').onclick = () => { openSettings(); };

  // ===== roster: grouped by workspace cwd =====
  const collapsed = new Map(); // cwd -> bool
  const base = (p) => p.replace(/\/+$/, '').split('/').pop() || p || '?';
  const shortPath = (p) => (state.home && p.startsWith(state.home) ? '~' + p.slice(state.home.length) : p);
  function agentRow(a) {
    const row = document.createElement('div');
    row.className = 'row' + (a.pending ? ' pending' : (state.focus === a.id ? ' active' : ''));
    const stTxt = a.pending ? 'SPAWNING' : a.alive ? 'LIVE' : (a.exit_code != null ? `EXITED ${a.exit_code}` : 'EXITED');
    row.innerHTML = `<span class="dot ${a.pending ? 'spawning' : a.alive ? 'live' : 'dead'}" role="img" aria-label="${stTxt}" title="${stTxt}"></span>` +
      PICON(a.name) +
      `<span class="rname">${esc(a.name)}</span>` +
      (a.role ? `<span class="role">${esc(a.role)}</span>` : '') +
      `<span class="argv">${esc((a.argv || []).join(' '))}</span>` +
      (a.pending ? '' : `<span class="rid">#${a.id}</span>`);
    if (a.pending) return row; // not focusable until the daemon returns an id
    row.onclick = () => focusPane(a.id);
    row.oncontextmenu = (e) => { e.preventDefault(); openHandoff(a.id); };
    row.onauxclick = (e) => { if (e.button === 2) { e.preventDefault(); openHandoff(a.id); } };
    return row;
  }
  function syncEmpty() {
    const es = $('empty-state');
    if (!es) return;
    const visible = [...state.agents.values()].filter((a) => a.alive || state.panes.has(a.id)).length;
    const pending = !!gridEl.querySelector('.gpane.pending');
    es.classList.toggle('hidden', visible > 0 || pending);
    gridEl.classList.toggle('es', visible === 0 && !pending);
  }
  function renderRoster() {
    rm.innerHTML = '';
    const groups = new Map();
    for (const a of state.agents.values()) {
      if (!a.alive && !state.panes.has(a.id)) continue; // temp-bash history stays out of sidebar
      const cwd = a.cwd || '?';
      if (!groups.has(cwd)) groups.set(cwd, []);
      groups.get(cwd).push(a);
    }
    // design 02: the sidebar shows the pending row too, not an empty workspace
    // list while the first PTY is being created.
    const pendingEl = gridEl.querySelector('.gpane.pending');
    if (pendingEl) {
      const cwd = state.cwd || state.home || '?';
      if (!groups.has(cwd)) groups.set(cwd, []);
      groups.get(cwd).push({
        id: -1,
        name: pendingEl.dataset.label || 'agent',
        argv: [pendingEl.dataset.label || 'agent'],
        alive: false,
        pending: true,
        cwd,
      });
    }
    // design 10: even with zero PTYs, the sidebar names the selected folder
    // and marks it current. An empty WORKSPACE FOLDERS label is not a state.
    if (!groups.size) groups.set(state.cwd || state.home || '/', []);
    const cwds = [...groups.keys()].sort((x, y) =>
      ((x === '?' ? 1 : x.split('/').length) - (y === '?' ? 1 : y.split('/').length)) || x.localeCompare(y));
    for (const cwd of cwds) {
      const list = groups.get(cwd);
      const block = document.createElement('div');
      const isCurrent = !state.agents.size && cwd === (state.cwd || state.home);
      block.className = 'ws-block' + (isCurrent ? ' current' : '');
      const head = document.createElement('div');
      head.className = 'ws-head';
      const liveN = list.filter((a) => a.alive).length;
      const badge = list.length === 0 ? '0 agents' : `${list.length} agent${list.length === 1 ? '' : 's'} · ${liveN} live`;
      head.innerHTML = `<span class="ws-caret">${collapsed.get(cwd) ? '▸' : '▾'}</span>` +
        `<span class="ws-name">${esc(base(cwd))}</span>` +
        `<span class="ws-path" title="${esc(cwd)}">${esc(shortPath(cwd))}</span>` +
        `<span class="ws-badge">${badge}</span>`;
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
    const vis = [...state.agents.values()].filter((a) => a.alive || state.panes.has(a.id));
    syncEmpty();
    const live = vis.filter((a) => a.alive).length;
    const exited = vis.length - live;
    const foc = state.focus != null ? state.agents.get(state.focus) : null;
    const cwdShow = (foc && foc.cwd) || cwds.find((c) => c !== '?') || state.cwd || state.home || '/';
    // Same abbreviation everywhere (~/orca/sentra), so the card, strip and
    // top-bar chip cannot disagree about which folder the screen is about.
    const short = state.home && cwdShow.startsWith(state.home) ? '~' + cwdShow.slice(state.home.length) : cwdShow;
    const dUrl = state.daemonUrl || (typeof window !== 'undefined' && window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:7621');
    {
      const f = $('es-foot');
      if (f) f.textContent = `Tip: drag & drop files anywhere · Ctrl-O jumps to another folder · PROJECT: ${short}`;
      const sub = document.querySelector('.es-card .es-sub');
      if (sub) sub.textContent = `Spawn your first CLI agent or pick a preset to begin orchestrating in ${short}`;
      const cs = $('cs-text');
      if (cs) {
        // design 03: one line of real data — live count, cwd, then the brief
        // that was actually typed into each spawn. While spawning, say so:
        // "0 agents" is true but reads like nothing is happening.
        const pendingLabel = gridEl.querySelector('.gpane.pending')?.dataset.label;
        const count = pendingLabel
          ? `spawning ${pendingLabel}…`
          : `${live} agent${live === 1 ? '' : 's'}`;
        cs.textContent = `${count} · ${short}` + (state.brief ? ` · brief: ${state.brief}` : '');
      }
    }
    // Design 10 top bar: left brand · centre folder chip + PTY count · right
    // daemon liveness and measured RSS. The daemon URL stays in the roster foot
    // (design 03: one status line, not three).
    const ts = $('tstat');
    if (ts) {
      const spawning = !!gridEl.querySelector('.gpane.pending');
      ts.innerHTML = `<span class="tb-folder" title="${esc(cwdShow)}">📁 ${esc(short || '/')}</span>` +
        `<span class="tb-pty"><span class="dot ${spawning ? 'spawning' : live ? 'live' : 'dead'}"></span> ${spawning ? 'spawning…' : live + ' PTYs'}</span>`;
    }
    const tbd = $('tbdaemon');
    if (tbd) {
      tbd.className = 'tb-daemon' + (state.daemonOnline ? '' : ' off');
      tbd.innerHTML = `<span class="dot ${state.daemonOnline ? 'live' : 'dead'}"></span> ${state.daemonOnline ? 'Daemon running' : 'Daemon offline'}`;
    }
    const tbr = $('tbrss');
    if (tbr) {
      const mb = state.daemonRssKb ? Math.round(state.daemonRssKb / 1024) : null;
      tbr.textContent = mb ? `RSS ${mb} MB` : '';
      tbr.title = mb ? 'Daemon resident memory (measured from /proc/self/statm)' : '';
    }
    const rd = $('rd-text');
    if (rd) rd.innerHTML = `DAEMON: <a href="${esc(dUrl)}" target="_blank" class="daemon-link">${esc(dUrl)}</a>`;
    const hs = $('hstatus');
    if (hs) hs.innerHTML = `<span class="dot live"></span> daemon live · ${live} agent${live === 1 ? '' : 's'} · <a href="${esc(dUrl)}" target="_blank" class="daemon-link">${esc(dUrl)}</a>`;
    resolveScreen();
  }

  // Telemetry shows only values the daemon actually reports. Token counts were
  // estimated from PTY bytes and the $ figure was derived from that estimate —
  // i.e. invented. Design: no placeholder telemetry.
  function fmtAge(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  }

  function updatePaneTelemetry() {
    for (const [id, rec] of state.panes) {
      const a = state.agents.get(id);
      let tel = rec.el.querySelector('.telemetry-strip');
      if (!a || !a.alive) {
        if (tel) tel.remove();
        rec.el.classList.remove('stalled');
        continue;
      }
      const rssMB = a.rss_kb != null ? Math.round(a.rss_kb / 1024) : 0;
      // Liveness is a pair of daemon timestamps, not a guess: last_output_age
      // is the newest PTY byte; last_input_age is the newest byte we wrote.
      // Input newer than output = agent received a task and answered nothing.
      const inAge = a.last_input_age_ms != null ? a.last_input_age_ms : null;
      const outAge = a.last_output_age_ms != null ? a.last_output_age_ms : null;
      const everOut = outAge != null && outAge < 1e15; // u64::MAX = never
      let silent = 0;
      if (inAge != null && (!everOut || inAge < outAge)) silent = inAge;

      const chips = [];
      if (rssMB) chips.push(`<span class="chip chip-rss" title="Resident memory reported by the daemon">${rssMB}MB</span>`);
      if (silent >= 120_000) {
        chips.push(`<span class="chip chip-stall" title="Input sent ${fmtAge(silent)} ago; no PTY output since. The agent may be waiting for approval or frozen.">NO OUTPUT ${fmtAge(silent)}</span>`);
      } else if (silent >= 3_000) {
        chips.push(`<span class="chip chip-waiting" title="Waiting for the PTY to answer the last input">WAITING ${fmtAge(silent)}</span>`);
      }
      if (!chips.length) {
        if (tel) tel.remove();
        rec.el.classList.remove('stalled');
        continue;
      }
      if (!tel) {
        tel = document.createElement('div');
        tel.className = 'telemetry-strip';
        rec.el.querySelector('.gargv').insertAdjacentElement('beforebegin', tel);
      }
      tel.className = 'telemetry-strip' + (rssMB > 300 ? ' warn' : '');
      tel.innerHTML = chips.join('');
      rec.el.classList.toggle('stalled', silent >= 120_000);
    }
  }

  // ===== panes =====
  const gridEl = $('grid');
  async function openPane(id, presetName) {
    if (state.panes.has(id)) return state.panes.get(id);
    clearPendingPane();
    const pane = document.createElement('div');
    pane.className = 'gpane';
    const a = state.agents.get(id) || {};
    pane.innerHTML = `<div class="gtitle"><span class="dot live"></span>` +
      PICON(a.name || presetName) +
      `<span class="gname"><span class="gid">#${id}</span> ${esc(a.name || presetName || ('agent ' + id))}</span>` +
      `<span class="gfocus">FOCUSED</span>` +
      `<span class="gargv">${esc((a.argv || []).join(' '))}</span>` +
      `<span class="gkill" title="kill (ctrl-shift-W)">✕</span></div>` +
      `<div class="gdead"></div><div class="gterm"></div>` +
      `<div class="gpane-actions">` +
      `<button type="button" class="gpact-btn pact-handoff" title="Handoff task to another agent">➔ HANDOFF</button>` +
      `<button type="button" class="gpact-btn pact-clear" title="Clear terminal screen">CLEAR</button>` +
      `<button type="button" class="gpact-btn pact-restart" title="Restart agent process">RESTART ⟳</button>` +
      `<button type="button" class="gpact-btn pact-copy" title="Copy terminal output">COPY LOGS</button>` +
      `</div>`;
    gridEl.appendChild(pane);
    const term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      scrollback: 5000,
      // WCAG AA: TUIs paint their own backgrounds (Codex draws a light
      // composer). Without this, a dark theme leaves its default-foreground
      // text near-white on that light block — unreadable.
      minimumContrastRatio: 4.5,
      fontFamily: '"Geist Mono","JetBrains Mono",monospace',
      fontSize: 12.5,
      theme: htmlEl.classList.contains('dark') ? XTERM_DARK : XTERM_LIGHT
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(pane.querySelector('.gterm'));
    const rec = { el: pane, term, fit };
    state.panes.set(id, rec);
    // backfill from daemon ring
    const r = await rpc({ cmd: 'read', id: String(id), tail: 65536 });
    if (r.ok && r.chunk) term.write(r.chunk);
    term.onData((d) => rpc({ cmd: 'send', id: String(id), text: d, enter: false }));
    term.onResize(({ cols, rows }) => rpc({ cmd: 'resize', id: String(id), cols, rows }));
    pane.querySelector('.gtitle').onclick = () => focusPane(id);
    pane.querySelector('.gtitle').oncontextmenu = (e) => { e.preventDefault(); focusPane(id); openHandoff(id); };

    // two-step kill confirmation arming window (3s)
    const killBtn = pane.querySelector('.gkill');
    let armTimer = null;
    killBtn.onclick = (e) => {
      e.stopPropagation();
      if (killBtn.classList.contains('armed')) {
        clearTimeout(armTimer);
        killBtn.classList.remove('armed');
        killBtn.textContent = '✕';
        rpc({ cmd: 'kill', id: String(id) });
      } else {
        killBtn.classList.add('armed');
        killBtn.textContent = 'KILL?';
        armTimer = setTimeout(() => {
          killBtn.classList.remove('armed');
          killBtn.textContent = '✕';
        }, 3000);
      }
    };

    // mobile pane actions
    const handoffBtn = pane.querySelector('.pact-handoff');
    if (handoffBtn) handoffBtn.onclick = (e) => { e.stopPropagation(); focusPane(id); openHandoff(id); };
    const clearBtn = pane.querySelector('.pact-clear');
    if (clearBtn) clearBtn.onclick = (e) => { e.stopPropagation(); term.clear(); };
    const restartBtn = pane.querySelector('.pact-restart');
    if (restartBtn) restartBtn.onclick = async (e) => {
      e.stopPropagation();
      await rpc({ cmd: 'kill', id: String(id) });
      const p = a.name || presetName || 'bash';
      spawnPreset(p);
    };
    const copyBtn = pane.querySelector('.pact-copy');
    if (copyBtn) copyBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const text = term.getSelection() || (await rpc({ cmd: 'read', id: String(id), tail: 8192 })).chunk || '';
        if (text) {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'COPIED!';
          setTimeout(() => { copyBtn.textContent = 'COPY LOGS'; }, 1500);
        }
      } catch {}
    };

    refitAll();
    focusPane(id);
    return rec;
  }

  function refitAll() {
    const n = state.panes.size;
    const keepEmpty = gridEl.classList.contains('es');
    gridEl.className = n >= 7 ? 'c8' : n >= 5 ? 'c6' : n === 4 ? 'c4' : n === 3 ? 'c3' : n === 2 ? 'c2' : 'c1';
    if (keepEmpty) gridEl.classList.add('es');
    for (const rec of state.panes.values()) { try { rec.fit.fit(); } catch {} }
    requestAnimationFrame(() => { for (const rec of state.panes.values()) { try { rec.fit.fit(); } catch {} } });
  }

  // ===== P0 #8: refit panes on resize (debounced) =====
  let resizeRaf = null;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      refitAll();
      resolveScreen('resize');
    });
  });

  function focusPane(id) {
    state.focus = id;
    for (const [pid, rec] of state.panes) rec.el.classList.toggle('focused', pid === id);
    const rec = state.panes.get(id);
    if (rec) { rec.term.focus(); rec.el.scrollIntoView({ block: 'nearest' }); }
    renderRoster();
  }

  function cycleFocus() {
    // Cycle the panes, not every agent record: the daemon keeps exited agents
    // after their pane is closed, and Ctrl-Tab must never land focus on one.
    const ids = [...state.panes.keys()].sort((a, b) => a - b);
    if (!ids.length) return;
    const i = ids.indexOf(state.focus);
    focusPane(ids[(i + 1) % ids.length]);
  }

  function closePane(id, keepInRoster) {
    const rec = state.panes.get(id);
    const closedAgent = state.agents.get(id);
    if (rec) {
      state.panes.delete(id);
      try { rec.el.remove(); } catch {}
      try { rec.term.dispose(); } catch (e) { console.warn('pane dispose failed:', e && e.message); }
    }
    if (!keepInRoster) {
      state.agents.delete(id);
      // Dead registry records used to accumulate forever; close is the honest
      // point to prune one. Live agents are never forgotten (the daemon refuses).
      if (closedAgent && !closedAgent.alive) {
        rpc({ cmd: 'forget', id: String(id) })
          .then((r) => { if (r && r.ok) refreshList(); })
          .catch(() => {});
      }
    }
    // A closed pane must not stay focused: no border, no roster highlight, and
    // keystrokes would have nowhere to go.
    if (state.focus === id) {
      state.focus = null;
      const next = [...state.panes.keys()].sort((a, b) => a - b)[0];
      if (next != null) state.focus = next;
    }
    // Fit the grid BEFORE the roster resolves the screen: resolveScreen reads
    // the grid class, and a stale `c2` made S03 log "missing #grid.c1" for a
    // frame every time a pane closed.
    refitAll();
    if (state.focus != null) focusPane(state.focus);
    else renderRoster();
    if (!state.panes.size) hideSuggest();
    resolveScreen('pane closed');
  }

  async function refreshList() {
    let r;
    try {
      r = await rpc({ cmd: 'list' });
    } catch {
      state.daemonOnline = false;
      renderRoster();
      return;
    }
    if (!r || !r.ok) {
      state.daemonOnline = false;
      renderRoster();
      return;
    }
    state.daemonOnline = true;
    if (r.rss_kb != null) state.daemonRssKb = r.rss_kb;
    if (r.daemon_url) state.daemonUrl = r.daemon_url;
    if (r.home) state.home = r.home;
    if (r.cwd && !state.cwd) state.cwd = r.cwd;
    state.agents.clear();
    for (const a of r.agents) state.agents.set(a.id, a);
    renderRoster();
    updatePaneTelemetry();
  }

  async function spawnCmd(argvOrPreset) {
    const s = (argvOrPreset || '').trim();
    if (!s) return { ok: false, err: 'empty' };
    const prof = state.profiles[s];
    const body = /\s/.test(s)
      ? { cmd: 'spawn', argv: s.split(/\s+/) }
      : s.startsWith('@')
        ? { cmd: 'spawn', profile: s.slice(1), fallback: s.slice(1) }
        // A bare token can be a profile, a preset, or a command (`htop`).
        // Profiles must go through `profile`, or a persona silently spawns its
        // bare preset name (or a missing binary) with no preamble.
        : prof
          ? { cmd: 'spawn', profile: s, fallback: (prof && prof.preset) || s }
          // One bare token can be a preset or a command (`htop`, `python`).
          // Send the token as the argv fallback so the daemon uses the preset
          // when it exists and still spawns a real command when it does not.
          : { cmd: 'spawn', preset: s, argv: [s] };
    if (state.cwd) body.cwd = state.cwd;
    const r = await rpc(body);
    if (r.ok) await refreshList();
    return r;
  }
  // ===== workspace brief =====
  // The brief is not a banner Sentra renders in the chrome only: it is typed
  // into the agent's PTY after the process produces its first bytes. No magic
  // "inherit context" claim, just real input the agent can see and edit.
  function briefText() {
    return (state.contextNote || state.brief || '').trim();
  }
  function dispatchText(task, name, argv) {
    const ctx = briefText();
    const t = (task || '').trim();
    // A shell has no notion of a project brief: `Context: …` would be executed
    // as a command. Send the task alone; the brief stays in the launcher.
    if (!ctx || isShell(name) || isShell((argv || [])[0])) return t;
    return t ? `Context: ${ctx} — ${t}` : `Context: ${ctx}`;
  }
  const SHELL_NAMES = new Set(['bash', 'sh', 'zsh', 'fish', 'dash', 'ksh', 'shell']);
  function isShell(name) {
    return SHELL_NAMES.has(String(name || '').toLowerCase());
  }
  async function waitForFirstOutput(id, timeoutMs = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const r = await rpc({ cmd: 'list' });
      const a = r && r.ok ? r.agents.find((x) => x.id === id) : null;
      if (!a || !a.alive) return false;
      if (a.last_output_age_ms != null && a.last_output_age_ms < 60_000) return true;
      await new Promise((res) => setTimeout(res, 120));
    }
    return false;
  }
  async function injectBrief(id) {
    const ctx = briefText();
    if (!ctx) return false;
    const a = state.agents.get(id);
    if (a && (isShell(a.name) || isShell((a.argv || [])[0]))) return false;
    await waitForFirstOutput(id);
    const r = await rpc({ cmd: 'send', id: String(id), text: `Context: ${ctx}`, enter: false });
    return !!(r && r.ok);
  }
  // ===== design 02: pending pane while the daemon creates the PTY =====
  // The launcher is not a workspace. A successful spawn must reveal the shell,
  // and the round-trip must show the pending pane the design asks for instead
  // of leaving the hero on screen while a hidden PTY starts behind it.
  let pendingPane = null;
  function showPendingPane(label) {
    if (!appEl.classList.contains('hidden') && state.panes.size > 0) return null; // only the first pane needs a pending card
    if (!pendingPane) {
      pendingPane = document.createElement('div');
      pendingPane.className = 'gpane pending';
      pendingPane.dataset.label = label || 'agent';
      // Design 02: pending pane still carries dot + icon + name + argv, so it
      // looks like the pane it becomes instead of an anonymous spinner.
      pendingPane.innerHTML = `<div class="gtitle"><span class="dot spawning"></span>` +
        PICON(label || 'agent') +
        `<span class="gname">spawning ${esc(label || 'agent')}…</span>` +
        `<span class="gargv">${esc(label || '')}</span></div>` +
        `<div class="gpending"><span class="spin"></span>waiting for the daemon to create the PTY</div>`;
      gridEl.appendChild(pendingPane);
    }
    gridEl.classList.remove('es');
    gridEl.classList.add('c1');
    // Create the card BEFORE revealing the shell: enterAppShell resolves the
    // screen, and S02 logs 9/10 if the required `.gpane.pending` is not there
    // yet.
    if (appEl.classList.contains('hidden')) enterAppShell();
    // The pending pane replaces the empty card; leaving both on screen is the
    // "second copy of the hero behind the pane" the design forbids.
    renderRoster();
    setScreen('02', 'spawn pending: ' + (label || 'agent'));
    // enterAppShell would otherwise leave focus on the now-hidden launcher
    // input; the command bar is the next real action in this shell.
    const c = $('cmd');
    if (c) c.focus();
    return pendingPane;
  }
  function clearPendingPane() {
    if (!pendingPane) return;
    pendingPane.remove();
    pendingPane = null;
    refitAll();
    // A failed spawn must not leave a blank grid: with no panes left, restore
    // the empty card instead of an empty canvas.
    if (!state.panes.size) renderRoster();
  }
  async function spawnUi(argvOrPreset, withBrief = true) {
    const r = await spawnCmd(argvOrPreset);
    if (r && r.ok) {
      clearPendingPane();
      await openPane(r.id);
      // Launcher → first workspace: the pane must become visible, not just
      // exist in a hidden app shell.
      if (!harnessEl.classList.contains('hidden')) enterAppShell();
      if (withBrief) injectBrief(r.id).catch(() => {});
    } else {
      clearPendingPane();
      railShow('spawn failed: ' + (r.err || '?'), 'err');
    }
    return r;
  }
  window.spawnUi = spawnUi; // dev helper
  // wire command bar — #28: ↑/↓ history + @preset autocomplete
  const cmdHist = { list: JSON.parse(localStorage.getItem('sentra-cmdhist') || '[]'), i: -1 };
  $('cmd').addEventListener('keydown', (e) => {
    const v = $('cmd').value;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHist.list.length) {
        cmdHist.i = cmdHist.i < 0 ? cmdHist.list.length - 1 : Math.max(0, cmdHist.i - 1);
        $('cmd').value = cmdHist.list[cmdHist.i];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdHist.i >= 0) {
        cmdHist.i++;
        $('cmd').value = cmdHist.i >= cmdHist.list.length ? '' : cmdHist.list[cmdHist.i];
        if (cmdHist.i >= cmdHist.list.length) cmdHist.i = -1;
      }
    } else if (e.key === 'Tab' && v.startsWith('@')) {
      e.preventDefault();
      const m = presets.find((p) => ('@' + p).startsWith(v));
      if (m) $('cmd').value = '@' + m;
    }
  });
  $('cmd').addEventListener('input', () => {
    const v = $('cmd').value.trim();
    // Only a line that starts with a handle uses the dispatch grammar; an
    // argv line that happens to contain `@` is still raw argv.
    const specs = v.startsWith('@') ? parseHarness(v) : [];
    if (!specs.length) { $('spbtn').textContent = 'Spawn Agent ↵'; return; }
    const anyTask = specs.some((sp) => (sp.task || '').trim());
    // design 04/08: DISPATCH REPO when every handle is already live and there
    // is a task, SPAWN + SEND when something still has to start, and the plain
    // spawn label when there is no task to send at all.
    const allLive = specs.every((sp) =>
      [...state.agents.values()].some((a) => a.alive && a.name.toLowerCase() === sp.preset));
    $('spbtn').textContent = !anyTask ? 'Spawn Agent ↵' : allLive ? 'DISPATCH REPO ▸' : 'SPAWN + SEND';
  });
  $('bar').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (spawnBusy) { railShow('spawn already in progress', 'err'); return; }
    const val = $('cmd').value.trim();
    if (!val) { railShow('empty command — type a preset or argv', 'err'); return; }
    cmdHist.list = [...cmdHist.list.filter((x) => x !== val), val].slice(-50);
    localStorage.setItem('sentra-cmdhist', JSON.stringify(cmdHist.list));
    cmdHist.i = -1;
    $('cmd').value = '';
    const specs = val.startsWith('@') ? parseHarness(val) : [];
    if (specs.length) {
      guardSpawn($('spbtn'), async () => {
        try {
          let ok = true;
          const touched = [];
          for (const sp of specs) {
            const name = sp.preset;
            const task = (sp.task || '').trim();
            const live = task
              ? [...state.agents.values()].filter((a) => a.alive && a.name.toLowerCase() === name)
              : [];
            if (live.length) {
              // Handoff to an already-running agent: no new PTY, no new pane.
              for (const a of live) {
                const r = await rpc({ cmd: 'send', id: String(a.id), text: dispatchText(task, a.name, a.argv), enter: true });
                ok = ok && r.ok;
                touched.push(a);
              }
              continue;
            }
            if (!state.panes.size) showPendingPane(name);
            const r = await spawnUi('@' + name, false);
            ok = ok && !!(r && r.ok);
            if (r && r.ok) {
              touched.push({ id: r.id, name });
              if (task) {
                const sent = await rpc({ cmd: 'send', id: String(r.id), text: dispatchText(task, a.name, a.argv), enter: true });
                ok = ok && !!(sent && sent.ok);
              }
            }
          }
          if (!ok) $('cmd').value = val; // design 04: failed submit keeps the text
          const summary = specs.every((sp) => !(sp.task || '').trim())
            ? `spawned ${specs.map((sp) => '@' + sp.preset).join(', ')}`
            : `dispatched to ${specs.map((sp) => '@' + sp.preset).join(', ')}`;
          railShow(ok ? summary : 'dispatch failed', ok ? '' : 'err');
          if (touched.length && state.panes.has(touched[0].id)) focusPane(touched[0].id);
          resolveScreen('dispatch: ' + specs.map((sp) => '@' + sp.preset).join(' '));
          return { ok };
        } catch (e) {
          $('cmd').value = val; // design 04: failed submit keeps the text
          throw e;
        }
      });
      return;
    }
    guardSpawn($('spbtn'), async () => {
      if (!state.panes.size) showPendingPane(val);
      try {
        const r = await spawnUi(val);
        if (!r || !r.ok) $('cmd').value = val;
        resolveScreen('cmdbar: ' + val);
        return r;
      } catch (e) {
        $('cmd').value = val; // design 04: failed submit keeps the text
        throw e;
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't' &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
        !$('empty-state').classList.contains('hidden')) {
      e.preventDefault();
      $('cmd').focus();
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'W') { killFocused(); }
    if (e.ctrlKey && e.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault(); splitFocused(e.key);
    }
    if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); cycleFocus(); }
  });
  let kfArmed = false, kfTimer = null;
  async function killFocused() {
    if (state.focus == null) return;
    const rec = state.panes.get(state.focus);
    const agent = state.agents.get(state.focus);
    // already dead: the kill affordance becomes "close this pane"
    if (agent && !agent.alive) { closePane(state.focus, false); return; }
    const killBtn = rec && rec.el.querySelector('.gkill');
    if (kfArmed) {
      clearTimeout(kfTimer);
      kfArmed = false;
      if (killBtn) { killBtn.classList.remove('armed'); killBtn.textContent = '✕'; }
      markIntentional(state.focus);
      await rpc({ cmd: 'kill', id: String(state.focus) });
    } else {
      kfArmed = true;
      if (killBtn) { killBtn.classList.add('armed'); killBtn.textContent = 'KILL?'; }
      railShow(`Press Ctrl-Shift-W again within 3s to kill #${state.focus}`, 'err');
      kfTimer = setTimeout(() => {
        kfArmed = false;
        if (killBtn) { killBtn.classList.remove('armed'); killBtn.textContent = '✕'; }
      }, 3000);
    }
  }
  // v1 splits = open a new pane of the same preset next to focus. No tiling algebra.
  function splitFocused(_dir) {
    const cur = state.agents.get(state.focus);
    const argv_or = cur && cur.argv.length ? cur.argv[0] : 'bash';
    spawnUi(argv_or);
  }

  // ===== preset chips (sidebar + cmdbar) =====
  for (const p of presets) {
    // sidebar preset chips
    const rc = document.createElement('div');
    rc.className = 'row preset-row';
    rc.tabIndex = 0;
    rc.setAttribute('role', 'button');
    rc.setAttribute('aria-label', 'spawn preset ' + p);
    rc.innerHTML = PICON(p) + `<span class="pchip">+</span><span class="rname">@${esc(p)}</span>`;
    rc.onclick = () => { if (!spawnBusy) guardSpawn(rc, () => spawnUi(p)); };
    rc.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rc.click(); } };
    $('roster-presets').appendChild(rc);
    // cmdbar chips
    const c = document.createElement('div');
    c.className = 'chip';
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', 'spawn preset ' + p);
    c.innerHTML = PICON(p) + esc(p);
    c.onclick = () => { if (!spawnBusy) guardSpawn(c, () => spawnUi(p)); };
    c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } };
    $('chips').appendChild(c);
  }

  // ===== after-exit strip (explicit actions, no auto-learning) =====
  function showSuggest(id, code) {
    const el = $('suggest');
    if (!el) return;
    const a = state.agents.get(id);
    el.innerHTML = '';
    el.appendChild(Object.assign(document.createElement('span'), { className: 's-tag', textContent: 'after exit' }));
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
        // Save under the preset key, not the unique instance name (omp-2).
        // Spawn injection loads by preset, so an instance key would never be
        // read back — a lesson that silently does nothing.
        const base = (a ? a.name : String(id)).replace(/-\d+$/, '');
        const known = ['hermes', 'omp', 'claude', 'codex', 'bash'];
        const key = (known.includes(base) ? base : (a ? a.name : base)).replace(/[^\w-]/g, '_');
        await rpc({ cmd: 'lessons', key, text: r.chunk.trim().slice(-4000) || '(empty)' });
        note.textContent = 'lesson saved.';
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
      updatePaneTelemetry();
      if (/401|unauthorized|authentication_error|invalid_api_key/i.test(evt.chunk || '')) {
        if (rec) {
          let eb = rec.el.querySelector('.gerror-banner');
          if (!eb) {
            eb = document.createElement('div');
            eb.className = 'gerror-banner';
            rec.el.querySelector('.gtitle').insertAdjacentElement('afterend', eb);
          }
          eb.innerHTML = `<span class="err-icon">⚠</span><span class="err-msg">Auth Error (HTTP 401): API key invalid or missing</span>` +
            `<button type="button" class="err-retry">CONFIG KEYS</button>` +
            `<button type="button" class="err-dismiss">✕</button>`;
          eb.querySelector('.err-dismiss').onclick = () => eb.remove();
          eb.querySelector('.err-retry').onclick = () => { eb.remove(); openSettings('models'); };
        }
      }
      // activity rail stays quiet during normal output: raw PTY bytes are not UI copy
      return;    }
    if (evt.evt === 'exit') {
      const a = state.agents.get(evt.id);
      if (a) { a.alive = false; a.exit_code = evt.code; }
      const rec = state.panes.get(evt.id);
      if (rec) {
        rec.el.classList.add('dead');
        // the header dot is part of the pane's truth, not decoration
        const hdot = rec.el.querySelector('.gtitle .dot');
        if (hdot) { hdot.className = 'dot dead'; hdot.setAttribute('aria-label', 'exited'); hdot.title = 'exited'; }
        // a dead pane cannot be killed again; the affordance is close
        const hkill = rec.el.querySelector('.gkill');
        if (hkill) {
          hkill.classList.remove('armed');
          hkill.textContent = '✕';
          hkill.title = 'close pane';
          hkill.onclick = (e) => { e.stopPropagation(); closePane(evt.id, false); };
        }
        // the error banner and the exit bar said the same thing twice
        const eb = rec.el.querySelector('.gerror-banner');
        if (eb) eb.remove();
        const gd = rec.el.querySelector('.gdead');
        gd.innerHTML = `<span>agent ${esc(evt.name ?? '')} exited (code ${evt.code})</span>` +
          `<span class="gdead-actions">` +
          `<button type="button" class="gdead-btn" data-act="restart">RESTART ⟳</button>` +
          `<button type="button" class="gdead-btn" data-act="close">CLOSE ✕</button></span>`;
        const rbtn = gd.querySelector('[data-act="restart"]');
        if (rbtn && a) {
          rbtn.onclick = (e) => {
            e.stopPropagation();
            closePane(evt.id, false);
            spawnUi(a.argv && a.argv.length ? a.argv.join(' ') : a.name);
          };
        }
        const cbtn = gd.querySelector('[data-act="close"]');
        if (cbtn) cbtn.onclick = (e) => { e.stopPropagation(); closePane(evt.id, false); };
      }
      renderRoster(); updatePaneTelemetry();
      if (!isIntentional(evt.id)) showSuggest(evt.id, evt.code);
      resolveScreen('exit #' + evt.id);
      return;
    }
    if (evt.evt === 'error') {
      if (evt.id != null && isIntentional(evt.id)) return;
      const msg = String(evt.msg || evt.code || 'Error');
      // daemon emits an `error` and an `exit` for the same death. The dead-pane
      // bar owns that story; a second red banner is noise.
      if (/exited with status|process exited/i.test(msg)) return;
      railShow(`[ERROR] ${msg}`, 'err');
      const rec = evt.id != null ? state.panes.get(evt.id) : null;
      if (rec) {
        let eb = rec.el.querySelector('.gerror-banner');
        if (!eb) {
          eb = document.createElement('div');
          eb.className = 'gerror-banner';
          rec.el.querySelector('.gtitle').insertAdjacentElement('afterend', eb);
        }
        eb.innerHTML = `<span class="err-icon">⚠</span><span class="err-msg">${esc(evt.msg || 'Error')}</span>` +
          `<button type="button" class="err-retry">RETRY</button>` +
          `<button type="button" class="err-dismiss">✕</button>`;
        eb.querySelector('.err-dismiss').onclick = () => eb.remove();
        eb.querySelector('.err-retry').onclick = () => {
          eb.remove();
          const a = state.agents.get(evt.id);
          if (a) spawnUi(a.argv && a.argv.length ? a.argv.join(' ') : a.name);
        };
      }
      return;
    }
    if (evt.evt === 'spawned') { refreshList().then(() => openPane(evt.id)); return; }
  };


  // Rust pump already subscribed the watch conn to the global feed
  await refreshList();
  // 5s backstop: output events are instant, but liveness ages, RSS and the
  // WAITING → NO OUTPUT transition need a clock. Hidden tabs stay quiet.
  setInterval(() => {
    if (document.hidden || appEl.classList.contains('hidden')) return;
    refreshList();
  }, 5000);
  const anyAlive = [...state.agents.values()].some((a) => a.alive);
  const frEl = $('firstrun');
  const seen = localStorage.getItem('sentra-init');
  // `?setup=1` re-opens the first-run screen for audit/preview even when a
  // workspace already exists; the real first-launch rule is unchanged.
  const forceSetup = new URLSearchParams(location.search).has('setup');
  function enterAppShell() {
    harnessEl.classList.add('hidden');
    appEl.classList.remove('hidden');
    if (frEl) frEl.classList.add('hidden');
    resolveScreen('app shell');
    if (state.panes.size) focusPane(state.focus != null ? state.focus : [...state.panes.keys()][0]);
    else focusForScreen('01');
  }
  function enterLauncher() {
    harnessEl.classList.remove('hidden');
    appEl.classList.add('hidden');
    if (frEl) frEl.classList.add('hidden');
    resolveScreen('launcher');
    focusForScreen('01');
  }
  const FR_BLURB = {
    claude: 'Autonomous coding agent with tool-call approvals',
    codex: 'Code generation & continuous test verification',
    omp: 'High-throughput pipeline runner & AST compiler',
    hermes: 'Autonomous search & documentation triage',
    bash: 'Native Linux pseudo-terminal fallback',
  };
  if ((forceSetup || (!seen && !anyAlive)) && frEl) {
    harnessEl.classList.add('hidden'); appEl.classList.add('hidden'); frEl.classList.remove('hidden');
    const cwdIn = $('fr-cwd');
    if (cwdIn && !cwdIn.value) cwdIn.value = state.cwd || state.home || '';
    const paint = (rows) => {
      const box = $('fr-rows');
      box.innerHTML = '';
      const list = rows || [];
      const n = list.filter((p) => p.found).length;
      for (const p of list) {
        const d = document.createElement('div');
        d.className = 'fr-row' + (p.found ? '' : ' off');
        d.style.animationDelay = (box.children.length * 28) + 'ms';
        const handle = (p.argv && p.argv[0]) || p.name;
        d.innerHTML = `<span class="dot ${p.found ? 'live' : 'dead'}"></span>` +
          `<span class="fr-name">${esc(p.name)}</span>` +
          `<span class="fr-handle">${esc(handle)}</span>` +
          `<span class="fr-blurb">${esc(FR_BLURB[p.name] || '')}</span>` +
          `<span class="fr-path">${esc(p.found ? p.path : 'not on $PATH')}</span>` +
          `<span class="fr-state">${p.found ? 'Ready' : 'Not found'}</span>`;
        box.appendChild(d);
      }
      if (!list.length) box.innerHTML = '<div class="fr-row off">no presets</div>';
      $('fr-daemon').textContent = `${n}/${list.length} on $PATH · ${location.host}`;
    };
    const scan = async () => {
      const r = await rpc({ cmd: 'presets' }).catch(() => null);
      if (!r || !r.ok) {
        paint([]);
        const box = $('fr-rows');
        if (box) box.innerHTML = '<div class="fr-row fr-row-err"><span class="dot dead"></span><span class="fr-name">preset probe unavailable</span><span class="fr-path">restart the daemon with the rebuilt binary</span></div>';
        $('fr-daemon').textContent = 'probe unavailable';
        return;
      }
      paint(r.presets);
    };
    await scan();
    $('fr-rescan').onclick = scan;
    const enter = (skip) => {
      const cwd = (cwdIn && cwdIn.value.trim()) || '';
      if (!skip && cwd && !cwd.startsWith('/')) { $('fr-err').hidden = false; $('fr-err').textContent = 'Workspace must be an absolute path.'; return; }
      if (cwd) { state.cwd = cwd; localStorage.setItem('sentra-cwd', cwd); }
      localStorage.setItem('sentra-init', '1');
      frEl.classList.add('hidden');
      if (anyAlive) enterAppShell(); else enterLauncher();
    };
    $('fr-go').onclick = () => enter(false);
    $('fr-skip').onclick = () => enter(true);
    resolveScreen('first run');
    focusForScreen('00');
  } else if (anyAlive) {
    enterAppShell();
  } else {
    enterLauncher();
  }
  renderRoster();
  // auto-open panes for existing agents (UI restart mid-flight)
  for (const a of [...state.agents.values()].filter((x) => x.alive).sort((x, y) => x.id - y.id).slice(0, 8)) await openPane(a.id);
  refitAll();
  booting = false;
  resolveScreen('boot complete');
  window.__sentraAuditReady = true;
  console.info('[SENTRA-AUDIT] ready · screen S' + AUDIT.current + ' · ' + JSON.stringify(AUDIT.checks[AUDIT.current] || {}));

  // handoff rail card (right column): shows last send→wait→read flow summary
  const railCard = $('handrail-card'), hcFlow = $('hc-flow');
  function showFlow(srcId, dstId, msg, status) {
    const src = state.agents.get(srcId), dst = state.agents.get(dstId);
    railCard.classList.remove('hidden');
    railCard.dataset.msg = msg;
    hcFlow.innerHTML =
      `<span class="flow-from">#${srcId} ${esc(src ? src.name : '')} → #${dstId} ${esc(dst ? dst.name : '')}</span>` +
      `<span class="flow-msg">${esc(msg.slice(0, 220))}</span>` +
      `<span class="flow-status">${esc(status)}</span>`;
  }
  $('hc-copy').onclick = async () => {
    const dst = railCard.dataset.dst;
    if (!dst) return;
    const rr = await rpc({ cmd: 'read', id: dst, tail: 8192 });
    const txt = copyableTail(rr.ok ? rr.chunk : '', 8, railCard.dataset.msg || '');
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
    // A previous successful handoff rebinds this button to "copy last output".
    // Reopening the dialog must restore the send action, not silently copy.
    const sb = $('ho-send');
    sb.textContent = 'send ↵';
    sb.disabled = false;
    sb.onclick = sendHandoff;
    openOverlay('handoff');
    if (targets.length) $('ho-msg').focus();
  }
  function copyableTail(chunk, maxLines = 8, sentMsg = '') {
    // Terminal bytes are not clipboard text: drop OSC/CSI sequences, CRs, and
    // shell/TUI prompts so "copy last output" copies the answer, not the
    // `bash-5.3$` line that happens to be last.
    const clean = String(chunk || '')
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\r/g, '');
    const isPrompt = (l) => /[$#%❯>]\s*$/.test(l) || /^[\s│╰─┌└|]+$/.test(l) || /^[\s\-_=]+$/.test(l);
    const sent = String(sentMsg || '').trim();
    const lines = clean.split('\n')
      .map((l) => l.replace(/^([\w.@:/~-]+\s*[$#%❯>]\s*)+/, '').trimEnd())
      .filter((l) => l.trim() && !isPrompt(l))
      .filter((l) => !sent || (!l.includes(sent) && !(sent.includes(l) && l.length > 2)));
    return lines.slice(-maxLines).join('\n') || '(no output)';
  }
  function closeHandoff() { closeOverlay('handoff'); $('ho-status').textContent = ''; }
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
    st.textContent = 'sent — waiting for PTY quiet…';
    showFlow(hoSrc, dst, msg, 'waiting for quiet…');
    railCard.dataset.dst = String(dst);
    const w = await rpc({ cmd: 'wait', id: String(dst), idle_ms: 4000 });
    if (!w.ok) { showFlow(hoSrc, dst, msg, 'wait failed: ' + (w.err || '?')); throw new Error(w.err || 'wait failed'); }
    ok = true;
    // "Quiet" is what the daemon can prove: input was written, output happened
    // afterwards, then the PTY went silent. It is not proof the task is done.
    st.textContent = 'PTY quiet — check the output';
    showFlow(hoSrc, dst, msg, 'quiet ✓ — check output');
    $('hc-copy').hidden = false;
    } catch (ex) { st.textContent = 'error: ' + String(ex.message || ex); }
    const btn = $('ho-send');
    btn.disabled = false; hoBusy = false;
    if (ok) {
      btn.textContent = 'copy last output';
      btn.onclick = async () => {
        const rr = await rpc({ cmd: 'read', id: String(dst), tail: 8192 });
        const txt = copyableTail(rr.ok ? rr.chunk : '', 8, msg);
        st.textContent = '> ' + txt;
        try { await navigator.clipboard.writeText(txt); st.textContent += ' — copied'; }
        catch { st.textContent += ' — clipboard blocked; output shown above'; }
      };
    }
  }
  $('ho-cancel').onclick = closeHandoff;
  $('ho-send').onclick = sendHandoff;
  window.addEventListener('keydown', (e) => {
    if (trapTab(e)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      if ($('switcher').classList.contains('hidden')) swOpen(); else swClose();
      return;
    }
    if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openSettings('shortcuts');
      return;
    }
    if (e.key === 'Escape') {
      if (!$('switcher').classList.contains('hidden')) { swClose(); return; }
      if (!$('drop-overlay').classList.contains('hidden')) { hideDropOverlay(); return; }
      if (!$('handoff').classList.contains('hidden')) { closeHandoff(); return; }
      if (!$('settings').classList.contains('hidden')) { closeSettings(); return; }
      const rec = state.panes.get(state.focus);
      if (rec) { rec.term.focus(); return; }
    }
    if (!$('handoff').classList.contains('hidden')) {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); sendHandoff(); }
      return;
    }
  });

  // ===== settings modal =====
  function openSettings(activeTab) {
    renderSetPresets();
    renderSetPersonas();
    syncThemeCards();
    if (activeTab) {
      for (const x of document.querySelectorAll('.mo-tab')) x.classList.toggle('active', x.dataset.tab === activeTab);
      for (const p of document.querySelectorAll('.mo-body')) p.classList.toggle('hidden', p.dataset.panel !== activeTab);
    }
    openOverlay('settings');
    setScreen('07', activeTab || 'settings');
    focusForScreen('07');
  }
  function closeSettings() { closeOverlay('settings'); }
  function syncThemeCards() {
    const cur = localStorage.getItem('sentra-theme-variant') || (htmlEl.classList.contains('dark') ? 'dark' : 'light');
    for (const c of document.querySelectorAll('.th-card')) c.classList.toggle('active', c.dataset.th === cur);
  }
  function applyThemeVariant(themeName) {
    htmlEl.classList.remove('dark', 'theme-cyberpunk', 'theme-sepia');
    if (themeName === 'dark') htmlEl.classList.add('dark');
    else if (themeName === 'cyberpunk') htmlEl.classList.add('dark', 'theme-cyberpunk');
    else if (themeName === 'sepia') htmlEl.classList.add('theme-sepia');
    localStorage.setItem('sentra-theme-variant', themeName);
    localStorage.setItem('sentra-dark', ['dark', 'cyberpunk'].includes(themeName) ? '1' : '0');
    syncThemeCards();
    const isDark = ['dark', 'cyberpunk'].includes(themeName);
    for (const rec of state.panes.values()) {
      try { rec.term.options.theme = isDark ? XTERM_DARK : XTERM_LIGHT; } catch {}
    }
    syncThemeIcon();
    themeNotice();
  }
  for (const c of document.querySelectorAll('.th-card')) {
    c.onclick = () => applyThemeVariant(c.dataset.th);
  }
  const motionChk = $('th-motion');
  if (motionChk) {
    motionChk.checked = localStorage.getItem('sentra-motion') === 'reduced';
    htmlEl.classList.toggle('motion-reduced', motionChk.checked);
    motionChk.onchange = () => {
      localStorage.setItem('sentra-motion', motionChk.checked ? 'reduced' : 'full');
      htmlEl.classList.toggle('motion-reduced', motionChk.checked);
    };
  }

  function renderSetPersonas() {
    const el = $('set-personas');
    if (!el) return;
    el.innerHTML = '';
    const profs = state.profiles || {};
    if (!Object.keys(profs).length) {
      el.innerHTML = '<div class="set-row"><span class="set-sub">No profiles in ~/.config/sentra/profiles.json</span></div>';
      return;
    }
    for (const [name, pr] of Object.entries(profs)) {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = PICON(name) +
        `<span class="set-name">@${esc(name)}</span>` +
        `<span class="set-sub">${esc(pr.role || pr.directive || 'persona profile')}</span>` +
        `<button class="mo-btn set-spawn" data-p="@${esc(name)}" type="button">SPAWN</button>`;
      el.appendChild(row);
    }
  }

  function renderSetPresets() {
    const el = $('set-presets');
    el.innerHTML = '';
    const list = state.presetProbe.length
      ? state.presetProbe
      : presets.map((name) => ({ name, argv: [name], found: true, path: '' }));
    if (!list.length) {
      el.innerHTML = '<div class="set-row"><span class="set-sub">No presets configured in ~/.config/sentra/presets.json</span></div>';
      return;
    }
    for (const p of list) {
      const row = document.createElement('div');
      row.className = 'set-row';
      const argv = (p.argv || [p.name]).join(' ');
      row.innerHTML = PICON(p.name) +
        `<span class="set-name">${esc(p.name)}</span>` +
        `<span class="set-sub" title="${esc(argv)}">${esc(argv)}</span>` +
        `<span class="set-path" title="${esc(p.path || '')}">${esc(p.path || (p.found ? '' : 'not on $PATH'))}</span>` +
        `<button class="mo-btn set-spawn" data-p="${esc(p.name)}" type="button"${p.found ? '' : ' disabled'}>${p.found ? 'SPAWN' : 'MISSING'}</button>`;
      el.appendChild(row);
    }
  }
  $('set-close').onclick = closeSettings;
  $('set-done').onclick = closeSettings;
  $('thmbtn').onclick = () => {
    const isDark = htmlEl.classList.contains('dark');
    applyThemeVariant(isDark ? 'light' : 'dark');
  };
  for (const t of document.querySelectorAll('.mo-tab')) {
    t.onclick = () => {
      for (const x of document.querySelectorAll('.mo-tab')) x.classList.toggle('active', x === t);
      for (const p of document.querySelectorAll('.mo-body')) p.classList.toggle('hidden', p.dataset.panel !== t.dataset.tab);
    };
  }
  // One delegate for every SPAWN button in the modal: the Presets tab and the
  // Personas tab both use `.set-spawn`; binding only #set-presets left the
  // persona buttons inert.
  $('settings').addEventListener('click', async (e) => {
    const b = e.target.closest('.set-spawn');
    if (!b) return;
    closeSettings();
    await spawnUi(b.dataset.p);
  });
  rpc({ cmd: 'profiles' }).then((r) => { if (r && r.ok) state.profiles = r.profiles || {}; }).catch(() => {});

  // ===== drag & drop file attach overlay (Screen 05b) =====
  const dropOverlay = $('drop-overlay');
  const dropTargetSelect = $('drop-target-agent');
  const dropPreview = $('drop-files-preview');
  const dropInject = $('drop-inject');
  let dragCounter = 0;
  let droppedFiles = [];
  let droppedRejected = [];
  function liveAgents() { return [...state.agents.values()].filter((a) => a.alive); }
  function showDropOverlay() {
    const live = liveAgents();
    dropTargetSelect.innerHTML = '<option value="focused">Active Focused Agent</option>';
    for (const a of live) dropTargetSelect.innerHTML += `<option value="${a.id}">#${a.id} ${esc(a.name)}</option>`;
    if (live.length > 1) dropTargetSelect.innerHTML += `<option value="all">Inject All Agents (${live.length})</option>`;
    openOverlay('drop-overlay');
    setScreen('05b', 'drop overlay');
    dropFiles([]);
  }
  function hideDropOverlay() {
    dragCounter = 0;
    closeOverlay('drop-overlay');
  }
  function dropFiles(list) {
    droppedFiles = [];
    droppedRejected = [];
    for (const f of list) {
      const v = classifyFile(f.name, f.size || 0);
      if (v.ok) droppedFiles.push(f); else droppedRejected.push({ name: f.name, why: v.why });
    }
    if (!dropPreview) return;
    const parts = [];
    for (const f of droppedFiles) parts.push(`<span class="chip">${esc(f.name)} · ${((f.size || 0) / 1024).toFixed(1)} KB</span>`);
    for (const r of droppedRejected) parts.push(`<span class="chip chip-bad">${esc(r.name)} · ${esc(r.why)}</span>`);
    dropPreview.innerHTML = parts.length ? parts.join(' ') : 'Ready to inject';
    dropPreview.classList.toggle('has-bad', droppedRejected.length > 0);
    const live = liveAgents();
    if (dropInject) {
      dropInject.disabled = !droppedFiles.length || !live.length;
      dropInject.textContent = !live.length ? 'Spawn an agent first' : `Inject ${droppedFiles.length || ''}`.trim();
    }
  }
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) showDropOverlay();
  });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter <= 0) hideDropOverlay();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const entries = await entriesFromDataTransfer(e.dataTransfer);
    if (!entryIsInsideDropBox(e.target)) { hideDropOverlay(); return; }
    dropFiles(entries);
  });
  function entryIsInsideDropBox(t) {
    const box = dropOverlay && dropOverlay.querySelector('.drop-box');
    return !!(box && t && box.contains(t));
  }
  if (dropInject) dropInject.onclick = async () => {
    const live = liveAgents();
    if (!droppedFiles.length || !live.length) return;
    const val = dropTargetSelect.value;
    const targets = val === 'all' ? live : val === 'focused' ? live.filter((a) => a.id === state.focus) : live.filter((a) => a.id === parseInt(val, 10));
    const refs = droppedFiles.map((f) => f.path || f.name).join(' ');
    for (const t of targets) await rpc({ cmd: 'send', id: String(t.id), text: refs, enter: false });
    railShow(`Sent ${droppedFiles.length} file reference(s) to ${targets.length} agent(s)`, 'good');
    hideDropOverlay();
  };


  // ===== quick switcher (⌘O / Ctrl+O) =====
  const swEl = $('switcher'), swInput = $('sw-input'), swList = $('sw-list');
  let swRows = [], swSel = 0, swAttachMode = false;
  function swAttachStart() {
    swAttachMode = true;
    swInput.value = state.cwd || '';
    swInput.placeholder = 'Type an absolute workspace path, then Enter…';
    swInput.removeAttribute('aria-invalid');
    swList.innerHTML = '<div class="sw-row"><span class="sw-kind">NEW</span>' +
      '<span class="sw-label">Workspace folder to attach</span>' +
      '<span class="path">absolute path · Enter to attach · Esc to cancel</span></div>';
    swInput.focus(); swInput.select();
  }
  function swAttachCommit() {
    const v = swInput.value.trim();
    if (!v.startsWith('/')) {
      swInput.setAttribute('aria-invalid', 'true');
      swList.innerHTML = '<div class="sw-row"><span class="sw-kind">ERR</span>' +
        '<span class="sw-label sw-err">Path must be absolute (start with /)</span></div>';
      return false;
    }
    state.cwd = v;
    localStorage.setItem('sentra-cwd', v);
    swAttachMode = false;
    swClose();
    railShow('workspace attached: ' + v, 'good');
    refreshList();
    return true;
  }
  function swBuild(filter) {
    swList.innerHTML = '';
    const f = (filter || '').toLowerCase();
    // Dead daemon records are not workspaces: a folder shows up because an
    // agent is live there or a pane is still open, and the badge counts live
    // agents only (design 09: "3 running", never "0/12 live").
    const pool = [...state.agents.values()].filter((a) => a.alive || state.panes.has(a.id));
    const cwds = [...new Set(pool.map((a) => a.cwd || '?'))]
      .sort((x, y) => (x.split('/').length - y.split('/').length) || x.localeCompare(y));
    if (!f) {
      const h = document.createElement('div');
      h.className = 'sw-section';
      h.textContent = 'ACTIVE & RECENT WORKSPACES';
      swList.appendChild(h);
    }
    swRows = [];
    for (const cwd of cwds) {
      const list = pool.filter((a) => (a.cwd || '?') === cwd);
      const live = list.filter((a) => a.alive).length;
      if (!live && cwd !== state.cwd) continue;
      swRows.push({ kind: 'ws', id: cwd, label: base(cwd), sub: cwd, badge: `${live} running` });
    }
    for (const p of presets) swRows.push({ kind: 'preset', id: p, label: '@' + p, sub: 'preset', badge: '' });
    swRows.push({ kind: 'attach', id: '__attach', label: 'Open / Attach New Workspace Folder…', sub: '', badge: '' });
    swRows = swRows.filter((r) => (r.label + ' ' + r.sub).toLowerCase().includes(f));
    swSel = Math.min(swSel, Math.max(0, swRows.length - 1));
    swRows.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'sw-row' + (i === swSel ? ' sel' : '');
      d.dataset.kind = r.kind; d.dataset.id = r.id;
      d.innerHTML = `<span class="sw-kind">${r.kind === 'ws' ? 'DIR' : r.kind === 'attach' ? 'NEW' : 'PRESET'}</span>` +
        `<span class="sw-label">${esc(r.label)}</span>` +
        (r.sub ? `<span class="ws-path">${esc(r.sub)}</span>` : '') +
        (r.badge ? `<span class="ws-badge">${esc(r.badge)}</span>` : '');
      d.onclick = () => swAct(r);
      swList.appendChild(d);
    });
  }
  function swAct(r) {
    if (!r) { swClose(); return; }
    if (r.kind === 'attach') { swAttachStart(); return; }
    swClose();
    if (r.kind === 'ws') {
      const a = [...state.agents.values()].filter((x) => (x.cwd || '?') === r.id && x.alive).sort((x, y) => x.id - y.id)[0];
      if (a) focusPane(a.id); else refreshList();
    } else spawnUi(r.id);
  }
  function swOpen() {
    swAttachMode = false;
    swInput.placeholder = 'Jump to folder or preset…';
    swInput.removeAttribute('aria-invalid');
    swInput.value = ''; swSel = 0; swBuild('');
    openOverlay('switcher');
    setScreen('09', 'quick switcher');
    swInput.focus();
  }
  function swClose() {
    swAttachMode = false;
    swInput.placeholder = 'Jump to folder or preset…';
    closeOverlay('switcher');
  }
  $('sw-open').onclick = swOpen;
  swInput.oninput = () => { if (swAttachMode) return; swSel = 0; swBuild(swInput.value); };
  swInput.onkeydown = (e) => {
    if (swAttachMode) {
      if (e.key === 'Enter') { e.preventDefault(); swAttachCommit(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); swSel = Math.min(swSel + 1, swRows.length - 1); swBuild(swInput.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); swSel = Math.max(swSel - 1, 0); swBuild(swInput.value); }
    else if (e.key === 'Enter') { e.preventDefault(); swAct(swRows[swSel]); }
  };
  // ===== empty state (screen 10) =====
  const esSpawn = $('es-spawn');
  if (esSpawn) esSpawn.onclick = () => $('cmd').focus();
  for (const b of document.querySelectorAll('.es-presets button[data-p]')) {
    b.onclick = () => {
      if (spawnBusy) return;
      // The empty-folder card is the first-agent moment too: same pending card
      // as S02, not an empty canvas while the daemon replies.
      guardSpawn(b, () => {
        showPendingPane(b.dataset.p);
        return launchHarness([{ preset: b.dataset.p, task: '' }]);
      });
    };
  }

  // ===== mobile navigation & workspaces drawer (Screen 11 / Mobile Suite) =====
  const mobileTabbar = $('mobile-tabbar');
  const rosterEl = $('roster');
  const drawerBackdrop = $('drawer-backdrop');
  const mobileMenuBtn = $('mobile-menu-btn');

  function openMobileDrawer() {
    if (rosterEl) rosterEl.classList.add('mobile-open');
    if (drawerBackdrop) drawerBackdrop.classList.remove('hidden');
    setActiveMobileTab('workspaces');
  }

  function closeMobileDrawer() {
    if (rosterEl) rosterEl.classList.remove('mobile-open');
    if (drawerBackdrop) drawerBackdrop.classList.add('hidden');
    setActiveMobileTab('terminal');
  }

  function toggleMobileDrawer() {
    if (rosterEl && rosterEl.classList.contains('mobile-open')) {
      closeMobileDrawer();
    } else {
      openMobileDrawer();
    }
  }

  function setActiveMobileTab(tabName) {
    if (!mobileTabbar) return;
    for (const b of mobileTabbar.querySelectorAll('.mtab-btn')) {
      b.classList.toggle('active', b.dataset.tab === tabName);
    }
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.onclick = (e) => {
      e.stopPropagation();
      toggleMobileDrawer();
    };
  }

  if (drawerBackdrop) {
    drawerBackdrop.onclick = () => closeMobileDrawer();
  }

  if (mobileTabbar) {
    mobileTabbar.onclick = (e) => {
      const btn = e.target.closest('.mtab-btn');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (tab === 'workspaces') {
        toggleMobileDrawer();
      } else {
        closeMobileDrawer();
        setActiveMobileTab(tab);
        if (tab === 'terminal') {
          if (state.focus) focusPane(state.focus);
          else if ($('cmd')) $('cmd').focus();
        } else if (tab === 'swarm') {
          const pids = [...state.panes.keys()];
          if (pids.length > 0) {
            const idx = pids.indexOf(state.focus);
            const nextId = pids[(idx + 1) % pids.length];
            focusPane(nextId);
            railShow(`Swarm: focused #${nextId} (${state.agents.get(nextId)?.name || 'agent'})`, 'neutral');
          } else {
            railShow('Swarm: 0 active agents running', 'neutral');
          }
        } else if (tab === 'settings') {
          openSettings();
        }
      }
    };
  }

  window.__sentra = { killFocused, spawnUi, focusPane, state, sendHandoff, openHandoff, openMobileDrawer, closeMobileDrawer };
}

main().catch((e) => {
  document.body.innerHTML = `<div class="boot-error"><h1>Sentra can't reach the daemon</h1><p>start it with <code>sentra serve</code>, then reload</p><code>${String(e)}</code></div>`;
});
