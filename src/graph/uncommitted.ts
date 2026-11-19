import { UNCOMMITTED_COLOR } from "@/graph/constants";
import type { GraphInput, GraphLayout, GraphRow, Segment } from "@/graph/types";

const touches = (segments: Segment[], lane: number) =>
	segments.some((s) => s.from === lane || s.to === lane);

/**
 * Adds the Uncommitted Changes row on top of a laid-out history, with a grey
 * line down to HEAD. The history keeps its lanes and colours: the line uses
 * HEAD's lane when it is free above HEAD, otherwise the first free lane.
 */
export function withUncommitted(
	layout: GraphLayout,
	commits: GraphInput[],
	head: string | null,
): GraphLayout {
	const target = head === null ? -1 : commits.findIndex((c) => c.hash === head);
	if (head === null || layout.rows.length === 0) {
		const top: GraphRow = {
			lane: 0,
			color: UNCOMMITTED_COLOR,
			up: [],
			down: [],
		};
		return {
			rows: [top, ...layout.rows],
			laneCount: Math.max(layout.laneCount, 1),
		};
	}

	// HEAD not loaded (filtered out or further down): the line runs to the bottom.
	const end = target === -1 ? layout.rows.length : target;
	const headLane = target === -1 ? -1 : layout.rows[target].lane;
	const free = (lane: number) => {
		for (let i = 0; i < end; i++) {
			const r = layout.rows[i];
			if (r.lane === lane || touches(r.up, lane) || touches(r.down, lane))
				return false;
		}
		return lane === headLane || target === -1
			? true
			: !touches(layout.rows[target].up, lane);
	};
	let lane = headLane;
	if (lane === -1 || !free(lane)) {
		lane = 0;
		while (!free(lane)) lane++;
	}

	const line = (to = lane): Segment => ({
		from: lane,
		to,
		color: UNCOMMITTED_COLOR,
	});
	const rows = layout.rows.map((r, i) => {
		if (i < end)
			return { ...r, up: [line(), ...r.up], down: [line(), ...r.down] };
		if (i === target) return { ...r, up: [line(headLane), ...r.up] };
		return r;
	});
	const top: GraphRow = {
		lane,
		color: UNCOMMITTED_COLOR,
		up: [],
		down: [line()],
	};
	return {
		rows: [top, ...rows],
		laneCount: Math.max(layout.laneCount, lane + 1),
	};
}
