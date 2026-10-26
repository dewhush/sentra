// sentra-ui: Tauri 2 shell. Two sockets: RPC conn (request/response) and a
// watch conn whose pump thread pushes every daemon line to the webview as
// event `sentra-line`. `connect` dials both; `send_line` writes to the RPC conn.
use sentra_cli::socket_path;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::sync::{LazyLock, Mutex};
use tauri::Emitter;

struct Conns {
    rpc: Mutex<Option<UnixStream>>,
}

static CONNS: LazyLock<Conns> = LazyLock::new(|| Conns {
    rpc: Mutex::new(None),
});

fn dial() -> Result<UnixStream, String> {
    UnixStream::connect(socket_path()).map_err(|e| {
        format!(
            "connect {}: {e} (daemon not running? start it with `sentra serve`)",
            socket_path().display()
        )
    })
}

#[tauri::command]
fn connect(app: tauri::AppHandle) -> Result<String, String> {
    {
        let g = CONNS.rpc.lock().map_err(|e| e.to_string())?;
        if g.is_some() {
            return Ok("already".into()); // idempotent across webview reloads
        }
    }
    // watch conn: dedicated; subscribe to the global feed right away, then
    // push every daemon line (ack + out/exit events) to the webview
    let watch = dial()?;
    let mut w = watch.try_clone().map_err(|e| format!("dup: {e}"))?;
    let _ = w.write_all(b"{\"cmd\":\"watch\",\"global\":true}\n");
    let _ = w.flush();
    let app2 = app.clone();
    std::thread::spawn(move || {
        let mut r = BufReader::new(watch);
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
    // rpc conn for req/res
    let rpc = dial()?;
    let rpc_holder = rpc.try_clone().map_err(|e| format!("dup: {e}"))?;
    // rpc conn: responses come back on the same socket, so pump them into
    // the webview too; onLine correlates via `_req`.
    let app3 = app.clone();
    std::thread::spawn(move || {
        let mut r = BufReader::new(rpc);
        let mut line = String::new();
        loop {
            line.clear();
            match r.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if app3.emit("sentra-line", line.trim_end()).is_err() {
                        break;
                    }
                }
            }
        }
    });
    *CONNS.rpc.lock().map_err(|e| e.to_string())? = Some(rpc_holder);
    Ok("ok".into())
}

#[tauri::command]
fn send_line(line: String) -> Result<(), String> {
    let mut g = CONNS.rpc.lock().map_err(|e| e.to_string())?;
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
