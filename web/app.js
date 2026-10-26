/* sentra web UI: xterm panes + roster + SSE live feed. Vanilla JS, no deps. */
"use strict";

const panesEl = document.getElementById("panes");
const agentsEl = document.getElementById("agents");
const chipsEl = document.getElementById("chips");
const cmdEl = document.getElementById("cmd");
const connDot = document.getElementById("conn");
const connLabel = document.getElementById("connlabel");

const agents = new Map();      // id -> {name, argv, alive, el, statusEl}
const panes = new Map();       // id -> {term, fit, el}
let selected = null;

async function api(cmd, extra = {}) {
  const r = await fetch("/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, ...extra }),
  });
  return r.json();
}

function termFor(id) {
  if (panes.has(id)) return panes.get(id);
  const pane = document.createElement("div");
  pane.className = "pane";
  pane.innerHTML = `<div class="pbar"><b>#${id}</b><span class="ptitle"></span><button class="kill" title="kill">kill</button></div><div class="term"></div>`;
  panesEl.appendChild(pane);
  const term = new Terminal({
    convertEol: false,
    fontFamily: '"JetBrains Mono","Fira Code",monospace',
    fontSize: 13,
    theme: { background: "#1a1a1a", foreground: "#f2f2f2", cursor: "#ffffff" },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(pane.querySelector(".term"));
  panes.set(id, { term, fit, el: pane });
  pane.querySelector(".kill").onclick = async () => { await api("kill", { id: String(id) }); };
  pane.onclick = () => select(id);
  requestAnimationFrame(() => { try { fit.fit(); } catch {} });
  return panes.get(id);
}

function select(id) {
  selected = id;
  for (const [pid, p] of panes) p.el.classList.toggle("sel", pid === id);
  for (const [aid, a] of agents) a.el.classList.toggle("sel", aid === id);
}

function relayout() {
  panesEl.className = panes.size > 1 ? "cols2" : "cols1";
  for (const p of panes.values()) requestAnimationFrame(() => { try { p.fit.fit(); } catch {} });
}

function renderRoster() {
  agentsEl.innerHTML = "";
  for (const [id, a] of [...agents.entries()].sort((x, y) => x[0] - y[0])) {
    const row = document.createElement("div");
    row.className = "agent" + (id === selected ? " sel" : "");
    row.innerHTML = `<span class="st ${a.alive ? "live" : ""}"></span><span class="nm">${a.name}</span><span class="ar" title="${a.argv}">${a.argv}</span>`;
    row.onclick = () => { select(id); openPane(id); };
    agentsEl.appendChild(row);
    a.el = row;
  }
}

async function openPane(id) {
  termFor(id);
  select(id);
  relayout();
  const r = await api("read", { id: String(id), tail: 8000 });
  if (r.ok && r.chunk) panes.get(id).term.write(r.chunk);
  if (r.ok && !panes.get(id).resized) {
    panes.get(id).resized = true;
    const { cols, rows } = panes.get(id).fit.proposeDimensions();
    await api("resize", { id: String(id), cols, rows });
  }
}

async function refreshList() {
  const r = await api("list");
  if (!r.ok) return;
  for (const a of r.agents) {
    const prev = agents.get(a.id);
    agents.set(a.id, { ...a, el: prev?.el });
    if (prev && prev.alive && !a.alive) {
      const p = panes.get(a.id);
      if (p) p.term.writeln("\r\n\x1b[90m── exit ──\x1b[0m");
    }
  }
  renderRoster();
  if (!chipsEl.childElementCount) {
    for (const preset of ["hermes", "omp", "claude", "codex", "bash"]) {
      const b = document.createElement("button");
      b.className = "chip"; b.textContent = preset;
      b.onclick = () => spawnPreset(preset);
      chipsEl.appendChild(b);
    }
  }
}

async function spawnPreset(preset) {
  const r = await api("spawn", { preset });
  if (r.ok) await activate(r.id, r.name);
}

async function spawnArgv(arg) {
  const parts = arg.trim().split(/\s+/);
  const r = await api("spawn", { argv: parts });
  if (r.ok) await activate(r.id, r.name);
  else alert(r.err);
}

async function activate(id, name) {
  await refreshList();
  await openPane(id);
  const p = panes.get(id);
  const t = p.el.querySelector(".ptitle");
  if (t) t.textContent = name;
  p.term.focus();
}

document.getElementById("spawn").onclick = () => {
  const v = cmdEl.value.trim();
  if (!v) return;
  cmdEl.value = "";
  spawnArgv(v);
};
cmdEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("spawn").onclick();
});

window.addEventListener("resize", relayout);

// ---- SSE live feed ----
function connect() {
  const es = new EventSource("/events");
  es.onopen = () => { connDot.classList.add("on"); connLabel.textContent = "live"; };
  es.onerror = () => {
    connDot.classList.remove("on");
    connLabel.textContent = "reconnecting…";
  };
  es.onmessage = async (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch { return; }
    if (ev.evt === "out" && panes.has(ev.id)) panes.get(ev.id).term.write(ev.chunk);
    if (ev.evt === "exit") {
      const a = agents.get(ev.id);
      if (a) { a.alive = false; renderRoster(); }
    }
  };
}

connect();
refreshList();
