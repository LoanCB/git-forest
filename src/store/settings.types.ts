import type { ThemeMode } from "@/theme/types";

export type Language = "fr" | "en";
export type UpdateChannel = "stable" | "beta";

export interface Settings {
	theme: ThemeMode;
	language: Language;
	updateChannel: UpdateChannel;
}
