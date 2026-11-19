import { create } from "zustand";
import { addRepo, listRepos, removeRepo, toGitError } from "../git/api";
import type { GitError, RepoEntry } from "../git/types";
import { getLastRepo, setLastRepo } from "./prefs";

export interface AddManyResult {
	added: RepoEntry[];
	failed: { path: string; error: GitError }[];
}

interface ReposState {
	repos: RepoEntry[];
	current: string | null;
	load(): Promise<void>;
	add(path: string): Promise<void>;
	addMany(paths: string[]): Promise<AddManyResult>;
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
		const added: RepoEntry[] = [];
		const failed: AddManyResult["failed"] = [];
		// One at a time, in order (the backend serialises list writes anyway);
		// one failing path must not abort the rest.
		await paths.reduce(
			(previous, path) =>
				previous.then(() =>
					addRepo(path).then(
						(entry) => {
							added.push(entry);
						},
						(e) => {
							failed.push({ path, error: toGitError(e) });
						},
					),
				),
			Promise.resolve(),
		);
		set((s) => ({
			repos: [
				...s.repos,
				...added.filter((a) => !s.repos.some((r) => r.path === a.path)),
			],
		}));
		if (get().current === null && added[0]) await get().select(added[0].path);
		return { added, failed };
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
