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

/// Lessons are captured from a PTY tail, so they arrive with cursor moves,
/// colour codes and OSC title sequences. Strip them at the storage boundary:
/// a lesson file should be readable markdown, and a spawn preamble must never
/// replay screen-control bytes into a new terminal.
pub fn sanitize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\x1b' {
            match it.next() {
                Some(']') => {
                    // OSC … terminated by BEL or ST (ESC \)
                    let mut prev = '\0';
                    for n in it.by_ref() {
                        if n == '\x07' || (prev == '\x1b' && n == '\\') {
                            break;
                        }
                        prev = n;
                    }
                }
                Some('[') => {
                    // CSI … final byte in 0x40..=0x7e
                    for n in it.by_ref() {
                        if ('@'..='~').contains(&n) {
                            break;
                        }
                    }
                }
                Some('(') | Some(')') => {
                    it.next(); // charset selection: ESC ( B
                }
                Some(_) | None => {}
            }
            continue;
        }
        match c {
            '\r' | '\x08' => {} // CR / backspace: the TUI already applied them
            '\n' | '\t' => out.push(c),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    // PTY captures often end in a wall of blank lines; keep it tidy.
    while out.ends_with(['\n', ' ']) {
        out.pop();
    }
    out
}

pub fn load(key: &str) -> String {
    match path_for(key).and_then(|p| fs::read_to_string(p).ok()) {
        Some(raw) => {
            let mut t = sanitize(&raw);
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
    // Store what we are willing to inject back into a PTY: no ANSI, no CR.
    let clean = sanitize(text);
    if clean.trim().is_empty() {
        return Ok(()); // an all-control capture is not a lesson
    }
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
    writeln!(f, "\n## {stamp}\n{clean}\n").map_err(|e| format!("write: {e}"))
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

#[cfg(test)]
mod tests {
    use super::sanitize;

    #[test]
    fn strips_csi_osc_and_carriage_returns() {
        let raw = "\x1b[31mred\x1b[0m\r\n\x1b]0;title\x07kept\ttext";
        assert_eq!(sanitize(raw), "red\nkept\ttext");
    }

    #[test]
    fn drops_other_control_bytes_but_keeps_unicode() {
        assert_eq!(sanitize("a\x08b\x00c✓\n"), "abc✓");
    }
}
