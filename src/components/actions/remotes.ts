/** `origin` when there is one, otherwise the first remote. */
export const defaultRemote = (names: string[]): string =>
	names.includes("origin") ? "origin" : (names[0] ?? "");
