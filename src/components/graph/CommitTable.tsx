import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ColumnResizer } from "@/components/graph/ColumnResizer";
import { CommitRow } from "@/components/graph/CommitRow";
import { Button } from "@/components/ui/button";
import { HEADER_HEIGHT, ROW_HEIGHT } from "@/graph/constants";
import { computeLayout } from "@/graph/layout";
import { groupRefs } from "@/graph/refs";
import { withUncommitted } from "@/graph/uncommitted";
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
	const history = useMemo(() => computeLayout(commits), [commits]);
	const layout = useMemo(
		() => (dirty ? withUncommitted(history, commits, head) : history),
		[history, commits, dirty, head],
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
		// The header shares the scroller, so the list starts below it.
		scrollMargin: HEADER_HEIGHT,
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
					key="uncommitted"
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
					className="sticky top-0 z-20 grid items-center border-b bg-background font-bold"
					style={{ height: HEADER_HEIGHT, gridTemplateColumns: columns }}
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
						.map((item) => renderRow(item.index, item.start - HEADER_HEIGHT))}
				</div>
			</div>
		</div>
	);
}
