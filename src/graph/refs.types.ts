export type RefBadge =
	| {
			kind: "local";
			name: string;
			/** Remotes whose branch of the same name points at the same commit. */
			remotes: string[];
			current: boolean;
			upstream?: string;
	  }
	| {
			kind: "remote";
			remote: string;
			name: string;
			/** True for the `<remote>/HEAD` badge itself, drawn at its target. */
			isHead: boolean;
	  }
	| { kind: "tag"; name: string };
