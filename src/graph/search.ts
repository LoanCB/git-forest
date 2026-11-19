import type { Commit } from "@/git/types";

const HEX_PREFIX = /^[0-9a-f]{4,40}$/;

/** Hashes of the commits matching `query`, in list order. */
export function searchCommits(commits: Commit[], query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const byHash = HEX_PREFIX.test(q);
	return commits
		.filter(
			(c) =>
				c.subject.toLowerCase().includes(q) ||
				c.authorName.toLowerCase().includes(q) ||
				c.authorEmail.toLowerCase().includes(q) ||
				(byHash && c.hash.startsWith(q)),
		)
		.map((c) => c.hash);
}
