pub mod askpass;
pub mod git;
pub mod repos;
#[cfg(test)]
pub(crate) mod test_support;
#[cfg(desktop)]
pub mod updater;
pub mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(repos::RepoListLock::default())
        .manage(git::ops::OpRegistry::default())
        .manage(watcher::WatcherState::default())
        .setup(|app| {
            askpass::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            repos::list_repos,
            repos::add_repo,
            repos::remove_repo,
            repos::scan_repos,
            git::read::get_refs,
            git::read::get_commits,
            git::read::get_uncommitted,
            git::read::get_commit_details,
            git::read::get_file_diff,
            git::read::resolve_commit,
            git::read::get_merged_branches,
            git::actions::checkout_branch,
            git::actions::checkout_commit,
            git::actions::checkout_remote_branch,
            git::actions::create_branch,
            git::actions::rename_branch,
            git::actions::delete_branch,
            git::actions::add_tag,
            git::actions::delete_tag,
            git::network::fetch,
            git::network::push_branch,
            git::network::push_tag,
            git::network::delete_remote_branch,
            git::network::delete_remote_tag,
            git::ops::cancel_operation,
            askpass::answer_askpass,
            askpass::ssh_agent_available,
            askpass::list_ssh_keys,
            askpass::load_ssh_key,
            watcher::watch_repo,
            watcher::unwatch_repo,
            #[cfg(desktop)]
            updater::check_update,
            #[cfg(desktop)]
            updater::install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
