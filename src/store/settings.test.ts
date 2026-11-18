import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<string, unknown>();
const save = vi.fn(async () => {});
vi.mock("@tauri-apps/plugin-store", () => ({
	load: vi.fn(async () => ({
		get: async (k: string) => data.get(k),
		set: async (k: string, v: unknown) => {
			data.set(k, v);
		},
		save,
	})),
}));

import i18n from "@/i18n";
import { useSettings } from "./settings";

beforeEach(async () => {
	data.clear();
	save.mockClear();
	await i18n.changeLanguage("en");
	useSettings.setState({
		theme: "dark",
		language: "en",
		updateChannel: "stable",
	});
});

describe("useSettings", () => {
	it("defaults to the dark theme and the stable channel", () => {
		const s = useSettings.getState();
		expect(s.theme).toBe("dark");
		expect(s.updateChannel).toBe("stable");
	});

	it("persists each setting to the store", async () => {
		await useSettings.getState().setTheme("light");
		await useSettings.getState().setUpdateChannel("beta");
		expect(data.get("theme")).toBe("light");
		expect(data.get("updateChannel")).toBe("beta");
		expect(save).toHaveBeenCalledTimes(2);
		expect(useSettings.getState().theme).toBe("light");
	});

	it("setLanguage switches i18n and persists", async () => {
		await useSettings.getState().setLanguage("fr");
		expect(i18n.language).toBe("fr");
		expect(data.get("language")).toBe("fr");
		expect(useSettings.getState().language).toBe("fr");
	});

	it("load applies stored values and applies the language", async () => {
		data.set("theme", "system");
		data.set("language", "fr");
		data.set("updateChannel", "beta");
		await useSettings.getState().load();
		const s = useSettings.getState();
		expect([s.theme, s.language, s.updateChannel]).toEqual([
			"system",
			"fr",
			"beta",
		]);
		expect(i18n.language).toBe("fr");
	});

	it("load ignores invalid stored values", async () => {
		data.set("theme", "neon");
		data.set("updateChannel", 3);
		await useSettings.getState().load();
		const s = useSettings.getState();
		expect(s.theme).toBe("dark");
		expect(s.updateChannel).toBe("stable");
	});
});
