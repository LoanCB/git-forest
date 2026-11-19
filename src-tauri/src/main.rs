// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Started by git or ssh to ask for a passphrase: answer and quit, no window.
    if let Some(code) = git_forest_lib::askpass::helper_main() {
        std::process::exit(code);
    }
    git_forest_lib::run()
}
