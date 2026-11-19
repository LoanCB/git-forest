import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { AddTagDialog } from "./AddTagDialog";
import { GitErrorDialog } from "./GitErrorDialog";
import { callsTo, HASH, resetActionStores } from "./testUtils";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(resetActionStores);

const renderDialog = (onClose = vi.fn()) => {
	render(
		<>
			<AddTagDialog repo="/p/r" hash={HASH} onClose={onClose} />
			<GitErrorDialog />
		</>,
	);
	return onClose;
};
const typeName = (name: string) =>
	fireEvent.change(screen.getByLabelText("Name:"), { target: { value: name } });
const submit = () =>
	fireEvent.click(screen.getByRole("button", { name: "Add Tag" }));

it("AddTagDialog: annotated by default, message optional, Push to remote pushes after tagging", async () => {
	const onClose = renderDialog();
	expect(screen.getByLabelText("Type:")).toHaveTextContent("Annotated");
	expect(screen.getByRole("button", { name: "Add Tag" })).toBeDisabled();

	typeName("v1.0");
	fireEvent.click(screen.getByRole("checkbox", { name: "Push to remote:" }));
	submit();

	await waitFor(() => expect(callsTo("push_tag")).toHaveLength(1));
	// No message typed: an annotated tag still goes out with an empty one.
	expect(callsTo("add_tag")[0][1]).toEqual({
		repo: "/p/r",
		name: "v1.0",
		at: HASH,
		message: "",
	});
	// origin is preferred over the first remote.
	expect(callsTo("push_tag")[0][1]).toMatchObject({
		remote: "origin",
		name: "v1.0",
	});
	const order = vi.mocked(invoke).mock.calls.map(([c]) => c);
	expect(order.indexOf("add_tag")).toBeLessThan(order.indexOf("push_tag"));
	expect(onClose).toHaveBeenCalled();
});

it("AddTagDialog: a lightweight tag sends no message and nothing is pushed unless asked", async () => {
	const onClose = renderDialog();
	fireEvent.click(screen.getByLabelText("Type:"));
	const option = await screen.findByRole("option", { name: "Lightweight" });
	fireEvent.pointerDown(option);
	fireEvent.pointerUp(option);
	fireEvent.click(option);
	await waitFor(() =>
		expect(screen.getByLabelText("Type:")).toHaveTextContent("Lightweight"),
	);
	typeName("light");
	submit();
	await waitFor(() => expect(onClose).toHaveBeenCalled());
	expect(callsTo("add_tag")[0][1]).toMatchObject({ message: null });
	expect(callsTo("push_tag")).toHaveLength(0);
});

it("AddTagDialog: a typed message is sent as the annotation", async () => {
	const onClose = renderDialog();
	typeName("v2");
	fireEvent.change(screen.getByLabelText("Message:"), {
		target: { value: "Release two" },
	});
	submit();
	await waitFor(() => expect(onClose).toHaveBeenCalled());
	expect(callsTo("add_tag")[0][1]).toMatchObject({ message: "Release two" });
});

it("AddTagDialog: invalid name error from backend is shown inline", async () => {
	vi.mocked(invoke).mockRejectedValue({
		kind: "invalidName",
		message: "'bad name' is not a valid tag name",
	});
	const onClose = renderDialog();
	typeName("bad name");
	fireEvent.click(screen.getByRole("checkbox", { name: "Push to remote:" }));
	submit();

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"'bad name' is not a valid tag name",
	);
	expect(onClose).not.toHaveBeenCalled();
	expect(callsTo("push_tag")).toHaveLength(0);
	// Inline only: the error dialog stays closed.
	expect(screen.getAllByRole("alert")).toHaveLength(1);
});

it("AddTagDialog: when tagging fails for another reason, nothing is pushed and the error dialog opens", async () => {
	vi.mocked(invoke).mockRejectedValue({
		kind: "failed",
		message: "fatal: tag 'v1' already exists",
	});
	renderDialog();
	typeName("v1");
	fireEvent.click(screen.getByRole("checkbox", { name: "Push to remote:" }));
	submit();
	expect(
		await screen.findByText("fatal: tag 'v1' already exists"),
	).toBeInTheDocument();
	expect(callsTo("push_tag")).toHaveLength(0);
});

it("AddTagDialog: a failed push leaves the tag and shows git's message", async () => {
	vi.mocked(invoke).mockImplementation(async (cmd) => {
		if (cmd === "push_tag")
			throw { kind: "failed", message: "! [rejected] v1 (already exists)" };
	});
	renderDialog();
	typeName("v1");
	fireEvent.click(screen.getByRole("checkbox", { name: "Push to remote:" }));
	submit();
	expect(
		await screen.findByText("! [rejected] v1 (already exists)"),
	).toBeInTheDocument();
	expect(callsTo("add_tag")).toHaveLength(1);
});
