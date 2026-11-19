export type ColumnId = "graph" | "description" | "date" | "author" | "commit";

export interface RepoPrefs {
	/** `null` means Show All. */
	branches: string[] | null;
	showRemotes: boolean;
	columnWidths: Record<ColumnId, number>;
}

export const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, number> = {
	graph: 120,
	description: 480,
	date: 150,
	author: 150,
	commit: 80,
};

export const DEFAULT_REPO_PREFS: RepoPrefs = {
	branches: null,
	showRemotes: true,
	columnWidths: DEFAULT_COLUMN_WIDTHS,
};
