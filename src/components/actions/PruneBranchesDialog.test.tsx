import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useOperations } from "@/store/operations";
import { PruneBranchesDialog } from "./PruneBranchesDialog";
import { callsTo, resetActionStores } from "./testUtils";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(resetActionStores);

const merged = (names: string[]) =>
	vi
		.mocked(invoke)
		.mockImplementation(async (cmd) =>
			cmd === "get_merged_branches" ? names : undefined,
		);

it("ticks merged branches except main, master and develop, and deletes the ticked ones", async () => {
	merged(["feat/a", "develop", "fix/b"]);
	const onClose = vi.fn();
	render(<PruneBranchesDialog repo="/p/r" onClose={onClose} />);
	expect(await screen.findByText("feat/a")).toBeInTheDocument();
	const box = (name: string) =>
		screen.getByText(name).closest("label")?.querySelector("[role=checkbox]");
	expect(box("feat/a")).toHaveAttribute("aria-checked", "true");
	expect(box("develop")).toHaveAttribute("aria-checked", "false");

	fireEvent.click(screen.getByRole("button", { name: "Delete 2 branches" }));
	expect(onClose).toHaveBeenCalled();
	await waitFor(() => expect(callsTo("delete_branch")).toHaveLength(2));
	expect(callsTo("delete_branch").map(([, a]) => a)).toEqual([
		{ repo: "/p/r", name: "feat/a", force: false },
		{ repo: "/p/r", name: "fix/b", force: false },
	]);
});

it("keeps deleting after a refusal and reports it", async () => {
	vi.mocked(invoke).mockImplementation(async (cmd, args) => {
		if (cmd === "get_merged_branches") return ["a", "b"];
		if (cmd === "delete_branch" && (args as { name: string }).name === "a")
			throw { kind: "failed", message: "not fully merged" };
		return undefined;
	});
	render(<PruneBranchesDialog repo="/p/r" onClose={vi.fn()} />);
	fireEvent.click(
		await screen.findByRole("button", { name: "Delete 2 branches" }),
	);
	await waitFor(() =>
		expect(useOperations.getState().lastError?.message).toBe(
			"a: not fully merged",
		),
	);
	expect(callsTo("delete_branch")).toHaveLength(2);
});

it("says so when nothing is merged", async () => {
	merged([]);
	render(<PruneBranchesDialog repo="/p/r" onClose={vi.fn()} />);
	expect(
		await screen.findByText(
			"No local branch is merged into the current branch.",
		),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Delete 0 branches" }),
	).toBeDisabled();
});
