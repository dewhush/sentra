use std::fs;
use std::path::PathBuf;

use serde_json::{Map, Value};

fn parse(s: &str) -> Option<Value> {
    serde_json::from_str(s).ok()
}

pub fn presets() -> Map<String, Value> {
    let mut m = Map::new();
    for (name, argv) in [
        ("hermes", r#"["hermes"]"#),
        ("omp", r#"["omp"]"#),
        ("claude", r#"["claude"]"#),
        ("codex", r#"["codex"]"#),
        ("bash", r#"["bash","--noprofile","--norc"]"#),
    ] {
        if let Some(v) = parse(argv) {
            m.insert(name.to_string(), v);
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let p = PathBuf::from(home).join(".config/sentra/presets.json");
        if let Ok(Value::Object(over)) = fs::read_to_string(p)
            .map_err(drop)
            .and_then(|t| serde_json::from_str(&t).map_err(drop))
        {
            for (k, v) in over {
                m.insert(k, v);
            }
        }
    }
    m
}
