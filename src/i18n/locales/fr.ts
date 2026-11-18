import type en from "./en";

const fr: typeof en = {
	repos: {
		empty: "Ajoute un dépôt pour commencer",
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
