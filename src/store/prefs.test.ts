import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<string, unknown>();
vi.mock("@tauri-apps/plugin-store", () => ({
	load: vi.fn(async () => ({
		get: async (k: string) => data.get(k),
		set: async (k: string, v: unknown) => {
			data.set(k, v);
		},
		save: async () => {},
	})),
}));

import { getLastRepo, getRepoPrefs, setLastRepo, setRepoPrefs } from "./prefs";

beforeEach(() => data.clear());

describe("prefs", () => {
	it("prefs default to Show All and remote branches shown", async () => {
		const prefs = await getRepoPrefs("/r");
		expect(prefs.branches).toBeNull();
		expect(prefs.showRemotes).toBe(true);
		expect(Object.keys(prefs.columnWidths).sort()).toEqual([
			"author",
			"commit",
			"date",
			"description",
			"graph",
		]);
	});

	it("setRepoPrefs merges a patch and persists per repository", async () => {
		await setRepoPrefs("/r", { showRemotes: false });
		await setRepoPrefs("/r", { branches: ["main"] });
		expect(await getRepoPrefs("/r")).toMatchObject({
			showRemotes: false,
			branches: ["main"],
		});
		expect((await getRepoPrefs("/other")).showRemotes).toBe(true);
	});

	it("keeps default column widths when only some are stored", async () => {
		await setRepoPrefs("/r", { columnWidths: { graph: 10 } as never });
		const prefs = await getRepoPrefs("/r");
		expect(prefs.columnWidths.graph).toBe(10);
		expect(prefs.columnWidths.date).toBeGreaterThan(0);
	});

	it("remembers the last repository", async () => {
		expect(await getLastRepo()).toBeNull();
		await setLastRepo("/r");
		expect(await getLastRepo()).toBe("/r");
	});
});
