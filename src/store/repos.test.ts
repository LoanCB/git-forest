import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...a: unknown[]) => invoke(...a),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
	load: vi.fn(async () => ({
		get: async () => undefined,
		set: async () => {},
		save: async () => {},
	})),
}));

import { useReposStore } from "./repos";

beforeEach(() => {
	invoke.mockReset();
	useReposStore.setState({ repos: [], current: null });
});

describe("useReposStore.addMany", () => {
	it("reports added entries and failed paths with normalised errors", async () => {
		invoke.mockImplementation(
			async (_cmd: string, { path }: { path: string }) => {
				if (path === "/gone") throw { kind: "repoNotFound", message: "/gone" };
				if (path === "/odd") throw "boom";
				return { path, name: path.slice(1) };
			},
		);
		const res = await useReposStore
			.getState()
			.addMany(["/a", "/gone", "/odd", "/b"]);
		expect(res.added.map((r) => r.path)).toEqual(["/a", "/b"]);
		expect(res.failed).toEqual([
			{ path: "/gone", error: { kind: "repoNotFound", message: "/gone" } },
			{ path: "/odd", error: { kind: "failed", message: "boom" } },
		]);
		expect(useReposStore.getState().repos.map((r) => r.path)).toEqual([
			"/a",
			"/b",
		]);
	});

	it("adds one path at a time", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		invoke.mockImplementation(
			async (_cmd: string, { path }: { path: string }) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise((r) => setTimeout(r, 5));
				inFlight--;
				return { path, name: path.slice(1) };
			},
		);
		await useReposStore.getState().addMany(["/a", "/b", "/c"]);
		expect(maxInFlight).toBe(1);
		expect(useReposStore.getState().repos.map((r) => r.path)).toEqual([
			"/a",
			"/b",
			"/c",
		]);
	});
});
