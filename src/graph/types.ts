export interface GraphInput {
	hash: string;
	parents: string[];
}

/** Lane at the top of the half-row → lane at its bottom. */
export interface Segment {
	from: number;
	to: number;
	color: number;
}

export interface GraphRow {
	/** Node column. */
	lane: number;
	/** Palette index of the node. */
	color: number;
	/** Top edge → row centre. */
	up: Segment[];
	/** Row centre → bottom edge. */
	down: Segment[];
}

export interface GraphLayout {
	rows: GraphRow[];
	laneCount: number;
}
