import { create } from "zustand";

/** The dialog the actions host shows; at most one at a time. */
export type DialogRequest =
	| { kind: "checkoutCommit"; hash: string }
	| { kind: "createBranch"; hash: string }
	| { kind: "addTag"; hash: string }
	| { kind: "renameBranch"; name: string }
	| { kind: "deleteBranch"; name: string }
	| { kind: "deleteRemoteBranch"; remote: string; name: string }
	| { kind: "deleteTag"; name: string }
	| { kind: "pushBranch"; name: string; hasUpstream: boolean }
	| { kind: "pushTag"; name: string };

interface ActionDialogState {
	request: DialogRequest | null;
	open(request: DialogRequest): void;
	close(): void;
}

export const useActionDialog = create<ActionDialogState>((set) => ({
	request: null,
	open: (request) => set({ request }),
	close: () => set({ request: null }),
}));
