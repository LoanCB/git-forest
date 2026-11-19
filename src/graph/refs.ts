import type { Refs } from "@/git/types";
import type { RefBadge } from "@/graph/refs.types";

/**
 * Badges per commit hash, ordered locals (current first), remotes, tags.
 * A remote branch with the same name and commit as a local one is folded
 * into the local badge, like `develop | origin`.
 */
export function groupRefs(
	refs: Refs,
	showRemotes: boolean,
): Map<string, RefBadge[]> {
	// Filled locals, then remotes, then tags: that is the order within a commit.
	const result = new Map<string, RefBadge[]>();
	const push = (hash: string, b: RefBadge) => {
		const list = result.get(hash);
		if (list) list.push(b);
		else result.set(hash, [b]);
	};

	const remoteBranches = showRemotes ? refs.remotes : [];
	const folded = new Set<(typeof remoteBranches)[number]>();
	const current = refs.head.branch;
	const ordered = [...refs.locals].sort(
		(a, b) => Number(b.name === current) - Number(a.name === current),
	);

	for (const local of ordered) {
		const same = remoteBranches.filter(
			(r) => r.name === local.name && r.commit === local.commit,
		);
		for (const r of same) folded.add(r);
		push(local.commit, {
			kind: "local",
			name: local.name,
			remotes: same.map((r) => r.remote),
			current: local.name === current,
			...(local.upstream ? { upstream: local.upstream } : {}),
		});
	}

	for (const r of remoteBranches) {
		if (!folded.has(r))
			push(r.commit, {
				kind: "remote",
				remote: r.remote,
				name: r.name,
				isHead: false,
			});
		if (r.isHead)
			push(r.commit, {
				kind: "remote",
				remote: r.remote,
				name: "HEAD",
				isHead: true,
			});
	}

	for (const tag of refs.tags)
		push(tag.commit, { kind: "tag", name: tag.name });

	return result;
}
