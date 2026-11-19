import { load, type Store } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import i18n from "@/i18n";
import type { ThemeMode } from "@/theme/types";
import type { Language, Settings, UpdateChannel } from "./settings.types";

const FILE = "settings.json";

let storePromise: Promise<Store> | null = null;
const getStore = () => {
	storePromise ??= load(FILE, { defaults: {}, autoSave: false });
	return storePromise;
};

async function persist<K extends keyof Settings>(key: K, value: Settings[K]) {
	const store = await getStore();
	await store.set(key, value);
	await store.save();
}

const isTheme = (v: unknown): v is ThemeMode =>
	v === "system" || v === "light" || v === "dark";
const isLanguage = (v: unknown): v is Language => v === "fr" || v === "en";
const isChannel = (v: unknown): v is UpdateChannel =>
	v === "stable" || v === "beta";

// The plugin store is async, so the theme is mirrored in localStorage to give
// the first paint the right value. The plugin store stays the source of truth.
const THEME_MIRROR_KEY = "theme-mode";

function readThemeMirror(): ThemeMode {
	try {
		const stored = localStorage.getItem(THEME_MIRROR_KEY);
		if (isTheme(stored)) return stored;
	} catch {
		// Storage unavailable: fall back to the default.
	}
	return "dark";
}

function writeThemeMirror(theme: ThemeMode) {
	try {
		localStorage.setItem(THEME_MIRROR_KEY, theme);
	} catch {
		// The mirror is only a first-paint hint.
	}
}

// Until a choice is stored, the language follows what i18n detected.
const detectedLanguage = (): Language =>
	i18n.language?.startsWith("fr") ? "fr" : "en";

interface SettingsStore extends Settings {
	load(): Promise<void>;
	setTheme(theme: ThemeMode): Promise<void>;
	setLanguage(language: Language): Promise<void>;
	setUpdateChannel(channel: UpdateChannel): Promise<void>;
}

export const useSettings = create<SettingsStore>((set) => ({
	theme: readThemeMirror(),
	language: detectedLanguage(),
	updateChannel: "stable",

	async load() {
		const store = await getStore();
		const [theme, language, updateChannel] = await Promise.all([
			store.get<unknown>("theme"),
			store.get<unknown>("language"),
			store.get<unknown>("updateChannel"),
		]);
		const patch: Partial<Settings> = {};
		if (isTheme(theme)) {
			patch.theme = theme;
			writeThemeMirror(theme);
		}
		if (isLanguage(language)) {
			patch.language = language;
			await i18n.changeLanguage(language);
		}
		if (isChannel(updateChannel)) patch.updateChannel = updateChannel;
		set(patch);
	},

	async setTheme(theme) {
		set({ theme });
		writeThemeMirror(theme);
		await persist("theme", theme);
	},

	async setLanguage(language) {
		set({ language });
		await i18n.changeLanguage(language);
		await persist("language", language);
	},

	async setUpdateChannel(updateChannel) {
		set({ updateChannel });
		await persist("updateChannel", updateChannel);
	},
}));
