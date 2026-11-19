import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useReposStore } from "@/store/repos";
import { ManageReposDialog } from "./ManageReposDialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/store/prefs", () => ({
	setLastRepo: vi.fn(),
	getLastRepo: vi.fn(),
}));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => {
	vi.mocked(invoke).mockReset();
	vi.mocked(open).mockReset();
	useReposStore.setState({
		repos: [{ path: "/p/old", name: "old" }],
		current: "/p/old",
	});
});

const renderDialog = () =>
	render(<ManageReposDialog open onOpenChange={() => {}} />);

it("scan shows candidates with checkboxes, adds the checked ones", async () => {
	vi.mocked(open).mockResolvedValue("/p");
	vi.mocked(invoke).mockImplementation(async (cmd, args) => {
		if (cmd === "scan_repos") return ["/p/old", "/p/a", "/p/b", "/p/bad"];
		const { path } = args as { path: string };
		if (path === "/p/bad") throw { kind: "notARepo", message: "not a repo" };
		return { path, name: path.slice(3) };
	});
	renderDialog();
	fireEvent.click(screen.getByRole("button", { name: /scan a folder/i }));

	// Already registered repositories are not offered again.
	expect(await screen.findByRole("checkbox", { name: "/p/a" })).toBeChecked();
	expect(screen.queryByRole("checkbox", { name: "/p/old" })).toBeNull();

	fireEvent.click(screen.getByText("/p/b"));
	fireEvent.click(screen.getByRole("button", { name: "Add selected (2)" }));

	await waitFor(() =>
		expect(useReposStore.getState().repos.map((r) => r.path)).toEqual([
			"/p/old",
			"/p/a",
		]),
	);
	// /p/bad stays checked, fails, and is reported.
	expect(await screen.findByRole("alert")).toHaveTextContent("/p/bad");
});

it("removing a repository never touches the disk (calls remove_repo only)", async () => {
	vi.mocked(invoke).mockResolvedValue(undefined);
	renderDialog();
	fireEvent.click(screen.getByRole("button", { name: "Remove old" }));
	await waitFor(() => expect(useReposStore.getState().repos).toEqual([]));
	expect(vi.mocked(invoke).mock.calls).toEqual([
		["remove_repo", { path: "/p/old" }],
	]);
});
