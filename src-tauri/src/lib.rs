use std::fs;
use std::io::Write;
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Handle del Node sidecar (server.js Next.js standalone). Salvato in static
/// così possiamo killarlo quando l'app esce — altrimenti resta orphan.
static SIDECAR_CHILD: OnceLock<Mutex<Option<CommandChild>>> = OnceLock::new();
/// PID del sidecar (atomico per accesso lock-free dall'exit handler). 0 = no PID.
static SIDECAR_PID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

fn log_line(line: &str) {
    if let Some(p) = LOG_PATH.get() {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(p) {
            let _ = writeln!(f, "[{}] {}", chrono_now(), line);
        }
    }
    log::info!("{}", line);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Determina app data dir (es. ~/Library/Application Support/app.piggybird/)
            // e crea il path del DB locale dell'utente.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app_data_dir");
            fs::create_dir_all(&app_data_dir)?;
            // Log to file: ~/Library/Application Support/app.piggybird/piggybird.log
            // Sempre attivo (anche release) — utile per debug bug nei beta tester.
            let _ = LOG_PATH.set(app_data_dir.join("piggybird.log"));
            log_line(&format!("=== Piggybird boot v{} ===", env!("CARGO_PKG_VERSION")));
            log_line(&format!("app_data_dir: {}", app_data_dir.display()));
            let db_path = app_data_dir.join("piggybird.db");
            // Prisma vuole l'URL "file:" + path assoluto
            let database_url = format!("file:{}", db_path.to_string_lossy());

            // Path al bundle standalone Next.js (incluso come Tauri resource)
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource_dir");
            let standalone_dir: PathBuf = resource_dir.join("standalone");
            let server_js = standalone_dir.join("server.js");
            let prisma_schema = standalone_dir.join("prisma").join("schema.prisma");

            log::info!("[piggybird] DATABASE_URL = {}", database_url);
            log::info!("[piggybird] standalone = {}", standalone_dir.display());

            let app_handle = app.handle().clone();

            // Spawn async: prima migrate (one-shot), poi sidecar Next.js server
            tauri::async_runtime::spawn(async move {
                if let Err(e) = bootstrap_and_serve(
                    app_handle,
                    server_js,
                    prisma_schema,
                    standalone_dir,
                    database_url,
                )
                .await
                {
                    log_line(&format!("sidecar fatal: {}", e));
                }
            });

            // Thread separato: polla la porta del sidecar e quando è up,
            // naviga la WebView principale a localhost. Strategia robusta
            // perché lo splash html (file://) NON può fare fetch http://
            // per security policy WebKit (cross-origin file→http blocked).
            let app_handle_nav = app.handle().clone();
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

/// Kill the sidecar Node process via 3 strategie in cascata:
/// 1. CommandChild::kill() (clean SIGTERM)
/// 2. kill -9 <pid> (SIGKILL diretto via system command)
/// 3. lsof + kill su SIDECAR_PORT (defense in depth — risolve anche se PID
///    è cambiato per qualche fork)
fn kill_sidecar_now() {
    use std::process::Command;
    // Strategia 1: CommandChild handle
    if let Some(mutex) = SIDECAR_CHILD.get() {
        if let Ok(mut guard) = mutex.lock() {
            if let Some(child) = guard.take() {
                match child.kill() {
                    Ok(_) => log_line("[exit] sidecar CommandChild.kill() OK"),
                    Err(e) => log_line(&format!("[exit] CommandChild.kill() err: {}", e)),
                }
            }
        }
    }
    // Strategia 2: kill -9 via system command (più diretto)
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
    // Strategia 3: chiunque ascolti sulla porta del sidecar
    kill_zombie_on_port(SIDECAR_PORT);
}

fn wait_and_navigate(app: AppHandle) {
    // Polling TCP della porta sidecar: se accept connection → server è ready.
    // Niente HTTP client (no deps extra) — basta verificare il listen socket.
    let addr = format!("127.0.0.1:{}", SIDECAR_PORT);
    let socket: std::net::SocketAddr = match addr.parse() {
        Ok(a) => a,
        Err(e) => {
            log_line(&format!("[wait-and-nav] addr parse error: {}", e));
            return;
        }
    };
    let max_attempts = 60u32; // 60 × 500ms = 30s
    for attempt in 1..=max_attempts {
        if TcpStream::connect_timeout(&socket, Duration::from_millis(500)).is_ok() {
            log_line(&format!(
                "[wait-and-nav] sidecar ready dopo {} attempt, navigate WebView",
                attempt
            ));
            // Naviga la window principale a localhost
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

/// Cleanup zombie: se una precedente istanza ha lasciato un Node sidecar
/// orphan sulla SIDECAR_PORT, killiamolo prima di spawnare il nuovo. Defense
/// in depth: anche se l'exit handler di RunEvent fallisce o se l'app è
/// stata force-quit, al boot successivo il port viene liberato.
fn kill_zombie_on_port(port: u16) {
    use std::process::Command;
    let lsof = Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output();
    let Ok(out) = lsof else {
        log_line(&format!("[zombie-kill] lsof not available, skip"));
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

async fn bootstrap_and_serve(
    app: AppHandle,
    server_js: PathBuf,
    _prisma_schema: PathBuf,
    standalone_dir: PathBuf,
    database_url: String,
) -> Result<(), String> {
    let shell = app.shell();

    // Cleanup zombie sidecar di precedenti istanze prima di spawnare il nuovo
    kill_zombie_on_port(SIDECAR_PORT);

    // Step 1: init-db.js — script bundlato che apply lo schema SQL via
    // better-sqlite3 SOLO se la tabella Setting non esiste (idempotente).
    // Più snello del CLI Prisma (che NFT non bundla).
    let init_db_js = standalone_dir.join("init-db.js");
    log_line(&format!("init-db.js path: {}", init_db_js.display()));
    if !init_db_js.exists() {
        log_line("[FATAL] init-db.js non trovato nel bundle");
        return Err(format!("init-db.js missing at {}", init_db_js.display()));
    }
    log_line("Step 1/2: inizializzo schema DB...");
    let migrate_cmd = shell
        .sidecar("node")
        .map_err(|e| format!("sidecar lookup failed: {}", e))?
        .args([init_db_js.to_string_lossy().to_string()])
        .env("DATABASE_URL", &database_url)
        .current_dir(standalone_dir.clone());
    match migrate_cmd.output().await {
        Ok(out) => {
            let stdout_s = String::from_utf8_lossy(&out.stdout);
            let stderr_s = String::from_utf8_lossy(&out.stderr);
            if !stdout_s.trim().is_empty() {
                log_line(&format!("init-db stdout: {}", stdout_s.trim()));
            }
            if !stderr_s.trim().is_empty() {
                log_line(&format!("init-db stderr: {}", stderr_s.trim()));
            }
            if !out.status.success() {
                log_line(&format!("[FATAL] init-db exit code: {:?}", out.status.code()));
                return Err(format!("init-db failed code {:?}", out.status.code()));
            }
        }
        Err(e) => {
            log_line(&format!("[FATAL] init-db spawn error: {}", e));
            return Err(format!("init-db spawn failed: {}", e));
        }
    }

    // Step 2: spawn Next.js standalone server (lunga vita)
    log_line(&format!("Step 2/2: avvio Next.js su porta {}", SIDECAR_PORT));
    let server_cmd = shell
        .sidecar("node")
        .map_err(|e| format!("sidecar lookup failed: {}", e))?
        .args([server_js.to_string_lossy().to_string()])
        .env("DATABASE_URL", &database_url)
        .env("PORT", SIDECAR_PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .current_dir(standalone_dir);

    let (mut rx, child) = server_cmd
        .spawn()
        .map_err(|e| format!("sidecar spawn failed: {}", e))?;
    // Salva PID atomico per kill diretto + handle CommandChild come fallback
    let pid = child.pid();
    SIDECAR_PID.store(pid, std::sync::atomic::Ordering::SeqCst);
    log_line(&format!("[spawn] sidecar pid={}", pid));
    let mutex = SIDECAR_CHILD.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        *guard = Some(child);
    }

    // Pump stdout/stderr → log Tauri (visibile in console se runa con `cargo tauri dev`)
    while let Some(event) = rx.recv().await {
        use tauri_plugin_shell::process::CommandEvent;
        match event {
            CommandEvent::Stdout(line) => {
                log_line(&format!("[next-out] {}", String::from_utf8_lossy(&line).trim_end()));
            }
            CommandEvent::Stderr(line) => {
                log_line(&format!("[next-err] {}", String::from_utf8_lossy(&line).trim_end()));
            }
            CommandEvent::Error(err) => {
                log_line(&format!("[next] error: {}", err));
            }
            CommandEvent::Terminated(payload) => {
                log_line(&format!(
                    "[next] sidecar exited code={:?} signal={:?}",
                    payload.code, payload.signal
                ));
                break;
            }
            _ => {}
        }
    }

    Ok(())
}
