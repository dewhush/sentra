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

#[derive(Deserialize)]
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

pub fn serve() -> Result<(), String> {
    // optional TCP peer: SENTRA_TCP=host:port (e.g. 0.0.0.0:7621 or a tailscale IP).
    // Same JSONL protocol + static web UI + SSE feed on the same port.
    if let Ok(addr) = std::env::var("SENTRA_TCP") {
        std::thread::Builder::new()
            .name("tcp".into())
            .spawn(move || {
                if let Err(e) = serve_tcp(&addr) {
                    eprintln!("sentra: tcp {addr}: {e}");
                }
            })
            .map_err(|e| format!("spawn tcp thread: {e}"))?;
    }
    serve_unix()
}

fn serve_tcp(addr: &str) -> Result<(), String> {
    use std::net::TcpListener;
    let listener = TcpListener::bind(addr).map_err(|e| format!("bind {addr}: {e}"))?;
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
    Ok(())
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
        ("GET", "/xterm.css") => http_static(s, "vendor/xterm.css"),
        ("GET", "/addon-fit.js") => http_static(s, "vendor/addon-fit.js"),
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
    std::env::var("SENTRA_WEB").map(Into::into).unwrap_or_else(|_| "crates/sentra-ui/dist".into())
}

fn http_static(mut s: std::net::TcpStream, rel: &str) -> Result<(), String> {
    let p = web_dist().join(rel);
    let body = std::fs::read(&p).map_err(|e| format!("read {p:?}: {e}"))?;
    let ct = match p.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "application/javascript",
        Some("css") => "text/css",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        _ => "application/octet-stream",
    };
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {ct}\r\nContent-Length: {}\r\n\r\n",
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
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("chmod {dir:?}: {e}"))?;
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
        "ping" => json!({"ok": true}),
        c => json!({"ok": false, "err": format!("unknown cmd {c:?}")}),
    }
}

fn list() -> Value {
    let reg = registry::lock(&registry::REGISTRY);
    let agents: Vec<Value> = reg
        .iter()
        .map(|a| {
            let (alive, exit_code) = status(a);
            json!({
                "id": a.id,
                "name": a.name,
                "argv": a.argv,
                "cwd": a.cwd,
                "pid": a.pid,
                "alive": alive,
                "exit_code": exit_code,
                "last_output_age_ms": registry_last_output_ms(a).unwrap_or(u64::MAX),
            })
        })
        .collect();
    json!({"ok": true, "agents": agents})
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
fn json_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn spawn(req: &Req) -> Value {
    let argv: Vec<String> = if let Some(p) = &req.preset {
        match presets().get(p) {
            Some(Value::Array(a)) if !a.is_empty() => a.iter().map(json_str).collect(),
            _ => return json!({"ok": false, "err": format!("preset {p:?} not found")}),
        }
    } else if let Some(a) = &req.argv {
        a.clone()
    } else {
        return json!({"ok": false, "err": "spawn: need preset or argv"});
    };
    let cwd = req.cwd.clone();
    match registry::spawn(req.name.as_deref(), argv, cwd) {
        Ok(a) => json!({"ok": true, "id": a.id, "name": a.name, "pid": a.pid}),
        Err(e) => json!({"ok": false, "err": e}),
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
        Ok(()) => json!({"ok": true, "id": a.id, "bytes": text.len()}),
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
                let last = *crate::registry::lock(&a.last_output);
                if let Some(t) = last
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
    let rc = unsafe { libc::kill(a.pid as libc::pid_t, libc::SIGKILL) };
    if rc != 0 {
        return json!({"ok": false, "err": format!("kill {}: {}", a.pid, std::io::Error::last_os_error())});
    }
    a.killed.store(true, std::sync::atomic::Ordering::SeqCst);
    *crate::registry::lock(&a.exit_code) = Some(-9);
    json!({"ok": true, "id": a.id})
}

