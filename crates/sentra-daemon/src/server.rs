use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};

use crate::presets::presets;
use crate::registry::{self, Agent};

const RING_CAP: u32 = 262_144;

#[derive(Deserialize, Clone)]
struct Req {
    cmd: String,
    id: Option<String>,
    name: Option<String>,
    preset: Option<String>,
    argv: Option<Vec<String>>,
    cwd: Option<String>,
    text: Option<String>,
    enter: Option<bool>,
    cols: Option<u16>,
    rows: Option<u16>,
    #[serde(default = "default_tail")]
    tail: u32,
    profile: Option<String>,
    fallback: Option<String>,
    limit: Option<u32>,
    key: Option<String>,
    query: Option<String>,
    idle_ms: Option<u64>,
    exit: Option<bool>,
    timeout_ms: Option<u64>,
    global: Option<bool>,
    #[serde(rename = "_req")]
    req_id: Option<u64>,
}

fn default_tail() -> u32 {
    8000
}

pub static DAEMON_URL: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

pub fn serve() -> Result<(), String> {
    // Default TCP peer: SENTRA_TCP or 127.0.0.1:7621.
    // Static web UI + SSE feed on the same port.
    let tcp_addr = std::env::var("SENTRA_TCP").unwrap_or_else(|_| "127.0.0.1:7621".into());
    let bound_url = match std::net::TcpListener::bind(&tcp_addr) {
        Ok(listener) => {
            let actual_addr = listener
                .local_addr()
                .map(|a| a.to_string())
                .unwrap_or_else(|_| tcp_addr.clone());
            let url = format!("http://{actual_addr}");
            *DAEMON_URL.lock().unwrap() = Some(url.clone());
            std::thread::Builder::new()
                .name("tcp".into())
                .spawn(move || {
                    for stream in listener.incoming() {
                        match stream {
                            Ok(s) => {
                                let _ = s.set_nodelay(true);
                                let _ = std::thread::Builder::new().name("tcpconn".into()).spawn(move || {
                                    if let Err(e) = tcp_conn(s) {
                                        eprintln!("sentra: tcpconn: {e}");
                                    }
                                });
                            }
                            Err(e) => eprintln!("sentra: tcp accept: {e}"),
                        }
                    }
                })
                .map_err(|e| format!("spawn tcp thread: {e}"))?;
            Some(url)
        }
        Err(e) => {
            // one daemon per web port: a second launch must not fall through to
            // "unix socket only" and hijack the socket from the running daemon
            eprintln!("sentra: tcp {tcp_addr}: {e} (another daemon is already running)");
            return Err(format!("tcp {tcp_addr} in use — sentra daemon already running"));
        }
    };

    let sock = socket_path()?;
    eprintln!("● sentra daemon running");
    eprintln!("  → IPC socket : {}", sock.display());
    if let Some(ref url) = bound_url {
        eprintln!("  → Web UI URL : {url}");
    }
    serve_unix()
}


// ---------- mini HTTP: static web UI + /api (JSON POST proxy) + /events (SSE) ----------

fn http_conn(mut s: std::net::TcpStream) -> Result<(), String> {
    let mut r = BufReader::new(s.try_clone().map_err(|e| e.to_string())?);
    let mut rl = String::new();
    r.read_line(&mut rl).map_err(|e| e.to_string())?;
    let mut parts = rl.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("/").to_string();
    // headers (we only care about content-length)
    let mut len = 0usize;
    loop {
        let mut h = String::new();
        r.read_line(&mut h).map_err(|e| e.to_string())?;
        let t = h.trim();
        if t.is_empty() { break; }
        if let Some(v) = t.to_ascii_lowercase().strip_prefix("content-length:") {
            len = v.trim().parse().unwrap_or(0);
        }
    }
    let path = path.split('?').next().unwrap_or("/").to_string();
    match (method.as_str(), path.as_str()) {
        ("GET", "/") | ("GET", "/index.html") => http_static(s, "index.html"),
        ("GET", "/app.js") => http_static(s, "app.js"),
        ("GET", "/style.css") => http_static(s, "style.css"),
        ("GET", "/logo.svg") => http_static(s, "logo.svg"),
        ("GET", "/xterm.js") => http_static(s, "vendor/xterm.js"),
        ("GET", "/font-archivo.woff2") => http_static(s, "fonts/Archivo.woff2"),
        ("GET", "/font-inter.woff2") => http_static(s, "fonts/Inter.woff2"),
        ("GET", "/font-mono.woff2") => http_static(s, "fonts/GeistMono.woff2"),
        ("GET", "/xterm.css") => http_static(s, "vendor/xterm.css"),
        ("GET", p) if p.starts_with("/vendor/") => http_static(s, &p[1..]),
        ("GET", p) if p.starts_with("/fonts/") => http_static(s, &p[1..]),
        ("GET", p) if p.starts_with("/icons/") => http_static(s, &p[1..]),
        ("GET", "/events") => sse_conn(s),
        ("POST", "/api") => {
            let mut body = vec![0u8; len];
            r.read_exact(&mut body).map_err(|e| e.to_string())?;
            let req: Req = serde_json::from_slice(&body)
                .map_err(|e| format!("bad json: {e}"))?;
            let resp = dispatch(&req);
            let payload = resp.to_string();
            let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: ";
            let mut out = format!("{head}{}\r\n\r\n", payload.len());
            out.push_str(&payload);
            s.write_all(out.as_bytes()).map_err(|e| e.to_string())
        }
        _ => {
            let b = "not found";
            let out = format!("HTTP/1.1 404 Not Found\r\nContent-Length: {}\r\n\r\n{b}", b.len());
            s.write_all(out.as_bytes()).map_err(|e| e.to_string())
        }
    }
}

fn web_dist() -> std::path::PathBuf {
    if let Ok(w) = std::env::var("SENTRA_WEB") {
        return w.into();
    }
    // cwd-relative default only works when launched from the repo; fall back to
    // the dist shipped next to the binary so `sentra serve` works from anywhere.
    let rel = std::path::Path::new("crates/sentra-ui/dist");
    if rel.is_dir() {
        return rel.into();
    }
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().and_then(|d| d.parent()).map(|d| d.join("share/sentra/dist")))
        .filter(|p| p.is_dir())
        // ponytail: XDG data dir assumed at $HOME/.local/share; add env override when packaging
        .or_else(|| std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".local/share/sentra/dist")).filter(|p| p.is_dir()))
        .unwrap_or_else(|| rel.into())
}

fn http_static(mut s: std::net::TcpStream, rel: &str) -> Result<(), String> {
    let p = web_dist().join(rel);
    let body = std::fs::read(&p).map_err(|e| format!("read {p:?}: {e}"))?;
    let ct = match p.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "application/javascript",
        Some("css") => "text/css",
        Some("svg") => "image/svg+xml",
        Some("woff2") => "font/woff2",
        Some("png") => "image/png",
        _ => "application/octet-stream",
    };
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {ct}\r\nCache-Control: no-store, must-revalidate\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );
    s.write_all(head.as_bytes()).and_then(|_| s.write_all(&body)).map_err(|e| e.to_string())
}

/// SSE: subscribe the global feed, stream events until the client disconnects.
fn sse_conn(mut s: std::net::TcpStream) -> Result<(), String> {
    use std::sync::mpsc;
    s.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\n\r\n").map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel::<Value>();
    {
        let mut subs = registry::lock(&registry::GLOBAL_SUBS);
        subs.push(tx);
    }
    let _ = s.write_all(b"data: {\"evt\":\"hello\"}\n\n");
    for evt in rx {
        if s.write_all(format!("data: {evt}\n\n").as_bytes()).is_err() {
            break;
        }
    }
    Ok(())
}

/// TCP comes from two kinds of clients: browsers (HTTP/SSE) and API clients
/// (JSONL). Peek the first bytes to pick the handler.
fn tcp_conn(s: std::net::TcpStream) -> Result<(), String> {
    let mut peek = [0u8; 4];
    let n = s.peek(&mut peek).map_err(|e| e.to_string())?;
    let p = &peek[..n];
    if p.starts_with(b"GET") || p.starts_with(b"POST") || p.starts_with(b"OPTI") || p.starts_with(b"HEAD") {
        http_conn(s)
    } else {
        handle_conn(s)
    }
}

fn serve_unix() -> Result<(), String> {
    let path = socket_path()?;
    // never steal a socket a live daemon is already serving
    if std::os::unix::net::UnixStream::connect(&path).is_ok() {
        return Err(format!("daemon already running on {}", path.display()));
    }
    if let Some(dir) = path.parent() {
        let existed = dir.exists();
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
        // only lockdown dirs WE created; never chmod a preexisting parent
        // like /tmp (fixes "chmod /tmp: Operation not permitted")
        if !existed {
            std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("chmod {dir:?}: {e}"))?;
        }
    }
    let _ = std::fs::remove_file(&path);
    let listener = UnixListener::bind(&path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AddrInUse {
            "daemon already running".to_string()
        } else {
            format!("bind {path:?}: {e}")
        }
    })?;
    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let _ = std::thread::Builder::new().name("conn".into()).spawn(move || {
                    if let Err(e) = handle_conn(s) {
                        eprintln!("sentra: conn: {e}");
                    }
                });
            }
            Err(e) => eprintln!("sentra: accept: {e}"),
        }
    }
    Ok(())
}

fn socket_path() -> Result<std::path::PathBuf, String> {
    if let Ok(p) = std::env::var("SENTRA_SOCKET") {
        return Ok(p.into());
    }
    let dir = match std::env::var("XDG_RUNTIME_DIR") {
        Ok(d) => format!("{d}/sentra"),
        Err(_) => {
            let uid = unsafe { libc::getuid() };
            format!("/tmp/sentra-{uid}")
        }
    };
    Ok(std::path::PathBuf::from(dir).join("sentra.sock"))
}


/// Streams we can duplicate for the split reader/writer design.
trait StreamClone {
    fn try_clone(&self) -> std::io::Result<Self> where Self: Sized;
}
impl StreamClone for UnixStream {
    fn try_clone(&self) -> std::io::Result<Self> {
        UnixStream::try_clone(self)
    }
}
impl StreamClone for std::net::TcpStream {
    fn try_clone(&self) -> std::io::Result<Self> {
        std::net::TcpStream::try_clone(self)
    }
}

fn handle_conn<S>(stream: S) -> Result<(), String>
where
    S: Read + Write + StreamClone + Send + 'static,
{
    // One connection multiplexes watch events and req/res RPC: a forwarder
    // thread streams watch events while the read loop keeps answering reqs.
    let dup = stream.try_clone().map_err(|e| e.to_string())?;
    let shared = std::sync::Arc::new(std::sync::Mutex::new(stream));
    let mut reader = BufReader::new(dup);
    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        let req: Req = match serde_json::from_str(line.trim()) {
            Ok(r) => r,
            Err(e) => {
                write_resp(&shared, &json!({"ok": false, "err": format!("bad request: {e}")}))?;
                continue;
            }
        };
        let mut resp = if req.cmd == "watch" {
            let (tx, rx) = mpsc::channel::<Value>();
            match subscribe(&req, tx) {
                Ok(()) => {
                    let ev = shared.clone();
                    std::thread::spawn(move || {
                        for evt in rx {
                            if write_resp(&ev, &evt).is_err() {
                                break; // client gone; Sender drop cleans up
                            }
                        }
                    });
                    json!({"ok": true})
                }
                Err(e) => json!({"ok": false, "err": e}),
            }
        } else if req.cmd == "unwatch" {
            unwatch(&req);
            json!({"ok": true})
        } else {
            dispatch(&req)
        };
        if let Some(r) = req.req_id {
            resp["_req"] = json!(r); // echo so the client can correlate
        }
        write_resp(&shared, &resp)?;
    }
}

fn write_resp<S: Write>(stream: &std::sync::Arc<std::sync::Mutex<S>>, v: &Value) -> Result<(), String> {
    let mut line = v.to_string();
    line.push('\n');
    let mut s = stream.lock().map_err(|e| e.to_string())?;
    s.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

fn subscribe(req: &Req, tx: mpsc::Sender<Value>) -> Result<(), String> {
    let global = req.global.unwrap_or(false);
    if global {
        crate::registry::lock(&crate::registry::GLOBAL_SUBS).push(tx);
        return Ok(());
    }
    let a = req
        .id
        .as_deref()
        .or(req.name.as_deref())
        .and_then(registry::resolve)
        .ok_or_else(|| err_unknown(req))?;
    crate::registry::lock(&a.subs).push((false, tx));
    Ok(())
}

fn unwatch(req: &Req) {
    let Some(a) = req.id.as_deref().or(req.name.as_deref()).and_then(registry::resolve)
    else {
        return;
    };
    crate::registry::lock(&a.subs).clear();
}

fn err_unknown(req: &Req) -> String {
    format!("agent {} not found", req.id.as_deref().or(req.name.as_deref()).unwrap_or("?"))
}

fn dispatch(req: &Req) -> Value {
    match req.cmd.as_str() {
        "list" => list(),
        "spawn" => spawn(req),
        "send" => send(req),
        "read" => read(req),
        "resize" => resize(req),
        "wait" => wait(req),
        "kill" => kill(req),
        "forget" => forget(req),
        "profiles" => json!({"ok": true, "profiles": crate::profiles::profiles()}),
        "presets" => json!({"ok": true, "presets": preset_probe()}),
        "ping" => json!({"ok": true}),
        "lessons" => lessons_cmd(req),
        "research" => research(req),
        c => json!({"ok": false, "err": format!("unknown cmd {c:?}")}),
    }
}

fn preset_probe() -> Value {
    let bins: Vec<std::path::PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    let mut out = Vec::new();
    for (name, spec) in presets() {
        let argv: Vec<String> = match &spec {
            Value::Array(a) => a.iter().map(json_str).collect(),
            _ => continue,
        };
        let bin = argv.first().map(String::as_str).unwrap_or("");
        let abs = std::path::Path::new(bin).is_absolute() && std::path::Path::new(bin).is_file();
        let found = abs || bins.iter().any(|d| d.join(bin).is_file());
        let path = if abs {
            bin.to_string()
        } else {
            bins.iter().find(|d| d.join(bin).is_file()).map(|d| d.join(bin).display().to_string()).unwrap_or_default()
        };
        out.push(json!({"name": name, "argv": argv, "found": found, "path": path, "ready": found}));
    }
    Value::Array(out)
}

fn list() -> Value {
    let reg = registry::lock(&registry::REGISTRY);
    let daemon_url = DAEMON_URL
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| "http://127.0.0.1:7621".into());
    let agents: Vec<Value> = reg
        .iter()
        .map(|a| {
            let (alive, exit_code) = status(a);
            let role = crate::registry::lock(&a.role).clone();
            json!({
                "id": a.id,
                "name": a.name,
                "argv": a.argv,
                "cwd": a.cwd,
                "pid": a.pid,
                "role": role,
                "alive": alive,
                "exit_code": exit_code,
                "last_output_age_ms": registry_last_output_ms(a).unwrap_or(u64::MAX),
                "last_input_age_ms": registry_last_input_ms(a),
                "rss_kb": agent_rss_kb(a.pid),
            })
        })
        .collect();
    json!({
        "ok": true,
        "agents": agents,
        "daemon_url": daemon_url,
        "rss_kb": daemon_rss_kb(),
        "socket": socket_path().ok().map(|p| p.display().to_string()),
        "home": std::env::var("HOME").ok(),
        "cwd": std::env::current_dir().ok().map(|p| p.display().to_string()),
    })
}

fn status(a: &Agent) -> (bool, Option<i32>) {
    (
        a.alive.load(std::sync::atomic::Ordering::SeqCst),
        *crate::registry::lock(&a.exit_code),
    )
}

fn registry_last_output_ms(a: &Agent) -> Option<u64> {
    registry::lock(&a.last_output)
        .map(|t| u64::try_from(t.elapsed().as_millis()).unwrap_or(u64::MAX))
}
fn registry_last_input_ms(a: &Agent) -> Option<u64> {
    registry::lock(&a.last_input)
        .map(|t| u64::try_from(t.elapsed().as_millis()).unwrap_or(u64::MAX))
}
fn daemon_rss_kb() -> Option<u64> {
    let s = std::fs::read_to_string("/proc/self/statm").ok()?;
    let pages: u64 = s.split_whitespace().nth(1)?.parse().ok()?;
    Some(pages * 4)
}
fn agent_rss_kb(pid: u32) -> Option<u64> {
    // statm: size resident shared text lib data dt (pages); RSS = 2nd field. 4K pages.
    let s = std::fs::read_to_string(format!("/proc/{pid}/statm")).ok()?;
    let pages: u64 = s.split_whitespace().nth(1)?.parse().ok()?;
    Some(pages * 4)
}
fn json_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn spawn(req: &Req) -> Value {
    // profile = persona wrapping a preset: role label + preamble + lessons
    let profile = req
        .profile
        .as_deref()
        .and_then(|p| crate::profiles::profiles().get(p).cloned());
    if req.profile.is_some() && profile.is_none() {
        // unknown profile → preset fallback (if it exists), else argv passthrough
        let fb = req.fallback.as_deref().or(req.profile.as_deref());
        if let Some(p) = fb
            && let Some(Value::Array(a)) = presets().get(p)
            && !a.is_empty()
        {
            return spawn_preset_named(p, req);
        }
        if let Some(a) = &req.argv {
            return spawn_argv(a.clone(), req);
        }
        return json!({"ok": false, "err": format!("profile {:?} not found", req.profile)});
    }
    let preset_of = |p: &Value| p.get("preset").and_then(Value::as_str).map(str::to_string);
    let presets = presets();
    let argv: Vec<String> = if let Some(pv) = &profile {
        match preset_of(pv).as_deref().and_then(|n| presets.get(n)) {
            Some(Value::Array(a)) if !a.is_empty() => a.iter().map(json_str).collect(),
            _ => return json!({"ok": false, "err": "profile: preset not found"}),
        }
    } else if let Some(p) = &req.preset {
        match presets.get(p) {
            Some(Value::Array(a)) if !a.is_empty() => a.iter().map(json_str).collect(),
            // A single bare token is ambiguous: it may be a preset name or a
            // command. If the caller supplied the argv fallback (the UI does),
            // spawn it instead of failing with "preset not found".
            _ => match &req.argv {
                Some(a) if !a.is_empty() => a.clone(),
                _ => return json!({"ok": false, "err": format!("preset {p:?} not found")}),
            },
        }
    } else if let Some(a) = &req.argv {
        a.clone()
    } else {
        return json!({"ok": false, "err": "spawn: need preset, profile or argv"});
    };
    let cwd = req.cwd.clone();
    // A persona spawn with no explicit name is named after the profile, so the
    // roster says which persona is running instead of only its underlying CLI.
    let auto_name = req.name.as_deref().or(req.profile.as_deref());
    let spawned = registry::spawn(auto_name, argv, cwd);
    let agent = match spawned {
        Ok(a) => a,
        Err(e) => {
            let mut subs = crate::registry::lock(&crate::registry::GLOBAL_SUBS);
            subs.retain(|tx| tx.send(json!({"evt": "error", "code": "SPAWN_FAILED", "msg": &e})).is_ok());
            return json!({"ok": false, "err": e});
        }
    };
    // stamp persona role for roster badges
    if let Some(pv) = &profile {
        *crate::registry::lock(&agent.role) =
            Some(pv.get("role").and_then(Value::as_str).unwrap_or("").to_string());
    }
    // Persona preamble + lessons are typed as the agent's first input, but
    // only after the TUI has drawn its first frame: writing before init gets
    // swallowed by the alternate-screen switch. Keep one write so the pieces
    // cannot interleave with a user keystroke.
    let mut prelude = String::new();
    if let Some(pv) = &profile {
        if let Some(preamble) = pv.get("preamble").and_then(Value::as_str)
            && !preamble.is_empty()
        {
            prelude.push_str(preamble);
            prelude.push('\n');
        }
    }
    // Lessons belong to the preset (claude, omp, …), not only to personas: a
    // plain `sentra spawn --preset omp` should inherit what previous omp runs
    // learned too. Profiles override the key so a persona keeps its own notes.
    let lessons_key = profile
        .as_ref()
        .and_then(|pv| preset_of(pv))
        .or_else(|| req.preset.clone());
    if let Some(key) = lessons_key {
        // Never type lesson text into a shell prompt: a newline in captured
        // output could execute as a command.
        if !is_shell_key(&key) {
            let lessons = crate::lessons::load(&key);
            if !lessons.trim().is_empty() {
                // One line: chat TUIs treat raw newlines as submit.
                let flat = lessons
                    .lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty())
                    .collect::<Vec<_>>()
                    .join(" · ");
                prelude.push_str(&format!("# lessons-learned (auto)\n{flat}\n"));
            }
        }
    }
    if !prelude.trim().is_empty() {
        inject_when_ready(&agent, prelude);
    }
    json!({"ok": true, "id": agent.id, "name": agent.name, "pid": agent.pid})
}

fn is_shell_key(key: &str) -> bool {
    matches!(key, "bash" | "sh" | "zsh" | "fish" | "dash" | "ksh")
}

/// Wait for the first PTY byte (max 5s), then write the prelude once. If the
/// process never speaks, inject anyway so the input is not silently dropped.
fn inject_when_ready(a: &std::sync::Arc<registry::Agent>, text: String) {
    let a = a.clone();
    let _ = std::thread::Builder::new()
        .name(format!("inject-{}", a.id))
        .spawn(move || {
            let deadline = Instant::now() + Duration::from_millis(5000);
            while Instant::now() < deadline {
                if !a.alive.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                if crate::registry::lock(&a.last_output).is_some() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            inject(&a, &text);
        });
}

/// Spawn straight from a preset name (used by profile fallback).
fn spawn_preset_named(preset: &str, req: &Req) -> Value {
    spawn(
        &Req {
            preset: Some(preset.to_string()),
            profile: None,
            fallback: None,
            ..req.clone()
        },
    )
}

/// Spawn raw argv (used by unknown-profile fallback).
fn spawn_argv(argv: Vec<String>, req: &Req) -> Value {
    spawn(
        &Req {
            profile: None,
            fallback: None,
            argv: Some(argv),
            ..req.clone()
        },
    )
}
/// Best-effort write into a fresh agent's TTY; failures don't fail the spawn.
fn inject(a: &std::sync::Arc<registry::Agent>, text: &str) {
    if let Some(mut w) = crate::registry::lock(&a.writer).take() {
        let wrote = w.write_all(text.as_bytes()).and_then(|_| w.flush()).is_ok();
        *crate::registry::lock(&a.writer) = Some(w);
        if wrote {
            *crate::registry::lock(&a.last_input) = Some(Instant::now());
        }
    }
}

fn resolved(req: &Req) -> Result<std::sync::Arc<Agent>, String> {
    registry::resolve(req.id.as_deref().or(req.name.as_deref()).unwrap_or(""))
        .ok_or_else(|| err_unknown(req))
}

fn send(req: &Req) -> Value {
    let a = match resolved(req) {
        Ok(a) => a,
        Err(e) => return json!({"ok": false, "err": e}),
    };
    if !a.alive.load(std::sync::atomic::Ordering::SeqCst) {
        return json!({"ok": false, "err": format!("agent {} not alive", a.id)});
    }
    let mut text = req.text.clone().unwrap_or_default();
    if req.enter != Some(false) {
        text.push('\r');
    }
    let mut w = match crate::registry::lock(&a.writer).take() {
        Some(w) => w,
        None => return json!({"ok": false, "err": "agent has no pty writer"}),
    };
    let r = match w.write_all(text.as_bytes()).and_then(|_| w.flush()) {
        Ok(()) => {
            // Liveness baseline: the UI compares this instant with the next
            // PTY byte to distinguish "working" from "received input, silent".
            *crate::registry::lock(&a.last_input) = Some(Instant::now());
            json!({"ok": true, "id": a.id, "bytes": text.len()})
        }
        Err(e) => json!({"ok": false, "err": format!("write: {e}")}),
    };
    *crate::registry::lock(&a.writer) = Some(w); // take_writer is once-only; put it back
    r
}

fn read(req: &Req) -> Value {
    let a = match resolved(req) {
        Ok(a) => a,
        Err(e) => return json!({"ok": false, "err": e}),
    };
    let tail = req.tail.min(RING_CAP) as usize;
    let ring = crate::registry::lock(&a.ring);
    let start = ring.len().saturating_sub(tail);
    let chunk = String::from_utf8_lossy(&ring.iter().skip(start).copied().collect::<Vec<u8>>()).into_owned();
    drop(ring);
    let (alive, _) = status(&a);
    json!({"ok": true, "id": a.id, "chunk": chunk, "alive": alive})
}

fn resize(req: &Req) -> Value {
    let a = match resolved(req) {
        Ok(a) => a,
        Err(e) => return json!({"ok": false, "err": e}),
    };
    let cols = req.cols.unwrap_or(120).clamp(10, 500);
    let rows = req.rows.unwrap_or(30).clamp(2, 300);
    let master = crate::registry::lock(&a.master);
    let Some(m) = master.as_ref() else {
        return json!({"ok": false, "err": "agent has no pty master"});
    };
    match m.resize(portable_pty::PtySize { rows, cols, ..Default::default() }) {
        Ok(()) => json!({"ok": true}),
        Err(e) => json!({"ok": false, "err": format!("resize: {e}")}),
    }
}

fn wait(req: &Req) -> Value {
    let a = match resolved(req) {
        Ok(a) => a,
        Err(e) => return json!({"ok": false, "err": e}),
    };
    let want_exit = req.exit.unwrap_or(false);
    let idle_ms = req.idle_ms.unwrap_or(4000);
    let deadline = Instant::now() + Duration::from_millis(req.timeout_ms.unwrap_or(120_000));
    loop {
        let (alive, code) = status(&a);
        if alive {
            if !want_exit {
                let last_in = *crate::registry::lock(&a.last_input);
                let last_out = *crate::registry::lock(&a.last_output);
                // A pending task means input was written after the last byte.
                // In that state "quiet for idle_ms" is not idleness, it is
                // silence: only output after the write can prove progress.
                let answered = match (last_in, last_out) {
                    (Some(i), Some(o)) => o >= i,
                    (Some(_), None) => false,
                    (None, _) => true,
                };
                if answered
                    && let Some(t) = last_out
                    && t.elapsed() >= Duration::from_millis(idle_ms) {
                        return json!({"ok": true, "idle": true});
                    }
            }
        } else {
            return json!({"ok": true, "exited": true, "code": code});
        }
        if Instant::now() >= deadline {
            return json!({"ok": false, "err": "timeout"});
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

fn kill(req: &Req) -> Value {
    let a = match resolved(req) {
        Ok(a) => a,
        Err(e) => return json!({"ok": false, "err": e}),
    };
    // stale-flag safe: attempt kill even if a reader race left alive=true; and if
    // SIGKILL fired, the process IS dying — reflect that immediately so list() can't
    // report a live pid we just killed.
    let rc = unsafe { libc::kill(a.pid as libc::pid_t, libc::SIGKILL) };
    if rc != 0 {
        let e = std::io::Error::last_os_error();
        if e.kind() != std::io::ErrorKind::NotFound {
            return json!({"ok": false, "err": format!("kill {}: {e}", a.pid)});
        } // ESRCH = already reaped; fall through to mark dead
    }
    a.alive.store(false, std::sync::atomic::Ordering::SeqCst);
    a.killed.store(true, std::sync::atomic::Ordering::SeqCst);
    *crate::registry::lock(&a.exit_code) = Some(-9);
    json!({"ok": true, "id": a.id})
}

fn forget(req: &Req) -> Value {
    let a = match resolved(req) {
        Ok(a) => a,
        Err(e) => return json!({"ok": false, "err": e}),
    };
    // Forgetting a live agent would orphan its PTY and hide it from the UI.
    // Kill is the only way out; forget only prunes dead registry records.
    if a.alive.load(std::sync::atomic::Ordering::SeqCst) {
        return json!({"ok": false, "err": format!("agent {} still alive — kill it first", a.id)});
    }
    let mut reg = crate::registry::lock(&crate::registry::REGISTRY);
    let before = reg.len();
    reg.retain(|x| x.id != a.id);
    json!({"ok": true, "forgot": a.id, "removed": before.saturating_sub(reg.len())})
}

fn lessons_cmd(req: &Req) -> Value {
    let Some(key) = req.key.as_deref().or(req.name.as_deref()).filter(|k| !k.is_empty()) else {
        return json!({"ok": false, "err": "lessons: need key (profile or agent name)"});
    };
    if req.text.as_deref() == Some("-") {
        match crate::lessons::clear(key) {
            Ok(()) => json!({"ok": true, "cleared": key}),
            Err(e) => json!({"ok": false, "err": format!("agent {key}: {e}")}),
        }
    } else if let Some(text) = req.text.as_deref().filter(|t| !t.trim().is_empty()) {
        match crate::lessons::append(key, text) {
            Ok(()) => json!({"ok": true, "key": key}),
            Err(e) => json!({"ok": false, "err": format!("agent {key}: {e}")}),
        }
    } else {
        json!({"ok": true, "key": key, "chunk": crate::lessons::load(key)})
    }
}

fn research(req: &Req) -> Value {
    let Some(q) = req.query.as_deref().filter(|q| !q.trim().is_empty()) else {
        return json!({"ok": false, "err": "research: need query"});
    };
    let limit = req.limit.unwrap_or(8).clamp(1, 30);
    let url = format!(
        "{}?q={}&format=json&language=en",
        std::env::var("SENTRA_SEARX_URL").unwrap_or_else(|_| "http://127.0.0.1:8888/search".into()),
        percent_encode(q)
    );
    let out = std::process::Command::new("curl")
        .args(["-s", "-m", "20", &url])
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| {
            if o.status.success() {
                Ok(o.stdout)
            } else {
                Err(format!("curl exit {}", o.status))
            }
        })
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).map_err(|e| e.to_string()));
    let body = match out {
        Ok(v) => v,
        Err(e) => return json!({"ok": false, "err": format!("agent -: searx: {e}")}),
    };
    let results: Vec<Value> = body
        .get("results")
        .and_then(Value::as_array)
        .map(|rs| {
            rs.iter()
                .take(limit as usize)
                .map(|r| {
                    json!({
                        "title": r.get("title").cloned().unwrap_or(Value::Null),
                        "url": r.get("url").cloned().unwrap_or(Value::Null),
                        "content": r.get("content").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    json!({"ok": true, "results": results})
}

/// Minimal %-encoding for a searxng query string value.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
