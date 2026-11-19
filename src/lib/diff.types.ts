export type DiffLineKind = "add" | "del" | "ctx" | "hunk" | "meta";

export interface DiffLine {
	kind: DiffLineKind;
	/** Without the leading `+`, `-` or space for add, del and ctx lines. */
	text: string;
	oldNo?: number;
	newNo?: number;
}
