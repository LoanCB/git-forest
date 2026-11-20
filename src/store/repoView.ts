import { create } from "zustand";
import { getCommits, getRefs, getUncommitted, toGitError } from "../git/api";
import type {
	Commit,
	FileChange,
	GitError,
	LogQuery,
	Refs,
} from "../git/types";
import { getRepoPrefs, setRepoPrefs } from "./prefs";
import { DEFAULT_REPO_PREFS, type RepoPrefs } from "./prefs.types";
import type { RefreshScope } from "./repoView.types";

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
	/** Hash the commit table should scroll to; cleared once it has done so. */
	scrollTarget: string | null;
	open(repo: string): Promise<void>;
	/** Drops the open repository (e.g. it was removed from the list) and any load in flight. */
	close(): void;
	/** Re-reads the repository; `"status"` only re-reads the uncommitted changes. */
	refresh(scope?: RefreshScope): Promise<void>;
	loadMore(): Promise<void>;
	loadUntil(hash: string): Promise<boolean>;
	/** Loads pages until `hash` is listed, runs `beforeScroll`, then sets `scrollTarget`. False if it is not in the view. */
	requestScrollTo(hash: string, beforeScroll?: () => void): Promise<boolean>;
	clearScrollTarget(): void;
	setBranches(branches: string[] | null): Promise<void>;
	setShowRemotes(show: boolean): Promise<void>;
}

// Bumped by every open() and history reload; a load that finds a different
// value when it resumes belongs to a stale request and drops its result.
let token = 0;
// Bumped whenever `commits` is replaced; a loadMore computed against an older
// list must not append to the new one.
let listVersion = 0;
let refreshLoop: Promise<void> | null = null;
let refreshQueued: RefreshScope | null = null;
let pageLoad: Promise<void> | null = null;

/** The scope covering both `a` and `b`. */
export const mergeScopes = (
	a: RefreshScope | null,
	b: RefreshScope,
): RefreshScope => (a === "all" || b === "all" ? "all" : "status");

// Commits are identified by their hash, so equal hash lists hold equal commits.
const sameCommits = (a: Commit[], b: Commit[]) =>
	a.length === b.length && a.every((c, i) => c.hash === b[i].hash);

const sameJson = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);

const query = (prefs: RepoPrefs, skip: number, limit: number): LogQuery => ({
	refs: prefs.branches,
	includeRemotes: prefs.showRemotes,
	skip,
	limit,
});

/**
 * `branches` without the names absent from `refs` (deleted or renamed since
 * they were chosen); `null` (Show All) when none is left. Returns `branches`
 * itself when nothing is dropped.
 */
function liveBranches(branches: string[] | null, refs: Refs): string[] | null {
	if (!branches) return branches;
	const live = new Set([
		...refs.locals.map((b) => b.name),
		...refs.remotes.map((b) => `${b.remote}/${b.name}`),
	]);
	const kept = branches.filter((b) => live.has(b));
	if (kept.length === branches.length) return branches;
	return kept.length > 0 ? kept : null;
}

export const useRepoView = create<RepoViewState>((set, get) => {
	/** Persists `prefs` without the branches missing from `refs`, if any. */
	async function pruneBranches(
		repo: string,
		prefs: RepoPrefs,
		refs: Refs,
	): Promise<RepoPrefs> {
		const branches = liveBranches(prefs.branches, refs);
		return branches === prefs.branches
			? prefs
			: setRepoPrefs(repo, { branches });
	}

	/** Reloads the first `limit` commits for the current prefs, replacing the list. */
	async function reloadHistory(limit: number) {
		const { repo, prefs } = get();
		if (!repo) return;
		const mine = ++token;
		set({ loading: true, error: null });
		try {
			const page = await getCommits(repo, query(prefs, 0, limit));
			if (mine !== token) return;
			listVersion++;
			set({ commits: page.commits, hasMore: page.hasMore, loading: false });
		} catch (e) {
			if (mine === token) set({ error: toGitError(e), loading: false });
		}
	}

	// Unchanged data keeps its previous object, so a refresh that finds nothing
	// new neither re-lays out the graph nor re-renders the table.
	async function refreshStatus() {
		const { repo } = get();
		if (!repo) return;
		const mine = token;
		try {
			const uncommitted = await getUncommitted(repo);
			if (mine !== token) return;
			const s = get();
			if (!sameJson(uncommitted, s.uncommitted)) set({ uncommitted });
			if (s.error) set({ error: null });
		} catch (e) {
			if (mine === token) set({ error: toGitError(e) });
		}
	}

	async function refreshOnce() {
		const { repo, commits } = get();
		if (!repo) return;
		const mine = token;
		try {
			const limit = Math.max(PAGE_SIZE, commits.length);
			// Refs first: a filtered branch may have been deleted meanwhile.
			const [refs, uncommitted] = await Promise.all([
				getRefs(repo),
				getUncommitted(repo),
			]);
			if (mine !== token) return;
			const prefs = await pruneBranches(repo, get().prefs, refs);
			if (mine !== token) return;
			const page = await getCommits(repo, query(prefs, 0, limit));
			if (mine !== token) return;
			// Even an unchanged list drops a loadMore in flight, which may append
			// to a list that has grown meanwhile.
			listVersion++;
			const s = get();
			const patch: Partial<RepoViewState> = {};
			if (prefs !== s.prefs) patch.prefs = prefs;
			if (!sameJson(refs, s.refs)) patch.refs = refs;
			if (!sameCommits(page.commits, s.commits)) patch.commits = page.commits;
			if (page.hasMore !== s.hasMore) patch.hasMore = page.hasMore;
			if (!sameJson(uncommitted, s.uncommitted))
				patch.uncommitted = uncommitted;
			if (s.error) patch.error = null;
			if (Object.keys(patch).length > 0) set(patch);
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
		scrollTarget: null,

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
				scrollTarget: null,
			});
			try {
				const [stored, refs, uncommitted] = await Promise.all([
					getRepoPrefs(repo),
					getRefs(repo),
					getUncommitted(repo),
				]);
				if (mine !== token) return;
				// A filtered branch deleted or renamed since would fail the log.
				const prefs = await pruneBranches(repo, stored, refs);
				if (mine !== token) return;
				set({ prefs });
				const page = await getCommits(repo, query(prefs, 0, PAGE_SIZE));
				if (mine !== token) return;
				listVersion++;
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

		close() {
			token++;
			listVersion++;
			set({
				repo: null,
				refs: null,
				commits: [],
				uncommitted: [],
				hasMore: false,
				loading: false,
				error: null,
				prefs: DEFAULT_REPO_PREFS,
				scrollTarget: null,
			});
		},

		refresh(scope = "all") {
			// A call during a refresh queues one more run and resolves with the loop,
			// so its caller sees the data that follows its own change.
			refreshQueued = mergeScopes(refreshQueued, scope);
			if (refreshLoop) return refreshLoop;
			const loop = (async () => {
				try {
					while (refreshQueued) {
						const next = refreshQueued;
						refreshQueued = null;
						await (next === "all" ? refreshOnce() : refreshStatus());
					}
				} finally {
					refreshLoop = null;
				}
			})();
			refreshLoop = loop;
			return loop;
		},

		loadMore() {
			if (pageLoad) return pageLoad;
			const { repo, prefs, commits, hasMore, loading } = get();
			if (!repo || !hasMore || loading) return Promise.resolve();
			const mine = token;
			const version = listVersion;
			const run = (async () => {
				try {
					const page = await getCommits(
						repo,
						query(prefs, commits.length, PAGE_SIZE),
					);
					if (mine !== token || version !== listVersion) return;
					set((s) => ({
						commits: [...s.commits, ...page.commits],
						hasMore: page.hasMore,
					}));
				} catch (e) {
					if (mine === token && version === listVersion)
						set({ error: toGitError(e) });
				}
			})().finally(() => {
				pageLoad = null;
			});
			pageLoad = run;
			return run;
		},

		async loadUntil(hash) {
			const startToken = token;
			// Each page starts where the previous one ended, so pages load one by one.
			const step = async (): Promise<boolean> => {
				const s = get();
				if (s.commits.some((c) => c.hash === hash)) return true;
				if (!s.hasMore || s.error || s.loading || token !== startToken)
					return false;
				await get().loadMore();
				return step();
			};
			return step();
		},

		async requestScrollTo(hash, beforeScroll) {
			const startToken = token;
			// A history reload in flight would make loadUntil give up; wait for it.
			if (get().loading)
				await new Promise<void>((resolve) => {
					const unsubscribe = useRepoView.subscribe((s) => {
						if (!s.loading) {
							unsubscribe();
							resolve();
						}
					});
				});
			if (token !== startToken || !(await get().loadUntil(hash))) return false;
			// Lets the caller commit layout changes (e.g. a panel) before the scroll.
			beforeScroll?.();
			set({ scrollTarget: hash });
			return true;
		},

		clearScrollTarget() {
			set({ scrollTarget: null });
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
