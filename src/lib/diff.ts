import type { DiffLine } from "./diff.types";

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parses the output of a single-file `git diff` into displayable lines. */
export function parseUnifiedDiff(text: string): DiffLine[] {
	const lines = text.split("\n");
	if (lines[lines.length - 1] === "") lines.pop();
	const out: DiffLine[] = [];
	let oldNo = 0;
	let newNo = 0;
	let inHunk = false;
	for (const line of lines) {
		if (line.startsWith("diff --git ")) {
			inHunk = false;
			out.push({ kind: "meta", text: line });
			continue;
		}
		const hunk = HUNK.exec(line);
		if (hunk && (!inHunk || line.startsWith("@@ "))) {
			inHunk = true;
			oldNo = Number(hunk[1]);
			newNo = Number(hunk[2]);
			out.push({ kind: "hunk", text: line });
			continue;
		}
		if (!inHunk) {
			out.push({ kind: "meta", text: line });
			continue;
		}
		switch (line[0]) {
			case "+":
				out.push({ kind: "add", text: line.slice(1), newNo: newNo++ });
				break;
			case "-":
				out.push({ kind: "del", text: line.slice(1), oldNo: oldNo++ });
				break;
			case "\\":
				out.push({ kind: "meta", text: line });
				break;
			default:
				out.push({
					kind: "ctx",
					text: line.slice(1),
					oldNo: oldNo++,
					newNo: newNo++,
				});
		}
	}
	return out;
}
