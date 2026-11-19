import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { UpdaterContext, type UpdaterState } from "@/hooks/useUpdater";
import i18n from "@/i18n";
import { useRepoView } from "@/store/repoView";
import { Toolbar } from "./Toolbar";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({
	getVersion: vi.fn(async () => "0.1.0"),
}));
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }));
vi.mock("@/store/prefs", () => ({
	setLastRepo: vi.fn(),
	getLastRepo: vi.fn(),
}));

const updater: UpdaterState = {
	status: "idle",
	available: null,
	progress: 0,
	error: null,
	checkForUpdate: vi.fn(),
	downloadAndInstall: vi.fn(),
	dismiss: vi.fn(),
	relaunchApp: vi.fn(),
};

function renderToolbar() {
	return render(
		<UpdaterContext.Provider value={updater}>
			<Toolbar />
		</UpdaterContext.Provider>,
	);
}

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => useRepoView.setState({ repo: "/p/r", error: null }));

it("Fetch is enabled on an open repository", () => {
	renderToolbar();
	expect(screen.getByRole("button", { name: "Fetch" })).toBeEnabled();
});

it("Fetch is disabled when the repository is missing", () => {
	useRepoView.setState({
		error: { kind: "repoNotFound", message: "gone" },
	});
	renderToolbar();
	expect(screen.getByRole("button", { name: "Fetch" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
});

it("the gear opens the settings dialog", async () => {
	renderToolbar();
	fireEvent.click(screen.getByRole("button", { name: "Settings" }));
	expect(await screen.findByRole("dialog")).toHaveTextContent("Theme");
});
