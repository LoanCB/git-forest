import { useState } from "react";
import { GRAPH_CELL_PADDING } from "@/graph/constants";
import { fitLanes } from "@/graph/paths";
import { setRepoPrefs } from "@/store/prefs";
import type { ColumnId, RepoPrefs } from "@/store/prefs.types";
import { useRepoView } from "@/store/repoView";

export const COLUMNS: ColumnId[] = [
	"graph",
	"description",
	"date",
	"author",
	"commit",
];

/**
 * The commit table's column widths: the saved ones, overridden by a drag in
 * progress until its result is saved for the repository. The graph column
 * squeezes its lanes, then widens, so that `laneCount` lanes always fit.
 */
export function useColumnWidths(
	repo: string | null,
	prefs: RepoPrefs,
	laneCount: number,
) {
	const [dragWidths, setDragWidths] = useState<
		Partial<Record<ColumnId, number>>
	>({});
	const chosen = { ...prefs.columnWidths, ...dragWidths };
	const fit = fitLanes(laneCount, chosen.graph, GRAPH_CELL_PADDING);
	const widths = { ...chosen, graph: fit.columnWidth };
	const columns = `${widths.graph}px minmax(${widths.description}px, 1fr) ${widths.date}px ${widths.author}px ${widths.commit}px`;
	const minWidth = COLUMNS.reduce((sum, c) => sum + widths[c], 0);

	const resize = (column: ColumnId, width: number) =>
		setDragWidths((d) => ({ ...d, [column]: width }));

	const save = async (column: ColumnId, width: number) => {
		if (!repo) return;
		const columnWidths = { ...prefs.columnWidths, [column]: width };
		try {
			const saved = await setRepoPrefs(repo, { columnWidths });
			if (useRepoView.getState().repo === repo)
				useRepoView.setState((s) => ({
					prefs: { ...s.prefs, columnWidths: saved.columnWidths },
				}));
			setDragWidths((d) => {
				const { [column]: _, ...rest } = d;
				return rest;
			});
		} catch (e) {
			console.error("Could not save the column widths", e);
		}
	};

	return { widths, columns, minWidth, resize, save, laneWidth: fit.laneWidth };
}
