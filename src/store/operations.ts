import { create } from "zustand";
import { cancelOperation, toGitError } from "../git/api";
import type { GitError } from "../git/types";
import { useRepoView } from "./repoView";

export interface RunningOperation {
	id: string;
	label: string;
	/** Network operations can be cancelled; local ones are over in an instant. */
	cancellable: boolean;
}

export interface RunOptions {
	/** An `invalidName` failure is returned to the caller (shown inline) instead of opening the error dialog. */
	inlineInvalidName?: boolean;
}

export interface RunResult {
	ok: boolean;
	/** The failure, including a cancellation; `null` on success or when refused as busy. */
	error: GitError | null;
}

interface OperationsState {
	running: RunningOperation[];
	lastError: GitError | null;
	/** Label of the operation that produced `lastError`. */
	lastErrorLabel: string;
	runLocal(
		label: string,
		fn: () => Promise<void>,
		options?: RunOptions,
	): Promise<RunResult>;
	runNetwork(
		label: string,
		fn: (opId: string) => Promise<void>,
		options?: RunOptions,
	): Promise<RunResult>;
	cancel(id: string): void;
	clearError(): void;
}

/** True while a local action runs; those never overlap. */
export const selectLocalBusy = (s: OperationsState) =>
	s.running.some((op) => !op.cancellable);

export const useOperations = create<OperationsState>((set, get) => {
	async function execute(
		label: string,
		cancellable: boolean,
		fn: (id: string) => Promise<void>,
		options: RunOptions = {},
	): Promise<RunResult> {
		const id = crypto.randomUUID();
		set((s) => ({ running: [...s.running, { id, label, cancellable }] }));
		const settle = () =>
			set((s) => ({ running: s.running.filter((op) => op.id !== id) }));
		let error: GitError | null = null;
		try {
			await fn(id);
		} catch (e) {
			error = toGitError(e);
		}
		if (cancellable) settle();
		if (
			error &&
			error.kind !== "cancelled" &&
			!(options.inlineInvalidName && error.kind === "invalidName")
		)
			set({ lastError: error, lastErrorLabel: label });
		try {
			await useRepoView.getState().refresh();
		} finally {
			// A local action stays busy until the view shows its outcome.
			if (!cancellable) settle();
		}
		return { ok: error === null, error };
	}

	return {
		running: [],
		lastError: null,
		lastErrorLabel: "",

		async runLocal(label, fn, options) {
			if (selectLocalBusy(get())) return { ok: false, error: null };
			return execute(label, false, () => fn(), options);
		},

		runNetwork: (label, fn, options) => execute(label, true, fn, options),

		cancel(id) {
			// The operation itself settles with `cancelled`; nothing to report here.
			cancelOperation(id).catch(() => {});
		},

		clearError() {
			set({ lastError: null, lastErrorLabel: "" });
		},
	};
});
