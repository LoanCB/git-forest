import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { ActionDialogs } from "./ActionDialogs";
import { BranchContextMenu } from "./BranchContextMenu";
import { CommitContextMenu } from "./CommitContextMenu";
import { callsTo, resetActionStores } from "./testUtils";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(resetActionStores);

const renderMenu = (current = false) => {
	render(
		<>
			<BranchContextMenu name="feat/x" current={current} hasUpstream>
				<span>feat/x badge</span>
			</BranchContextMenu>
			<ActionDialogs />
		</>,
	);
	fireEvent.contextMenu(screen.getByText("feat/x badge"));
};

it("offers Checkout, Rename, Delete and Push on a local branch", async () => {
	renderMenu();
	for (const name of ["Checkout", "Rename…", "Delete…", "Push…"])
		expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
});

it("the current branch can be neither checked out nor deleted", async () => {
	renderMenu(true);
	expect(
		await screen.findByRole("menuitem", { name: "Checkout" }),
	).toHaveAttribute("aria-disabled", "true");
	expect(screen.getByRole("menuitem", { name: "Delete…" })).toHaveAttribute(
		"aria-disabled",
		"true",
	);
	expect(screen.getByRole("menuitem", { name: "Push…" })).not.toHaveAttribute(
		"aria-disabled",
		"true",
	);
});

it("delete branch: -D only when 'Force delete' is checked", async () => {
	renderMenu();
	fireEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
	fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
	await waitFor(() => expect(callsTo("delete_branch")).toHaveLength(1));
	expect(callsTo("delete_branch")[0][1]).toEqual({
		repo: "/p/r",
		name: "feat/x",
		force: false,
	});

	fireEvent.contextMenu(screen.getByText("feat/x badge"));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
	fireEvent.click(await screen.findByText("Force delete"));
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	await waitFor(() => expect(callsTo("delete_branch")).toHaveLength(2));
	expect(callsTo("delete_branch")[1][1]).toMatchObject({ force: true });
});

it("a failed action shows git's message in the error dialog", async () => {
	const { invoke } = await import("@tauri-apps/api/core");
	vi.mocked(invoke).mockRejectedValue({
		kind: "failed",
		message: "error: branch 'feat/x' is not fully merged",
	});
	renderMenu();
	fireEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
	fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
	const pre = await screen.findByText(
		"error: branch 'feat/x' is not fully merged",
	);
	expect(pre.tagName).toBe("PRE");
});

it("a right-click on a badge opens the branch menu, not the commit's", async () => {
	render(
		<CommitContextMenu hash="abc">
			<div>
				<BranchContextMenu name="feat/x" current={false} hasUpstream>
					<span>badge</span>
				</BranchContextMenu>
				<span>subject</span>
			</div>
		</CommitContextMenu>,
	);
	fireEvent.contextMenu(screen.getByText("badge"));
	expect(
		await screen.findByRole("menuitem", { name: "Rename…" }),
	).toBeInTheDocument();
	expect(screen.queryByRole("menuitem", { name: "Add tag…" })).toBeNull();
});

it("a right-click on the row opens the commit menu", async () => {
	render(
		<CommitContextMenu hash="abc">
			<span>subject</span>
		</CommitContextMenu>,
	);
	fireEvent.contextMenu(screen.getByText("subject"));
	for (const name of ["Checkout…", "Create branch…", "Add tag…", "Copy hash"])
		expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
});
