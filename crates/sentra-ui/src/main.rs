// sentra-ui: Tauri 2 shell. The webview talks JSONL to the daemon through a
// long-lived unix socket. Rust side owns the socket: `connect` dials, a pump
// thread pushes every daemon line to the webview as event `sentra-line`,
// `send_line` writes one request line.
use sentra_cli::socket_path;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::sync::{LazyLock, Mutex};
use tauri::Emitter;
struct Conn {
    sock: Mutex<Option<UnixStream>>,
}

static CONN: LazyLock<Conn> = LazyLock::new(|| Conn {
    sock: Mutex::new(None),
});

#[tauri::command]
fn connect(app: tauri::AppHandle) -> Result<String, String> {
    {
        let g = CONN.sock.lock().map_err(|e| e.to_string())?;
        if g.is_some() {
            return Ok("already".into()); // idempotent: UI reload must not double-pump
        }
    }
    let s = UnixStream::connect(socket_path()).map_err(|e| {
        format!(
            "connect {}: {e} (daemon not running? start it with `sentra serve`)",
            socket_path().display()
        )
    })?;
    let rd = s.try_clone().map_err(|e| format!("dup socket: {e}"))?;
    *CONN.sock.lock().map_err(|e| e.to_string())? = Some(s);
    let app2 = app.clone();
    std::thread::spawn(move || {
        let mut r = BufReader::new(rd);
        let mut line = String::new();
        loop {
            line.clear();
            match r.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if app2.emit("sentra-line", line.trim_end()).is_err() {
                        break;
                    }
                }
            }
        }
    });
    Ok("ok".into())
}

#[tauri::command]
fn send_line(line: String) -> Result<(), String> {
    let mut g = CONN.sock.lock().map_err(|e| e.to_string())?;
    let s = g.as_mut().ok_or("not connected")?;
    let mut data = line.into_bytes();
    data.push(b'\n');
    s.write_all(&data).map_err(|e| format!("write: {e}"))?;
    s.flush().map_err(|e| format!("flush: {e}"))?;
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![connect, send_line])
        .run(tauri::generate_context!())
        .expect("tauri run"); // ponytail: startup only; per-request paths return Result
}
