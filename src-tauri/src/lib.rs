use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

/// PID del Node sidecar. Atomico per accesso lock-free dall'exit handler.
/// 0 = no PID (boot in corso o sidecar non spawnato).
static SIDECAR_PID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Handle del Child process — tenuto in static per evitarne la Drop (che
/// non killerebbe automaticamente il processo, ma chiuderebbe i pipe).
static SIDECAR_CHILD: OnceLock<Mutex<Option<std::process::Child>>> = OnceLock::new();

/// Soglia di rotation log: oltre 100MB il file corrente viene ruotato.
/// Manteniamo max 5 file storici (piggybird.log.1 → piggybird.log.5).
const LOG_ROTATE_BYTES: u64 = 100 * 1024 * 1024;
const LOG_ROTATE_KEEP: u32 = 5;

fn log_line(line: &str) {
    if let Some(p) = LOG_PATH.get() {
        // Rotation check: se il file supera la soglia, ruota prima di scrivere
        if let Ok(meta) = std::fs::metadata(p) {
            if meta.len() > LOG_ROTATE_BYTES {
                rotate_log(p);
            }
        }
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(p) {
            let _ = writeln!(f, "[{}] {}", chrono_now(), line);
        }
    }
    log::info!("{}", line);
}

/// Ruota il log corrente: piggybird.log.4 → .5, .3 → .4, ..., .log → .log.1.
/// Il più vecchio (.5) viene cancellato.
fn rotate_log(current: &PathBuf) {
    let parent = match current.parent() {
        Some(p) => p,
        None => return,
    };
    let stem = match current.file_name().and_then(|n| n.to_str()) {
        Some(s) => s,
        None => return,
    };
    // Cancella il più vecchio
    let oldest = parent.join(format!("{}.{}", stem, LOG_ROTATE_KEEP));
    let _ = std::fs::remove_file(&oldest);
    // Sposta gli altri
    for i in (1..LOG_ROTATE_KEEP).rev() {
        let src = parent.join(format!("{}.{}", stem, i));
        let dst = parent.join(format!("{}.{}", stem, i + 1));
        if src.exists() {
            let _ = std::fs::rename(&src, &dst);
        }
    }
    // .log → .log.1
    let first = parent.join(format!("{}.1", stem));
    let _ = std::fs::rename(current, &first);
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", secs)
}

/// Porta su cui spawniamo il Node sidecar interno. La WebView (splash.html)
/// punta a questa porta. Hardcoded per ora — se collide con un servizio
/// dell'utente, l'app non si avvia (errore visibile in splash).
const SIDECAR_PORT: u16 = 13371;

/// Target triple del Node binary embedded. Determinato a build-time da Cargo.
#[cfg(all(target_arch = "aarch64", target_os = "macos"))]
const NODE_BIN_NAME: &str = "node-aarch64-apple-darwin";
#[cfg(all(target_arch = "x86_64", target_os = "macos"))]
const NODE_BIN_NAME: &str = "node-x86_64-apple-darwin";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Shell plugin serve SOLO per shell:open (apri URL esterni dal
        // bottone "Scarica" del modale update). NON usiamo piu il sidecar
        // pattern di tauri-plugin-shell per spawnare Node — vedi
        // bootstrap_and_serve che usa std::process::Command + setsid().
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app_data_dir");
            fs::create_dir_all(&app_data_dir)?;
            let _ = LOG_PATH.set(app_data_dir.join("piggybird.log"));
            log_line(&format!("=== Piggybird boot v{} ===", env!("CARGO_PKG_VERSION")));
            log_line(&format!("app_data_dir: {}", app_data_dir.display()));
            let db_path = app_data_dir.join("piggybird.db");
            let database_url = format!("file:{}", db_path.to_string_lossy());

            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource_dir");
            let standalone_dir: PathBuf = resource_dir.join("standalone");
            let server_js = standalone_dir.join("server.js");
            let node_bin = resource_dir.join("binaries").join(NODE_BIN_NAME);

            log::info!("[piggybird] DATABASE_URL = {}", database_url);
            log::info!("[piggybird] standalone = {}", standalone_dir.display());
            log::info!("[piggybird] node_bin = {}", node_bin.display());

            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                if let Err(e) = bootstrap_and_serve(
                    server_js,
                    standalone_dir,
                    node_bin,
                    database_url,
                ) {
                    log_line(&format!("sidecar fatal: {}", e));
                }
            });

            let app_handle_nav = app_handle.clone();
            std::thread::spawn(move || {
                wait_and_navigate(app_handle_nav);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                kill_sidecar_now();
            }
        });
}

fn wait_and_navigate(app: AppHandle) {
    let addr = format!("127.0.0.1:{}", SIDECAR_PORT);
    let socket: std::net::SocketAddr = match addr.parse() {
        Ok(a) => a,
        Err(e) => {
            log_line(&format!("[wait-and-nav] addr parse error: {}", e));
            return;
        }
    };
    let max_attempts = 60u32;
    for attempt in 1..=max_attempts {
        if TcpStream::connect_timeout(&socket, Duration::from_millis(500)).is_ok() {
            log_line(&format!(
                "[wait-and-nav] sidecar ready dopo {} attempt, navigate WebView",
                attempt
            ));
            if let Some(window) = app.get_webview_window("main") {
                let url_str = format!("http://127.0.0.1:{}/", SIDECAR_PORT);
                match url::Url::parse(&url_str) {
                    Ok(parsed) => {
                        if let Err(e) = window.navigate(parsed) {
                            log_line(&format!("[wait-and-nav] navigate error: {}", e));
                        } else {
                            log_line("[wait-and-nav] navigated to localhost OK");
                        }
                    }
                    Err(e) => log_line(&format!("[wait-and-nav] url parse error: {}", e)),
                }
            } else {
                log_line("[wait-and-nav] main window not found");
            }
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    log_line("[wait-and-nav] TIMEOUT 30s — sidecar non risponde");
}

/// Pre-spawn cleanup: kill chi ascolta sulla porta del sidecar (orphan da
/// run precedente). Defense in depth: anche se exit handler ha fallito.
fn kill_zombie_on_port(port: u16) {
    let lsof = Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output();
    let Ok(out) = lsof else {
        log_line("[zombie-kill] lsof not available, skip");
        return;
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    for pid_str in stdout.lines() {
        let Ok(pid) = pid_str.trim().parse::<i32>() else { continue };
        let res = Command::new("kill").args(["-9", &pid.to_string()]).output();
        match res {
            Ok(_) => log_line(&format!("[zombie-kill] killed pid {} on port {}", pid, port)),
            Err(e) => log_line(&format!("[zombie-kill] failed pid {}: {}", pid, e)),
        }
    }
}

fn bootstrap_and_serve(
    server_js: PathBuf,
    standalone_dir: PathBuf,
    node_bin: PathBuf,
    database_url: String,
) -> Result<(), String> {
    if !node_bin.exists() {
        return Err(format!("node binary missing at {}", node_bin.display()));
    }

    kill_zombie_on_port(SIDECAR_PORT);

    // Step 1: init-db.js — one-shot, blocking. Usa std::process::Command
    // sincrono (non serve detach: il processo finisce subito).
    let init_db_js = standalone_dir.join("init-db.js");
    log_line(&format!("init-db.js path: {}", init_db_js.display()));
    if !init_db_js.exists() {
        log_line("[FATAL] init-db.js non trovato nel bundle");
        return Err(format!("init-db.js missing at {}", init_db_js.display()));
    }
    log_line("Step 1/2: inizializzo schema DB...");
    let init_out = Command::new(&node_bin)
        .arg(&init_db_js)
        .env("DATABASE_URL", &database_url)
        .current_dir(&standalone_dir)
        .output()
        .map_err(|e| format!("init-db spawn failed: {}", e))?;
    let stdout_s = String::from_utf8_lossy(&init_out.stdout);
    let stderr_s = String::from_utf8_lossy(&init_out.stderr);
    if !stdout_s.trim().is_empty() {
        log_line(&format!("init-db stdout: {}", stdout_s.trim()));
    }
    if !stderr_s.trim().is_empty() {
        log_line(&format!("init-db stderr: {}", stderr_s.trim()));
    }
    if !init_out.status.success() {
        log_line(&format!("[FATAL] init-db exit code: {:?}", init_out.status.code()));
        return Err(format!("init-db failed code {:?}", init_out.status.code()));
    }

    // Step 2: spawn Next.js server.js con detach process_group(0) per
    // evitare che macOS associ il processo Node alla sessione GUI di
    // Piggybird.app (causa Dock entry / icon bouncing).
    log_line(&format!("Step 2/2: avvio Next.js su porta {}", SIDECAR_PORT));
    let mut cmd = Command::new(&node_bin);
    cmd.arg(&server_js)
        .env("DATABASE_URL", &database_url)
        .env("PORT", SIDECAR_PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .current_dir(&standalone_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Detach: child diventa session leader del proprio process group, NON
    // eredita la GUI session di Piggybird.app. Risultato: niente Dock entry
    // / bouncing icon per il processo node sidecar.
    unsafe {
        cmd.pre_exec(|| {
            // setsid() → nuovo session id + nuovo process group
            if libc_setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }

    let mut child = cmd.spawn().map_err(|e| format!("Node spawn failed: {}", e))?;
    let pid = child.id();
    SIDECAR_PID.store(pid, std::sync::atomic::Ordering::SeqCst);
    log_line(&format!("[spawn] sidecar pid={}", pid));

    // Pump stdout/stderr in thread separati → log file
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                log_line(&format!("[next-out] {}", line));
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                log_line(&format!("[next-err] {}", line));
            }
        });
    }

    let mutex = SIDECAR_CHILD.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        *guard = Some(child);
    }

    Ok(())
}

// Wrapper FFI minimo per setsid(2). Evita di aggiungere `libc` come dep.
extern "C" {
    fn setsid() -> i32;
}
fn libc_setsid() -> i32 {
    unsafe { setsid() }
}

/// Kill the sidecar Node process via 3 strategie in cascata:
/// 1. std::process::Child::kill (SIGKILL)
/// 2. kill -9 <pid> diretto via system command (in caso il Child handle
///    fosse stato perso)
/// 3. lsof + kill su SIDECAR_PORT (defense in depth)
fn kill_sidecar_now() {
    if let Some(mutex) = SIDECAR_CHILD.get() {
        if let Ok(mut guard) = mutex.lock() {
            if let Some(mut child) = guard.take() {
                match child.kill() {
                    Ok(_) => {
                        let _ = child.wait();
                        log_line("[exit] sidecar Child.kill() OK");
                    }
                    Err(e) => log_line(&format!("[exit] Child.kill() err: {}", e)),
                }
            }
        }
    }
    let pid = SIDECAR_PID.load(std::sync::atomic::Ordering::SeqCst);
    if pid > 0 {
        let res = Command::new("kill").args(["-9", &pid.to_string()]).output();
        match res {
            Ok(o) if o.status.success() => log_line(&format!("[exit] kill -9 pid={} OK", pid)),
            Ok(o) => log_line(&format!(
                "[exit] kill -9 pid={} fail: {}",
                pid,
                String::from_utf8_lossy(&o.stderr)
            )),
            Err(e) => log_line(&format!("[exit] kill -9 pid={} err: {}", pid, e)),
        }
    }
    kill_zombie_on_port(SIDECAR_PORT);
}
