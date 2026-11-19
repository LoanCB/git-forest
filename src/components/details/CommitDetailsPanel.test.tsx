import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { CommitDetails, FileChange } from "@/git/types";
import i18n from "@/i18n";
import { CommitDetailsPanel } from "./CommitDetailsPanel";

const api = vi.hoisted(() => ({
	getCommitDetails: vi.fn(),
	getUncommitted: vi.fn(),
	getFileDiff: vi.fn(),
}));
vi.mock("@/git/api", async (orig) => ({
	...(await orig<typeof import("@/git/api")>()),
	...api,
}));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => vi.resetAllMocks());

const file = (over: Partial<FileChange>): FileChange => ({
	status: "M",
	path: "a.txt",
	oldPath: null,
	additions: 2,
	deletions: 1,
	...over,
});

const details: CommitDetails = {
	hash: "a".repeat(40),
	parents: ["b".repeat(40), "c".repeat(40)],
	authorName: "Ada",
	authorEmail: "ada@example.com",
	authorDate: new Date(2026, 10, 18, 14, 58).getTime() / 1000,
	committerName: "Bob",
	committerEmail: "bob@example.com",
	committerDate: new Date(2026, 10, 19, 9, 5).getTime() / 1000,
	message: "feat: :sparkles: subject\n\nbody line",
	files: [
		file({}),
		file({ status: "A", path: "img.png", additions: null, deletions: null }),
	],
};

const DIFF =
	"diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n";

it("panel shows full hash, parents, author, committer, dates and full message", async () => {
	api.getCommitDetails.mockResolvedValue(details);
	const onSelectParent = vi.fn();
	render(
		<CommitDetailsPanel
			repo="/r"
			id={details.hash}
			onSelectParent={onSelectParent}
		/>,
	);
	expect(await screen.findByText(details.hash)).toBeInTheDocument();
	expect(screen.getByText("b".repeat(40))).toBeInTheDocument();
	expect(screen.getByText(/Ada <ada@example.com>/)).toHaveTextContent(
		"18 Nov 2026 14:58",
	);
	expect(screen.getByText(/Bob <bob@example.com>/)).toHaveTextContent(
		"19 Nov 2026 09:05",
	);
	const message = screen.getByText(/body line/);
	expect(message).toHaveTextContent("feat: ✨ subject");
	fireEvent.click(screen.getByText("c".repeat(40)));
	expect(onSelectParent).toHaveBeenCalledWith("c".repeat(40));
});

it("panel lists files with status and +/- counts, '-' for binaries", async () => {
	api.getCommitDetails.mockResolvedValue(details);
	render(
		<CommitDetailsPanel repo="/r" id={details.hash} onSelectParent={vi.fn()} />,
	);
	const text = (await screen.findByText("a.txt")).closest("button");
	expect(text).toHaveTextContent("M");
	expect(text).toHaveTextContent("+2");
	expect(text).toHaveTextContent("-1");
	const bin = screen.getByText("img.png").closest("button");
	expect(bin).toHaveTextContent("A");
	expect(bin?.textContent?.endsWith("-")).toBe(true);
	expect(bin).not.toHaveTextContent("+");
});

it("clicking a file loads and shows its diff", async () => {
	api.getCommitDetails.mockResolvedValue(details);
	api.getFileDiff.mockResolvedValue(DIFF);
	render(
		<CommitDetailsPanel repo="/r" id={details.hash} onSelectParent={vi.fn()} />,
	);
	fireEvent.click(await screen.findByText("a.txt"));
	expect(await screen.findByText("new")).toBeInTheDocument();
	expect(screen.getByText("old")).toBeInTheDocument();
	expect(api.getFileDiff).toHaveBeenCalledWith(
		"/r",
		{ kind: "commit", hash: details.hash },
		"a.txt",
		null,
	);
});

it("the Uncommitted row lists working tree changes and diffs against HEAD", async () => {
	api.getUncommitted.mockResolvedValue([file({ path: "w.txt" })]);
	api.getFileDiff.mockResolvedValue(DIFF);
	render(<CommitDetailsPanel repo="/r" id="*" onSelectParent={vi.fn()} />);
	fireEvent.click(await screen.findByText("w.txt"));
	await screen.findByText("new");
	expect(api.getCommitDetails).not.toHaveBeenCalled();
	expect(api.getFileDiff).toHaveBeenCalledWith(
		"/r",
		{ kind: "workingTree" },
		"w.txt",
		null,
	);
});

it("shows git's error message inline", async () => {
	api.getCommitDetails.mockRejectedValue({
		kind: "failed",
		message: "bad object",
	});
	render(
		<CommitDetailsPanel repo="/r" id={details.hash} onSelectParent={vi.fn()} />,
	);
	expect(await screen.findByRole("alert")).toHaveTextContent("bad object");
});

it("ignores a late result for a row that is no longer expanded", async () => {
	let resolveFirst: (d: CommitDetails) => void = () => {};
	api.getCommitDetails.mockImplementationOnce(
		() => new Promise((r) => (resolveFirst = r)),
	);
	api.getCommitDetails.mockResolvedValueOnce({
		...details,
		hash: "d".repeat(40),
		message: "second",
	});
	const { rerender } = render(
		<CommitDetailsPanel repo="/r" id="first" onSelectParent={vi.fn()} />,
	);
	rerender(
		<CommitDetailsPanel repo="/r" id="second" onSelectParent={vi.fn()} />,
	);
	expect(await screen.findByText("second")).toBeInTheDocument();
	resolveFirst({ ...details, message: "stale message" });
	await Promise.resolve();
	expect(screen.queryByText("stale message")).toBeNull();
});
