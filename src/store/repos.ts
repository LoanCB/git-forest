import { create } from "zustand";
import { addRepo, listRepos, removeRepo } from "../git/api";
import type { RepoEntry } from "../git/types";
import { getLastRepo, setLastRepo } from "./prefs";

interface ReposState {
	repos: RepoEntry[];
	current: string | null;
	load(): Promise<void>;
	add(path: string): Promise<void>;
	addMany(paths: string[]): Promise<void>;
	remove(path: string): Promise<void>;
	select(path: string): Promise<void>;
}

export const useReposStore = create<ReposState>((set, get) => ({
	repos: [],
	current: null,

	async load() {
		const [repos, last] = await Promise.all([listRepos(), getLastRepo()]);
		const current =
			last && repos.some((r) => r.path === last)
				? last
				: (repos[0]?.path ?? null);
		set({ repos, current });
	},

	async add(path) {
		const entry = await addRepo(path);
		set((s) => ({
			repos: s.repos.some((r) => r.path === entry.path)
				? s.repos
				: [...s.repos, entry],
		}));
		await get().select(entry.path);
	},

	async addMany(paths) {
		// One failing path must not abort the rest of the batch.
		const results = await Promise.allSettled(paths.map(addRepo));
		const added = results.flatMap((r) =>
			r.status === "fulfilled" ? [r.value] : [],
		);
		set((s) => ({
			repos: [
				...s.repos,
				...added.filter((a) => !s.repos.some((r) => r.path === a.path)),
			],
		}));
		if (get().current === null && added[0]) await get().select(added[0].path);
	},

	async remove(path) {
		await removeRepo(path);
		set((s) => {
			const repos = s.repos.filter((r) => r.path !== path);
			return {
				repos,
				current: s.current === path ? (repos[0]?.path ?? null) : s.current,
			};
		});
	},

	async select(path) {
		set({ current: path });
		await setLastRepo(path);
	},
}));
