import { create } from "zustand";

interface WatchNoticeState {
	message: string | null;
	/** Shown at most once per session: after a dismissal it stays quiet. */
	dismissed: boolean;
	show(message: string): void;
	dismiss(): void;
}

/** Why automatic refresh is off, when the watcher could not start. */
export const useWatchNotice = create<WatchNoticeState>((set, get) => ({
	message: null,
	dismissed: false,
	show(message) {
		if (!get().dismissed) set({ message });
	},
	dismiss() {
		set({ message: null, dismissed: true });
	},
}));
