import { memo } from "react";
import {
	LANE_WIDTH,
	NODE_RADIUS,
	ROW_HEIGHT,
	STROKE_WIDTH,
	UNCOMMITTED_COLOR,
} from "@/graph/constants";
import { laneColor } from "@/graph/palette";
import type { GraphRow, NodeKind, Segment } from "@/graph/types";

interface GraphCellProps {
	row: GraphRow;
	laneCount: number;
	node: NodeKind;
}

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;

/** Straight when the lane does not move, else a cubic Bézier with control points at mid-height. */
function path({ from, to }: Segment, y1: number, y2: number): string {
	const x1 = laneX(from);
	const x2 = laneX(to);
	if (x1 === x2) return `M${x1} ${y1}V${y2}`;
	const mid = (y1 + y2) / 2;
	return `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
}

export const GraphCell = memo(function GraphCell({
	row,
	laneCount,
	node,
}: GraphCellProps) {
	const centre = ROW_HEIGHT / 2;
	const nodeColor = laneColor(
		node === "uncommitted" ? UNCOMMITTED_COLOR : row.color,
	);
	const hollow = node !== "commit";
	return (
		<svg
			width={Math.max(laneCount, 1) * LANE_WIDTH}
			height={ROW_HEIGHT}
			className="block shrink-0"
			aria-hidden
		>
			{row.up.map((s) => (
				<path
					key={`u${s.from}-${s.to}`}
					d={path(s, 0, centre)}
					stroke={laneColor(s.color)}
					strokeWidth={STROKE_WIDTH}
					fill="none"
				/>
			))}
			{row.down.map((s) => (
				<path
					key={`d${s.from}-${s.to}`}
					d={path(s, centre, ROW_HEIGHT)}
					stroke={laneColor(s.color)}
					strokeWidth={STROKE_WIDTH}
					fill="none"
				/>
			))}
			<circle
				data-node={node}
				cx={laneX(row.lane)}
				cy={centre}
				r={hollow ? NODE_RADIUS - STROKE_WIDTH / 2 : NODE_RADIUS}
				stroke={nodeColor}
				strokeWidth={hollow ? STROKE_WIDTH : 0}
				fill={hollow ? undefined : nodeColor}
				// Hollow nodes hide the lines that meet at their centre.
				style={hollow ? { fill: "var(--background)" } : undefined}
			/>
		</svg>
	);
});
