import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { darkTheme } from "./themes/dark";
import { lightTheme } from "./themes/light";
import type { Theme, ThemeMode } from "./types";

interface ThemeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
	mode: "dark",
	setMode: () => {},
});

export function useTheme() {
	return use(ThemeContext);
}

function isDark(mode: ThemeMode, prefersDark: boolean): boolean {
	return mode === "system" ? prefersDark : mode === "dark";
}

function applyTheme(theme: Theme, dark: boolean) {
	const root = document.documentElement;
	for (const [key, value] of Object.entries(theme.tokens)) {
		root.style.setProperty(key, value);
	}
	root.classList.toggle("dark", dark);
}

function readStoredMode(defaultMode: ThemeMode): ThemeMode {
	const stored = localStorage.getItem("theme-mode");
	return stored === "system" || stored === "light" || stored === "dark"
		? stored
		: defaultMode;
}

interface ThemeProviderProps {
	children: ReactNode;
	defaultMode?: ThemeMode;
}

export function ThemeProvider({
	children,
	defaultMode = "dark",
}: ThemeProviderProps) {
	const [mode, setModeState] = useState<ThemeMode>(() =>
		readStoredMode(defaultMode),
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		function sync() {
			const dark = isDark(mode, mediaQuery.matches);
			applyTheme(dark ? darkTheme : lightTheme, dark);
		}
		sync();
		mediaQuery.addEventListener("change", sync);
		return () => mediaQuery.removeEventListener("change", sync);
	}, [mode]);

	const setMode = useCallback((newMode: ThemeMode) => {
		localStorage.setItem("theme-mode", newMode);
		setModeState(newMode);
	}, []);

	const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}
