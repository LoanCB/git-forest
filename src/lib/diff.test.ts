import { describe, expect, it } from "vitest";
import { diffLineKeys, parseUnifiedDiff } from "./diff";

it("parses hunks with line numbers for added, removed and context lines", () => {
	const text = [
		"diff --git a/a.txt b/a.txt",
		"index 111..222 100644",
		"--- a/a.txt",
		"+++ b/a.txt",
		"@@ -3,3 +3,3 @@ fn",
		" keep",
		"-old",
		"+new",
		" tail",
		"\\ No newline at end of file",
		"@@ -20 +20,2 @@",
		"+extra",
		"",
	].join("\n");
	const lines = parseUnifiedDiff(text);
	expect(lines.map((l) => l.kind)).toEqual([
		"meta",
		"meta",
		"meta",
		"meta",
		"hunk",
		"ctx",
		"del",
		"add",
		"ctx",
		"meta",
		"hunk",
		"add",
	]);
	expect(lines[5]).toEqual({ kind: "ctx", text: "keep", oldNo: 3, newNo: 3 });
	expect(lines[6]).toEqual({ kind: "del", text: "old", oldNo: 4 });
	expect(lines[7]).toEqual({ kind: "add", text: "new", newNo: 4 });
	expect(lines[8]).toMatchObject({ oldNo: 5, newNo: 5 });
	expect(lines[11]).toEqual({ kind: "add", text: "extra", newNo: 20 });
});

it("marks a binary file diff as meta", () => {
	const lines = parseUnifiedDiff(
		"diff --git a/i.png b/i.png\nindex 1..2 100644\nBinary files a/i.png and b/i.png differ\n",
	);
	expect(lines).toHaveLength(3);
	expect(lines.every((l) => l.kind === "meta")).toBe(true);
});

describe("diffLineKeys", () => {
	it("gives every line a distinct key, suffixing repeated lines", () => {
		const lines = parseUnifiedDiff(
			[
				"@@ -1 +1 @@",
				"-a",
				"\\ No newline at end of file",
				"+b",
				"\\ No newline at end of file",
			].join("\n"),
		);
		const keys = diffLineKeys(lines);
		expect(new Set(keys).size).toBe(lines.length);
		expect(keys[4]).toBe(`${keys[2]}#1`);
	});
});
