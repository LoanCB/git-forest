import { create } from "zustand";
import { getCommits, getRefs, getUncommitted } from "../git/api";
import type {
	Commit,
	FileChange,
	GitError,
	LogQuery,
	Refs,
} from "../git/types";
import { getRepoPrefs, setRepoPrefs } from "./prefs";
import { DEFAULT_REPO_PREFS, type RepoPrefs } from "./prefs.types";

export const PAGE_SIZE = 300;

interface RepoViewState {
	repo: string | null;
	refs: Refs | null;
	commits: Commit[];
	uncommitted: FileChange[];
	hasMore: boolean;
	loading: boolean;
	error: GitError | null;
	prefs: RepoPrefs;
	open(repo: string): Promise<void>;
	refresh(): Promise<void>;
	loadMore(): Promise<void>;
	loadUntil(hash: string): Promise<boolean>;
	setBranches(branches: string[] | null): Promise<void>;
	setShowRemotes(show: boolean): Promise<void>;
}

const toGitError = (e: unknown): GitError =>
	typeof e === "object" && e !== null && "kind" in e && "message" in e
		? (e as GitError)
		: { kind: "failed", message: String(e) };

// Bumped by every open() and history reload; a load that finds a different
// value when it resumes belongs to a stale request and drops its result.
let token = 0;
let refreshing = false;
let refreshQueued = false;
let pageLoad: Promise<void> | null = null;

const query = (prefs: RepoPrefs, skip: number, limit: number): LogQuery => ({
	refs: prefs.branches,
	includeRemotes: prefs.showRemotes,
	skip,
	limit,
});

export const useRepoView = create<RepoViewState>((set, get) => {
	/** Reloads the first `limit` commits for the current prefs, replacing the list. */
	async function reloadHistory(limit: number) {
		const { repo, prefs } = get();
		if (!repo) return;
		const mine = ++token;
		set({ loading: true, error: null });
		try {
			const page = await getCommits(repo, query(prefs, 0, limit));
			if (mine !== token) return;
			set({ commits: page.commits, hasMore: page.hasMore, loading: false });
		} catch (e) {
			if (mine === token) set({ error: toGitError(e), loading: false });
		}
	}

	async function refreshOnce() {
		const { repo, prefs, commits } = get();
		if (!repo) return;
		const mine = token;
		try {
			const limit = Math.max(PAGE_SIZE, commits.length);
			const [refs, page, uncommitted] = await Promise.all([
				getRefs(repo),
				getCommits(repo, query(prefs, 0, limit)),
				getUncommitted(repo),
			]);
			if (mine !== token) return;
			set({
				refs,
				commits: page.commits,
				hasMore: page.hasMore,
				uncommitted,
				error: null,
			});
		} catch (e) {
			if (mine === token) set({ error: toGitError(e) });
		}
	}

	return {
		repo: null,
		refs: null,
		commits: [],
		uncommitted: [],
		hasMore: false,
		loading: false,
		error: null,
		prefs: DEFAULT_REPO_PREFS,

		async open(repo) {
			const mine = ++token;
			set({
				repo,
				refs: null,
				commits: [],
				uncommitted: [],
				hasMore: false,
				loading: true,
				error: null,
				prefs: DEFAULT_REPO_PREFS,
			});
			try {
				const prefs = await getRepoPrefs(repo);
				if (mine !== token) return;
				set({ prefs });
				const [refs, page, uncommitted] = await Promise.all([
					getRefs(repo),
					getCommits(repo, query(prefs, 0, PAGE_SIZE)),
					getUncommitted(repo),
				]);
				if (mine !== token) return;
				set({
					refs,
					commits: page.commits,
					hasMore: page.hasMore,
					uncommitted,
					loading: false,
				});
			} catch (e) {
				if (mine === token) set({ error: toGitError(e), loading: false });
			}
		},

		async refresh() {
			if (refreshing) {
				refreshQueued = true;
				return;
			}
			refreshing = true;
			try {
				do {
					refreshQueued = false;
					await refreshOnce();
				} while (refreshQueued);
			} finally {
				refreshing = false;
			}
		},

		loadMore() {
			if (pageLoad) return pageLoad;
			const { repo, prefs, commits, hasMore, loading } = get();
			if (!repo || !hasMore || loading) return Promise.resolve();
			const mine = token;
			const run = (async () => {
				try {
					const page = await getCommits(
						repo,
						query(prefs, commits.length, PAGE_SIZE),
					);
					if (mine !== token) return;
					set((s) => ({
						commits: [...s.commits, ...page.commits],
						hasMore: page.hasMore,
					}));
				} catch (e) {
					if (mine === token) set({ error: toGitError(e) });
				}
			})().finally(() => {
				pageLoad = null;
			});
			pageLoad = run;
			return run;
		},

		async loadUntil(hash) {
			const startToken = token;
			for (;;) {
				const s = get();
				if (s.commits.some((c) => c.hash === hash)) return true;
				if (!s.hasMore || s.error || s.loading || token !== startToken)
					return false;
				await get().loadMore();
			}
		},

		async setBranches(branches) {
			const { repo } = get();
			if (!repo) return;
			const prefs = await setRepoPrefs(repo, { branches });
			if (get().repo !== repo) return;
			set({ prefs });
			await reloadHistory(PAGE_SIZE);
		},

		async setShowRemotes(showRemotes) {
			const { repo } = get();
			if (!repo) return;
			const prefs = await setRepoPrefs(repo, { showRemotes });
			if (get().repo !== repo) return;
			set({ prefs });
			await reloadHistory(PAGE_SIZE);
		},
	};
});
