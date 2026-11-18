export type GitErrorKind =
	| "gitNotFound"
	| "repoNotFound"
	| "notARepo"
	| "notRegistered"
	| "invalidName"
	| "cancelled"
	| "failed";

export interface GitError {
	kind: GitErrorKind;
	message: string;
}

export interface RepoEntry {
	path: string;
	name: string;
}

export interface Head {
	/** `null` means a detached HEAD. */
	branch: string | null;
	/** `null` means an empty repository. */
	commit: string | null;
}

export interface LocalBranch {
	name: string;
	commit: string;
	upstream: string | null;
}

export interface RemoteBranch {
	remote: string;
	name: string;
	commit: string;
	/** True for the target of `<remote>/HEAD`. */
	isHead: boolean;
}

export interface Tag {
	name: string;
	/** The commit the tag points at (peeled). */
	commit: string;
	annotated: boolean;
}

export interface Refs {
	head: Head;
	locals: LocalBranch[];
	remotes: RemoteBranch[];
	tags: Tag[];
	remoteNames: string[];
}

export interface Commit {
	hash: string;
	parents: string[];
	authorName: string;
	authorEmail: string;
	/** Unix seconds. */
	authorDate: number;
	subject: string;
}

export interface CommitPage {
	commits: Commit[];
	hasMore: boolean;
}

export interface LogQuery {
	/** `null` means every ref (Show All). */
	refs: string[] | null;
	includeRemotes: boolean;
	skip: number;
	limit: number;
}

export interface FileChange {
	/** One of A M D R C T, or ? for untracked. */
	status: string;
	path: string;
	oldPath: string | null;
	/** `null` for binary or untracked files. */
	additions: number | null;
	deletions: number | null;
}

export interface CommitDetails {
	hash: string;
	parents: string[];
	authorName: string;
	authorEmail: string;
	authorDate: number;
	committerName: string;
	committerEmail: string;
	committerDate: number;
	message: string;
	files: FileChange[];
}

export type DiffTarget =
	| { kind: "commit"; hash: string }
	| { kind: "workingTree" };
