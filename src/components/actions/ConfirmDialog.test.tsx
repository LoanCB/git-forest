import { invoke } from "@tauri-apps/api/core";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { type DialogRequest, useActionDialog } from "@/store/actionDialog";
import { useRepoView } from "@/store/repoView";
import { ActionDialogs } from "./ActionDialogs";
import { callsTo, HASH, resetActionStores } from "./testUtils";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(resetActionStores);

const open = (request: DialogRequest) => {
	render(<ActionDialogs />);
	act(() => useActionDialog.getState().open(request));
};

it("remote branch delete requires typing the branch name to confirm", async () => {
	open({ kind: "deleteRemoteBranch", remote: "origin", name: "feat/x" });
	const confirm = await screen.findByRole("button", { name: "Delete" });
	expect(confirm).toBeDisabled();

	fireEvent.change(screen.getByLabelText("feat/x"), {
		target: { value: "feat/" },
	});
	expect(confirm).toBeDisabled();
	fireEvent.change(screen.getByLabelText("feat/x"), {
		target: { value: "feat/x" },
	});
	expect(confirm).toBeEnabled();
	fireEvent.click(confirm);

	await waitFor(() => expect(callsTo("delete_remote_branch")).toHaveLength(1));
	expect(callsTo("delete_remote_branch")[0][1]).toMatchObject({
		repo: "/p/r",
		remote: "origin",
		name: "feat/x",
	});
});

it("checkout of a commit asks for confirmation (detached HEAD)", async () => {
	open({ kind: "checkoutCommit", hash: HASH });
	expect(await screen.findByText(/detaches HEAD/)).toBeInTheDocument();
	expect(callsTo("checkout_commit")).toHaveLength(0);

	fireEvent.click(screen.getByRole("button", { name: "Checkout" }));
	await waitFor(() => expect(callsTo("checkout_commit")).toHaveLength(1));
	expect(callsTo("checkout_commit")[0][1]).toEqual({
		repo: "/p/r",
		hash: HASH,
	});
});

it("cancelling the confirmation runs nothing", async () => {
	open({ kind: "checkoutCommit", hash: HASH });
	fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
	await waitFor(() => expect(useActionDialog.getState().request).toBeNull());
	expect(invoke).not.toHaveBeenCalled();
});

it("delete tag: 'also on remote' runs delete_remote_tag after delete_tag", async () => {
	open({ kind: "deleteTag", name: "v1" });
	fireEvent.click(
		await screen.findByText("Also delete on the remote (origin)"),
	);
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));

	await waitFor(() => expect(callsTo("delete_remote_tag")).toHaveLength(1));
	const order = vi.mocked(invoke).mock.calls.map(([c]) => c);
	expect(order.indexOf("delete_tag")).toBeLessThan(
		order.indexOf("delete_remote_tag"),
	);
	expect(callsTo("delete_remote_tag")[0][1]).toMatchObject({
		remote: "origin",
		name: "v1",
	});
});

it("delete tag: without the box nothing happens on the remote", async () => {
	open({ kind: "deleteTag", name: "v1" });
	fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
	await waitFor(() => expect(callsTo("delete_tag")).toHaveLength(1));
	expect(callsTo("delete_remote_tag")).toHaveLength(0);
});

it("push dialog: defaults to origin, upstream is checked only without one", async () => {
	open({ kind: "pushBranch", name: "main", hasUpstream: false });
	expect(await screen.findByLabelText("Remote:")).toHaveValue("origin");
	expect(screen.getByRole("checkbox", { name: "Set upstream" })).toBeChecked();
	fireEvent.click(screen.getByRole("button", { name: "Push" }));
	await waitFor(() => expect(callsTo("push_branch")).toHaveLength(1));
	expect(callsTo("push_branch")[0][1]).toMatchObject({
		remote: "origin",
		name: "main",
		setUpstream: true,
	});
});

it("Ctrl+Shift+P opens the push dialog for the current branch, and is ignored while a dialog is open", async () => {
	render(<ActionDialogs />);
	fireEvent.keyDown(document, { key: "P", ctrlKey: true, shiftKey: true });
	expect(await screen.findByText("Push branch main")).toBeInTheDocument();
	expect(screen.getByRole("checkbox", { name: "Set upstream" })).toBeChecked();

	fireEvent.keyDown(document, { key: "P", ctrlKey: true, shiftKey: true });
	expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

it("a pending dialog is dropped when the repository changes, so it cannot run on the next one", async () => {
	open({ kind: "deleteBranch", name: "feat/x" });
	await screen.findByRole("button", { name: "Delete" });
	act(() => useRepoView.setState({ repo: "/p/other" }));
	await waitFor(() => expect(useActionDialog.getState().request).toBeNull());
	expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	expect(callsTo("delete_branch")).toHaveLength(0);
});

it("a dialog confirmed on a repository that is no longer open runs nothing", async () => {
	open({ kind: "deleteBranch", name: "feat/x" });
	const confirm = await screen.findByRole("button", { name: "Delete" });
	// Swap the repo without notifying subscribers, as a race would.
	useRepoView.getState().repo = "/p/other";
	fireEvent.click(confirm);
	await waitFor(() => expect(useActionDialog.getState().request).toBeNull());
	expect(callsTo("delete_branch")).toHaveLength(0);
});
