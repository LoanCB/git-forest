import { PALETTE } from "@/graph/palette";
import type { GraphInput, GraphLayout, GraphRow, Segment } from "@/graph/types";

/**
 * Assigns each commit a column and the line segments joining it to its
 * neighbours. Expects children before parents (`git log --date-order`).
 * Cost per commit is O(lanes).
 */
export function computeLayout(commits: GraphInput[]): GraphLayout {
	// lanes[i] is the hash the column i is waiting for, null when free.
	const lanes: (string | null)[] = [];
	const laneColor: number[] = [];
	let nextColor = 0;
	let laneCount = 0;
	const rows: GraphRow[] = [];

	const allocate = (): number => {
		let lane = lanes.indexOf(null);
		if (lane === -1) {
			lane = lanes.length;
			lanes.push(null);
			laneColor.push(0);
		}
		laneColor[lane] = nextColor;
		nextColor = (nextColor + 1) % PALETTE.length;
		return lane;
	};

	for (const { hash, parents } of commits) {
		const waiting: number[] = [];
		for (let i = 0; i < lanes.length; i++) {
			if (lanes[i] === hash) waiting.push(i);
		}

		const lane = waiting.length > 0 ? waiting[0] : allocate();
		const color = laneColor[lane];

		const up: Segment[] = [];
		for (let i = 0; i < lanes.length; i++) {
			if (lanes[i] === null) continue;
			if (lanes[i] === hash)
				up.push({ from: i, to: lane, color: laneColor[i] });
			else up.push({ from: i, to: i, color: laneColor[i] });
		}

		for (const w of waiting) lanes[w] = null;

		const merges: Segment[] = [];
		// Lanes opened by this commit start at its centre, so they have no straight line.
		const opened: number[] = [];
		if (parents.length > 0) {
			lanes[lane] = parents[0];
			for (let k = 1; k < parents.length; k++) {
				const existing = lanes.indexOf(parents[k]);
				if (existing !== -1) {
					merges.push({ from: lane, to: existing, color: laneColor[existing] });
				} else {
					const created = allocate();
					lanes[created] = parents[k];
					opened.push(created);
					merges.push({ from: lane, to: created, color: laneColor[created] });
				}
			}
		}

		const down: Segment[] = [];
		for (let i = 0; i < lanes.length; i++) {
			if (lanes[i] !== null && !opened.includes(i))
				down.push({ from: i, to: i, color: laneColor[i] });
		}
		down.push(...merges);

		rows.push({ lane, color, up, down });

		let widest = lane + 1;
		for (const s of up) widest = Math.max(widest, s.from + 1, s.to + 1);
		for (const s of down) widest = Math.max(widest, s.from + 1, s.to + 1);
		laneCount = Math.max(laneCount, widest);
	}

	return { rows, laneCount };
}
