import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useRepoView } from "@/store/repoView";
import { Toolbar } from "./Toolbar";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/store/prefs", () => ({
	setLastRepo: vi.fn(),
	getLastRepo: vi.fn(),
}));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => useRepoView.setState({ repo: "/p/r", error: null }));

it("Fetch is enabled on an open repository", () => {
	render(<Toolbar />);
	expect(screen.getByRole("button", { name: "Fetch" })).toBeEnabled();
});

it("Fetch is disabled when the repository is missing", () => {
	useRepoView.setState({
		error: { kind: "repoNotFound", message: "gone" },
	});
	render(<Toolbar />);
	expect(screen.getByRole("button", { name: "Fetch" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
});
