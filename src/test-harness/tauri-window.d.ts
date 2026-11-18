interface Window {
	__TAURI_INTERNALS__: Record<string, unknown>;
	/** Every `invoke` the app made, in order. */
	__calls: { cmd: string; args: Record<string, unknown> | undefined }[];
	/** Commands to reject, by name, with the value to reject with. */
	__failures: Record<string, unknown>;
}
