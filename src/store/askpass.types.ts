/** A question from ssh or git, as sent by the askpass helper. */
export interface AskpassRequest {
	id: number;
	prompt: string;
	/** `confirm`: a yes/no answer, no text. */
	kind: "text" | "confirm";
	/** Asked during a fetch or push: dropped once no such operation runs. */
	network: boolean;
}
