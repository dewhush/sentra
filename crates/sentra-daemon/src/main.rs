fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("serve") => {
            let with_ui = args.iter().any(|a| a == "--with-ui");
            if with_ui {
                serve_with_ui();
            }
            if let Err(e) = sentra_daemon::serve() {
                eprintln!("sentra: {e}");
                std::process::exit(1);
            }
        }
        _ => std::process::exit(sentra_cli::run(args)),
    }
}

/// `sentra serve --with-ui`: spawn the UI child (no-op if missing or already up).
fn serve_with_ui() {
    let ui = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("sentra-ui")))
        .filter(|p| p.exists());
    let Some(ui) = ui else {
        eprintln!("sentra: --with-ui: sentra-ui binary not found next to `sentra`");
        return;
    };
    // UI connects asynchronously; if another daemon already owns the socket the
    // bind below errors out and this child gets killed as our child process.
    let _ = std::process::Command::new(ui)
        .env("DISPLAY", std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into()))
        .spawn();
}
