import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { UpdaterContext, type UpdaterState } from "@/hooks/useUpdater";
import i18n from "@/i18n";
import { useSettings } from "@/store/settings";
import { SettingsDialog } from "./SettingsDialog";

vi.mock("@tauri-apps/api/app", () => ({
	getVersion: vi.fn(async () => "0.1.0"),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
	load: vi.fn(async () => ({
		get: async () => undefined,
		set: async () => {},
		save: async () => {},
	})),
}));

const updater: UpdaterState = {
	status: "idle",
	available: null,
	progress: 0,
	error: null,
	checkForUpdate: vi.fn(async () => {}),
	downloadAndInstall: vi.fn(),
	dismiss: vi.fn(),
	relaunchApp: vi.fn(),
};

function renderDialog() {
	return render(
		<UpdaterContext.Provider value={updater}>
			<SettingsDialog open onOpenChange={() => {}} />
		</UpdaterContext.Provider>,
	);
}

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => {
	vi.mocked(updater.checkForUpdate).mockClear();
	useSettings.setState({
		theme: "dark",
		language: "en",
		updateChannel: "stable",
	});
});

it("changes the theme", async () => {
	renderDialog();
	fireEvent.click(screen.getByRole("button", { name: "Light" }));
	expect(useSettings.getState().theme).toBe("light");
});

it("changes the language and the dialog follows", async () => {
	renderDialog();
	fireEvent.click(screen.getByRole("button", { name: "Français" }));
	expect(await screen.findByText("Paramètres")).toBeInTheDocument();
	expect(useSettings.getState().language).toBe("fr");
	await i18n.changeLanguage("en");
});

it("switching to the beta channel saves it and re-checks for updates", async () => {
	renderDialog();
	fireEvent.click(screen.getByRole("button", { name: "Beta" }));
	expect(useSettings.getState().updateChannel).toBe("beta");
	await vi.waitFor(() =>
		expect(updater.checkForUpdate).toHaveBeenCalledWith(true),
	);
	expect(screen.getByText(/may be unstable/i)).toBeInTheDocument();
});

it("opens the changelog from the dialog", async () => {
	renderDialog();
	fireEvent.click(screen.getByRole("button", { name: "What's new" }));
	// The changelog content changes with each release; its dialog does not.
	expect(
		await screen.findByText("The changes in Git Forest."),
	).toBeInTheDocument();
});
