import { afterEach, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => vi.restoreAllMocks());

it("uses the Clipboard API when it is available", async () => {
	const writeText = vi.fn(async () => {});
	vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
		writeText,
	} as unknown as Clipboard);
	await copyText("main");
	expect(writeText).toHaveBeenCalledWith("main");
});

it("falls back to execCommand when the Clipboard API refuses", async () => {
	vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
		writeText: vi.fn(async () => {
			throw new Error("denied");
		}),
	} as unknown as Clipboard);
	const exec = vi.fn(() => true);
	document.execCommand = exec;
	await copyText("v1.0.0");
	expect(exec).toHaveBeenCalledWith("copy");
	expect(document.querySelector("textarea")).toBeNull();
});
