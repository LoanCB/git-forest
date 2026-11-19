import { memo } from "react";
import {
	NODE_RADIUS,
	ROW_HEIGHT,
	STROKE_WIDTH,
	UNCOMMITTED_COLOR,
} from "@/graph/constants";
import { laneColor } from "@/graph/palette";
import type { GraphPath } from "@/graph/paths.types";
import type { GraphRow, NodeKind } from "@/graph/types";

interface GraphCellProps {
	row: GraphRow;
	/** From `rowPaths`. */
	paths: GraphPath[];
	laneCount: number;
	laneWidth: number;
	node: NodeKind;
}

export const GraphCell = memo(function GraphCell({
	row,
	paths,
	laneCount,
	laneWidth,
	node,
}: GraphCellProps) {
	const centre = ROW_HEIGHT / 2;
	const nodeColor = laneColor(
		node === "uncommitted" ? UNCOMMITTED_COLOR : row.color,
	);
	const hollow = node !== "commit";
	return (
		<svg
			width={Math.max(laneCount, 1) * laneWidth}
			height={ROW_HEIGHT}
			className="block shrink-0"
			aria-hidden
		>
			{paths.map((p) => (
				<path
					key={p.key}
					d={p.d}
					stroke={laneColor(p.color)}
					strokeWidth={STROKE_WIDTH}
					fill="none"
				/>
			))}
			<circle
				data-node={node}
				cx={row.lane * laneWidth + laneWidth / 2}
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
