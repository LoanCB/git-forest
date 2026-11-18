# Git Forest

Desktop app (Linux, macOS, Windows) built with Tauri 2 that shows git graphs, like the VS Code "Git Graph" extension.

Screenshots to come.

## Requirements

- `git` available in your `PATH`. Git Forest runs the real git binary, so your SSH and credential configuration is used as-is.

For development you also need Node 22, pnpm 10 (pinned through `packageManager`, enable it with `corepack enable`), a Rust toolchain, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/).

## Development

```sh
pnpm install
pnpm tauri dev
```

## Tests

```sh
pnpm lint
pnpm test:run
cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Pull requests run the same checks in CI, plus a Rust job on Windows.

## Releasing

Releases are built by GitHub Actions for macOS (arm64), Windows (x64) and Linux (x64), with updater manifests (`latest.json`, `latest-deb.json`, and `latest-beta*.json` for `-beta` tags) attached to the GitHub release.

```sh
git tag v0.1.0 && git push --tags
```

The tag sets the app version at build time.

### Signing key setup (one-time)

Updater artifacts are signed with a Tauri signing key. Until this is done, release builds cannot produce signed updates.

1. Generate the key pair:

   ```sh
   pnpm tauri signer generate -w ~/.tauri/git-forest.key
   ```
2. Paste the **public** key (printed, also in `~/.tauri/git-forest.key.pub`) into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, replacing `REPLACE_WITH_PUBKEY`.
3. In the GitHub repository settings (Secrets and variables, Actions), add:
   - `TAURI_SIGNING_PRIVATE_KEY`: the content of `~/.tauri/git-forest.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password chosen at generation

Never commit the private key.

## Install warnings

The binaries are not code-signed with an OS certificate, so the first launch shows a warning:

- **macOS (Gatekeeper)**: "cannot be opened because the developer cannot be verified". Right-click the app, choose Open, then confirm. Or run `xattr -dr com.apple.quarantine "/Applications/Git Forest.app"`.
- **Windows (SmartScreen)**: "Windows protected your PC". Click "More info", then "Run anyway".

## License

See [LICENSE.md](LICENSE.md).
