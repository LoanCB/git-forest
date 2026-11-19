import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { toGitError, unwatchRepo, watchRepo } from "../git/api";
import { selectLocalBusy, useOperations } from "../store/operations";
import { useRepoView } from "../store/repoView";
import { useWatchNotice } from "../store/watchNotice";

/**
 * Keeps the open repository watched and refreshes the view when it changes
 * on disk. A change that arrives during a local action waits for it to finish
 * and then costs a single refresh. Mount once.
 */
export function useRepoWatcher() {
	const repo = useRepoView((s) => s.repo);
	const busy = useOperations(selectLocalBusy);
	const busyRef = useRef(busy);
	const pending = useRef(false);

	useEffect(() => {
		busyRef.current = busy;
		if (!busy && pending.current) {
			pending.current = false;
			void useRepoView.getState().refresh();
		}
	}, [busy]);

	useEffect(() => {
		if (!repo) {
			unwatchRepo().catch(() => {});
			return;
		}
		let cancelled = false;
		let unlisten: (() => void) | undefined;
		pending.current = false;
		listen<{ repo: string }>("repo-changed", (event) => {
			if (event.payload.repo !== useRepoView.getState().repo) return;
			if (busyRef.current) pending.current = true;
			else void useRepoView.getState().refresh();
		})
			.then((fn) => {
				if (cancelled) fn();
				else unlisten = fn;
			})
			.catch((e) => console.error("Could not listen to repo changes", e));
		watchRepo(repo).catch((e) => {
			console.error("Could not watch the repo", e);
			if (!cancelled) useWatchNotice.getState().show(toGitError(e).message);
		});
		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, [repo]);

	// Not in the effect above: on a repo switch, an unwatch could overtake the
	// next watch and drop it.
	useEffect(() => () => void unwatchRepo().catch(() => {}), []);
}
