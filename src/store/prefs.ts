import { load, type Store } from "@tauri-apps/plugin-store";
import { DEFAULT_REPO_PREFS, type RepoPrefs } from "./prefs.types";

const FILE = "prefs.json";
const LAST_REPO_KEY = "lastRepo";
const repoKey = (path: string) => `repo:${path}`;

let storePromise: Promise<Store> | null = null;
const getStore = () => {
	storePromise ??= load(FILE, { defaults: {}, autoSave: false });
	return storePromise;
};

export async function getRepoPrefs(path: string): Promise<RepoPrefs> {
	const stored = await (await getStore()).get<Partial<RepoPrefs>>(
		repoKey(path),
	);
	return {
		...DEFAULT_REPO_PREFS,
		...stored,
		columnWidths: {
			...DEFAULT_REPO_PREFS.columnWidths,
			...stored?.columnWidths,
		},
	};
}

export async function setRepoPrefs(
	path: string,
	patch: Partial<RepoPrefs>,
): Promise<RepoPrefs> {
	const store = await getStore();
	const next = { ...(await getRepoPrefs(path)), ...patch };
	await store.set(repoKey(path), next);
	await store.save();
	return next;
}

export async function getLastRepo(): Promise<string | null> {
	return (await (await getStore()).get<string>(LAST_REPO_KEY)) ?? null;
}

export async function setLastRepo(path: string): Promise<void> {
	const store = await getStore();
	await store.set(LAST_REPO_KEY, path);
	await store.save();
}
