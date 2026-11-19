import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useAskpass } from "@/store/askpass";
import type { AskpassRequest } from "@/store/askpass.types";
import { useOperations } from "@/store/operations";

const networkRunning = () =>
	useOperations.getState().running.some((op) => op.cancellable);

/**
 * Queues the prompts ssh and git send through the askpass helper, and drops
 * those of a fetch or push once it is over (cancelled or failed), since
 * nobody waits for their answer any more. Mount once.
 */
export function useAskpassPrompts() {
	useEffect(() => {
		let unlisten: (() => void) | undefined;
		let cancelled = false;
		listen<Omit<AskpassRequest, "network">>("askpass-request", (event) => {
			useAskpass
				.getState()
				.push({ ...event.payload, network: networkRunning() });
		})
			.then((fn) => {
				if (cancelled) fn();
				else unlisten = fn;
			})
			.catch((e) => console.error("Could not listen to prompts", e));
		const unsubscribe = useOperations.subscribe((s) => {
			if (!s.running.some((op) => op.cancellable))
				useAskpass.getState().dropNetwork();
		});
		return () => {
			cancelled = true;
			unlisten?.();
			unsubscribe();
		};
	}, []);
}
