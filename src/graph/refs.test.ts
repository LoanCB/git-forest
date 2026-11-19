import { describe, expect, it } from "vitest";
import type { Refs } from "@/git/types";
import { groupRefs } from "@/graph/refs";

const refs = (patch: Partial<Refs>): Refs => ({
	head: { branch: "main", commit: "c1" },
	locals: [],
	remotes: [],
	tags: [],
	remoteNames: ["origin"],
	...patch,
});

describe("groupRefs", () => {
	it("merges origin/develop into the local develop badge when on the same commit", () => {
		const map = groupRefs(
			refs({
				locals: [{ name: "develop", commit: "c2", upstream: "origin/develop" }],
				remotes: [
					{ remote: "origin", name: "develop", commit: "c2", isHead: false },
				],
			}),
			true,
		);
		expect(map.get("c2")).toEqual([
			{
				kind: "local",
				name: "develop",
				remotes: ["origin"],
				current: false,
				upstream: "origin/develop",
			},
		]);
	});

	it("keeps origin/feat/x separate when it points elsewhere", () => {
		const map = groupRefs(
			refs({
				locals: [{ name: "feat/x", commit: "c2", upstream: null }],
				remotes: [
					{ remote: "origin", name: "feat/x", commit: "c3", isHead: false },
				],
			}),
			true,
		);
		expect(map.get("c2")).toEqual([
			{ kind: "local", name: "feat/x", remotes: [], current: false },
		]);
		expect(map.get("c3")).toEqual([
			{ kind: "remote", remote: "origin", name: "feat/x", isHead: false },
		]);
	});

	it("handles slashes in branch names and a remote other than origin", () => {
		const map = groupRefs(
			refs({
				remoteNames: ["origin", "upstream"],
				locals: [{ name: "feat/a/b", commit: "c2", upstream: null }],
				remotes: [
					{ remote: "upstream", name: "feat/a/b", commit: "c2", isHead: false },
					{ remote: "origin", name: "a/b", commit: "c2", isHead: false },
				],
			}),
			true,
		);
		expect(map.get("c2")).toEqual([
			{
				kind: "local",
				name: "feat/a/b",
				remotes: ["upstream"],
				current: false,
			},
			{ kind: "remote", remote: "origin", name: "a/b", isHead: false },
		]);
	});

	it("marks the current branch and orders current first", () => {
		const map = groupRefs(
			refs({
				head: { branch: "main", commit: "c1" },
				locals: [
					{ name: "aaa", commit: "c1", upstream: null },
					{ name: "main", commit: "c1", upstream: null },
				],
				remotes: [
					{ remote: "origin", name: "zzz", commit: "c1", isHead: false },
				],
				tags: [{ name: "v1.0.0", commit: "c1", annotated: true }],
			}),
			true,
		);
		expect(map.get("c1")).toEqual([
			{ kind: "local", name: "main", remotes: [], current: true },
			{ kind: "local", name: "aaa", remotes: [], current: false },
			{ kind: "remote", remote: "origin", name: "zzz", isHead: false },
			{ kind: "tag", name: "v1.0.0" },
		]);
	});

	it("flags the origin/HEAD target and drops all remotes when showRemotes is false", () => {
		const input = refs({
			locals: [{ name: "develop", commit: "c2", upstream: "origin/develop" }],
			remotes: [
				{ remote: "origin", name: "develop", commit: "c2", isHead: true },
				{ remote: "origin", name: "feat/x", commit: "c3", isHead: false },
			],
			tags: [{ name: "v0.10.0", commit: "c2", annotated: false }],
		});

		expect(groupRefs(input, true).get("c2")).toEqual([
			{
				kind: "local",
				name: "develop",
				remotes: ["origin"],
				current: false,
				upstream: "origin/develop",
			},
			{ kind: "remote", remote: "origin", name: "HEAD", isHead: true },
			{ kind: "tag", name: "v0.10.0" },
		]);

		const hidden = groupRefs(input, false);
		expect(hidden.get("c2")).toEqual([
			{
				kind: "local",
				name: "develop",
				remotes: [],
				current: false,
				upstream: "origin/develop",
			},
			{ kind: "tag", name: "v0.10.0" },
		]);
		expect(hidden.has("c3")).toBe(false);
	});
});
