import { invoke } from "@tauri-apps/api/core";
import type {
	CommitDetails,
	CommitPage,
	DiffTarget,
	FileChange,
	GitError,
	LogQuery,
	Refs,
	RepoEntry,
} from "./types";

export function isGitError(e: unknown): e is GitError {
	return (
		typeof e === "object" &&
		e !== null &&
		typeof (e as GitError).kind === "string" &&
		typeof (e as GitError).message === "string"
	);
}

export const toGitError = (e: unknown): GitError =>
	isGitError(e) ? e : { kind: "failed", message: String(e) };

/** Rejects with a `GitError` whatever Tauri threw. */
async function call<T>(
	cmd: string,
	args?: Record<string, unknown>,
): Promise<T> {
	try {
		return await invoke<T>(cmd, args);
	} catch (e) {
		throw isGitError(e)
			? e
			: ({ kind: "failed", message: String(e) } satisfies GitError);
	}
}

export const listRepos = () => call<RepoEntry[]>("list_repos");
export const addRepo = (path: string) => call<RepoEntry>("add_repo", { path });
export const removeRepo = (path: string) => call<void>("remove_repo", { path });
export const scanRepos = (root: string) =>
	call<string[]>("scan_repos", { root });

export const getRefs = (repo: string) => call<Refs>("get_refs", { repo });
export const getCommits = (repo: string, query: LogQuery) =>
	call<CommitPage>("get_commits", { repo, query });
export const getUncommitted = (repo: string) =>
	call<FileChange[]>("get_uncommitted", { repo });
export const getCommitDetails = (repo: string, hash: string) =>
	call<CommitDetails>("get_commit_details", { repo, hash });
export const getFileDiff = (
	repo: string,
	target: DiffTarget,
	path: string,
	oldPath: string | null = null,
) => call<string>("get_file_diff", { repo, target, path, oldPath });
export const resolveCommit = (repo: string, rev: string) =>
	call<string | null>("resolve_commit", { repo, rev });

export const checkoutBranch = (repo: string, name: string) =>
	call<void>("checkout_branch", { repo, name });
export const checkoutCommit = (repo: string, hash: string) =>
	call<void>("checkout_commit", { repo, hash });
export const checkoutRemoteBranch = (
	repo: string,
	remote: string,
	name: string,
) => call<void>("checkout_remote_branch", { repo, remote, name });
export const createBranch = (
	repo: string,
	name: string,
	at: string,
	checkout: boolean,
) => call<void>("create_branch", { repo, name, at, checkout });
export const renameBranch = (repo: string, old: string, newName: string) =>
	call<void>("rename_branch", { repo, old, new: newName });
export const deleteBranch = (repo: string, name: string, force: boolean) =>
	call<void>("delete_branch", { repo, name, force });
export const addTag = (
	repo: string,
	name: string,
	at: string,
	message: string | null = null,
) => call<void>("add_tag", { repo, name, at, message });
export const deleteTag = (repo: string, name: string) =>
	call<void>("delete_tag", { repo, name });

/** `opId` comes from `crypto.randomUUID()` and is what `cancelOperation` takes. */
export const fetch = (opId: string, repo: string, prune: boolean) =>
	call<void>("fetch", { opId, repo, prune });
export const pushBranch = (
	opId: string,
	repo: string,
	remote: string,
	name: string,
	setUpstream: boolean,
) => call<void>("push_branch", { opId, repo, remote, name, setUpstream });
export const pushTag = (
	opId: string,
	repo: string,
	remote: string,
	name: string,
) => call<void>("push_tag", { opId, repo, remote, name });
export const deleteRemoteBranch = (
	opId: string,
	repo: string,
	remote: string,
	name: string,
) => call<void>("delete_remote_branch", { opId, repo, remote, name });
export const deleteRemoteTag = (
	opId: string,
	repo: string,
	remote: string,
	name: string,
) => call<void>("delete_remote_tag", { opId, repo, remote, name });
export const cancelOperation = (opId: string) =>
	call<void>("cancel_operation", { opId });

// The backend runs commands on a thread pool in no fixed order; it applies
// only a watch/unwatch newer than the last one it saw.
let watchGeneration = 0;

/** Starts watching `repo` (replacing any previous watch); changes arrive as `repo-changed`. */
export const watchRepo = (repo: string) =>
	call<void>("watch_repo", { repo, generation: ++watchGeneration });
export const unwatchRepo = () =>
	call<void>("unwatch_repo", { generation: ++watchGeneration });
