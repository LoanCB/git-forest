import { describe, expect, it } from "vitest";
import { UNCOMMITTED_COLOR } from "@/graph/constants";
import { computeLayout } from "@/graph/layout";
import type { GraphInput, Segment } from "@/graph/types";
import { withUncommitted } from "@/graph/uncommitted";

const c = (hash: string, ...parents: string[]): GraphInput => ({
	hash,
	parents,
});
const grey = (segments: Segment[]) =>
	segments.filter((s) => s.color === UNCOMMITTED_COLOR);
const nonGrey = (segments: Segment[]) =>
	segments.filter((s) => s.color !== UNCOMMITTED_COLOR);

describe("withUncommitted", () => {
	it("adds a grey row above HEAD on HEAD's lane when HEAD is on top", () => {
		const commits = [c("h", "p"), c("p")];
		const clean = computeLayout(commits);
		const dirty = withUncommitted(clean, commits, "h");
		expect(dirty.rows).toHaveLength(3);
		expect(dirty.rows[0]).toEqual({
			lane: 0,
			color: UNCOMMITTED_COLOR,
			up: [],
			down: [{ from: 0, to: 0, color: UNCOMMITTED_COLOR }],
		});
		expect(grey(dirty.rows[1].up)).toEqual([
			{ from: 0, to: 0, color: UNCOMMITTED_COLOR },
		]);
		expect(dirty.rows.slice(1)).toEqual(
			clean.rows.map((r, i) =>
				i === 0
					? { ...r, up: [{ from: 0, to: 0, color: UNCOMMITTED_COLOR }] }
					: r,
			),
		);
	});

	it("keeps every commit's lane and colour when HEAD is below another branch tip", () => {
		const commits = [c("x1", "c1"), c("head", "c1"), c("c1")];
		const clean = computeLayout(commits);
		const dirty = withUncommitted(clean, commits, "head");
		const rows = dirty.rows.slice(1);
		expect(rows.map((r) => [r.lane, r.color])).toEqual(
			clean.rows.map((r) => [r.lane, r.color]),
		);
		rows.forEach((r, i) => {
			expect(nonGrey(r.up)).toEqual(clean.rows[i].up);
			expect(nonGrey(r.down)).toEqual(clean.rows[i].down);
		});
		// HEAD (lane 1) is free above its row, so the grey line runs straight down it.
		const lane = clean.rows[1].lane;
		expect(dirty.rows[0].lane).toBe(lane);
		expect(grey(rows[0].down)).toEqual([
			{ from: lane, to: lane, color: UNCOMMITTED_COLOR },
		]);
		expect(grey(rows[1].up)).toEqual([
			{ from: lane, to: lane, color: UNCOMMITTED_COLOR },
		]);
		expect(grey(rows[1].down)).toEqual([]);
	});

	it("uses a free lane and curves into HEAD when HEAD's lane is busy above it", () => {
		// "child" sits on HEAD's lane above HEAD.
		const commits = [c("child", "head"), c("head", "p"), c("p")];
		const clean = computeLayout(commits);
		const dirty = withUncommitted(clean, commits, "head");
		expect(dirty.rows[0].lane).toBe(1);
		expect(dirty.laneCount).toBe(2);
		expect(grey(dirty.rows[2].up)).toEqual([
			{ from: 1, to: 0, color: UNCOMMITTED_COLOR },
		]);
		expect(dirty.rows.slice(1).map((r) => r.color)).toEqual(
			clean.rows.map((r) => r.color),
		);
	});

	it("runs the line to the bottom when HEAD is not loaded", () => {
		const commits = [c("a", "b"), c("b")];
		const dirty = withUncommitted(computeLayout(commits), commits, "zzz");
		expect(dirty.rows[0].lane).toBe(1);
		for (const r of dirty.rows.slice(1)) {
			expect(grey(r.up)).toEqual([
				{ from: 1, to: 1, color: UNCOMMITTED_COLOR },
			]);
			expect(grey(r.down)).toEqual([
				{ from: 1, to: 1, color: UNCOMMITTED_COLOR },
			]);
		}
	});

	it("draws a lone node in an empty repository", () => {
		const dirty = withUncommitted(computeLayout([]), [], null);
		expect(dirty.rows).toEqual([
			{ lane: 0, color: UNCOMMITTED_COLOR, up: [], down: [] },
		]);
		expect(dirty.laneCount).toBe(1);
	});
});
