import { describe, expect, it } from "vitest";
import type { Commit } from "@/git/types";
import { searchCommits } from "./search";

const commit = (
	hash: string,
	subject: string,
	name = "Ada",
	email = "a@x.io",
) =>
	({
		hash,
		parents: [],
		authorName: name,
		authorEmail: email,
		authorDate: 0,
		subject,
	}) satisfies Commit;

const commits = [
	commit("abcd1234".padEnd(40, "0"), "Fix Login bug"),
	commit("ffff9999".padEnd(40, "0"), "Add docs", "Bob Martin", "bob@corp.io"),
	commit("1234abcd".padEnd(40, "0"), "Refactor"),
];

describe("searchCommits", () => {
	it("matches subject, author and hash prefix case-insensitively", () => {
		expect(searchCommits(commits, "login")).toEqual([commits[0].hash]);
		expect(searchCommits(commits, "MARTIN")).toEqual([commits[1].hash]);
		expect(searchCommits(commits, "corp.io")).toEqual([commits[1].hash]);
		expect(searchCommits(commits, "ABCD12")).toEqual([commits[0].hash]);
	});

	it("ignores hash prefixes shorter than 4 hex chars", () => {
		expect(searchCommits(commits, "abc")).toEqual([]);
		expect(searchCommits(commits, "abcd")).toEqual([commits[0].hash]);
	});

	it("returns nothing for a blank query and keeps commit order", () => {
		expect(searchCommits(commits, "  ")).toEqual([]);
		expect(searchCommits(commits, "a")).toEqual([
			commits[0].hash,
			commits[1].hash,
			commits[2].hash,
		]);
	});
});
