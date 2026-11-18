import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ColumnResizer } from "@/components/graph/ColumnResizer";
import { CommitRow } from "@/components/graph/CommitRow";
import { Button } from "@/components/ui/button";
import type { Commit } from "@/git/types";
import { ROW_HEIGHT, UNCOMMITTED_COLOR } from "@/graph/constants";
import { computeLayout } from "@/graph/layout";
import { groupRefs } from "@/graph/refs";
import type { GraphLayout } from "@/graph/types";
import { formatDate } from "@/lib/format";
import { setRepoPrefs } from "@/store/prefs";
import type { ColumnId } from "@/store/prefs.types";
import { useRepoView } from "@/store/repoView";

const COLUMNS: ColumnId[] = [
	"graph",
	"description",
	"date",
	"author",
	"commit",
];
const UNCOMMITTED_HASH = "*";

/**
 * Lays out the history, with the Uncommitted Changes row on top when the
 * working tree is dirty. Its line down to HEAD is greyed.
 */
function buildLayout(
	commits: Commit[],
	dirty: boolean,
	head: string | null,
): GraphLayout {
	if (!dirty) return computeLayout(commits);
	const layout = computeLayout([
		{ hash: UNCOMMITTED_HASH, parents: head ? [head] : [] },
		...commits,
	]);
	const [top, ...rest] = layout.rows;
	const lane = top.lane;
	for (const s of top.down) s.color = UNCOMMITTED_COLOR;
	// The lane stays reserved for HEAD until HEAD's row, so nothing else uses it.
	for (let i = 0; i < rest.length; i++) {
		for (const s of rest[i].up)
			if (s.from === lane) s.color = UNCOMMITTED_COLOR;
		if (commits[i].hash === head) break;
		for (const s of rest[i].down)
			if (s.from === lane && s.to === lane) s.color = UNCOMMITTED_COLOR;
	}
	return layout;
}

export function CommitTable() {
	const { t, i18n } = useTranslation();
	const repo = useRepoView((s) => s.repo);
	const refs = useRepoView((s) => s.refs);
	const commits = useRepoView((s) => s.commits);
	const uncommitted = useRepoView((s) => s.uncommitted);
	const hasMore = useRepoView((s) => s.hasMore);
	const loading = useRepoView((s) => s.loading);
	const prefs = useRepoView((s) => s.prefs);
	const loadMore = useRepoView((s) => s.loadMore);

	const [dragWidths, setDragWidths] = useState<
		Partial<Record<ColumnId, number>>
	>({});
	const widths = { ...prefs.columnWidths, ...dragWidths };
	const columns = `${widths.graph}px minmax(${widths.description}px, 1fr) ${widths.date}px ${widths.author}px ${widths.commit}px`;
	const minWidth = COLUMNS.reduce((sum, c) => sum + widths[c], 0);

	const head = refs?.head.commit ?? null;
	const dirty = uncommitted.length > 0;
	const layout = useMemo(
		() => buildLayout(commits, dirty, head),
		[commits, dirty, head],
	);
	const badges = useMemo(
		() => (refs ? groupRefs(refs, prefs.showRemotes) : new Map()),
		[refs, prefs.showRemotes],
	);
	// A fresh list on every refresh, so this is the time of the last status read.
	const uncommittedAt = useMemo(
		() => (uncommitted.length > 0 ? Date.now() / 1000 : 0),
		[uncommitted],
	);

	const offset = dirty ? 1 : 0;
	const count = layout.rows.length + (hasMore ? 1 : 0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 20,
	});

	const saveWidth = async (column: ColumnId, width: number) => {
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

	const locale = i18n.language;
	const renderRow = (index: number, top: number) => {
		if (index >= layout.rows.length)
			return (
				<div
					key="more"
					className="absolute inset-x-0 top-0 flex items-center justify-center"
					style={{ height: ROW_HEIGHT, transform: `translateY(${top}px)` }}
				>
					<Button
						variant="ghost"
						size="xs"
						disabled={loading}
						onClick={() => void loadMore()}
					>
						{t("graph.loadMore")}
					</Button>
				</div>
			);
		const graph = layout.rows[index];
		if (index < offset)
			return (
				<CommitRow
					key={UNCOMMITTED_HASH}
					graph={graph}
					laneCount={layout.laneCount}
					node="uncommitted"
					columns={columns}
					top={top}
					muted={false}
					subject={t("graph.uncommitted", { count: uncommitted.length })}
					strong
					date={formatDate(uncommittedAt, locale)}
					author="*"
					hash="*"
				/>
			);
		const commit = commits[index - offset];
		return (
			<CommitRow
				key={commit.hash}
				graph={graph}
				laneCount={layout.laneCount}
				node={commit.hash === head ? "head" : "commit"}
				columns={columns}
				top={top}
				muted={commit.parents.length > 1}
				badges={badges.get(commit.hash)}
				subject={commit.subject}
				date={formatDate(commit.authorDate, locale)}
				author={commit.authorName}
				hash={commit.hash.slice(0, 8)}
			/>
		);
	};

	return (
		<div
			ref={scrollRef}
			className="relative h-full overflow-auto text-[13px] text-foreground"
		>
			<div style={{ minWidth }}>
				<div
					className="sticky top-0 z-20 grid h-[30px] items-center border-b bg-background font-bold"
					style={{ gridTemplateColumns: columns }}
				>
					{COLUMNS.map((c) => (
						<div
							key={c}
							className="relative flex h-full items-center justify-center border-r last:border-r-0"
						>
							<span className="truncate px-1.5">{t(`graph.columns.${c}`)}</span>
							<ColumnResizer
								width={widths[c]}
								label={t("graph.resizeColumn", {
									column: t(`graph.columns.${c}`),
								})}
								onResize={(w) => setDragWidths((d) => ({ ...d, [c]: w }))}
								onResizeEnd={(w) => void saveWidth(c, w)}
							/>
						</div>
					))}
				</div>
				<div
					className="relative"
					style={{ height: virtualizer.getTotalSize() }}
				>
					{virtualizer
						.getVirtualItems()
						.map((item) => renderRow(item.index, item.start))}
				</div>
			</div>
		</div>
	);
}
