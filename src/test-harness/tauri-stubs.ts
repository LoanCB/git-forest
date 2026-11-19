// Sets up window.__TAURI_INTERNALS__ so the Tauri JS SDK talks to the fixture
// dispatcher instead of a backend. Must be imported before any Tauri SDK usage.
import { dispatch } from "./fixtures";

window.__calls = [];
window.__failures ??= {};
window.__unstubbed = [];

window.__TAURI_INTERNALS__ = {
	ipc: {
		postMessage: () => {},
	},
	metadata: {
		currentWindow: { label: "main" },
		windows: [],
		menus: {},
	},
	convertFileSrc: (path: string) => path,
	transformCallback: (_callback: (response: unknown) => void, _once: boolean) =>
		Math.random(),
	invoke: async (cmd: string, args?: Record<string, unknown>) => {
		window.__calls.push({ cmd, args });
		if (cmd in window.__failures) throw window.__failures[cmd];
		return dispatch(cmd, args);
	},
};
