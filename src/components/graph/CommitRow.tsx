import { type CSSProperties, memo } from "react";
import { GraphCell } from "@/components/graph/GraphCell";
import { RefBadges } from "@/components/graph/RefBadges";
import { ROW_HEIGHT } from "@/graph/constants";
import { laneColor } from "@/graph/palette";
import type { RefBadge } from "@/graph/refs.types";
import type { GraphRow, NodeKind } from "@/graph/types";
import { replaceShortcodes } from "@/lib/emoji";
import { cn } from "@/lib/utils";

interface CommitRowProps {
	graph: GraphRow;
	laneCount: number;
	node: NodeKind;
	/** CSS grid template shared with the header. */
	columns: string;
	/** Vertical offset inside the virtual list. */
	top: number;
	muted: boolean;
	badges?: RefBadge[];
	subject: string;
	/** Bold subject, for the Uncommitted Changes row. */
	strong?: boolean;
	date: string;
	author: string;
	hash: string;
	/** Passed back to `onToggle`; a commit hash, or `"*"` for Uncommitted Changes. */
	id: string;
	expanded: boolean;
	onToggle: (id: string) => void;
}

const cell = "truncate px-1.5";

export const CommitRow = memo(function CommitRow({
	graph,
	laneCount,
	node,
	columns,
	top,
	muted,
	badges,
	subject,
	strong = false,
	date,
	author,
	hash,
	id,
	expanded,
	onToggle,
}: CommitRowProps) {
	const style: CSSProperties = {
		height: ROW_HEIGHT,
		gridTemplateColumns: columns,
		transform: `translateY(${top}px)`,
	};
	return (
		// biome-ignore lint/a11y/useSemanticElements: a grid row cannot be a <button>
		<div
			data-row
			role="button"
			tabIndex={0}
			aria-expanded={expanded}
			onClick={() => onToggle(id)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onToggle(id);
				}
			}}
			className={cn(
				"absolute inset-x-0 top-0 grid cursor-pointer items-center hover:bg-accent",
				expanded && "bg-accent",
				muted && "text-muted-foreground",
			)}
			style={style}
		>
			<div className="h-full overflow-hidden pl-1.5">
				<GraphCell row={graph} laneCount={laneCount} node={node} />
			</div>
			<div className="flex min-w-0 items-center gap-1 overflow-hidden px-1.5">
				{badges && <RefBadges badges={badges} color={laneColor(graph.color)} />}
				<span className={cn("truncate", strong && "font-bold")}>
					{replaceShortcodes(subject)}
				</span>
			</div>
			<div className={cell}>{date}</div>
			<div className={cell}>{author}</div>
			<div className={cell}>{hash}</div>
		</div>
	);
});
