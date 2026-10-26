//! Lessons: plain-markdown memory keyed by profile name (or preset name).
//! Files live in ~/.config/sentra/lessons/<key>.md. Injected into spawned
//! agents' first prompt (capped). CLI: `sentra lessons <key> [text…]` appends,
//! `sentra lessons <key> --show` dumps, `--clear` wipes.

use std::fs;
use std::path::PathBuf;

pub fn dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(|h| PathBuf::from(h).join(".config/sentra/lessons"))
}

fn path_for(key: &str) -> Option<PathBuf> {
    // trust boundary: key comes from the wire; keep it a plain filename
    let safe: String = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if safe.is_empty() {
        return None;
    }
    dir().map(|d| d.join(format!("{safe}.md")))
}

/// Max bytes of lessons injected into a spawn preamble.
const INJECT_CAP: usize = 8192;

pub fn load(key: &str) -> String {
    match path_for(key).and_then(|p| fs::read_to_string(p).ok()) {
        Some(mut t) => {
            if t.len() > INJECT_CAP {
                // keep the tail (most recent lessons)
                let cut = t.len() - INJECT_CAP;
                let boundary = t[cut..].find('\n').map(|i| cut + i + 1).unwrap_or(cut);
                t = t[boundary..].to_string();
            }
            t
        }
        None => String::new(),
    }
}

pub fn append(key: &str, text: &str) -> Result<(), String> {
    let p = path_for(key).ok_or_else(|| "bad lessons key".to_string())?;
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| format!("mkdir: {e}"))?;
    }
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&p)
        .map_err(|e| format!("open: {e}"))?;
    let stamp = chrono_stamp();
    writeln!(f, "\n## {stamp}\n{text}\n").map_err(|e| format!("write: {e}"))
}

pub fn clear(key: &str) -> Result<(), String> {
    match path_for(key) {
        Some(p) => fs::remove_file(p).map_err(|e| format!("remove: {e}")),
        None => Err("bad lessons key".into()),
    }
}

fn chrono_stamp() -> String {
    // ponytail: wall-clock UTC stamp without a time crate; upgrade: `jiff`
    std::process::Command::new("date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string()))
        .unwrap_or_default()
}
