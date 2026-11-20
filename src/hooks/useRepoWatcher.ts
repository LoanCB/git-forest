import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { toGitError, unwatchRepo, watchRepo } from "../git/api";
import { selectLocalBusy, useOperations } from "../store/operations";
import { mergeScopes, useRepoView } from "../store/repoView";
import type { RefreshScope } from "../store/repoView.types";
import { useWatchNotice } from "../store/watchNotice";

/**
 * Keeps the open repository watched and refreshes the view when it changes
 * on disk. A change that arrives during a local action, or while the window is
 * hidden, waits for it to end and then costs a single refresh. Mount once.
 */
export function useRepoWatcher() {
	const repo = useRepoView((s) => s.repo);
	const busy = useOperations(selectLocalBusy);
	const busyRef = useRef(busy);
	const pending = useRef<RefreshScope | null>(null);

	const flush = useRef(() => {
		const scope = pending.current;
		if (!scope || busyRef.current || document.hidden) return;
		pending.current = null;
		void useRepoView.getState().refresh(scope);
	}).current;

	useEffect(() => {
		busyRef.current = busy;
		flush();
	}, [busy, flush]);

	useEffect(() => {
		document.addEventListener("visibilitychange", flush);
		return () => document.removeEventListener("visibilitychange", flush);
	}, [flush]);

	useEffect(() => {
		if (!repo) {
			unwatchRepo().catch(() => {});
			return;
		}
		let cancelled = false;
		let unlisten: (() => void) | undefined;
		pending.current = null;
		listen<{ repo: string; history?: boolean }>("repo-changed", (event) => {
			if (event.payload.repo !== useRepoView.getState().repo) return;
			const scope = event.payload.history === false ? "status" : "all";
			pending.current = mergeScopes(pending.current, scope);
			flush();
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
	}, [repo, flush]);

	// Not in the effect above: on a repo switch, an unwatch could overtake the
	// next watch and drop it.
	useEffect(() => () => void unwatchRepo().catch(() => {}), []);
}
