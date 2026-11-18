import type en from "./en";

const fr: typeof en = {
	repos: {
		empty: "Ajoute un dépôt pour commencer",
		select: "Choisir un dépôt",
		manage: "Gérer les dépôts…",
		missing: "Dépôt introuvable",
		missingHelp: "Le dossier {{path}} n'existe plus ou n'est pas un dépôt git.",
		removeFromList: "Retirer de la liste",
		dialog: {
			title: "Gérer les dépôts",
			description:
				"Les dépôts sont seulement enregistrés ici ; rien n'est jamais supprimé du disque.",
			addFolder: "Ajouter un dossier…",
			scanFolder: "Analyser un dossier…",
			none: "Aucun dépôt enregistré",
			remove: "Retirer {{name}}",
			scanTitle: "Dépôts trouvés",
			scanNone: "Aucun nouveau dépôt trouvé dans ce dossier",
			addSelected: "Ajouter la sélection ({{count}})",
			failed: "Impossible d'ajouter {{path}} : {{message}}",
		},
	},
	toolbar: {
		repo: "Dépôt :",
		branches: "Branches :",
		showAll: "Tout afficher",
		branchesSelected: "{{count}} sélectionnée(s)",
		showRemotes: "Afficher les branches distantes",
		search: "Rechercher",
		searchPlaceholder: "Rechercher…",
		searchCount: "{{current}} / {{total}}",
		fetch: "Fetch",
		settings: "Paramètres",
		refresh: "Rafraîchir",
	},
	graph: {
		columns: {
			graph: "Graphe",
			description: "Description",
			date: "Date",
			author: "Auteur",
			commit: "Commit",
		},
		uncommitted: "Modifications non validées ({{count}})",
		loadMore: "Charger plus de commits",
		commitNotInView: "Commit absent de la vue actuelle",
		resizeColumn: "Redimensionner la colonne {{column}}",
	},
	details: {
		loading: "Chargement…",
		commit: "Commit",
		parents: "Parents",
		author: "Auteur",
		committer: "Validé par",
		files: "Fichiers ({{count}})",
		noFiles: "Aucun fichier modifié",
		pickFile: "Choisissez un fichier pour voir son diff",
		loadingDiff: "Chargement du diff…",
		emptyDiff: "Aucune modification textuelle",
		diffTruncated:
			"Diff tronqué : seules les {{count}} premières lignes sont affichées",
		renamedFrom: "depuis {{path}}",
		goToParent: "Aller au parent {{hash}}",
	},
};

export default fr;
