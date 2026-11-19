import { invoke } from "@tauri-apps/api/core";
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

it("loads the next page once the end of the list is rendered", () => {
	const loadMore = vi.fn(async () => {});
	setView({ hasMore: true, loadMore });
	render(<CommitTable />);
	expect(loadMore).toHaveBeenCalled();
	expect(screen.getByText(/loading more commits/i)).toBeInTheDocument();
});

it("does not load more pages after a page failed", () => {
	const loadMore = vi.fn(async () => {});
	setView({
		hasMore: true,
		loadMore,
		error: { kind: "failed", message: "boom" },
	});
	render(<CommitTable />);
	expect(loadMore).not.toHaveBeenCalled();
});

it("renders emoji shortcodes in the description", () => {
	setView({
		commits: [commit("c3aaaaaaaaaa", [], "feat(graph): :sparkles: draw it")],
	});
	render(<CommitTable />);
	expect(screen.getByText("feat(graph): ✨ draw it")).toBeInTheDocument();
});

it("neither loads nor shows a loading row when every commit is loaded", () => {
	const loadMore = vi.fn(async () => {});
	setView({ hasMore: false, loadMore });
	render(<CommitTable />);
	expect(loadMore).not.toHaveBeenCalled();
	expect(screen.queryByText(/loading more commits/i)).toBeNull();
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

it("expands one row at a time under the clicked commit and closes on Escape", async () => {
	vi.mocked(invoke).mockResolvedValue({
		hash: "f1",
		parents: ["c1"],
		authorName: "Loan",
		authorEmail: "l@e.com",
		authorDate: 0,
		committerName: "Loan",
		committerEmail: "l@e.com",
		committerDate: 0,
		message: "full message",
		files: [],
	});
	setView({});
	render(<CommitTable />);
	fireEvent.click(rowOf("feature"));
	expect(await screen.findByText("full message")).toBeInTheDocument();
	// The panel sits right under its row; the rows above stay put.
	const panel = screen.getByText("full message").closest("[data-index]");
	expect((panel as HTMLElement).style.transform).toBe("translateY(72px)");
	expect(rowOf("top").style.transform).toBe("translateY(0px)");

	fireEvent.click(rowOf("root"));
	expect(await screen.findAllByText("full message")).toHaveLength(1);
	fireEvent.keyDown(document, { key: "Escape" });
	expect(screen.queryByText("full message")).toBeNull();
	expect(rowOf("root").style.transform).toBe("translateY(72px)");
});

it("scrolls to the scroll target after the render, and clears it", async () => {
	setView({});
	render(<CommitTable />);
	const spy = vi.spyOn(HTMLElement.prototype, "scrollTo");
	useRepoView.setState({ scrollTarget: "c1" });
	await vi.waitFor(() =>
		expect(useRepoView.getState().scrollTarget).toBeNull(),
	);
	expect(spy).toHaveBeenCalled();
	spy.mockRestore();
});

it("tells the user when a clicked parent is not in the view", async () => {
	vi.mocked(invoke).mockResolvedValue({
		hash: "c2",
		parents: ["gone"],
		authorName: "L",
		authorEmail: "l@e.com",
		authorDate: 0,
		committerName: "L",
		committerEmail: "l@e.com",
		committerDate: 0,
		message: "m",
		files: [],
	});
	setView({});
	render(<CommitTable />);
	fireEvent.click(rowOf("Merge branch 'f'"));
	fireEvent.click(await screen.findByRole("button", { name: /go to parent/i }));
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Commit not in the current view",
	);
	// The previous panel stays open.
	expect(screen.getByText("m")).toBeInTheDocument();
});
