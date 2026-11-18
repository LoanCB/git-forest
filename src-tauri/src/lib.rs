pub mod git;
pub mod repos;
#[cfg(test)]
pub(crate) mod test_support;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![
            repos::list_repos,
            repos::add_repo,
            repos::remove_repo,
            repos::scan_repos,
            repos::repo_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
