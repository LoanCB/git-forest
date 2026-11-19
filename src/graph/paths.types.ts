/** One stroke of a row's graph cell. */
export interface GraphPath {
	key: string;
	/** SVG path data, in the cell's coordinates. */
	d: string;
	/** Palette index (or UNCOMMITTED_COLOR). */
	color: number;
}

/** Lane spacing and the graph column width that fits every lane. */
export interface LaneFit {
	laneWidth: number;
	/** Graph column width: at least the chosen one, wider when lanes need it. */
	columnWidth: number;
}
