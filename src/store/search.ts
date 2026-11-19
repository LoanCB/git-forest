import { create } from "zustand";

interface SearchState {
	query: string;
	matches: string[];
	/** Position of the current match in `matches`. */
	index: number;
	setQuery(query: string): void;
	/** Replaces the matches, keeping the current one selected when it survives. */
	setMatches(matches: string[]): void;
	/** Moves by `delta` (wrapping) and returns the new current hash. */
	step(delta: number): string | null;
	select(hash: string): void;
	clear(): void;
}

export const useSearch = create<SearchState>((set, get) => ({
	query: "",
	matches: [],
	index: 0,

	setQuery(query) {
		set({ query });
	},

	setMatches(matches) {
		const { matches: old, index } = get();
		const kept = matches.indexOf(old[index]);
		set({ matches, index: Math.max(kept, 0) });
	},

	step(delta) {
		const { matches, index } = get();
		if (matches.length === 0) return null;
		const next = (index + delta + matches.length) % matches.length;
		set({ index: next });
		return matches[next];
	},

	select(hash) {
		const i = get().matches.indexOf(hash);
		if (i >= 0) set({ index: i });
	},

	clear() {
		set({ query: "", matches: [], index: 0 });
	},
}));
