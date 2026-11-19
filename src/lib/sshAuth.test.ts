import { expect, it } from "vitest";
import { isSshAuthFailure } from "./sshAuth";

it("recognises an ssh key refusal", () => {
	expect(
		isSshAuthFailure("git@host: Permission denied (publickey,password)."),
	).toBe(true);
	expect(isSshAuthFailure("fatal: repository not found")).toBe(false);
});
