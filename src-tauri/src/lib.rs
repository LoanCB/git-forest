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
            repos::repo_exists,
            git::read::get_refs,
            git::read::get_commits,
            git::read::get_uncommitted,
            git::read::get_commit_details,
            git::read::get_file_diff,
            git::read::resolve_commit,
            git::actions::checkout_branch,
            git::actions::checkout_commit,
            git::actions::checkout_remote_branch,
            git::actions::create_branch,
            git::actions::rename_branch,
            git::actions::delete_branch,
            git::actions::add_tag,
            git::actions::delete_tag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
