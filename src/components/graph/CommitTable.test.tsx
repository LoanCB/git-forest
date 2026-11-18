import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Commit, FileChange, Refs } from "@/git/types";
import { UNCOMMITTED_STROKE } from "@/graph/constants";
import { PALETTE } from "@/graph/palette";
import i18n from "@/i18n";
import { DEFAULT_REPO_PREFS } from "@/store/prefs.types";
import { useRepoView } from "@/store/repoView";
import { CommitTable } from "./CommitTable";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const setRepoPrefs = vi.fn();
vi.mock("@/store/prefs", () => ({
	getRepoPrefs: vi.fn(),
	setRepoPrefs: (...a: unknown[]) => setRepoPrefs(...a),
}));

// happy-dom has no layout: give every element a size so the virtualiser
// believes the viewport can show rows.
const sizes = { clientHeight: 600, clientWidth: 1200 };
const saved = new Map<string, PropertyDescriptor | undefined>();
beforeAll(async () => {
	for (const [key, value] of Object.entries(sizes)) {
		saved.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
		Object.defineProperty(HTMLElement.prototype, key, {
			configurable: true,
			get: () => value,
		});
	}
	await i18n.changeLanguage("en");
});
afterAll(() => {
	for (const [key, desc] of saved) {
		if (desc) Object.defineProperty(HTMLElement.prototype, key, desc);
	}
});

const commit = (hash: string, parents: string[], subject = hash): Commit => ({
	hash,
	parents,
	authorName: "Loan",
	authorEmail: "loan@example.com",
	authorDate: new Date(2026, 10, 18, 14, 58).getTime() / 1000,
	subject,
});

const refs = (head: string | null): Refs => ({
	head: { branch: "main", commit: head },
	locals: head ? [{ name: "main", commit: head, upstream: null }] : [],
	remotes: [],
	tags: [],
	remoteNames: [],
});

const change: FileChange = {
	status: "M",
	path: "a.txt",
	oldPath: null,
	additions: 1,
	deletions: 0,
};

function setView(patch: Partial<ReturnType<typeof useRepoView.getState>>) {
	useRepoView.setState({
		repo: "/repo",
		refs: refs("c3aaaaaaaaaa"),
		commits: [
			commit("c3aaaaaaaaaa", ["c2"], "top"),
			commit("c2", ["c1", "f1"], "Merge branch 'f'"),
			commit("f1", ["c1"], "feature"),
			commit("c1", [], "root"),
		],
		uncommitted: [],
		hasMore: false,
		loading: false,
		error: null,
		...patch,
	});
}

const rowOf = (text: string | RegExp) => {
	const row = screen.getByText(text).closest("[data-row]");
	if (!row) throw new Error(`no row for ${text}`);
	return row as HTMLElement;
};

it("shows an Uncommitted Changes (N) row when the working tree is dirty", () => {
	setView({ uncommitted: [change, { ...change, path: "b.txt" }] });
	render(<CommitTable />);
	const row = rowOf("Uncommitted Changes (2)");
	const node = row.querySelector("circle");
	expect(node?.getAttribute("stroke")).not.toBe(PALETTE[0]);
	expect(node?.getAttribute("data-node")).toBe("uncommitted");
	// Its line down to HEAD is grey too, not a palette colour.
	expect(rowOf("top").querySelector("path")?.getAttribute("stroke")).toBe(
		UNCOMMITTED_STROKE,
	);
	// The row comes before the first commit, at the top of the list.
	const rows = [...document.querySelectorAll("[data-row]")];
	expect(rows.indexOf(row)).toBe(0);
	expect(row.style.transform).toBe("translateY(0px)");
});

it("gives every commit the same colour whether the tree is dirty or clean", () => {
	// A branch tip above HEAD: the Uncommitted lane must not shift its colour.
	const history = [
		commit("x1", ["c1"], "other tip"),
		commit("head1", ["c1"], "head commit"),
		commit("c1", [], "root"),
	];
	const colours = () =>
		["other tip", "head commit", "root"].map((s) =>
			rowOf(s).querySelector("circle")?.getAttribute("stroke"),
		);

	setView({ refs: refs("head1"), commits: history, uncommitted: [] });
	const { unmount } = render(<CommitTable />);
	const clean = colours();
	unmount();

	setView({ refs: refs("head1"), commits: history, uncommitted: [change] });
	render(<CommitTable />);
	expect(colours()).toEqual(clean);
});

it("renders merge commits with the muted style", () => {
	setView({});
	render(<CommitTable />);
	expect(rowOf("Merge branch 'f'").className).toContain(
		"text-muted-foreground",
	);
	expect(rowOf("feature").className).not.toContain("text-muted-foreground");
	// Short hashes are 8 characters long.
	expect(within(rowOf("top")).getByText("c3aaaaaa")).toBeInTheDocument();
	// The header sits above the list in the same scroller, not over row 1.
	expect(rowOf("top").style.transform).toBe("translateY(0px)");
});

it("shows a Load more row when hasMore and calls loadMore on click", () => {
	const loadMore = vi.fn(async () => {});
	setView({ hasMore: true, loadMore });
	render(<CommitTable />);
	fireEvent.click(screen.getByRole("button", { name: /load more/i }));
	expect(loadMore).toHaveBeenCalledOnce();
});

it("renders emoji shortcodes in the description", () => {
	setView({
		commits: [commit("c3aaaaaaaaaa", [], "feat(graph): :sparkles: draw it")],
	});
	render(<CommitTable />);
	expect(screen.getByText("feat(graph): ✨ draw it")).toBeInTheDocument();
});

it("hides the Load more row when every commit is loaded", () => {
	setView({ hasMore: false });
	render(<CommitTable />);
	expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
});

it("draws HEAD's node as a hollow circle", () => {
	setView({});
	render(<CommitTable />);
	const head = rowOf("top").querySelector("circle");
	expect(head?.getAttribute("data-node")).toBe("head");
	expect(head?.getAttribute("stroke")).toBe(PALETTE[0]);
	expect(head?.style.fill).toBe("var(--background)");

	const other = rowOf("feature").querySelector("circle");
	expect(other?.getAttribute("data-node")).toBe("commit");
	expect(other?.getAttribute("fill")).toBe(other?.getAttribute("stroke"));
});

it("shows an empty graph without error for a repository with no commits", () => {
	setView({ refs: refs(null), commits: [], uncommitted: [change] });
	const { unmount } = render(<CommitTable />);
	expect(screen.getByText("Uncommitted Changes (1)")).toBeInTheDocument();
	expect(screen.getByText("Description")).toBeInTheDocument();
	unmount();

	setView({ refs: refs(null), commits: [], uncommitted: [] });
	render(<CommitTable />);
	expect(document.querySelectorAll("[data-row]")).toHaveLength(0);
	expect(screen.getByText("Description")).toBeInTheDocument();
});

it("saves a resized column width in the repository prefs", async () => {
	setView({ prefs: DEFAULT_REPO_PREFS });
	setRepoPrefs.mockImplementation(async (_repo, patch) => ({
		...DEFAULT_REPO_PREFS,
		...patch,
	}));
	render(<CommitTable />);
	fireEvent.keyDown(screen.getByRole("separator", { name: /column date/i }), {
		key: "ArrowRight",
	});
	expect(setRepoPrefs).toHaveBeenCalledWith("/repo", {
		columnWidths: { ...DEFAULT_REPO_PREFS.columnWidths, date: 160 },
	});
	await vi.waitFor(() =>
		expect(useRepoView.getState().prefs.columnWidths.date).toBe(160),
	);
});
