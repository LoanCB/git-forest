# Git Forest — design

Date : 2026-11-18
Dépôt : `git@github.com:LoanCB/git-forest.git`
Référence technique : `~/Projects/usagi-client` (appli Tauri existante, même auteur)
Référence visuelle : [capture 1](assets/git-graph-reference-1.png),
[capture 2 (boîte Add tag)](assets/git-graph-reference-2.png). « Les captures »
dans ce document désigne ces deux images.

## Intention

Une application de bureau (Linux, macOS, Windows) pour consulter et manipuler
les dépôts git présents sur l'ordinateur, sans ouvrir VS Code. L'expérience de
référence est l'extension VS Code **Git Graph** (mhutchie.git-graph) : même
tableau Graph / Description / Date / Author / Commit, mêmes badges de
branches, de remotes et de tags, et la même ligne « Uncommitted Changes ».
L'auteur l'utilise au quotidien et veut la retrouver dans une appli autonome,
qui couvre plusieurs dépôts.

Le besoin couvre **voir et agir** : checkout, tags, fetch, push.

## Objectifs

1. **Liste de dépôts** : ajouter un dépôt via un sélecteur de dossier, ou
   scanner un dossier racine (par ex. `~/Projects`) pour y trouver les dépôts
   git. Les retirer de la liste sans toucher au disque. La liste persiste
   entre les lancements.
2. **Graphe des commits** à la Git Graph :
   - colonnes Graph / Description / Date / Author / Commit (hash court) ;
     colonnes redimensionnables ;
   - un trait coloré par branche, avec un point par commit, un cercle creux
     pour HEAD et des courbes aux merges et aux forks ;
   - des badges avant le message : branche locale (avec, accolé, le remote
     qui pointe au même commit, par ex. `develop | origin`), branche distante
     seule, `origin/HEAD`, tag. La branche courante est en gras ;
   - les commits de merge sont grisés, comme dans les captures ;
   - une ligne « Uncommitted Changes (N) » en tête quand l'arbre de travail
     est modifié ;
   - un chargement par pages (par ex. 300 commits, puis « Charger plus » en
     bas) et une liste virtualisée, pour rester fluide sur les gros dépôts.
3. **Barre d'outils** : sélecteur de dépôt, filtre de branches (multi-sélection,
   « Show All » par défaut), case « Show Remote Branches », recherche
   (message, hash, auteur ; surlignage et navigation entre résultats),
   bouton Fetch et bouton Rafraîchir.
4. **Détail d'un commit** : un clic ouvre un panneau sous la ligne, comme
   dans Git Graph, avec le hash complet, les parents, l'auteur, le committer,
   les dates, le message complet et la liste des fichiers modifiés (statut
   A/M/D/R, +/−). Un clic sur un fichier affiche son diff unifié en lecture
   seule.
5. **Actions** (menus contextuels sur les commits et les badges, avec une
   boîte de dialogue quand il y a des paramètres) :
   - **Commit** : checkout (HEAD détachée, avec confirmation), créer une
     branche ici, ajouter un tag ici, copier le hash ;
   - **Branche locale** : checkout, renommer, supprimer (confirmation ;
     `-d` par défaut, `-D` derrière une case à cocher explicite), push vers
     un remote (avec choix « définir l'upstream ») ;
   - **Branche distante** : checkout, qui crée une branche locale qui la
     suit, ou bascule sur la branche locale si elle existe déjà ; supprimer
     sur le remote (confirmation forte) ;
   - **Tag** : ajout (nom, type annotated/lightweight, message, case « push
     to remote ») comme la boîte « Add tag » de Git Graph ; suppression
     (locale, et option « aussi sur le remote ») ; push ;
   - **Fetch** de tous les remotes, avec une option prune ;
   - **Push** de la branche courante.
6. **Rafraîchissement automatique** : l'appli surveille le `.git` du dépôt
   affiché et se met à jour quand quelque chose change en dehors d'elle
   (terminal, IDE), avec un debounce.
7. **Retour d'erreur lisible** : si git échoue, son message stderr s'affiche
   tel quel, dans une notification ou une boîte de dialogue.
8. Thème sombre par défaut (comme les captures) et thème clair. Interface en
   français et en anglais.
9. Livraison : binaires signés pour les 3 OS sur un tag `v*`, avec mise à
   jour intégrée, sur le modèle de usagi-client.

## Non-objectifs (v1)

- Merge, rebase, cherry-pick, revert, reset, stash.
- Staging, commit, édition de fichiers, résolution de conflits.
- Clone d'un dépôt distant.
- Push forcé (même `--force-with-lease`).
- Gestion des remotes (ajout, suppression, renommage) et des submodules.
- Ouvrir depuis la version Windows des dépôts situés dans WSL
  (`\\wsl.localhost\…`, git via `wsl.exe`). Idem pour les dépôts sur
  `/mnt/c` ouverts depuis Linux : pas de rafraîchissement périodique prévu.
- Signature de code OS (Apple Developer ID / notarisation, Authenticode).
- Version mobile (le workflow `release-mobile.yml` de usagi-client n'est pas
  repris).

## Anti-objectifs (échec même si « ça marche »)

- **Perdre du travail en silence** : aucune action ne doit écraser des
  modifications non commitées ni supprimer une branche non mergée sans
  confirmation explicite. On laisse git refuser (checkout sur un arbre sale)
  et on affiche son refus. On n'ajoute pas de `--force` à la place de
  l'utilisateur.
- **Se figer** : une commande réseau ne doit jamais bloquer l'interface ni
  rester suspendue sur une demande de mot de passe invisible.
- **Stocker des identifiants** : l'appli ne voit ni ne garde aucun secret.
  L'authentification reste celle de git (agent SSH, credential helper).
- Une interface qui diverge visiblement de Git Graph sur le graphe lui-même.

## Contraintes

- **Tauri 2**, cross-plateforme Linux / macOS / Windows.
- **Reprise de usagi-client comme base**, en gardant ce qui est générique :
  React 19 + TypeScript + Vite, Tailwind 4 + composants shadcn/base-ui,
  zustand, i18next (FR/EN), lucide-react, Biome, Vitest, Playwright, pnpm.
  On garde aussi les conventions de son `CLAUDE.md` : commentaires en anglais,
  types dans leur propre fichier, changelog bilingue `changelog.json`, puis
  react-doctor et `pnpm run lint:fix` en fin de tâche. On laisse tout le
  métier propre à Bunly : coffre SQLCipher, crypto, sync, tiptap, dnd-kit,
  tauri-plugin-sql, notifications.
- **CI/CD** : reprendre `release.yml` (matrice macOS-arm64 / Windows-x64 /
  Linux-x64, signature des artefacts de mise à jour, zip NSIS en STORE,
  manifestes `latest.json` et `latest-deb.json`, gestion beta), `pr-checks.yml`
  et `react-doctor.yml`, en remplaçant `LoanCB/usagi-client` par
  `LoanCB/git-forest` et les noms d'artefacts `bunly-*` par `git-forest-*`.
  Il faut **générer une nouvelle paire de clés de signature Tauri** :
  la clé publique va dans `tauri.conf.json` et les secrets
  `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` sur le
  dépôt GitHub. L'auteur ajoute lui-même les secrets.
- **Licence de Git Graph** : l'extension est sous une licence propre,
  restrictive. On reproduit l'**expérience** (disposition, comportement, code
  couleur), **jamais son code ni ses assets**. L'algorithme de placement des
  branches est écrit de zéro.
- **Environnements visés** : sur le PC sous WSL2, les dépôts sont dans le
  système de fichiers WSL et l'appli tourne en **version Linux via WSLg**, ce
  qui revient à du Linux natif. Les autres machines sont du Windows, du Linux
  (Debian) ou du macOS natifs, où dépôts et appli sont sur le même OS. Dans
  tous les cas, l'appli utilise le git de son propre OS et `notify` sur un
  système de fichiers local.
- **Dépôt GitHub public** : les releases sont publiques (l'updater
  fonctionne sans authentification) et la CI tourne sur GitHub Actions.

## Approches envisagées

| | Approche | Pour | Contre |
|---|---|---|---|
| **A (retenue)** | Côté Rust, lancer le binaire `git` installé (`std::process::Command`, arguments en tableau, sans shell) et lire sa sortie avec des formats explicites | Fetch et push fonctionnent tout de suite avec la config de l'utilisateur (agent SSH, `~/.ssh/config`, credential helpers, GPG, hooks). Le comportement est celui de git en ligne de commande. C'est l'approche de Git Graph. | git doit être installé. Il faut lire du texte (rendu fiable par des séparateurs `%x00` / `%x1f`). |
| B | Bibliothèque libgit2 (crate `git2`) | Pas besoin de git installé ; données déjà structurées | Auth SSH à recoder, gestion partielle de `~/.ssh/config`, pas de hooks, OpenSSL et libssh2 à compiler sur les 3 OS |
| C | gitoxide (`gix`) en lecture, la commande git pour les actions | Lecture plus rapide sur les très gros dépôts | Deux accès à git à maintenir pour un gain invisible sur les dépôts visés |

L'auteur a choisi **A**.

## Décisions déjà prises

- Commande `git` système (approche A).
- Actions dans le périmètre : checkout, branches (créer, renommer,
  supprimer), tags (ajouter, supprimer, push), fetch, push.
- Origin du projet : `git@github.com:LoanCB/git-forest.git` ; l'URL de
  l'updater pointe sur
  `https://github.com/LoanCB/git-forest/releases/latest/download/latest.json`.

## Choix de l'assistant (à corriger si besoin)

- **Nom et identifiant** : productName « Git Forest », identifier
  `com.loancb.gitforest`, version de départ 0.1.0.
- **Persistance** : liste des dépôts et préférences par dépôt (filtre de
  branches, remotes affichés, largeur des colonnes, dernier dépôt ouvert)
  dans un fichier JSON via `tauri-plugin-store`. Pas de base SQL : il n'y a
  rien de relationnel à stocker.
- **Commandes réseau et authentification** : on ne touche pas à la config
  SSH ou credential de l'utilisateur (pas de `BatchMode`, pas de surcharge de
  `core.sshCommand` ou `GIT_SSH`, plink compris). Les fenêtres graphiques
  restent autorisées : Git Credential Manager, l'approbation de l'agent SSH
  1Password ou Bitwarden, pinentry. Seule l'invite **terminal** est coupée
  (`GIT_TERMINAL_PROMPT=0`, stdin fermé), pour qu'une invite invisible
  échoue au lieu de bloquer. Il n'y a **pas de délai maximal qui tue git**.
  Les commandes réseau tournent en tâche de fond et affichent un indicateur
  avec un bouton **Annuler**, qui tue le processus. C'est ce bouton qui
  garantit que l'appli ne reste jamais figée. Ainsi on ne coupe pas
  l'utilisateur en pleine saisie de mot de passe, et un hook pre-push long
  peut aller au bout.
- **Windows** : les processus git sont lancés avec `CREATE_NO_WINDOW`, pour
  éviter qu'une console clignote à chaque commande.
- **Validation** : les noms de branches et de tags passent par
  `git check-ref-format` avant toute action. Le chemin d'un dépôt n'est
  accepté par une commande que s'il figure dans la liste enregistrée.
- **Algorithme du graphe** : calculé côté TypeScript (fonction pure, testée
  unitairement) à partir de la liste ordonnée des commits et de leurs
  parents. Le rendu se fait en SVG, ligne par ligne, dans la liste
  virtualisée.
- **Couleurs des branches** : une palette fixe de 8 à 12 couleurs vives
  (bleu, magenta, vert, orange…), attribuées par colonne, comme dans les
  captures.
- **Surveillance du dépôt** : crate `notify` côté Rust, sur `.git/HEAD`,
  `.git/refs`, `.git/packed-refs` et `.git/index`, avec un debounce de
  ~300 ms et un événement Tauri vers le front.
- **Mise à jour** : mêmes mécanismes et même bannière que usagi-client.
- **Signature** : comme usagi-client, seulement la signature de l'updater
  Tauri. Il n'y a pas de signature Apple (Developer ID, notarisation) ni
  Windows (Authenticode) en v1, donc Gatekeeper et SmartScreen
  avertiront au premier lancement. La paire de clés est générée **par
  l'auteur** avec `pnpm tauri signer generate`. Le plan lui donne la
  commande, et la clé privée ne passe jamais par l'assistant.
- **Recherche** : elle porte sur les commits déjà chargés, comme Git Graph,
  avec surlignage et navigation. Exception : un hash complet ou abrégé
  absent de la liste est résolu côté backend (`git rev-parse`), puis les
  pages sont chargées jusqu'à lui.
- **Filtre de branches** : un changement de filtre relance `git log` sur les
  refs choisies côté backend. On ne filtre pas ce qui est déjà chargé, car
  l'ordre et la forme du graphe en dépendent.
- **Licence** : la même que usagi-client (PolyForm Noncommercial + clause
  d'attribution), avec le nom du projet adapté.

## Laissé au builder

- Le découpage exact des commandes Tauri et des stores zustand.
- La bibliothèque de virtualisation (par ex. `@tanstack/react-virtual`).
- Les formats exacts de `git log` / `for-each-ref` / `status --porcelain=v2`.
- La profondeur et les exclusions du scan de dossier (ignorer
  `node_modules`, `target`… et ne pas descendre dans un dépôt trouvé).
- L'icône de l'appli (provisoire acceptée).
- La stratégie de tests e2e : le harnais Playwright de usagi-client simule
  le backend Tauri, à adapter avec des dépôts git créés pour les tests.
