import { LANE_WIDTH, MIN_LANE_WIDTH, ROW_HEIGHT } from "@/graph/constants";
import type { GraphPath, LaneFit } from "@/graph/paths.types";
import type { GraphRow, Segment } from "@/graph/types";

/**
 * Lanes first shrink from LANE_WIDTH towards MIN_LANE_WIDTH to fit the
 * column; past that the column grows so that no lane is ever cut off.
 * `padding` is the cell's horizontal padding.
 */
export function fitLanes(
	laneCount: number,
	columnWidth: number,
	padding: number,
): LaneFit {
	const lanes = Math.max(laneCount, 1);
	const available = columnWidth - padding;
	const laneWidth = Math.min(
		LANE_WIDTH,
		Math.max(MIN_LANE_WIDTH, available / lanes),
	);
	return {
		laneWidth,
		columnWidth: Math.max(columnWidth, Math.ceil(lanes * laneWidth + padding)),
	};
}

const straight = (s: Segment) => s.from === s.to;
const hasStraight = (segments: Segment[], lane: number) =>
	segments.some((s) => straight(s) && s.from === lane);
/**
 * Whether `bend`, in the top half of the row below `upper`, starts at
 * `upper`'s centre: its lane must run straight down there, with no other
 * curve landing on it at the boundary.
 */
const bendSpans = (upper: GraphRow, bend: Segment) =>
	hasStraight(upper.down, bend.from) &&
	!upper.down.some((d) => !straight(d) && d.to === bend.from);

/**
 * The strokes of `row`, given its neighbours. A lane change between two
 * commits is drawn as one S-curve from row centre to row centre, split at the
 * row boundary: its first half in the upper row, its second half in the lower
 * one. It spans both rows only when the other side of the boundary continues
 * it as a straight line; otherwise it stays within its half-row.
 */
export function rowPaths(
	row: GraphRow,
	prev: GraphRow | undefined,
	next: GraphRow | undefined,
	laneWidth: number,
): GraphPath[] {
	const x = (lane: number) => lane * laneWidth + laneWidth / 2;
	const h = ROW_HEIGHT;
	const c = h / 2;
	const out: GraphPath[] = [];

	const half = (s: Segment, y1: number, y2: number) => {
		const x1 = x(s.from);
		const x2 = x(s.to);
		if (x1 === x2) return `M${x1} ${y1}V${y2}`;
		const mid = (y1 + y2) / 2;
		return `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
	};
	// Halves of the cubic from (a, -c) to (b, c) with control points on the
	// boundary (y = 0), split at t = 0.5.
	const firstHalf = (a: number, b: number) => {
		const xa = x(a);
		const xb = x(b);
		return `M${xa} ${c}C${xa} ${h - c / 2} ${(3 * xa + xb) / 4} ${h - c / 4} ${(xa + xb) / 2} ${h}`;
	};
	const secondHalf = (a: number, b: number) => {
		const xa = x(a);
		const xb = x(b);
		return `M${(xa + xb) / 2} 0C${(xa + 3 * xb) / 4} ${c / 4} ${xb} ${c / 2} ${xb} ${c}`;
	};

	// Curves from the row above that end in this row's top half.
	const spanningFromAbove = prev
		? prev.down.filter((s) => !straight(s) && hasStraight(row.up, s.to))
		: [];
	for (const s of spanningFromAbove)
		out.push({
			key: `m${s.from}-${s.to}`,
			d: secondHalf(s.from, s.to),
			color: s.color,
		});

	for (const s of row.up) {
		const key = `u${s.from}-${s.to}`;
		if (straight(s)) {
			// A lane opened by a curve above starts with that curve, not a line.
			const opened =
				prev !== undefined &&
				!hasStraight(prev.down, s.from) &&
				spanningFromAbove.some((m) => m.to === s.from);
			if (!opened) out.push({ key, d: half(s, 0, c), color: s.color });
		} else if (prev && bendSpans(prev, s)) {
			out.push({ key, d: secondHalf(s.from, s.to), color: s.color });
		} else {
			out.push({ key, d: half(s, 0, c), color: s.color });
		}
	}

	for (const s of row.down) {
		const key = `d${s.from}-${s.to}`;
		if (straight(s)) {
			const bend = next?.up.find(
				(u) => u.from === s.from && !straight(u) && bendSpans(row, u),
			);
			out.push({
				key,
				d: bend ? firstHalf(bend.from, bend.to) : half(s, c, h),
				color: s.color,
			});
		} else if (next && hasStraight(next.up, s.to)) {
			out.push({ key, d: firstHalf(s.from, s.to), color: s.color });
		} else {
			out.push({ key, d: half(s, c, h), color: s.color });
		}
	}
	return out;
}
