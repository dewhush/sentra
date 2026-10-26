//! sentra-cli: thin unix-socket client. Verb → JSONL wire mapping + friendly output.
use serde_json::{json, Map, Value};
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;

pub fn socket_path() -> PathBuf {
    if let Ok(p) = std::env::var("SENTRA_SOCKET")
        && !p.is_empty() {
            return PathBuf::from(p);
        }
    let dir = match std::env::var("XDG_RUNTIME_DIR") {
        Ok(d) if !d.is_empty() => PathBuf::from(d).join("sentra"),
        _ => PathBuf::from(format!("/tmp/sentra-{}", { unsafe { libc::getuid() } })),
    };
    dir.join("sentra.sock")
}

pub fn connect() -> Result<UnixStream, String> {
    UnixStream::connect(socket_path()).map_err(|e| {
        format!(
            "connect {}: {e} (daemon not running? start it with `sentra serve`)",
            socket_path().display()
        )
    })
}

/// One-shot request on a fresh connection; returns the single response line.
pub fn request(v: &Value) -> Result<Value, String> {
    let mut s = connect()?;
    req_on(&mut s, v)
}

fn req_on(s: &mut UnixStream, v: &Value) -> Result<Value, String> {
    let mut line = serde_json::to_vec(v).map_err(|e| e.to_string())?;
    line.push(b'\n');
    s.write_all(&line).map_err(|e| format!("write: {e}"))?;
    read_resp(s)
}

pub fn read_resp(s: &mut UnixStream) -> Result<Value, String> {
    let mut buf = [0u8; 1];
    let mut out = Vec::new();
    loop {
        match s.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                out.extend_from_slice(&buf[..n]);
                if out.last() == Some(&b'\n') {
                    break;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(format!("read: {e}")),
        }
    }
    if out.is_empty() {
        return Err("daemon closed connection".into());
    }
    let txt = String::from_utf8_lossy(&out);
    serde_json::from_str(txt.trim_end()).map_err(|e| format!("bad json from daemon: {e}"))
}

fn err_of(resp: &Value) -> String {
    resp.get("err")
        .and_then(Value::as_str)
        .unwrap_or("unknown error")
        .into()
}

pub fn run(args: Vec<String>) -> i32 {
    match cmd(&args) {
        Ok(()) => 0,
        Err(e) => {
            if args.iter().any(|a| a == "--json") {
                println!("{}", json!({"ok": false, "err": e}));
            } else {
                eprintln!("sentra: {e}");
            }
            1
        }
    }
}

fn cmd(args: &[String]) -> Result<(), String> {
    let json = args.iter().any(|a| a == "--json");
    let verb = args
        .first()
        .ok_or("usage: sentra <spawn|list|send|wait|read|resize|kill|presets|profiles|lessons|research> [args] [--json]")?;
    let rest: Vec<&String> = args[1..].iter().filter(|a| a.as_str() != "--json").collect();

    if verb == "presets" {
        return presets_cmd(json);
    }
    if verb == "profiles" {
        return profiles_cmd(json);
    }
    if verb == "lessons" || verb == "research" {
        return special(verb, &rest, json);
    }

    let req = match verb.as_str() {
        "spawn" => build_spawn(&rest)?,
        "list" => json!({"cmd": "list"}),
        "read" => build_1opt(&rest, "read", "tail", "8000")?,
        "wait" => build_wait(&rest)?,
        "send" => build_send(&rest)?,
        "resize" => build_resize(&rest)?,
        "kill" => build_kill(&rest)?,
        other => return Err(format!("unknown verb `{other}`")),
    };

    let resp = request(&req)?;
    if resp.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(err_of(&resp));
    }
    if json {
        println!("{resp}");
    } else {
        friendly(verb, &resp);
    }
    Ok(())
}

fn friendly(verb: &str, resp: &Value) {
    match verb {
        "spawn" => println!("spawned agent {} `{}`", resp["id"], resp["name"].as_str().unwrap_or("?")),
        "list" => {
            if let Some(agents) = resp.get("agents").and_then(Value::as_array) {
                for a in agents {
                    println!(
                        "{:>4}  {} {}  [{}]",
                        a["id"],
                        if a["alive"].as_bool() == Some(true) { "●" } else { "○" },
                        a["name"].as_str().unwrap_or("?"),
                        a["argv"]
                            .as_array()
                            .map(|x| x.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" "))
                            .unwrap_or_default()
                    );
                }
            }
        }
        "read" => print!("{}", resp["chunk"].as_str().unwrap_or("")),
        "wait" => {
            if resp.get("idle") == Some(&json!(true)) {
                println!("idle");
            } else if resp.get("exited") == Some(&json!(true)) {
                println!("exited code {}", resp["code"]);
            }
        }
        _ => {}
    }
}

fn presets_cmd(json: bool) -> Result<(), String> {
    let p = presets();
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&p).map_err(|e| e.to_string())?
        );
    } else {
        for (k, argv) in &p {
            println!("{k}: {}", preset_argv(argv).unwrap_or_default().join(" "));
        }
    }
    Ok(())
}

/// Default presets; `~/.config/sentra/presets.json` overrides per key (file wins).
pub fn presets() -> Map<String, Value> {
    let mut m = Map::new();
    for (k, v) in [
        ("hermes", json!(["hermes"])),
        ("omp", json!(["omp"])),
        ("claude", json!(["claude"])),
        ("codex", json!(["codex"])),
        ("bash", json!(["bash"])),
    ] {
        m.insert(k.into(), v);
    }
    let path = std::env::var("HOME")
        .map(|h| PathBuf::from(h).join(".config/sentra/presets.json"))
        .unwrap_or_default();
    if let Ok(txt) = std::fs::read_to_string(path)
        && let Ok(Value::Object(user)) = serde_json::from_str::<Value>(&txt) {
            for (k, v) in user {
                if v.is_array() {
                    m.insert(k, v);
                }
            }
        }
    m
}

fn preset_argv(v: &Value) -> Option<Vec<String>> {
    v.as_array().map(|a| {
        a.iter()
            .map(|x| x.as_str().map(str::to_string).unwrap_or_else(|| x.to_string()))
            .collect()
    })
}

fn target(rest: &[&String]) -> Result<String, String> {
    rest.first().map(|s| (*s).clone()).ok_or_else(|| "missing <id|name> argument".to_string())
}

fn build_spawn(rest: &[&String]) -> Result<Value, String> {
    let mut v = json!({"cmd":"spawn"});
    let mut i = 0;
    while i < rest.len() {
        match rest[i].as_str() {
            "--name" | "--cwd" | "--preset" | "--profile" => {
                let key = &rest[i][2..];
                let val = rest.get(i + 1).ok_or_else(|| format!("{} needs a value", rest[i]))?;
                v[key] = json!(val);
                i += 2;
            }
            "--" => {
                if i + 1 >= rest.len() {
                    return Err("`--` must be followed by argv".into());
                }
                v["argv"] = json!(rest[i + 1..].iter().map(|s| s.as_str()).collect::<Vec<_>>());
                break;
            }
            other => return Err(format!("unexpected spawn arg `{other}`")),
        }
    }
    if v.get("preset").is_none() && v.get("argv").is_none() && v.get("profile").is_none() {
        return Err("usage: sentra spawn [--name N] [--cwd D] (--preset P | --profile P | -- argv…)".into());
    }
    Ok(v)
}

fn build_1opt(rest: &[&String], verb: &'static str, opt: &'static str, default: &str) -> Result<Value, String> {
    let t = target(rest)?;
    let n = rest
        .iter()
        .position(|a| a.as_str() == format!("--{opt}"))
        .and_then(|i| rest.get(i + 1))
        .map(|s| s.as_str())
        .unwrap_or(default);
    n.parse::<u64>()
        .map(|n| json!({"cmd": verb, "id": t, opt: n}))
        .map_err(|_| format!("--{opt} needs a number"))
}

fn build_wait(rest: &[&String]) -> Result<Value, String> {
    let t = target(rest)?;
    let mut v = json!({"cmd":"wait","id":t,"idle_ms":4000,"timeout_ms":120000,"exit":false});
    for flag in ["--idle-ms", "--timeout-ms"] {
        if let Some(i) = rest.iter().position(|a| a.as_str() == flag) {
            let n = rest
                .get(i + 1)
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or_else(|| format!("{flag} needs a number"))?;
            let key = if flag == "--idle-ms" { "idle_ms" } else { "timeout_ms" };
            v[key] = json!(n);
        }
    }
    if rest.iter().any(|a| a.as_str() == "--exit") {
        v["exit"] = json!(true);
    }
    Ok(v)
}

fn build_send(rest: &[&String]) -> Result<Value, String> {
    let t = target(rest)?;
    let args: Vec<&String> = rest.iter().filter(|a| a.as_str() != "--no-enter").copied().collect();
    let text = args.get(1).map(|s| s.as_str()).unwrap_or("");
    let enter = !rest.iter().any(|a| a.as_str() == "--no-enter");
    Ok(json!({"cmd":"send","id":t,"text":text,"enter":enter}))
}

fn build_kill(rest: &[&String]) -> Result<Value, String> {
    let t = target(rest)?;
    Ok(json!({"cmd":"kill","id":t}))
}

fn build_resize(rest: &[&String]) -> Result<Value, String> {
    let t = target(rest)?;
    let grab = |flag: &str| -> Result<u16, String> {
        rest.iter()
            .position(|a| a.as_str() == flag)
            .and_then(|i| rest.get(i + 1))
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or_else(|| format!("usage: sentra resize <id|name> --cols N --rows N ({flag} missing/invalid)"))
    };
    Ok(json!({"cmd":"resize","id":t,"cols":grab("--cols")?,"rows":grab("--rows")?}))
}
/// `lessons` and `research` — shape-mapping too custom for build_* helpers.
fn special(verb: &str, rest: &[&String], json: bool) -> Result<(), String> {
    let mut v = json!({"cmd": verb});
    let flags: Vec<&String> = rest.iter().filter(|a| a.as_str().starts_with("--")).copied().collect();
    match verb {
        "lessons" => {
            // sentra lessons <key> [text…] | --show | --clear
            let positional: Vec<&String> = rest.iter().filter(|a| !a.as_str().starts_with("--")).copied().collect();
            let key = positional.first().ok_or("usage: sentra lessons <key> [text…] | --clear")?;
            v["key"] = json!(key);
            let text: Vec<&String> = positional.iter().skip(1).copied().collect();
            if flags.iter().any(|f| f.as_str() == "--clear") {
                v["text"] = json!("-");
            } else if !text.is_empty() {
                let joined = text.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(" ");
                v["text"] = json!(joined);
            } // else: show
        }
        "research" => {
            let positional: Vec<&String> = rest.iter().filter(|a| !a.as_str().starts_with("--")).copied().collect();
            let q = positional.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(" ");
            if q.is_empty() {
                return Err("usage: sentra research \"query\" [--limit 8]".into());
            }
            v["query"] = json!(q);
            if let Some(i) = flags.iter().position(|f| f.as_str() == "--limit")
                && let Some(n) = flags.get(i + 1).and_then(|s| s.parse::<u32>().ok()) {
                    v["limit"] = json!(n);
                }
        }
        _ => unreachable!(),
    }
    // lessons --show friendly-prints the chunk; research friendly-prints results
    let resp = request(&v)?;
    if resp.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(err_of(&resp));
    }
    if json {
        println!("{resp}");
        return Ok(());
    }
    match verb {
        "lessons" => {
            if let Some(c) = resp.get("chunk").and_then(Value::as_str) {
                print!("{c}");
            }
        }
        "research" => {
            let mut n = 0;
            for r in resp.get("results").and_then(Value::as_array).unwrap_or(&vec![]) {
                n += 1;
                println!("{} · {}\n  {}", r["title"].as_str().unwrap_or("?"), r["url"].as_str().unwrap_or(""), r["content"].as_str().unwrap_or("").chars().take(200).collect::<String>());
            }
            eprintln!("# {n} results (searxng)");
        }
        _ => {}
    }
    Ok(())
}

fn profiles_cmd(json: bool) -> Result<(), String> {
    let resp = request(&json!({"cmd": "profiles"}))?;
    if resp.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(err_of(&resp));
    }
    if json {
        println!("{}", resp.get("profiles").cloned().unwrap_or(json!({})));
        return Ok(());
    }
    if let Some(Value::Object(m)) = resp.get("profiles") {
        for (k, p) in m {
            let preset = p.get("preset").and_then(Value::as_str).unwrap_or("?");
            let role = p.get("role").and_then(Value::as_str).unwrap_or("");
            println!("{k}: [{preset}] {role}");
        }
    }
    Ok(())
}
