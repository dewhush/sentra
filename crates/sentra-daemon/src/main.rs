fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("serve") => {
            let with_ui = args.iter().any(|a| a == "--with-ui");
            if let Some(pos) = args.iter().position(|a| a == "--port" || a == "-p") {
                if let Some(port) = args.get(pos + 1) {
                    unsafe { std::env::set_var("SENTRA_TCP", format!("127.0.0.1:{port}")); }
                }
            } else if let Some(pos) = args.iter().position(|a| a == "--addr") {
                if let Some(addr) = args.get(pos + 1) {
                    unsafe { std::env::set_var("SENTRA_TCP", addr); }
                }
            }
            if with_ui {
                serve_with_ui();
                if daemon_alive() {
                    eprintln!("sentra: daemon already running — UI attached, not starting a second daemon");
                    return;
                }
            }
            if let Err(e) = sentra_daemon::serve() {
                eprintln!("sentra: {e}");
                std::process::exit(1);
            }
        }
        _ => std::process::exit(sentra_cli::run(args)),
    }
}

/// `sentra serve --with-ui`: spawn the UI child, then let `serve()` decide whether
/// this process is the daemon. A second launch only attaches the UI.
fn serve_with_ui() {
    let ui = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("sentra-ui")))
        .filter(|p| p.exists());
    let Some(ui) = ui else {
        eprintln!("sentra: --with-ui: sentra-ui binary not found next to `sentra`");
        return;
    };
    let _ = std::process::Command::new(ui)
        .env("DISPLAY", std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into()))
        .spawn();
}

/// Is a daemon already answering on the configured web port?
fn daemon_alive() -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;
    let addr = std::env::var("SENTRA_TCP").unwrap_or_else(|_| "127.0.0.1:7621".into());
    addr.to_socket_addrs()
        .ok()
        .and_then(|mut it| it.next())
        .map(|sa| TcpStream::connect_timeout(&sa, Duration::from_millis(250)).is_ok())
        .unwrap_or(false)
}
