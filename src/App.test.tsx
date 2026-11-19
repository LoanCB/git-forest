import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useReposStore } from "@/store/repos";
import { useRepoView } from "@/store/repoView";
import App from "./App";
import i18n from "./i18n";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const lastRepo = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/store/prefs", () => ({
	getLastRepo: async () => lastRepo.value,
	setLastRepo: vi.fn(),
	getRepoPrefs: async () =>
		(await import("@/store/prefs.types")).DEFAULT_REPO_PREFS,
	setRepoPrefs: vi.fn(),
}));

const refs = {
	head: { branch: "main", commit: null },
	locals: [],
	remotes: [],
	tags: [],
	remoteNames: [],
};

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => {
	vi.mocked(invoke).mockReset();
	lastRepo.value = null;
	useReposStore.setState({ repos: [], current: null });
	useRepoView.setState({ repo: null, error: null, commits: [] });
});

describe("App", () => {
	it("renders the empty state when no repository is registered", async () => {
		vi.mocked(invoke).mockResolvedValue([]);
		render(<App />);
		expect(await screen.findByText(/add a repository/i)).toBeInTheDocument();
	});

	it("reopens the last repository on start", async () => {
		lastRepo.value = "/b";
		vi.mocked(invoke).mockImplementation(async (cmd) => {
			if (cmd === "list_repos")
				return [
					{ path: "/a", name: "a" },
					{ path: "/b", name: "b" },
				];
			if (cmd === "get_refs") return refs;
			if (cmd === "get_commits") return { commits: [], hasMore: false };
			return [];
		});
		render(<App />);
		await waitFor(() =>
			expect(invoke).toHaveBeenCalledWith("get_refs", { repo: "/b" }),
		);
		expect(invoke).not.toHaveBeenCalledWith("get_refs", { repo: "/a" });
	});

	it("repo-missing: a RepoNotFound error shows the message and a Remove button", async () => {
		vi.mocked(invoke).mockImplementation(async (cmd) => {
			if (cmd === "list_repos") return [{ path: "/gone", name: "gone" }];
			if (cmd === "remove_repo") return undefined;
			throw { kind: "repoNotFound", message: "/gone is missing" };
		});
		render(<App />);
		expect(await screen.findByText("Repository not found")).toBeInTheDocument();
		expect(screen.getByText("/gone is missing")).toBeInTheDocument();
		screen.getByRole("button", { name: "Remove from list" }).click();
		await waitFor(() => expect(useReposStore.getState().repos).toEqual([]));
		expect(await screen.findByText(/add a repository/i)).toBeInTheDocument();
	});

	it("removing the last repository disables the toolbar and F5 does nothing", async () => {
		vi.mocked(invoke).mockImplementation(async (cmd) => {
			if (cmd === "list_repos") return [{ path: "/a", name: "a" }];
			if (cmd === "get_refs") return refs;
			if (cmd === "get_commits") return { commits: [], hasMore: false };
			return [];
		});
		render(<App />);
		const refresh = await screen.findByRole("button", { name: "Refresh" });
		await waitFor(() => expect(refresh).toBeEnabled());

		await useReposStore.getState().remove("/a");
		await screen.findByText(/add a repository/i);
		expect(refresh).toBeDisabled();
		expect(screen.getByRole("button", { name: "Fetch" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Show All" })).toBeDisabled();

		vi.mocked(invoke).mockClear();
		fireEvent.keyDown(document, { key: "F5" });
		await new Promise((r) => setTimeout(r, 0));
		expect(invoke).not.toHaveBeenCalled();
	});
});
