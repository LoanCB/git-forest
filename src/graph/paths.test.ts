import { describe, expect, it } from "vitest";
import { LANE_WIDTH, MIN_LANE_WIDTH } from "@/graph/constants";
import { computeLayout } from "@/graph/layout";
import { fitLanes, rowPaths } from "@/graph/paths";

describe("fitLanes", () => {
	it("keeps full lane width when the column is wide enough", () => {
		expect(fitLanes(3, 120, 6)).toEqual({
			laneWidth: LANE_WIDTH,
			columnWidth: 120,
		});
	});

	it("squeezes lanes before growing the column", () => {
		const fit = fitLanes(9, 120, 6);
		expect(fit.laneWidth).toBeCloseTo(114 / 9);
		expect(fit.columnWidth).toBe(120);
	});

	it("grows the column once lanes are at their minimum", () => {
		expect(fitLanes(20, 120, 6)).toEqual({
			laneWidth: MIN_LANE_WIDTH,
			columnWidth: 206,
		});
	});
});

// m merges a and f; f branches off a, so its lane opens at m and bends back at a.
const layout = computeLayout([
	{ hash: "m", parents: ["a", "f"] },
	{ hash: "f", parents: ["a"] },
	{ hash: "a", parents: ["r"] },
	{ hash: "r", parents: [] },
]);
const paths = (i: number) =>
	rowPaths(layout.rows[i], layout.rows[i - 1], layout.rows[i + 1], LANE_WIDTH);
const d = (i: number, key: string) => paths(i).find((p) => p.key === key)?.d;

describe("rowPaths", () => {
	it("draws the merge as one curve split across the boundary", () => {
		// Row 0 opens lane 1 for f: first half ends mid-way at the bottom edge.
		expect(d(0, "d0-1")).toBe("M8 12C8 18 12 21 16 24");
		// Row 1 continues it from that point; lane 1 has no separate top line.
		expect(d(1, "m0-1")).toBe("M16 0C20 3 24 6 24 12");
		expect(d(1, "u1-1")).toBeUndefined();
	});

	it("bends a converging lane from the centre of the row above", () => {
		// Row 2 (a) collects lane 1 back into lane 0.
		expect(d(1, "d1-1")).toBe("M24 12C24 18 20 21 16 24");
		expect(d(2, "u1-0")).toBe("M16 0C12 3 8 6 8 12");
	});

	it("keeps straight lines straight", () => {
		expect(d(1, "u0-0")).toBe("M8 0V12");
		expect(d(3, "u0-0")).toBe("M8 0V12");
	});

	it("falls back to a half-row curve without a neighbour", () => {
		const first = rowPaths(layout.rows[2], undefined, undefined, LANE_WIDTH);
		expect(first.find((p) => p.key === "u1-0")?.d).toBe("M24 0C24 6 8 6 8 12");
	});
});
