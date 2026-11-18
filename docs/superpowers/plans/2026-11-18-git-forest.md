# Git Forest — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** une appli de bureau Tauri 2 (Linux / macOS / Windows) qui affiche le
graphe git des dépôts locaux à la manière de l'extension Git Graph et permet
checkout, branches, tags, fetch et push.

**Architecture :** le backend Rust lance le binaire `git` du système, sans
shell, et lit sa sortie avec des séparateurs `%x1f`/`%x1e`. Il possède la
liste des dépôts autorisés, la surveillance de `.git` et l'annulation des
opérations réseau. Le front React calcule le placement des branches (fonction
pure) et dessine le graphe en SVG, ligne par ligne, dans une table
virtualisée.

**Tech Stack :** Tauri 2, Rust (`notify-debouncer-mini`, `tauri-plugin-store`,
`tauri-plugin-dialog`, `tauri-plugin-updater`), React 19, TypeScript, Vite 7,
Tailwind 4, composants shadcn/base-ui, zustand, i18next, `@tanstack/react-virtual`,
Vitest + happy-dom, Playwright, Biome, pnpm.

**Spec :** [docs/superpowers/specs/2026-11-18-git-forest-design.md](../specs/2026-11-18-git-forest-design.md)
et ses captures de référence dans `docs/superpowers/specs/assets/`.

Racine du projet : `/home/loan-billonnet/Projects/git_forest` (dépôt déjà
initialisé, `origin` = `git@github.com:LoanCB/git-forest.git`).
Projet de référence : `/home/loan-billonnet/Projects/usagi-client` (noté
`USAGI/` ci-dessous).

## Global Constraints

- pnpm uniquement, jamais npm. Node 22 (`.nvmrc` repris de USAGI).
- productName `Git Forest`, identifier `com.loancb.gitforest`, version `0.1.0`,
  crate `git_forest`, lib `git_forest_lib`.
- Dépôt `LoanCB/git-forest` (public) ; endpoint updater
  `https://github.com/LoanCB/git-forest/releases/latest/download/latest.json`.
- Toutes les commandes git passent par `git::runner` : arguments en tableau,
  jamais de shell, `GIT_TERMINAL_PROMPT=0`, stdin fermé, `CREATE_NO_WINDOW`
  sous Windows.
- Ne jamais toucher à la config SSH ou credential : pas de `BatchMode`, pas de
  surcharge de `core.sshCommand`/`GIT_SSH`. Pas de délai qui tue git ; seul le
  bouton Annuler tue un processus réseau.
- Jamais de `--force` ajouté à la place de l'utilisateur, jamais de push forcé.
  `branch -D` uniquement derrière une case cochée explicitement.
- Une commande ne s'exécute que sur un dépôt présent dans la liste enregistrée.
- Les noms de branches et de tags sont validés par `git check-ref-format` avant
  toute action.
- Aucun code ni asset de l'extension Git Graph (licence restrictive) : on
  reproduit seulement l'apparence et le comportement visibles sur les captures.
- Interface en FR et EN : toute chaîne visible passe par i18next, avec une clé
  dans `en.ts` et `fr.ts`.
- Conventions de USAGI/CLAUDE.md : commentaires en anglais, utiles et rares ;
  types partagés dans leur propre fichier ; `pnpm run lint:fix` en fin de
  tâche. Commits au format `type(scope): :gitmoji: message`.
- Pas de base SQL, pas de notifications système, pas de coffre ni de crypto.

## Review Focus

1. **Boucle de rafraîchissement** : `git status` réécrit `.git/index`, le
   watcher se déclenche, l'appli relance `status`, et ainsi de suite. On
   attend que les lectures n'écrivent jamais dans `.git`
   (`GIT_OPTIONAL_LOCKS=0`). Tests : `status_does_not_touch_index` (Task 2),
   `reading_the_repo_does_not_trigger_an_event` (Task 12).
2. **Dépôt sans commit** (juste après `git init`) : on attend un graphe vide
   et la ligne Uncommitted si des fichiers existent, sans erreur. Tests :
   `commits_of_empty_repo_is_empty`, `refs_of_empty_repo` (Task 3).
3. **Messages et auteurs non ASCII** (gitmojis ✨🐛, accents) et messages
   contenant `|`, tabulations ou retours ligne : on attend une lecture exacte.
   Test : `parses_unicode_and_separators` (Task 3).
4. **Noms de refs avec `/`** (`feat/platform-dashboard`, `origin/feat/x`),
   remote autre qu'`origin`, `origin/HEAD` : on attend des badges corrects
   (local + remote accolés seulement s'ils pointent sur le même commit).
   Tests `groupRefs` (Task 6).
5. **Dépôt déplacé ou supprimé du disque** : on attend un message « dépôt
   introuvable » et la possibilité de le retirer, sans plantage ni boucle.
   Tests : `missing_repo_is_reported` (Task 2), `repo-missing` (Task 8).

---

### Task 1 : socle du projet (copie allégée de usagi-client)

**Files :**
- Create (copiés de USAGI puis adaptés) : `package.json`, `pnpm-workspace.yaml`,
  `.nvmrc`, `.gitignore`, `biome.json`, `components.json`, `tsconfig.json`,
  `tsconfig.node.json`, `vite.config.ts`, `index.html`, `playwright.config.ts`,
  `LICENSE.md`, `CLAUDE.md`, `README.md`
- Create : `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/utils.ts`,
  `src/i18n/index.ts`, `src/i18n/locales/en.ts`, `src/i18n/locales/fr.ts`,
  `src/theme/ThemeProvider.tsx`, `src/theme/types.ts`,
  `src/theme/themes/dark.ts`, `src/theme/themes/light.ts`,
  `src/test/setup.ts`, `src/assets/changelog.json`
- Create : `src/components/ui/{button,button-variants,badge,badge-variants,dialog,dropdown-menu,context-menu,input,select,checkbox,switch,tooltip,popover,separator,scroll-area}.tsx` (copiés de USAGI)
- Create : `src-tauri/{Cargo.toml,build.rs,tauri.conf.json}`,
  `src-tauri/src/{main.rs,lib.rs}`, `src-tauri/capabilities/{default,desktop}.json`,
  `src-tauri/icons/*` (copiés de USAGI, provisoires)
- Test : `src/App.test.tsx`

**Interfaces :**
- Produces : alias `@/` vers `src/` ; `cn()` dans `@/lib/utils` ;
  `ThemeProvider`/`useTheme()` avec les modes `"system" | "light" | "dark"`
  (défaut `"dark"`) ; `i18n` avec `fr`/`en` ; `run()` dans `lib.rs`, qui
  enregistre les plugins `opener`, `dialog`, `store`, `process`, `updater` ;
  `invoke_handler` vide pour l'instant.

- [ ] **Step 1 : copier et adapter la configuration**
  - `package.json` : `name: "git-forest"`, mêmes scripts que USAGI.
    Dépendances à garder : `@base-ui/react`, `@fontsource-variable/geist`,
    `@tailwindcss/vite`, `@tauri-apps/api`, `plugin-dialog`, `plugin-opener`,
    `plugin-process`, `class-variance-authority`, `clsx`, `i18next`,
    `i18next-browser-languagedetector`, `lucide-react`, `react`, `react-dom`,
    `react-i18next`, `tailwind-merge`, `tailwindcss`, `tw-animate-css`,
    `zustand`. Ajouter `@tauri-apps/plugin-store` et
    `@tanstack/react-virtual`. Dev : les mêmes que USAGI, sauf
    `better-sqlite3`, `@types/better-sqlite3`, `jsdom` et le bloc
    `pnpm.onlyBuiltDependencies`.
  - `src-tauri/Cargo.toml` : `name = "git_forest"`, lib `git_forest_lib`.
    Dépendances : `tauri 2`, `tauri-plugin-opener`, `tauri-plugin-dialog`,
    `tauri-plugin-store`, `serde`, `serde_json`, `notify-debouncer-mini = "0.5"`,
    `tokio = { features = ["sync","rt","process","macros","time"] }`, plus le
    bloc desktop `tauri-plugin-updater`, `tauri-plugin-process`, `url`,
    `semver`. Dev : `tempfile`.
  - Capabilities : `core:default`, `opener:default`, `dialog:default`,
    `store:default` ; desktop : `updater:default`, `process:default`. Pas de
    `fs` ni de `http` : tout l'accès au disque et au réseau passe par les
    commandes Rust.
  - `tauri.conf.json` : valeurs des Global Constraints. Fenêtre « Git Forest »
    de 1400×900. CSP de USAGI sans `connect-src https://github.com` (l'updater
    passe par Rust). Pas de `linux.deb.depends`. Pubkey de l'updater =
    placeholder `"REPLACE_WITH_PUBKEY"` (remplacé en Task 14).
  - `LICENSE.md` et `CLAUDE.md` : ceux de USAGI, en remplaçant « usagi-client »
    et « Bunly » par « git-forest » et « Git Forest ».
  - `src/index.css` : seulement les imports Tailwind, shadcn et Geist et la
    variante `dark`, sans les blocs glassmorphism ni orbes.
  - `src/theme` : seulement `dark` (fond `#1e1e1e`, texte `#cccccc`, bordures
    `#3c3c3c`, comme les captures) et `light`. Retirer de `ThemeTokens` les
    tokens propres à Bunly (priority, glass, orbs).

- [ ] **Step 2 : écrire le test de fumée**

```tsx
// src/App.test.tsx
it("renders the empty state when no repository is registered", async () => {
	render(<App />);
	expect(await screen.findByText(/add a repository/i)).toBeInTheDocument();
});
```

- [ ] **Step 3 : `App` minimal** qui affiche la clé i18n `repos.empty`
  (« Add a repository to get started » / « Ajoute un dépôt pour commencer »).
- [ ] **Step 4 : vérifier**
  Run : `pnpm install && pnpm test:run && pnpm build && (cd src-tauri && cargo build)`
  Expected : les tests passent, le build Vite réussit, cargo compile.
- [ ] **Step 5 : vérifier que l'appli démarre** (WSLg) : `pnpm tauri dev`
  ouvre une fenêtre sombre avec l'état vide.
- [ ] **Step 6 : commit** `chore(setup): :tada: scaffold Git Forest from usagi-client`

---

### Task 2 : exécuteur git et liste des dépôts (Rust)

**Files :**
- Create : `src-tauri/src/git/mod.rs`, `src-tauri/src/git/runner.rs`,
  `src-tauri/src/git/error.rs`, `src-tauri/src/repos.rs`,
  `src-tauri/src/test_support.rs` (`#[cfg(test)]`)
- Modify : `src-tauri/src/lib.rs` (modules et commandes)

**Interfaces :**
- Produces :
  - `pub struct GitError { pub kind: GitErrorKind, pub message: String }`,
    sérialisé `{ kind, message }`, avec
    `enum GitErrorKind { GitNotFound, RepoNotFound, NotARepo, NotRegistered, InvalidName, Cancelled, Failed }`.
    `message` contient le stderr de git, sans retouche.
  - `pub fn git_command(repo: &Path, args: &[&str]) -> std::process::Command` :
    l'environnement commun, réutilisé par la Task 10. Env
    `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`, stdin
    `Stdio::null()`, `CREATE_NO_WINDOW` (`0x08000000`) sous `cfg(windows)`.
  - `pub fn run_git(repo: &Path, args: &[&str]) -> Result<String, GitError>` :
    exécute `git_command` et retourne stdout en UTF-8 lossy.
  - `pub fn validate_ref_name(repo: &Path, kind: RefKind, name: &str) -> Result<(), GitError>`
    avec `enum RefKind { Branch, Tag }` : `check-ref-format --branch <name>`
    pour une branche, `check-ref-format refs/tags/<name>` pour un tag.
  - `repos.rs` : `RepoEntry { path: String, name: String }`, avec
    name = nom du dossier. Persistance dans le store `git-forest.json`, clé
    `repos`. Commandes Tauri :
    `list_repos() -> Vec<RepoEntry>`,
    `add_repo(path: String) -> Result<RepoEntry, GitError>` (normalise via
    `rev-parse --show-toplevel` et ignore les doublons),
    `remove_repo(path: String)`,
    `scan_repos(root: String) -> Result<Vec<String>, GitError>` (renvoie
    les candidats sans les ajouter),
    `repo_exists(path: String) -> bool`.
  - `pub fn resolve_repo(app: &AppHandle, path: &str) -> Result<PathBuf, GitError>` :
    `NotRegistered` si le dépôt n'est pas dans la liste, `RepoNotFound` si
    le dossier n'existe plus. **Toutes** les commandes git des tâches
    suivantes passent par cette fonction.
  - `test_support::TestRepo` : `new()` (tempdir, `git init -b main`,
    `user.name`/`user.email` en config locale),
    `commit(msg, files: &[(&str,&str)]) -> String` (hash ; dates fixées
    via `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` incrémentées), `git(args)`,
    `path()`.

- [ ] **Step 1 : tests du runner et du scan**

```rust
#[test] fn run_git_returns_stdout()            // rev-parse HEAD == hash du commit
#[test] fn run_git_failure_carries_stderr()    // `git rev-parse nope` → kind Failed, message contient "nope"
#[test] fn status_does_not_touch_index()       // mtime de .git/index identique avant/après run_git(["status","--porcelain"]) après `touch` d'un fichier suivi
#[test] fn validate_ref_name_rejects_bad_names() // "a..b", "-x", "x.lock" refusés ; "feat/x" accepté
#[test] fn scan_finds_nested_repos_and_stops_inside_them() // root/{a(.git), b/c(.git), a/sub(.git ignoré), node_modules/d(.git ignoré)} → [a, b/c]
#[test] fn missing_repo_is_reported()          // check_registered sur un chemin enregistré puis supprimé → RepoNotFound
#[test] fn unregistered_repo_is_refused()      // check_registered sur un chemin hors liste → NotRegistered
```

- [ ] **Step 2 : lancer `cargo test`** : échec (modules absents).
- [ ] **Step 3 : implémenter.** Le scan va jusqu'à une profondeur de 4.
  Il ignore les dossiers cachés, `node_modules`, `target`, `dist`, `vendor`,
  `build` et ne descend pas dans un dépôt trouvé. Pour tester sans
  AppHandle, `resolve_repo` s'appuie sur
  `fn check_registered(list: &[RepoEntry], path: &str) -> Result<PathBuf, GitError>`.
  Si `git` est absent (`io::ErrorKind::NotFound`), renvoyer
  `GitErrorKind::GitNotFound`.
- [ ] **Step 4 : `cargo test`, `cargo clippy --all-targets -- -D warnings`** → OK.
- [ ] **Step 5 : commit** `feat(git): :sparkles: run git safely and keep the repository list`

---

### Task 3 : lecture du dépôt (Rust)

**Files :**
- Create : `src-tauri/src/git/read.rs`, `src-tauri/src/git/types.rs`
- Modify : `src-tauri/src/lib.rs`

**Interfaces :**
- Produces (types `serde(rename_all = "camelCase")`, miroir TS en Task 5) :
  - `Refs { head: Head, locals: Vec<LocalBranch>, remotes: Vec<RemoteBranch>, tags: Vec<Tag>, remoteNames: Vec<String> }`
  - `Head { branch: Option<String>, commit: Option<String> }`, où
    `branch = None` signifie HEAD détachée et `commit = None` un dépôt vide.
  - `LocalBranch { name, commit, upstream: Option<String> }`
  - `RemoteBranch { remote, name, commit, isHead: bool }`, où `isHead`
    vaut true pour la cible de `<remote>/HEAD`. La ref symbolique
    `<remote>/HEAD` elle-même n'est pas listée.
  - `Tag { name, commit, annotated: bool }`, où `commit` est le commit
    pointé (peeled).
  - `Commit { hash, parents: Vec<String>, authorName, authorEmail, authorDate: i64, subject }`
  - `CommitPage { commits: Vec<Commit>, hasMore: bool }`
  - `LogQuery { refs: Option<Vec<String>>, includeRemotes: bool, skip: u32, limit: u32 }`
  - `FileChange { status: String /* A M D R C T ?(untracked) */, path, oldPath: Option<String>, additions: Option<u32>, deletions: Option<u32> }`
    (`None` pour un fichier binaire ou non suivi)
  - `CommitDetails { hash, parents, authorName, authorEmail, authorDate, committerName, committerEmail, committerDate, message, files: Vec<FileChange> }`
  - `DiffTarget = Commit { hash } | WorkingTree` (`serde(tag = "kind")`)
- Commandes Tauri (premier argument `repo: String`, résolu par `resolve_repo`) :
  `get_refs`, `get_commits(repo, query: LogQuery) -> CommitPage`,
  `get_uncommitted(repo) -> Vec<FileChange>`,
  `get_commit_details(repo, hash) -> CommitDetails`,
  `get_file_diff(repo, target: DiffTarget, path, oldPath: Option<String>) -> String`,
  `resolve_commit(repo, rev) -> Option<String>`.

- [ ] **Step 1 : tests**

```rust
#[test] fn commits_of_empty_repo_is_empty()      // get_commits → { commits: [], hasMore: false }, pas d'erreur
#[test] fn refs_of_empty_repo()                  // head.commit == None, locals vide
#[test] fn parses_unicode_and_separators()       // subject "feat(x): ✨ a|b\tc" et auteur "Loan Côté" relus à l'identique
#[test] fn commits_are_in_date_order_with_parents() // merge : 2 parents, ordre topo/date
#[test] fn paging_with_skip_and_has_more()       // 5 commits, limit 2 skip 2 → 2 commits, hasMore true ; skip 4 → 1, false
#[test] fn refs_filter_limits_history()          // refs=["feature"] n'inclut pas les commits propres à main
#[test] fn refs_lists_remotes_tags_and_origin_head() // clone d'un dépôt local : origin/main isHead, tag annoté peeled, branche "feat/x"
#[test] fn detached_head_has_no_branch()
#[test] fn uncommitted_lists_modified_added_untracked_renamed()
#[test] fn details_of_merge_compare_to_first_parent()
#[test] fn details_of_root_commit_lists_all_files()
#[test] fn file_diff_of_commit_and_working_tree() // contient "+nouvelle ligne" ; fichier non suivi → tout en "+"
#[test] fn resolve_commit_short_hash_and_unknown() // Some(full) / None
```

- [ ] **Step 2 : `cargo test git::read`** : échec.
- [ ] **Step 3 : implémenter.**
  - Log : `git log --date-order --format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s%x1e --max-count=<limit+1> --skip=<skip>`.
    Quand `refs` vaut None, on passe `--branches --tags HEAD`, plus `--remotes`
    si `includeRemotes`. Sinon on passe les refs données. Dépôt vide
    (`head.commit == None`) : on renvoie une page vide sans lancer git.
  - Refs : `for-each-ref --format=%(refname)%1f%(objectname)%1f%(*objectname)%1f%(upstream:short)%1f%(symref)`
    sur `refs/heads refs/remotes refs/tags`, puis `symbolic-ref -q --short HEAD`.
  - Uncommitted : `status --porcelain=v1 -z --untracked-files=all`. Dans
    `-z`, une entrée R/C est suivie d'un second chemin.
  - Détails : `show -s --format=...` pour l'en-tête, puis
    `diff-tree -r -M --no-commit-id --numstat -z` et `--name-status -z` entre
    `<parent1>` et `<hash>` (`--root` sans parent). Les deux sont fusionnés
    par chemin.
  - Diff : `diff <hash>^ <hash> -- <old> <path>` (`show <hash> -- <path>` pour
    un commit racine). Pour l'arbre de travail : `diff HEAD -- <path>`. Un
    fichier non suivi passe par `diff --no-index /dev/null <path>` (code de
    sortie 1 attendu, ce n'est pas une erreur ; utiliser `NUL` sous Windows).
- [ ] **Step 4 : `cargo test` + clippy** → OK.
- [ ] **Step 5 : commit** `feat(git): :sparkles: read refs, history, changes and diffs`

---

### Task 4 : placement des branches du graphe (TS, fonction pure)

**Files :**
- Create : `src/graph/types.ts`, `src/graph/layout.ts`, `src/graph/palette.ts`
- Test : `src/graph/layout.test.ts`

**Interfaces :**
- Produces :

```ts
export interface GraphInput { hash: string; parents: string[] }
export interface Segment { from: number; to: number; color: number } // lane at top → lane at bottom of the half-row
export interface GraphRow {
	lane: number;        // node column
	color: number;       // palette index of the node
	up: Segment[];       // top edge → row centre
	down: Segment[];     // row centre → bottom edge
}
export interface GraphLayout { rows: GraphRow[]; laneCount: number }
export function computeLayout(commits: GraphInput[]): GraphLayout;
export const PALETTE: readonly string[]; // 12 couleurs, PALETTE[0] = bleu "#0085d9", [1] magenta "#d9008f", [2] vert "#00d90a", puis orange, violet, cyan, jaune, rouge…
```

- [ ] **Step 1 : tests** (on vérifie `lane`, `color` et les segments, les
  positions en pixels ne comptent pas)

```ts
it("keeps a linear history on lane 0 with one colour")
it("opens a lane for a merged branch and closes it at the fork point") // M(parents A,B), B, A(parent R), R : B lane 1 ; le down de B va vers la lane de R ; R lane 0
it("converges two lanes waiting for the same parent")                  // deux branches nées du même commit
it("reuses the leftmost free lane after a branch ends")
it("keeps a lane open to the bottom when the parent is not loaded")    // dernier commit chargé : down vers sa propre lane
it("gives a continuing branch the same colour on every row")
it("handles an octopus merge with three parents")
it("places a virtual uncommitted row above HEAD on HEAD's lane")      // input[0] = { hash: "*", parents: [head] }
```

- [ ] **Step 2 : `pnpm test:run src/graph`** : échec.
- [ ] **Step 3 : implémenter `computeLayout`.** L'algorithme est écrit de zéro :
  - État : `lanes: (string | null)[]` (hash attendu dans chaque colonne) et
    `laneColor: number[]`. Un compteur `nextColor` avance de 1 à chaque
    nouvelle lane (modulo `PALETTE.length`).
  - Pour chaque commit, dans l'ordre :
    1. Les colonnes qui attendent ce hash sont `waiting`. La lane du commit
       est la plus à gauche de `waiting` ; s'il n'y en a aucune, c'est la
       première lane `null`, ou une nouvelle lane à droite (nouvelle couleur).
    2. `up` : un segment `{from: l, to: l}` pour chaque lane occupée qui ne
       fait pas partie de `waiting`, et `{from: w, to: lane}` pour chaque
       `w` de `waiting` (ce sont les convergences). Si le commit n'était
       attendu nulle part, il n'y a pas de segment entrant pour sa lane.
    3. Les autres colonnes de `waiting` sont libérées (`null`).
    4. Premier parent : il reste dans `lane`, avec la même couleur. Pour
       chaque parent suivant : s'il est déjà attendu dans une lane `p`, on
       ajoute le segment `{from: lane, to: p}` ; sinon on alloue la première
       lane `null` (ou une nouvelle) avec une nouvelle couleur et on ajoute
       `{from: lane, to: nouvelle}`. Sans parent, la lane est libérée.
    5. `down` : `{from: l, to: l}` pour chaque lane encore occupée, plus les
       segments du point 4 (les `{from: lane, to: x}` remplacent le
       `{lane,lane}` quand `x ≠ lane`).
  - `laneCount` = le nombre maximal de lanes ouvertes en même temps.
- [ ] **Step 4 : tests** → PASS.
- [ ] **Step 5 : commit** `feat(graph): :sparkles: lay out branches into lanes`

---

### Task 5 : couche d'accès au backend et état de la vue (TS)

**Files :**
- Create : `src/git/types.ts` (miroir exact des types de Task 3, plus
  `GitError` et `RepoEntry`), `src/git/api.ts`, `src/store/repos.ts`,
  `src/store/repoView.ts`, `src/store/prefs.ts`, `src/store/prefs.types.ts`
- Test : `src/store/repoView.test.ts`, `src/store/prefs.test.ts`

**Interfaces :**
- Produces :
  - `api.ts` : une fonction typée par commande Rust, par exemple
    `getCommits(repo: string, query: LogQuery): Promise<CommitPage>`. Les
    noms sont ceux des commandes en camelCase. Les erreurs sont rejetées
    sous forme de `GitError`.
  - `useReposStore` : `{ repos: RepoEntry[], current: string | null, load(), add(path), addMany(paths), remove(path), select(path) }`.
    `select` mémorise `lastRepo` dans les préférences.
  - `RepoPrefs { branches: string[] | null /* null = Show All */, showRemotes: boolean /* défaut true */, columnWidths: Record<ColumnId, number> }`,
    avec `ColumnId = "graph" | "description" | "date" | "author" | "commit"`.
    `prefs.ts` : `getRepoPrefs(path)`, `setRepoPrefs(path, patch)`,
    `getLastRepo()` et `setLastRepo(path)` via `@tauri-apps/plugin-store`
    (fichier `prefs.json`).
  - `useRepoView` : `{ repo, refs, commits, uncommitted: FileChange[], hasMore, loading, error: GitError | null, prefs, open(repo), refresh(), loadMore(), loadUntil(hash): Promise<boolean>, setBranches(b), setShowRemotes(v) }`.
    Taille de page : `PAGE_SIZE = 300`. `refresh()` recharge les refs, les
    `max(PAGE_SIZE, commits.length)` premiers commits et les fichiers non
    commités, sans réinitialiser le défilement. Si un refresh est demandé
    pendant un autre, il s'exécute une fois à la fin du premier, jamais
    en parallèle.

- [ ] **Step 1 : tests** (`invoke` mocké via `vi.mock("@tauri-apps/api/core")`)

```ts
it("open loads refs, first page and uncommitted changes")
it("loadMore appends the next page with skip = commits.length")
it("setBranches reloads history for the chosen refs and persists prefs")
it("setShowRemotes(false) reloads with includeRemotes false")
it("loadUntil pages until the hash is present, false when history ends")
it("coalesces refresh calls made while one is running")
it("exposes a RepoNotFound error instead of throwing")
it("prefs default to Show All and remote branches shown")
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter** → **Step 4 : PASS**
- [ ] **Step 5 : commit** `feat(store): :sparkles: load a repository's view state`

---

### Task 6 : table des commits et rendu du graphe

**Files :**
- Create : `src/components/graph/GraphCell.tsx`, `src/components/graph/RefBadges.tsx`,
  `src/components/graph/CommitTable.tsx`, `src/components/graph/CommitRow.tsx`,
  `src/components/graph/ColumnResizer.tsx`, `src/graph/refs.ts`,
  `src/graph/refs.types.ts`, `src/graph/constants.ts`, `src/lib/format.ts`
- Test : `src/graph/refs.test.ts`, `src/components/graph/CommitTable.test.tsx`,
  `src/lib/format.test.ts`

**Interfaces :**
- Consumes : `computeLayout` et `PALETTE` (Task 4), `useRepoView` (Task 5).
- Produces :
  - `constants.ts` : `ROW_HEIGHT = 24`, `LANE_WIDTH = 16`, `NODE_RADIUS = 4`,
    `STROKE_WIDTH = 2`.
  - `RefBadge = { kind: "local"; name; remotes: string[]; current: boolean; upstream?: string } | { kind: "remote"; remote; name; isHead: boolean } | { kind: "tag"; name }`
  - `groupRefs(refs: Refs, showRemotes: boolean): Map<string, RefBadge[]>` :
    une branche distante qui a le **même nom** et le **même commit** qu'une
    branche locale est fusionnée dans le badge local (`remotes: ["origin"]`).
    Les autres restent des badges `remote`. L'ordre est : locales
    (la courante d'abord), distantes, tags. Avec `showRemotes = false`, il
    n'y a aucun badge distant et aucune fusion.
  - `formatDate(unixSeconds, locale)` → `"18 Nov 2026 14:58"` en EN,
    `"18 nov. 2026 14:58"` en FR.
  - `<CommitTable />` : lit `useRepoView`, sans props.

- [ ] **Step 1 : tests**

```ts
// refs.test.ts
it("merges origin/develop into the local develop badge when on the same commit")
it("keeps origin/feat/x separate when it points elsewhere")
it("handles slashes in branch names and a remote other than origin")
it("marks the current branch and orders current first")
it("flags the origin/HEAD target and drops all remotes when showRemotes is false")
// format.test.ts
it("formats dates as in the reference screenshots for en and fr")
// CommitTable.test.tsx
it("shows an Uncommitted Changes (N) row when the working tree is dirty")
it("renders merge commits with the muted style")
it("shows a Load more row when hasMore and calls loadMore on click")
it("draws HEAD's node as a hollow circle")
it("shows an empty graph without error for a repository with no commits")
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter.**
  - Liste virtualisée `@tanstack/react-virtual`, `estimateSize: ROW_HEIGHT`.
  - En-tête collant Graph / Description / Date / Author / Commit, avec
    `ColumnResizer` qui sauvegarde `columnWidths`.
  - `GraphCell` : un `<svg>` par ligne, de largeur
    `laneCount * LANE_WIDTH`. Les segments `up` vont de y=0 à
    `ROW_HEIGHT/2`, les `down` de `ROW_HEIGHT/2` à `ROW_HEIGHT`. Les
    segments obliques sont des courbes de Bézier cubiques (points de contrôle
    à mi-hauteur), comme sur les captures.
  - Nœuds : disque plein pour un commit, cercle creux pour HEAD, cercle creux
    gris pour la ligne « Uncommitted Changes ». La ligne Uncommitted est
    injectée en tête de `computeLayout` (`{hash:"*", parents:[head.commit]}`,
    ou `parents: []` sur un dépôt vide) quand `uncommitted.length > 0` ; son
    trait est gris, pas pris dans la palette.
  - Badges : pastille colorée avec la couleur de la lane du commit et une
    icône lucide (`GitBranch` pour une branche, `Tag` pour un tag). Un
    remote accolé s'affiche en italique dans le même cadre
    (`develop | origin`). La branche courante est en gras. Le reste
    reprend les captures.
  - Commit de merge (`parents.length > 1`) : texte en `text-muted-foreground`.
    Hash court sur 8 caractères.
- [ ] **Step 4 : PASS**, puis vérification visuelle avec `pnpm tauri dev` sur
  un vrai dépôt (par ex. usagi-client), en comparant à
  `docs/superpowers/specs/assets/git-graph-reference-1.png`.
- [ ] **Step 5 : commit** `feat(graph): :sparkles: draw the commit graph table`

---

### Task 7 : détail d'un commit et diff

**Files :**
- Create : `src/components/details/CommitDetailsPanel.tsx`,
  `src/components/details/FileList.tsx`, `src/components/details/DiffView.tsx`,
  `src/lib/diff.ts`, `src/lib/diff.types.ts`
- Modify : `src/components/graph/CommitTable.tsx` (ligne dépliée)
- Test : `src/lib/diff.test.ts`, `src/components/details/CommitDetailsPanel.test.tsx`

**Interfaces :**
- Consumes : `getCommitDetails`, `getUncommitted`, `getFileDiff` (Task 5).
- Produces : `parseUnifiedDiff(text): DiffLine[]` avec
  `DiffLine { kind: "add" | "del" | "ctx" | "hunk" | "meta"; text; oldNo?: number; newNo?: number }`.
  `CommitTable` gère un `expanded: string | null` (hash ou `"*"`) : un clic
  sur une ligne l'ouvre ou la ferme, et Échap la ferme.

- [ ] **Step 1 : tests**

```ts
it("parses hunks with line numbers for added, removed and context lines")
it("marks a binary file diff as meta")
it("panel shows full hash, parents, author, committer, dates and full message")
it("panel lists files with status and +/- counts, '-' for binaries")
it("clicking a file loads and shows its diff")
it("the Uncommitted row lists working tree changes and diffs against HEAD")
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter.** Le panneau s'insère
  dans la liste virtualisée comme une ligne de hauteur variable
  (`measureElement`). Un clic sur un hash parent fait défiler jusqu'à ce
  commit (`loadUntil` s'il n'est pas chargé).
- [ ] **Step 4 : PASS** → **Step 5 : commit** `feat(details): :sparkles: show a commit's files and diffs`

---

### Task 8 : gestion des dépôts et barre d'outils

**Files :**
- Create : `src/components/layout/Toolbar.tsx`, `src/components/repos/RepoSelect.tsx`,
  `src/components/repos/ManageReposDialog.tsx`, `src/components/repos/ScanResultsList.tsx`,
  `src/components/toolbar/BranchFilter.tsx`, `src/components/toolbar/SearchBox.tsx`,
  `src/graph/search.ts`, `src/components/layout/RepoMissing.tsx`
- Modify : `src/App.tsx`
- Test : `src/graph/search.test.ts`, `src/components/toolbar/SearchBox.test.tsx`,
  `src/components/toolbar/BranchFilter.test.tsx`,
  `src/components/repos/ManageReposDialog.test.tsx`, `src/App.test.tsx`

**Interfaces :**
- Consumes : `useReposStore`, `useRepoView`, `scanRepos`, `resolveCommit`.
- Produces : `searchCommits(commits: Commit[], query: string): string[]`
  renvoie les hash qui correspondent, dans l'ordre. La recherche ignore la
  casse et porte sur le sujet, le nom et l'email de l'auteur, ou un préfixe
  de hash d'au moins 4 caractères hexadécimaux.

- [ ] **Step 1 : tests**

```ts
it("matches subject, author and hash prefix case-insensitively")
it("ignores hash prefixes shorter than 4 hex chars")
it("Enter / Shift+Enter cycle through matches and scroll to them")
it("an unloaded full or short hash is resolved then loaded with loadUntil")
it("BranchFilter: Show All clears the selection; picking branches calls setBranches")
it("ManageReposDialog: scan shows candidates with checkboxes, adds the checked ones")
it("removing a repository never touches the disk (calls remove_repo only)")
it("repo-missing: a RepoNotFound error shows the message and a Remove button")
it("reopens the last repository on start")
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter.** Barre identique aux
  captures : « Repo: [select] », « Branches: [Show All ▾] », case « Show
  Remote Branches ». À droite, les icônes Rechercher, Fetch (`CloudDownload`),
  Paramètres (`Settings`, branché en Task 13) et Rafraîchir (`RotateCw`) ; le
  bouton Fetch sera branché en Task 11. Le sélecteur de dossier passe par
  `@tauri-apps/plugin-dialog` `open({ directory: true })`. Le select contient
  aussi l'entrée « Gérer les dépôts… ». Raccourcis : `Ctrl/Cmd+F` pour la
  recherche, `F5` pour rafraîchir.
- [ ] **Step 4 : PASS** → **Step 5 : commit** `feat(repos): :sparkles: manage repositories and filter the graph`

---

### Task 9 : actions locales (Rust)

**Files :**
- Create : `src-tauri/src/git/actions.rs`
- Modify : `src-tauri/src/lib.rs`

**Interfaces :**
- Produces (commandes Tauri, `repo: String` en premier, retour
  `Result<(), GitError>`) :
  `checkout_branch(repo, name)`, `checkout_commit(repo, hash)` (HEAD
  détachée), `checkout_remote_branch(repo, remote, name)`,
  `create_branch(repo, name, at, checkout: bool)`,
  `rename_branch(repo, old, new)`, `delete_branch(repo, name, force: bool)`,
  `add_tag(repo, name, at, message: Option<String>)` (annotated si
  `message` vaut Some, y compris une chaîne vide → `-m ""`),
  `delete_tag(repo, name)`.

- [ ] **Step 1 : tests**

```rust
#[test] fn checkout_refuses_to_overwrite_local_changes() // conflit → Failed, stderr de git conservé, fichier intact
#[test] fn checkout_remote_branch_creates_tracking_branch()
#[test] fn checkout_remote_branch_switches_to_existing_local()
#[test] fn delete_unmerged_branch_without_force_fails()
#[test] fn delete_unmerged_branch_with_force_succeeds()
#[test] fn create_rename_delete_branch_roundtrip()
#[test] fn annotated_and_lightweight_tags()        // cat-file -t → "tag" / "commit"
#[test] fn invalid_names_are_rejected_before_git_runs() // "bad..name" → InvalidName
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter.** `checkout_remote_branch`
  bascule sur la branche locale `name` si elle existe, sinon lance
  `checkout --track <remote>/<name>`. Aucune commande n'utilise `-f` sauf
  `branch -D` quand `force`. Les noms passent par `validate_ref_name` et les
  `at`/`hash` par `rev-parse --verify <x>^{commit}`.
- [ ] **Step 4 : PASS + clippy** → **Step 5 : commit** `feat(git): :sparkles: checkout, branches and tags`

---

### Task 10 : opérations réseau annulables (Rust)

**Files :**
- Create : `src-tauri/src/git/network.rs`, `src-tauri/src/git/ops.rs`
- Modify : `src-tauri/src/lib.rs` (gérer `OpRegistry`)

**Interfaces :**
- Consumes : `git_command` (Task 2), converti en `tokio::process::Command`.
- Produces :
  - `OpRegistry` (`Mutex<HashMap<String, Child handle>>`, en état Tauri) et
    `async fn run_cancellable(registry, op_id: &str, repo, args) -> Result<String, GitError>`.
    `cancel_operation(op_id)` tue le processus, et l'appel en cours renvoie
    `Cancelled`.
  - Commandes async (`op_id: String` en premier, puis `repo`) :
    `fetch(op_id, repo, prune: bool)` (`fetch --all --tags`, plus `--prune`),
    `push_branch(op_id, repo, remote, name, set_upstream: bool)`,
    `push_tag(op_id, repo, remote, name)`,
    `delete_remote_branch(op_id, repo, remote, name)` (`push <remote> --delete <name>`),
    `delete_remote_tag(op_id, repo, remote, name)` (`push <remote> --delete refs/tags/<name>`),
    `cancel_operation(op_id)`.
  - Le front génère `op_id` (`crypto.randomUUID()`).

- [ ] **Step 1 : tests** (remote = dépôt bare local, donc sans réseau)

```rust
#[tokio::test] async fn fetch_gets_new_remote_commits_and_prunes()
#[tokio::test] async fn push_branch_sets_upstream()
#[tokio::test] async fn push_and_delete_remote_tag()
#[tokio::test] async fn rejected_non_fast_forward_push_reports_stderr() // jamais retenté en force
#[cfg(unix)] #[tokio::test] async fn cancel_kills_running_operation()  // hook pre-push local `sleep 30` ; cancel → Cancelled en < 2 s, plus aucun processus sleep
#[cfg(unix)] #[tokio::test] async fn no_timeout_is_applied()           // hook pre-push `sleep 3` → le push aboutit
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter.** Sur unix, le processus
  git est placé dans son propre groupe (`process_group(0)`) et l'annulation
  tue le groupe, pour que le hook ou ssh meure avec lui. Sous Windows,
  l'annulation passe par `taskkill /T /F /PID`, lancé avec `CREATE_NO_WINDOW`.
- [ ] **Step 4 : PASS + clippy** → **Step 5 : commit** `feat(git): :sparkles: fetch and push with cancellation`

---

### Task 11 : menus contextuels, dialogues et suivi des opérations (TS)

**Files :**
- Create : `src/components/actions/CommitContextMenu.tsx`,
  `src/components/actions/BranchContextMenu.tsx`,
  `src/components/actions/RemoteBranchContextMenu.tsx`,
  `src/components/actions/TagContextMenu.tsx`,
  `src/components/actions/AddTagDialog.tsx`, `CreateBranchDialog.tsx`,
  `RenameBranchDialog.tsx`, `ConfirmDialog.tsx`, `PushDialog.tsx`,
  `src/components/actions/OperationBar.tsx`, `src/components/actions/GitErrorDialog.tsx`,
  `src/store/operations.ts`
- Modify : `CommitRow.tsx`, `RefBadges.tsx`, `Toolbar.tsx` (Fetch)
- Test : `src/store/operations.test.ts`, `src/components/actions/AddTagDialog.test.tsx`,
  `src/components/actions/ConfirmDialog.test.tsx`, `src/components/actions/BranchContextMenu.test.tsx`

**Interfaces :**
- Consumes : les commandes des Tasks 9 et 10 via `api.ts`, et
  `useRepoView.refresh`.
- Produces : `useOperations` : `{ running: { id, label }[], runLocal(label, fn), runNetwork(label, (opId) => Promise), cancel(id), lastError: GitError | null, clearError() }`.
  Après chaque action, réussie ou non, on appelle `refresh()`. Une erreur
  ouvre `GitErrorDialog`, qui affiche `message` tel quel dans un `<pre>`.
  `Cancelled` n'ouvre pas de dialogue.

- [ ] **Step 1 : tests**

```ts
it("runNetwork shows the operation with a Cancel button until it settles")
it("cancel calls cancel_operation and Cancelled shows no error dialog")
it("a failed action shows git's stderr verbatim and still refreshes")
it("AddTagDialog: annotated by default, message optional, Push to remote pushes after tagging")
it("AddTagDialog: invalid name error from backend is shown inline")
it("delete branch: -D only when 'Force delete' is checked")
it("delete tag: 'also on remote' runs delete_remote_tag after delete_tag")
it("remote branch delete requires typing the branch name to confirm")
it("checkout of a commit asks for confirmation (detached HEAD)")
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter.**
  - Menus (clic droit) :
    - **Commit** : Checkout…, Créer une branche…, Ajouter un tag…, Copier le hash.
    - **Branche locale** : Checkout, Renommer…, Supprimer…, Push…
    - **Branche distante** : Checkout, Supprimer sur le remote…
    - **Tag** : Push…, Supprimer… (case « aussi sur le remote »).
  - Double-clic sur un badge de branche = checkout.
  - `AddTagDialog` reprend la capture 2 : Name, Type (Annotated /
    Lightweight), Message (« Optional »), Push to remote, boutons Add Tag et
    Cancel.
  - `PushDialog` : choix du remote (défaut `origin`, ou le premier remote)
    et case « Définir l'upstream » (cochée si la branche n'a pas
    d'upstream).
  - Bouton Fetch de la barre : `fetch(prune: false)`. Un clic droit ou un
    menu propose « Fetch & prune ».
  - Push de la branche courante : entrée « Push » dans le menu de la branche
    courante, et `Ctrl/Cmd+Shift+P`.
- [ ] **Step 4 : PASS** → **Step 5 : commit** `feat(actions): :sparkles: act on commits, branches and tags`

---

### Task 12 : rafraîchissement automatique

**Files :**
- Create : `src-tauri/src/watcher.rs`, `src/hooks/useRepoWatcher.ts`
- Modify : `src-tauri/src/lib.rs`, `src/App.tsx`
- Test : tests Rust dans `watcher.rs`, `src/hooks/useRepoWatcher.test.ts`

**Interfaces :**
- Produces : commandes `watch_repo(repo)` (remplace le watcher précédent) et
  `unwatch_repo()`. Événement Tauri `repo-changed` avec la charge utile
  `{ repo: string }`, émis avec un debounce de 300 ms. Sont surveillés :
  `.git/HEAD`, `.git/index`, `.git/packed-refs`, `.git/refs/` (récursif),
  ainsi que les modifications de l'arbre de travail hors `.git`
  (récursif, en ignorant `.git/objects`, `.git/logs` et `*.lock`), pour
  mettre à jour la ligne Uncommitted.
  Pour un worktree ou un `.git` sous forme de fichier, le dossier git réel
  est résolu par `rev-parse --git-dir`.

- [ ] **Step 1 : tests**

```rust
#[test] fn emits_once_for_a_burst_of_ref_changes()   // 5 écritures en 50 ms → 1 événement
#[test] fn ignores_object_and_lock_files()
#[test] fn reading_the_repo_does_not_trigger_an_event() // get_refs + get_commits + get_uncommitted → aucun événement en 1 s
```
```ts
it("refreshes the view on repo-changed for the current repo only")
it("defers the refresh while a local action is running")
```

- [ ] **Step 2 : échec** → **Step 3 : implémenter** (`notify-debouncer-mini`,
  callback → `app.emit`). Pour tester sans AppHandle, le debouncer est
  isolé derrière `fn start(dir, on_change: impl Fn() + Send + 'static)`.
- [ ] **Step 4 : PASS** → **Step 5 : commit** `feat(watch): :sparkles: refresh when the repository changes`

---

### Task 13 : mise à jour intégrée, paramètres et changelog

**Files :**
- Create (copiés de USAGI et allégés) : `src-tauri/src/updater.rs`,
  `src/hooks/useUpdater.ts(x)`, `src/components/layout/UpdateBanner.tsx`,
  `src/components/layout/ChangelogDialog.tsx`, `src/components/layout/ChangelogList.tsx`,
  `src/store/settings.ts` (seulement `updateChannel: "stable" | "beta"`,
  `theme` et `language`), `src/components/layout/SettingsDialog.tsx`
  (thème, langue, canal)
- Test : reprendre `UpdateBanner.test.tsx` de USAGI et l'adapter

**Interfaces :**
- Consumes : rien des tâches git.
- Produces : la bannière en haut de la fenêtre et le dialogue Paramètres,
  ouvert par l'icône engrenage de la barre d'outils.

- [ ] **Step 1 : copier les tests de USAGI** et les adapter (retirer ce qui
  dépend de la sync ou du coffre).
- [ ] **Step 2 : copier le code**, en remplaçant `usagi-client` par
  `git-forest` dans les URLs de manifeste (stable, beta, deb). Si
  `useUpdater` de USAGI importe `@tauri-apps/plugin-updater` côté JS,
  ajouter cette dépendance.
- [ ] **Step 3 : `pnpm test:run` et `cargo test`** → PASS.
- [ ] **Step 4 : commit** `feat(update): :sparkles: in-app updates, settings and changelog`

---

### Task 14 : CI/CD GitHub Actions et clé de signature

**Files :**
- Create : `.github/workflows/release.yml`, `.github/workflows/pr-checks.yml`,
  `.github/workflows/react-doctor.yml` (copiés de USAGI)
- Modify : `src-tauri/tauri.conf.json` (pubkey), `README.md`

- [ ] **Step 1 : copier les workflows** et remplacer `LoanCB/usagi-client`
  par `LoanCB/git-forest`, `bunly-` par `git-forest-` et `Bunly` par
  `Git Forest`. Dans `release.yml`, retirer `libdbus-1-dev` et
  `libglib2.0-dev` (ils servaient aux notifications). Dans
  `pr-checks.yml`, retirer `pnpm config set onlyBuiltDependencies "esbuild msw"`
  si msw n'est pas utilisé.
- [ ] **Step 2 : demander à l'auteur de générer la clé** (l'assistant ne
  manipule pas la clé privée) :
  `pnpm tauri signer generate -w ~/.tauri/git-forest.key`. L'auteur
  colle la clé **publique** dans `plugins.updater.pubkey`, puis ajoute
  `TAURI_SIGNING_PRIVATE_KEY` (contenu du fichier) et
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` dans les secrets du dépôt GitHub.
  Tant que ce n'est pas fait, cette étape reste ouverte.
- [ ] **Step 3 : README** : présentation, captures, prérequis (git dans le
  PATH), dev (`pnpm tauri dev`), publication d'une version (`git tag v0.1.0
  && git push --tags`), et avertissements Gatekeeper/SmartScreen (pas de
  signature OS).
- [ ] **Step 4 : vérifier localement** : `pnpm lint && pnpm test:run && pnpm build`
  et `cd src-tauri && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test`
  → tout est vert.
- [ ] **Step 5 : commit** `ci: :construction_worker: checks and signed releases for the three platforms`

---

### Task 15 : parcours de bout en bout

**Files :**
- Create : `index.test.html`, `src/test-harness/main.tsx`,
  `src/test-harness/tauri-stubs.ts` (repris de USAGI),
  `src/test-harness/fixtures.ts`, `tests/e2e/graph.spec.ts`

**Interfaces :**
- Consumes : toutes les commandes, simulées par `fixtures.ts`. `invoke` est
  remplacé par un dispatcher qui répond par nom de commande avec un dépôt
  fictif : ~40 commits, 2 merges, des branches `develop`/`origin/develop`,
  `feat/x` et un tag `v0.1.0`, plus 3 fichiers non commités. Le dispatcher
  enregistre les appels dans `window.__calls` pour les assertions.

- [ ] **Step 1 : écrire le parcours**

```ts
test("open a repository, read the graph, inspect a commit, add a tag", async ({ page }) => {
	// goto /index.test.html → la ligne "Uncommitted Changes (3)" est visible
	// le badge "develop" contient "origin" ; le badge du tag v0.1.0 est visible
	// clic sur un commit → panneau avec la liste des fichiers ; clic sur un fichier → lignes "+"
	// clic droit → "Add Tag…" → nom "v0.2.0", Add Tag → window.__calls contient add_tag {name:"v0.2.0", message:""}
	// recherche "feat" → 1er résultat surligné
});
test("a failed push shows git's message", async ({ page }) => {
	// le stub rejette push_branch avec { kind:"Failed", message:"! [rejected] main -> main (non-fast-forward)" }
	// → le dialogue d'erreur affiche ce texte tel quel
});
```

- [ ] **Step 2 : `pnpm test:e2e`** → PASS.
- [ ] **Step 3 : fin de tâche (CLAUDE.md)** : entrée « Unreleased » bilingue
  dans `changelog.json` (« Première version : graphe, branches, tags, fetch,
  push » / « First release: graph, branches, tags, fetch, push »), puis
  react-doctor (`nvm use 22.22.2 && rm -rf ~/.npm/_npx && pnpm doctor`),
  en corrigeant seulement les diagnostics introduits, puis
  `pnpm run lint:fix`.
- [ ] **Step 4 : commit** `test(e2e): :white_check_mark: walk the graph end to end`
