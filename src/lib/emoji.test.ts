import { expect, it } from "vitest";
import { replaceShortcodes } from "@/lib/emoji";

it("replaces known gitmoji shortcodes", () => {
	expect(replaceShortcodes("feat(graph): :sparkles: draw it")).toBe(
		"feat(graph): \u2728 draw it",
	);
	expect(replaceShortcodes(":bug: :memo: :white_check_mark: :lock:")).toBe(
		"\u{1F41B} \u{1F4DD} \u2705 \u{1F512}",
	);
});

it("replaces several codes on a line, even back to back", () => {
	expect(replaceShortcodes(":fire::pencil2: and :lipstick:")).toBe(
		"\u{1F525}\u270F\uFE0F and \u{1F484}",
	);
	expect(replaceShortcodes("x :speech_balloon:")).toBe("x 💬");
});

it("leaves unknown codes literal", () => {
	expect(replaceShortcodes("fix: :not_an_emoji: here")).toBe(
		"fix: :not_an_emoji: here",
	);
});

it("does not replace inside words or times", () => {
	expect(replaceShortcodes("a:bug:c")).toBe("a:bug:c");
	expect(replaceShortcodes("a:b:c")).toBe("a:b:c");
	expect(replaceShortcodes("at 12:30:45")).toBe("at 12:30:45");
});
