import { invoke } from "@tauri-apps/api/core";
import { vi } from "vitest";
import { useActionDialog } from "@/store/actionDialog";
import { useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";

export const HASH = "0123456789abcdef0123456789abcdef01234567";

/** Resets the stores and gives the open repository two remotes. */
export function resetActionStores() {
	vi.mocked(invoke).mockReset();
	vi.mocked(invoke).mockResolvedValue(undefined);
	useActionDialog.setState({ request: null });
	useOperations.setState({ running: [], lastError: null });
	useRepoView.setState({
		repo: "/p/r",
		refresh: vi.fn().mockResolvedValue(undefined),
		refs: {
			head: { branch: "main", commit: HASH },
			locals: [],
			remotes: [],
			tags: [],
			remoteNames: ["upstream", "origin"],
		},
	});
}

export const callsTo = (cmd: string) =>
	vi.mocked(invoke).mock.calls.filter(([c]) => c === cmd);
