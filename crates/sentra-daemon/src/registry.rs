use std::collections::VecDeque;
use std::io::Read;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde_json::json;

const RING_CAP: usize = 262_144;

pub struct Agent {
    pub id: u32,
    pub name: String,
    pub argv: Vec<String>,
    pub cwd: Option<String>,
    pub pid: u32,
    pub alive: AtomicBool,
    pub killed: AtomicBool,
    pub exit_code: Mutex<Option<i32>>,
    pub last_output: Mutex<Option<Instant>>,
    pub ring: Mutex<VecDeque<u8>>,
    pub subs: Mutex<Vec<(bool, Sender<serde_json::Value>)>>,
    pub master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    pub writer: Mutex<Option<Box<dyn std::io::Write + Send>>>,
    pub child: Mutex<Option<Box<dyn portable_pty::Child + Send>>>,
}

use std::sync::atomic::AtomicBool;

pub static REGISTRY: Mutex<Vec<Arc<Agent>>> = Mutex::new(Vec::new());
/// Watchers subscribed to the global feed receive events for every agent,
/// including ones spawned after they subscribed.
pub static GLOBAL_SUBS: Mutex<Vec<Sender<serde_json::Value>>> = Mutex::new(Vec::new());

pub fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn next_id(reg: &[Arc<Agent>]) -> u32 {
    reg.iter().map(|a| a.id).max().unwrap_or(0) + 1
}

pub fn unique_name(reg: &[Arc<Agent>], base: &str) -> String {
    let mut name = base.to_string();
    let mut n = 2;
    while reg.iter().any(|a| a.name == name) {
        name = format!("{base}-{n}");
        n += 1;
    }
    name
}

pub fn spawn(
    name: Option<&str>,
    argv: Vec<String>,
    cwd: Option<String>,
) -> Result<Arc<Agent>, String> {
    if argv.is_empty() {
        return Err("spawn: no argv".into());
    }
    let pty = native_pty_system()
        .openpty(PtySize { rows: 30, cols: 120, ..Default::default() })
        .map_err(|e| format!("openpty: {e}"))?;
    let mut cmd = CommandBuilder::new(&argv[0]);
    cmd.args(&argv[1..]);
    let cwd = cwd.or_else(|| std::env::var("HOME").ok());
    if let Some(c) = &cwd {
        cmd.cwd(c);
    }
    let child = pty.slave.spawn_command(cmd).map_err(|e| format!("spawn: {e}"))?;
    drop(pty.slave);
    let pid = child.process_id().unwrap_or(0);
    let reader = pty.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pty.master.take_writer().map_err(|e| e.to_string())?;

    let name0 = argv[0].clone();
    let reg = lock(&REGISTRY);
    let id = next_id(&reg);
    let aname = unique_name(&reg, name.unwrap_or(name0.as_str()));
    drop(reg);
    let agent = Arc::new(Agent {
        id,
        name: aname,
        argv,
        cwd,
        pid,
        alive: AtomicBool::new(true),
        killed: AtomicBool::new(false),
        exit_code: Mutex::new(None),
        last_output: Mutex::new(None),
        ring: Mutex::new(VecDeque::with_capacity(8192)),
        subs: Mutex::new(Vec::new()),
        master: Mutex::new(Some(pty.master)),
        writer: Mutex::new(Some(writer)),
        child: Mutex::new(Some(child)),
    });
    lock(&REGISTRY).push(agent.clone());
    let agent2 = agent.clone();
    std::thread::Builder::new()
        .name(format!("agent-{}", agent.id))
        .spawn(move || reader_loop(agent2, reader))
        .map_err(|e| e.to_string())?;
    Ok(agent)
}

pub fn resolve(id_or_name: &str) -> Option<Arc<Agent>> {
    let reg = lock(&REGISTRY);
    if let Ok(id) = id_or_name.parse::<u32>()
        && let Some(a) = reg.iter().find(|a| a.id == id) {
            return Some(a.clone());
        }
    reg.iter().find(|a| a.name == id_or_name).cloned()
}

fn fanout(agent: &Agent, evt: serde_json::Value) {
    lock(&agent.subs).retain(|(_, tx)| tx.send(evt.clone()).is_ok());
    lock(&GLOBAL_SUBS).retain(|tx| tx.send(evt.clone()).is_ok());
}

fn push_output(agent: &Agent, bytes: &[u8]) {
    let dropped = {
        let mut ring = lock(&agent.ring);
        ring.extend(bytes.iter().copied());
        let mut dropped = 0usize;
        while ring.len() > RING_CAP {
            ring.pop_front();
            dropped += 1;
        }
        u64::try_from(dropped).unwrap_or(u64::MAX)
    };
    if dropped > 0 {
        fanout(agent, json!({"evt":"dropped","id":agent.id,"bytes":dropped}));
    }
    fanout(agent, json!({"evt":"out","id":agent.id,"chunk":String::from_utf8_lossy(bytes)}));
}

fn reader_loop(agent: Arc<Agent>, mut reader: Box<dyn Read + Send>) {
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                *lock(&agent.last_output) = Some(Instant::now());
                push_output(&agent, &buf[..n]);
            }
            Err(_) => break,
        }
    }
    // EOF on the master side doesn't guarantee the child reaped; take the child and wait.
    let code = lock(&agent.child)
        .take()
        .and_then(|mut c| c.wait().ok())
        .map(|s| s.exit_code() as i32);
    agent.alive.store(false, std::sync::atomic::Ordering::SeqCst);
    let code = {
        let mut ec = lock(&agent.exit_code);
        if ec.is_none() {
            *ec = code;
        }
        ec.unwrap_or(-1)
    };
    lock(&agent.master).take(); // drop master so daemon can free fds
    fanout(&agent, json!({"evt":"exit","id":agent.id,"code":code}));
}
