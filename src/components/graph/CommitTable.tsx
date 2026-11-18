import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import {
	CommitDetailsPanel,
	UNCOMMITTED_ID,
} from "@/components/details/CommitDetailsPanel";
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
import { useSearch } from "@/store/search";

/** Initial guess for a details panel's height, until it is measured. */
const PANEL_ESTIMATE = 240;

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

	const matches = useSearch((s) => s.matches);
	const currentMatch = useSearch((s) => s.matches[s.index]);
	const matchSet = useMemo(() => new Set(matches), [matches]);

	const offset = dirty ? 1 : 0;
	const count = layout.rows.length + (hasMore ? 1 : 0);
	const scrollRef = useRef<HTMLDivElement>(null);

	// One row at a time is expanded; its details panel is a virtual item of its own.
	// Tied to the repo so opening another one starts collapsed.
	const [open, setOpen] = useState<{ repo: string | null; id: string } | null>(
		null,
	);
	const expanded = open && open.repo === repo ? open.id : null;
	const setExpanded = useCallback(
		(id: string | null | ((cur: string | null) => string | null)) =>
			setOpen((o) => {
				const cur = o && o.repo === repo ? o.id : null;
				const next = typeof id === "function" ? id(cur) : id;
				return next === null ? null : { repo, id: next };
			}),
		[repo],
	);
	const expandedRow = useMemo(() => {
		if (expanded === null) return -1;
		if (expanded === UNCOMMITTED_ID) return dirty ? 0 : -1;
		const i = commits.findIndex((c) => c.hash === expanded);
		return i < 0 ? -1 : i + offset;
	}, [expanded, commits, dirty, offset]);
	const panelIndex = expandedRow < 0 ? -1 : expandedRow + 1;
	const virtualizer = useVirtualizer({
		count: count + (panelIndex < 0 ? 0 : 1),
		getScrollElement: () => scrollRef.current,
		estimateSize: (i) => (i === panelIndex ? PANEL_ESTIMATE : ROW_HEIGHT),
		getItemKey: (i) => {
			if (i === panelIndex) return "panel";
			const row = panelIndex >= 0 && i > panelIndex ? i - 1 : i;
			if (row >= layout.rows.length) return "more";
			return row < offset ? "uncommitted" : commits[row - offset].hash;
		},
		// The header shares the scroller, so the list starts below it.
		scrollMargin: HEADER_HEIGHT,
		// Keeps a row scrolled to the start out from under the sticky header.
		scrollPaddingStart: HEADER_HEIGHT,
		overscan: 20,
	});

	useEffect(() => {
		if (expanded === null) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setExpanded(null);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [expanded, setExpanded]);

	const toggle = useCallback(
		(id: string) => setExpanded((cur) => (cur === id ? null : id)),
		[setExpanded],
	);
	const [notice, setNotice] = useState<string | null>(null);
	useEffect(() => {
		if (notice === null) return;
		const timer = setTimeout(() => setNotice(null), 4000);
		return () => clearTimeout(timer);
	}, [notice]);
	const goToParent = useCallback(
		async (hash: string) => {
			const opened = useRepoView.getState().repo;
			// The panel opens only once the commit is found, and before the scroll
			// runs, so the scroll sees the final layout.
			const found = await useRepoView
				.getState()
				.requestScrollTo(hash, () => flushSync(() => setExpanded(hash)));
			if (!found && useRepoView.getState().repo === opened)
				setNotice(t("graph.commitNotInView"));
		},
		[setExpanded, t],
	);

	const scrollTarget = useRepoView((s) => s.scrollTarget);
	const clearScrollTarget = useRepoView((s) => s.clearScrollTarget);
	useEffect(() => {
		if (scrollTarget === null) return;
		const i = commits.findIndex((c) => c.hash === scrollTarget);
		if (i < 0) return;
		const row = i + offset;
		// The panel sits below its row, so only a panel above the target shifts it.
		const index = expandedRow >= 0 && expandedRow < row ? row + 1 : row;
		virtualizer.scrollToIndex(index, { align: "start" });
		clearScrollTarget();
	}, [
		scrollTarget,
		commits,
		offset,
		expandedRow,
		virtualizer,
		clearScrollTarget,
	]);

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
	const renderRow = (virtualIndex: number, top: number) => {
		if (virtualIndex === panelIndex && expanded !== null && repo)
			return (
				<div
					key="panel"
					ref={virtualizer.measureElement}
					data-index={virtualIndex}
					className="absolute inset-x-0 top-0 border-y bg-muted/40"
					style={{ transform: `translateY(${top}px)` }}
				>
					<CommitDetailsPanel
						key={`${repo}:${expanded}`}
						repo={repo}
						id={expanded}
						onSelectParent={(h) => void goToParent(h)}
					/>
				</div>
			);
		const index =
			panelIndex >= 0 && virtualIndex > panelIndex
				? virtualIndex - 1
				: virtualIndex;
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
					id={UNCOMMITTED_ID}
					expanded={expanded === UNCOMMITTED_ID}
					onToggle={toggle}
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
				id={commit.hash}
				expanded={expanded === commit.hash}
				match={
					commit.hash === currentMatch
						? "current"
						: matchSet.has(commit.hash)
							? "match"
							: undefined
				}
				onToggle={toggle}
			/>
		);
	};

	return (
		<div className="relative h-full">
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
								<span className="truncate px-1.5">
									{t(`graph.columns.${c}`)}
								</span>
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
			{notice && (
				<div
					role="status"
					className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded border bg-popover px-3 py-1 text-[13px] shadow"
				>
					{notice}
				</div>
			)}
		</div>
	);
}
