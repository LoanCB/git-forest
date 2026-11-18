import { type CSSProperties, memo } from "react";
import { GraphCell } from "@/components/graph/GraphCell";
import { RefBadges } from "@/components/graph/RefBadges";
import { ROW_HEIGHT } from "@/graph/constants";
import { laneColor } from "@/graph/palette";
import type { RefBadge } from "@/graph/refs.types";
import type { GraphRow, NodeKind } from "@/graph/types";
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
}: CommitRowProps) {
	const style: CSSProperties = {
		height: ROW_HEIGHT,
		gridTemplateColumns: columns,
		transform: `translateY(${top}px)`,
	};
	return (
		<div
			data-row
			className={cn(
				"absolute inset-x-0 top-0 grid items-center hover:bg-accent",
				muted && "text-muted-foreground",
			)}
			style={style}
		>
			<div className="h-full overflow-hidden pl-1.5">
				<GraphCell row={graph} laneCount={laneCount} node={node} />
			</div>
			<div className="flex min-w-0 items-center gap-1 overflow-hidden px-1.5">
				{badges && <RefBadges badges={badges} color={laneColor(graph.color)} />}
				<span className={cn("truncate", strong && "font-bold")}>{subject}</span>
			</div>
			<div className={cell}>{date}</div>
			<div className={cell}>{author}</div>
			<div className={cell}>{hash}</div>
		</div>
	);
});
