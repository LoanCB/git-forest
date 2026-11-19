import { create } from "zustand";
import { answerAskpass } from "@/git/api";
import type { AskpassRequest } from "./askpass.types";

interface AskpassState {
	/** Oldest first; the dialog shows the head. */
	queue: AskpassRequest[];
	push(request: AskpassRequest): void;
	/** Sends `answer` for `id`; `null` cancels it. */
	answer(id: number, answer: string | null): void;
	/** Cancels every request asked during an operation that is now over. */
	dropNetwork(): void;
}

const send = (id: number, answer: string | null) =>
	answerAskpass(id, answer).catch((e) =>
		console.error("Could not answer the prompt", e),
	);

export const useAskpass = create<AskpassState>((set, get) => ({
	queue: [],
	push: (request) => set((s) => ({ queue: [...s.queue, request] })),
	answer(id, answer) {
		set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
		void send(id, answer);
	},
	dropNetwork() {
		const stale = get().queue.filter((r) => r.network);
		if (stale.length === 0) return;
		set((s) => ({ queue: s.queue.filter((r) => !r.network) }));
		for (const r of stale) void send(r.id, null);
	},
}));
