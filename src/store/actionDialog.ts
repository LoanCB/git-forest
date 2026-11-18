import { create } from "zustand";
import { useRepoView } from "./repoView";

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

/** A request is bound to the repository it was opened on. */
export type OpenDialog = DialogRequest & { repo: string };

interface ActionDialogState {
	request: OpenDialog | null;
	open(request: DialogRequest): void;
	close(): void;
}

export const useActionDialog = create<ActionDialogState>((set) => ({
	request: null,
	open: (request) => {
		const repo = useRepoView.getState().repo;
		if (repo) set({ request: { ...request, repo } });
	},
	close: () => set({ request: null }),
}));

// A pending dialog never outlives the repository it was opened on.
useRepoView.subscribe((s, prev) => {
	if (s.repo !== prev.repo) useActionDialog.setState({ request: null });
});
