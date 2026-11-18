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
export const repoExists = (path: string) =>
	call<boolean>("repo_exists", { path });

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
