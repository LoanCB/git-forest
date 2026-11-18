import { describe, expect, it } from "vitest";
import { computeLayout } from "@/graph/layout";
import type { GraphInput, GraphRow, Segment } from "@/graph/types";

const seg = (from: number, to: number, color: number): Segment => ({
	from,
	to,
	color,
});
const byShape = (a: Segment, b: Segment) =>
	a.from - b.from || a.to - b.to || a.color - b.color;
const row = (
	lane: number,
	color: number,
	up: Segment[],
	down: Segment[],
): GraphRow => ({
	lane,
	color,
	up,
	down,
});
const c = (hash: string, ...parents: string[]): GraphInput => ({
	hash,
	parents,
});

/** Segment order is not significant, so both sides are sorted before comparing. */
function normalise(rows: GraphRow[]) {
	return rows.map((r) => ({
		...r,
		up: [...r.up].sort(byShape),
		down: [...r.down].sort(byShape),
	}));
}
function expectRows(actual: GraphRow[], expected: GraphRow[]) {
	expect(normalise(actual)).toEqual(normalise(expected));
}

describe("computeLayout", () => {
	it("keeps a linear history on lane 0 with one colour", () => {
		const { rows, laneCount } = computeLayout([
			c("C3", "C2"),
			c("C2", "C1"),
			c("C1"),
		]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0)]),
			row(0, 0, [seg(0, 0, 0)], [seg(0, 0, 0)]),
			row(0, 0, [seg(0, 0, 0)], []),
		]);
		expect(laneCount).toBe(1);
	});

	it("opens a lane for a merged branch and closes it at the fork point", () => {
		const { rows, laneCount } = computeLayout([
			c("M", "A", "B"),
			c("B", "R"),
			c("A", "R"),
			c("R"),
		]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0), seg(0, 1, 1)]),
			row(1, 1, [seg(0, 0, 0), seg(1, 1, 1)], [seg(0, 0, 0), seg(1, 1, 1)]),
			row(0, 0, [seg(0, 0, 0), seg(1, 1, 1)], [seg(0, 0, 0), seg(1, 1, 1)]),
			row(0, 0, [seg(0, 0, 0), seg(1, 0, 1)], []),
		]);
		expect(laneCount).toBe(2);
	});

	it("converges two lanes waiting for the same parent", () => {
		const { rows, laneCount } = computeLayout([
			c("X", "P"),
			c("Y", "P"),
			c("P"),
		]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0)]),
			row(1, 1, [seg(0, 0, 0)], [seg(0, 0, 0), seg(1, 1, 1)]),
			row(0, 0, [seg(0, 0, 0), seg(1, 0, 1)], []),
		]);
		expect(laneCount).toBe(2);
	});

	it("reuses the leftmost free lane after a branch ends", () => {
		const { rows } = computeLayout([c("S", "A", "B"), c("B"), c("X", "Y")]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0), seg(0, 1, 1)]),
			row(1, 1, [seg(0, 0, 0), seg(1, 1, 1)], [seg(0, 0, 0)]),
			row(1, 2, [seg(0, 0, 0)], [seg(0, 0, 0), seg(1, 1, 2)]),
		]);
	});

	it("keeps a lane open to the bottom when the parent is not loaded", () => {
		const { rows } = computeLayout([c("C2", "C1"), c("C1", "unloaded")]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0)]),
			row(0, 0, [seg(0, 0, 0)], [seg(0, 0, 0)]),
		]);
	});

	it("gives a continuing branch the same colour on every row", () => {
		const { rows } = computeLayout([
			c("M", "A", "B"),
			c("B", "B2"),
			c("A", "A2"),
			c("B2"),
			c("A2"),
		]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0), seg(0, 1, 1)]),
			row(1, 1, [seg(0, 0, 0), seg(1, 1, 1)], [seg(0, 0, 0), seg(1, 1, 1)]),
			row(0, 0, [seg(0, 0, 0), seg(1, 1, 1)], [seg(0, 0, 0), seg(1, 1, 1)]),
			row(1, 1, [seg(0, 0, 0), seg(1, 1, 1)], [seg(0, 0, 0)]),
			row(0, 0, [seg(0, 0, 0)], []),
		]);
	});

	it("handles an octopus merge with three parents", () => {
		const { rows, laneCount } = computeLayout([
			c("O", "A", "B", "C"),
			c("B"),
			c("C"),
			c("A"),
		]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0), seg(0, 1, 1), seg(0, 2, 2)]),
			row(
				1,
				1,
				[seg(0, 0, 0), seg(1, 1, 1), seg(2, 2, 2)],
				[seg(0, 0, 0), seg(2, 2, 2)],
			),
			row(2, 2, [seg(0, 0, 0), seg(2, 2, 2)], [seg(0, 0, 0)]),
			row(0, 0, [seg(0, 0, 0)], []),
		]);
		expect(laneCount).toBe(3);
	});

	it("draws a merge edge into a lane that is already waiting for the parent", () => {
		const { rows } = computeLayout([c("T", "B"), c("M", "A", "B")]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0)]),
			row(1, 1, [seg(0, 0, 0)], [seg(0, 0, 0), seg(1, 1, 1), seg(1, 0, 0)]),
		]);
	});

	it("places a virtual uncommitted row above HEAD on HEAD's lane", () => {
		const { rows, laneCount } = computeLayout([
			c("*", "H"),
			c("H", "P"),
			c("P"),
		]);
		expectRows(rows, [
			row(0, 0, [], [seg(0, 0, 0)]),
			row(0, 0, [seg(0, 0, 0)], [seg(0, 0, 0)]),
			row(0, 0, [seg(0, 0, 0)], []),
		]);
		expect(laneCount).toBe(1);
	});

	it("returns an empty layout for no commits", () => {
		expect(computeLayout([])).toEqual({ rows: [], laneCount: 0 });
	});
});
