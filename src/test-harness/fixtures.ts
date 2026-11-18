// A made-up repository and the command dispatcher that serves it, so the app
// can be walked end to end in a browser with no Tauri backend.
import type {
	Commit,
	CommitDetails,
	FileChange,
	Refs,
	RepoEntry,
	Tag,
} from "@/git/types";

export const REPO: RepoEntry = {
	path: "/home/dev/forest-demo",
	name: "forest-demo",
};

const hash = (n: number) => n.toString(16).padStart(40, "0");
const BASE_DATE = 1_767_225_600; // 2026-01-01T00:00:00Z
const AUTHORS = [
	{ name: "Ada Byron", email: "ada@example.test" },
	{ name: "Linus Pauling", email: "linus@example.test" },
];

const commits: Commit[] = [];
// Appends in oldest-first order; `parents` are indexes of earlier commits.
const add = (subject: string, parents: number[]): number => {
	const n = commits.length;
	const author = AUTHORS[n % AUTHORS.length];
	commits.push({
		hash: hash(n + 1),
		parents: parents.map((p) => hash(p + 1)),
		authorName: author.name,
		authorEmail: author.email,
		authorDate: BASE_DATE + n * 3600,
		subject,
	});
	return n;
};

const MAIN = [
	":tada: chore: initial commit",
	"docs: :memo: describe the project",
	"build: :construction_worker: add the CI workflow",
	"feat(core): :sparkles: read the repository list",
	"fix(core): :bug: ignore empty lines",
	"chore(release): :bookmark: 0.1.0",
	"refactor(core): :recycle: split the loader",
	"test(core): :white_check_mark: cover the loader",
	"style: :lipstick: align the toolbar",
	"perf(core): :zap: cache the parsed list",
	"fix(ui): :bug: keep the scroll position",
	"docs: :memo: add a screenshot",
	"build(deps): :arrow_up: bump the toolchain",
	"fix(ui): :bug: close the menu on escape",
	"chore: :wrench: tune the linter",
	"test(ui): :white_check_mark: cover the menu",
	"style(ui): :lipstick: tighten the rows",
	"refactor(ui): :recycle: extract the badge",
	"docs: :memo: update the changelog",
	"fix(core): :bug: handle a missing remote",
	"chore: :arrow_down: drop an unused crate",
];
const FEAT_X = [
	"feat(x): :sparkles: add the x module",
	"feat(x): :sparkles: wire the x module",
	"test(x): :white_check_mark: cover the x module",
	"fix(x): :bug: guard against empty input",
	"docs(x): :memo: document the x module",
	"refactor(x): :recycle: simplify the x loop",
	"style(x): :lipstick: format the x module",
	"perf(x): :zap: batch the x calls",
];
const DEVELOP = [
	"chore(dev): :wrench: set up the develop branch",
	"build(dev): :construction_worker: run checks on develop",
	"docs(dev): :memo: note the branching model",
	"test(dev): :white_check_mark: add a smoke test",
	"style(dev): :lipstick: unify the spacing",
	"perf(dev): :zap: trim the start-up path",
];

// main (21) forks feat/x (8) at commit 10, which merges back; then develop (6)
// forks and merges back too: 21 + 8 + 6 + 2 merges + 3 more = 40 commits.
let tip = -1;
const onMain = (subject: string) => {
	tip = add(subject, tip < 0 ? [] : [tip]);
	return tip;
};
for (const s of MAIN.slice(0, 10)) onMain(s);
const featFork = tip;
let featTip = featFork;
for (let i = 0; i < FEAT_X.length; i++) {
	featTip = add(FEAT_X[i], [featTip]);
	if (MAIN[10 + i]) onMain(MAIN[10 + i]);
}
tip = add("Merge branch 'feat/x'", [tip, featTip]);
const developFork = tip;
let developTip = developFork;
for (let i = 0; i < DEVELOP.length; i++) {
	developTip = add(DEVELOP[i], [developTip]);
	if (MAIN[18 + i]) onMain(MAIN[18 + i]);
}
tip = add("Merge branch 'develop'", [tip, developTip]);
onMain("fix(graph): :bug: draw merge lines under the badges");
onMain("feat(graph): :sparkles: grey out the merge commits");
onMain("docs: :memo: prepare the next release");

/** Newest first, as `git log` returns them. */
const history = [...commits].reverse();
const at = (n: number) => hash(n + 1);

const tags: Tag[] = [{ name: "v0.1.0", commit: at(5), annotated: true }];

const refs = (): Refs => ({
	head: { branch: "main", commit: at(tip) },
	locals: [
		{ name: "main", commit: at(tip), upstream: "origin/main" },
		{ name: "develop", commit: at(developTip), upstream: "origin/develop" },
		{ name: "feat/x", commit: at(featTip), upstream: null },
	],
	remotes: [
		{ remote: "origin", name: "main", commit: at(tip), isHead: true },
		{
			remote: "origin",
			name: "develop",
			commit: at(developTip),
			isHead: false,
		},
	],
	tags: [...tags],
	remoteNames: ["origin"],
});

const UNCOMMITTED: FileChange[] = [
	{
		status: "M",
		path: "src/loader.ts",
		oldPath: null,
		additions: 4,
		deletions: 1,
	},
	{
		status: "D",
		path: "docs/old-notes.md",
		oldPath: null,
		additions: 0,
		deletions: 12,
	},
	{
		status: "?",
		path: "src/scratch.ts",
		oldPath: null,
		additions: null,
		deletions: null,
	},
];

const commitFiles = (): FileChange[] => [
	{
		status: "M",
		path: "src/loader.ts",
		oldPath: null,
		additions: 3,
		deletions: 1,
	},
	{
		status: "A",
		path: "src/loader.test.ts",
		oldPath: null,
		additions: 10,
		deletions: 0,
	},
];

const DIFF = `diff --git a/src/loader.ts b/src/loader.ts
index 1111111..2222222 100644
--- a/src/loader.ts
+++ b/src/loader.ts
@@ -1,4 +1,6 @@
 export function load(lines: string[]) {
-	return lines;
+	const kept = lines.filter(Boolean);
+	return kept.map((l) => l.trim());
 }
+
+export const EMPTY: string[] = [];
`;

const details = (rev: string): CommitDetails => {
	const c = commits.find((x) => x.hash === rev);
	if (!c) throw { kind: "failed", message: `bad object ${rev}` };
	return {
		hash: c.hash,
		parents: c.parents,
		authorName: c.authorName,
		authorEmail: c.authorEmail,
		authorDate: c.authorDate,
		committerName: c.authorName,
		committerEmail: c.authorEmail,
		committerDate: c.authorDate,
		message: c.subject,
		files: commitFiles(),
	};
};

// plugin-store: values live in memory, per store handle.
const stores = new Map<number, Map<string, unknown>>();
let nextRid = 1;

/** Answers a Tauri command with the fixture repository. */
export function dispatch(
	cmd: string,
	args: Record<string, unknown> = {},
): unknown {
	switch (cmd) {
		case "list_repos":
			return [REPO];
		case "repo_exists":
			return true;
		case "get_refs":
			return refs();
		case "get_commits": {
			const { skip, limit } = args.query as { skip: number; limit: number };
			return {
				commits: history.slice(skip, skip + limit),
				hasMore: skip + limit < history.length,
			};
		}
		case "get_uncommitted":
			return UNCOMMITTED;
		case "get_commit_details":
			return details(args.hash as string);
		case "get_file_diff":
			return DIFF;
		case "resolve_commit":
			return null;
		case "add_tag":
			tags.push({
				name: args.name as string,
				commit: args.at as string,
				annotated: args.message !== null,
			});
			return null;
		case "watch_repo":
		case "unwatch_repo":
		case "push_branch":
		case "push_tag":
		case "fetch":
		case "cancel_operation":
			return null;
		case "plugin:event|listen":
			return nextRid++;
		case "plugin:event|unlisten":
			return null;
		case "plugin:store|load": {
			const rid = nextRid++;
			stores.set(rid, new Map());
			return rid;
		}
		case "plugin:store|get": {
			const value = stores.get(args.rid as number)?.get(args.key as string);
			return [value ?? null, value !== undefined];
		}
		case "plugin:store|set":
			stores.get(args.rid as number)?.set(args.key as string, args.value);
			return null;
		case "plugin:store|save":
			return null;
		default:
			// A renamed or new command must fail the spec, not hide in a toast.
			window.__unstubbed.push(cmd);
			throw { kind: "failed", message: `Unstubbed command: ${cmd}` };
	}
}
