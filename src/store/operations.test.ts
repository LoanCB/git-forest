import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { useOperations } from "./operations";
import { useRepoView } from "./repoView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const refresh = vi.fn();

beforeEach(() => {
	vi.mocked(invoke).mockReset();
	refresh.mockReset().mockResolvedValue(undefined);
	useRepoView.setState({ refresh });
	useOperations.setState({ running: [], lastError: null });
	useRepoView.setState({ repo: "/p/r" });
});

it("runNetwork shows the operation with a Cancel button until it settles", async () => {
	let finish: () => void = () => {};
	const done = useOperations
		.getState()
		.runNetwork(
			"Fetch",
			() => new Promise<void>((resolve) => (finish = resolve)),
		);
	const [op] = useOperations.getState().running;
	expect(op).toMatchObject({ label: "Fetch", cancellable: true });

	finish();
	await done;
	expect(useOperations.getState().running).toEqual([]);
	expect(refresh).toHaveBeenCalledTimes(1);
});

it("hands the same id to the action and to cancel_operation", async () => {
	vi.mocked(invoke).mockResolvedValue(undefined);
	let seen = "";
	void useOperations.getState().runNetwork("Fetch", (opId) => {
		seen = opId;
		return new Promise<void>(() => {});
	});
	useOperations.getState().cancel(seen);
	expect(invoke).toHaveBeenCalledWith("cancel_operation", { opId: seen });
});

it("cancel calls cancel_operation and Cancelled shows no error dialog", async () => {
	vi.mocked(invoke).mockResolvedValue(undefined);
	let reject: (e: unknown) => void = () => {};
	const done = useOperations
		.getState()
		.runNetwork("Push", () => new Promise<void>((_, r) => (reject = r)));
	const [op] = useOperations.getState().running;
	useOperations.getState().cancel(op.id);
	expect(invoke).toHaveBeenCalledWith("cancel_operation", { opId: op.id });

	reject({ kind: "cancelled", message: "cancelled" });
	const result = await done;
	expect(result.ok).toBe(false);
	expect(useOperations.getState().lastError).toBeNull();
	expect(refresh).toHaveBeenCalled();
});

it("a failed action shows git's stderr verbatim and still refreshes", async () => {
	const message = "fatal: unable to access\n  'https://x/': Could not resolve";
	await useOperations
		.getState()
		.runLocal("Checkout", () => Promise.reject({ kind: "failed", message }));
	expect(useOperations.getState().lastError).toEqual({
		kind: "failed",
		message,
	});
	expect(refresh).toHaveBeenCalledTimes(1);
	useOperations.getState().clearError();
	expect(useOperations.getState().lastError).toBeNull();
});

it("an invalid name goes back to the caller instead of the dialog when asked", async () => {
	const error = { kind: "invalidName", message: "bad name" };
	const result = await useOperations
		.getState()
		.runLocal("Create branch", () => Promise.reject(error), {
			inlineInvalidName: true,
		});
	expect(result).toEqual({ ok: false, error });
	expect(useOperations.getState().lastError).toBeNull();
});

it("refuses a second local action while one is running", async () => {
	let finish: () => void = () => {};
	const first = useOperations
		.getState()
		.runLocal("A", () => new Promise<void>((resolve) => (finish = resolve)));
	const fn = vi.fn();
	const second = await useOperations.getState().runLocal("B", fn);
	expect(second.ok).toBe(false);
	expect(fn).not.toHaveBeenCalled();
	finish();
	await first;
});

it("records the repository an error belongs to, even if another is open by then", async () => {
	let reject: (e: unknown) => void = () => {};
	const done = useOperations
		.getState()
		.runNetwork("Fetch", () => new Promise<void>((_, r) => (reject = r)));
	expect(useOperations.getState().running[0].repo).toBe("/p/r");
	useRepoView.setState({ repo: "/p/other" });
	reject({ kind: "failed", message: "boom" });
	await done;
	expect(useOperations.getState().lastErrorRepo).toBe("/p/r");
});

it("a local action stays busy until the refresh has finished", async () => {
	let finishRefresh: () => void = () => {};
	refresh.mockReturnValue(new Promise<void>((r) => (finishRefresh = r)));
	const done = useOperations.getState().runLocal("A", async () => {});
	await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
	expect(useOperations.getState().running).toHaveLength(1);
	finishRefresh();
	await done;
	expect(useOperations.getState().running).toHaveLength(0);
});
