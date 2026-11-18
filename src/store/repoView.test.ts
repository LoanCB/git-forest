import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Commit, CommitPage, Refs } from "../git/types";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...a: unknown[]) => invoke(...a),
}));

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

import { PAGE_SIZE, useRepoView } from "./repoView";

const commit = (n: number): Commit => ({
	hash: `h${n}`,
	parents: [],
	authorName: "a",
	authorEmail: "a@x",
	authorDate: n,
	subject: `c${n}`,
});
const range = (from: number, count: number) =>
	Array.from({ length: count }, (_, i) => commit(from + i));
const refs = (head: string | null = "h0"): Refs => ({
	head: { branch: "main", commit: head },
	locals: [],
	remotes: [],
	tags: [],
	remoteNames: [],
});

interface Handlers {
	get_refs?: (a: Record<string, unknown>) => unknown;
	get_commits?: (a: {
		repo: string;
		query: { skip: number; limit: number };
	}) => unknown;
	get_uncommitted?: (a: Record<string, unknown>) => unknown;
}
function mockBackend(h: Handlers = {}) {
	invoke.mockImplementation(async (cmd: string, args: never) => {
		const handler = (h as Record<string, (a: never) => unknown>)[cmd];
		if (handler) return handler(args);
		if (cmd === "get_refs") return refs();
		if (cmd === "get_commits")
			return { commits: [], hasMore: false } satisfies CommitPage;
		if (cmd === "get_uncommitted") return [];
		throw new Error(`unexpected ${cmd}`);
	});
}
const lastCommitCall = () => commitCalls()[commitCalls().length - 1][1];
const commitCalls = () =>
	invoke.mock.calls.filter((c) => c[0] === "get_commits");

beforeEach(async () => {
	invoke.mockReset();
	data.clear();
	// Bumping the module-level request token and clearing leftovers from a previous test.
	invoke.mockResolvedValue(undefined);
	await useRepoView.getState().open("/blank");
	invoke.mockReset();
	useRepoView.setState({ repo: null, error: null });
});

describe("useRepoView", () => {
	it("open loads refs, first page and uncommitted changes", async () => {
		const change = {
			status: "M",
			path: "a",
			oldPath: null,
			additions: 1,
			deletions: 0,
		};
		mockBackend({
			get_commits: () => ({ commits: range(0, 3), hasMore: true }),
			get_uncommitted: () => [change],
		});
		await useRepoView.getState().open("/r");
		const s = useRepoView.getState();
		expect(s.repo).toBe("/r");
		expect(s.refs?.head.commit).toBe("h0");
		expect(s.commits).toHaveLength(3);
		expect(s.hasMore).toBe(true);
		expect(s.uncommitted).toEqual([change]);
		expect(s.loading).toBe(false);
		expect(commitCalls()[0][1]).toEqual({
			repo: "/r",
			query: { refs: null, includeRemotes: true, skip: 0, limit: PAGE_SIZE },
		});
	});

	it("loadMore appends the next page with skip = commits.length", async () => {
		mockBackend({
			get_commits: ({ query }) =>
				query.skip === 0
					? { commits: range(0, 2), hasMore: true }
					: { commits: range(2, 2), hasMore: false },
		});
		await useRepoView.getState().open("/r");
		await useRepoView.getState().loadMore();
		const s = useRepoView.getState();
		expect(commitCalls()[1][1].query.skip).toBe(2);
		expect(s.commits.map((c) => c.hash)).toEqual(["h0", "h1", "h2", "h3"]);
		expect(s.hasMore).toBe(false);
	});

	it("setBranches reloads history for the chosen refs and persists prefs", async () => {
		mockBackend();
		await useRepoView.getState().open("/r");
		await useRepoView.getState().setBranches(["main"]);
		expect(lastCommitCall().query).toMatchObject({
			refs: ["main"],
			skip: 0,
		});
		expect(useRepoView.getState().prefs.branches).toEqual(["main"]);
		expect(data.get("repo:/r")).toMatchObject({ branches: ["main"] });
	});

	it("setShowRemotes(false) reloads with includeRemotes false", async () => {
		mockBackend();
		await useRepoView.getState().open("/r");
		await useRepoView.getState().setShowRemotes(false);
		expect(lastCommitCall().query.includeRemotes).toBe(false);
		expect(useRepoView.getState().prefs.showRemotes).toBe(false);
	});

	it("loadUntil pages until the hash is present, false when history ends", async () => {
		mockBackend({
			get_commits: ({ query }) => ({
				commits: range(query.skip, 2),
				hasMore: query.skip < 4,
			}),
		});
		await useRepoView.getState().open("/r");
		expect(await useRepoView.getState().loadUntil("h5")).toBe(true);
		expect(useRepoView.getState().commits).toHaveLength(6);
		expect(await useRepoView.getState().loadUntil("nope")).toBe(false);
	});

	it("coalesces refresh calls made while one is running", async () => {
		mockBackend();
		await useRepoView.getState().open("/r");
		invoke.mockClear();
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		mockBackend({
			get_refs: async () => {
				await gate;
				return refs();
			},
		});
		const first = useRepoView.getState().refresh();
		const second = useRepoView.getState().refresh();
		const third = useRepoView.getState().refresh();
		await second;
		await third;
		expect(invoke.mock.calls.filter((c) => c[0] === "get_refs")).toHaveLength(
			1,
		);
		release();
		await first;
		expect(invoke.mock.calls.filter((c) => c[0] === "get_refs")).toHaveLength(
			2,
		);
	});

	it("refresh reloads at least as many commits as are already loaded", async () => {
		mockBackend({
			get_commits: ({ query }) => ({
				commits: range(0, query.limit > 2 ? 2 : 0),
				hasMore: true,
			}),
		});
		await useRepoView.getState().open("/r");
		useRepoView.setState({ commits: range(0, 450) });
		await useRepoView.getState().refresh();
		expect(lastCommitCall().query.limit).toBe(450);
	});

	it("exposes a RepoNotFound error instead of throwing", async () => {
		invoke.mockRejectedValue({ kind: "repoNotFound", message: "/gone" });
		await expect(useRepoView.getState().open("/gone")).resolves.toBeUndefined();
		const s = useRepoView.getState();
		expect(s.error).toEqual({ kind: "repoNotFound", message: "/gone" });
		expect(s.loading).toBe(false);
	});

	it("normalises non-GitError rejections to kind failed", async () => {
		invoke.mockRejectedValue("boom");
		await useRepoView.getState().open("/r");
		expect(useRepoView.getState().error).toEqual({
			kind: "failed",
			message: "boom",
		});
	});

	it("an empty repository is valid: no commits, no error", async () => {
		mockBackend({ get_refs: () => refs(null) });
		await useRepoView.getState().open("/empty");
		const s = useRepoView.getState();
		expect(s.commits).toEqual([]);
		expect(s.error).toBeNull();
		expect(s.refs?.head.commit).toBeNull();
	});

	it("ignores results of a stale repository when another is opened meanwhile", async () => {
		let releaseA!: () => void;
		const gateA = new Promise<void>((r) => {
			releaseA = r;
		});
		mockBackend({
			get_commits: async ({ repo }) => {
				if (repo === "/a") {
					await gateA;
					return { commits: range(100, 2), hasMore: true };
				}
				return { commits: range(0, 1), hasMore: false };
			},
		});
		const a = useRepoView.getState().open("/a");
		await vi.waitFor(() => expect(commitCalls().length).toBe(1));
		await useRepoView.getState().open("/b");
		releaseA();
		await a;
		const s = useRepoView.getState();
		expect(s.repo).toBe("/b");
		expect(s.commits.map((c) => c.hash)).toEqual(["h0"]);
		expect(s.hasMore).toBe(false);
		expect(s.loading).toBe(false);
	});
});
