//! Profiles: named agent personas over presets.
//! `~/.config/sentra/profiles.json` overrides bundled defaults per key (file wins).

use serde_json::{Map, Value};

fn parse(s: &str) -> Option<Value> {
    serde_json::from_str(s).ok()
}

pub fn profiles() -> Map<String, Value> {
    let mut m = Map::new();
    for (name, p) in [
        (
            "omp-fs",
            r#"{"preset":"omp","role":"Fullstack Engineer"}"#,
        ),
        (
            "claude-ux",
            r#"{"preset":"claude","role":"UI/UX Designer"}"#,
        ),
        ("hermes-help", r#"{"preset":"hermes","role":"Helper of OMP"}"#),
        ("codex-sec", r#"{"preset":"codex","role":"Helper of OMP"}"#),
    ] {
        if let Some(v) = parse(p) {
            m.insert(name.to_string(), v);
        }
    }
    let path = std::env::var("HOME").ok().map(|h| {
        std::path::PathBuf::from(h).join(".config/sentra/profiles.json")
    });
    if let Some(p) = path
        && let Ok(t) = std::fs::read_to_string(p)
        && let Ok(Value::Object(over)) = serde_json::from_str::<Value>(&t)
    {
        for (k, v) in over {
            m.insert(k, v);
        }
    }
    m
}
