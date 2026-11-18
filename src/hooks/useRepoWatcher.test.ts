import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useOperations } from "../store/operations";
import { useRepoView } from "../store/repoView";
import { useRepoWatcher } from "./useRepoWatcher";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const refresh = vi.fn();
let emit: (repo: string) => void = () => {};

const busy = (on: boolean) =>
	act(() =>
		useOperations.setState({
			running: on
				? [{ id: "x", label: "Do", cancellable: false, repo: "/p/r" }]
				: [],
		}),
	);

beforeEach(() => {
	vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
	vi.mocked(listen)
		.mockReset()
		.mockImplementation(async (_event, handler) => {
			emit = (repo) =>
				(handler as (e: { payload: { repo: string } }) => void)({
					payload: { repo },
				});
			return () => {};
		});
	refresh.mockReset().mockResolvedValue(undefined);
	useOperations.setState({ running: [] });
	useRepoView.setState({ repo: "/p/r", refresh });
});

it("refreshes the view on repo-changed for the current repo only", async () => {
	renderHook(() => useRepoWatcher());
	await vi.waitFor(() => expect(listen).toHaveBeenCalled());
	expect(invoke).toHaveBeenCalledWith("watch_repo", { repo: "/p/r" });

	emit("/p/other");
	expect(refresh).not.toHaveBeenCalled();
	emit("/p/r");
	expect(refresh).toHaveBeenCalledTimes(1);
});

it("defers the refresh while a local action is running", async () => {
	renderHook(() => useRepoWatcher());
	await vi.waitFor(() => expect(listen).toHaveBeenCalled());
	busy(true);

	emit("/p/r");
	emit("/p/r");
	expect(refresh).not.toHaveBeenCalled();
	busy(false);
	expect(refresh).toHaveBeenCalledTimes(1);
});

it("unwatches when the repository closes", async () => {
	renderHook(() => useRepoWatcher());
	await vi.waitFor(() =>
		expect(invoke).toHaveBeenCalledWith("watch_repo", { repo: "/p/r" }),
	);
	act(() => useRepoView.setState({ repo: null }));
	await vi.waitFor(() =>
		expect(invoke).toHaveBeenCalledWith("unwatch_repo", undefined),
	);
});
