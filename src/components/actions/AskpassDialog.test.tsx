import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useAskpass } from "@/store/askpass";
import { AskpassDialog } from "./AskpassDialog";
import { callsTo } from "./testUtils";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => {
	vi.mocked(invoke).mockReset();
	vi.mocked(invoke).mockResolvedValue(undefined);
	useAskpass.setState({ queue: [] });
});

const ask = (id: number, prompt: string, extra = {}) =>
	useAskpass
		.getState()
		.push({ id, prompt, kind: "text", network: true, ...extra });

it("masks a passphrase and sends what was typed", () => {
	ask(1, "Enter passphrase for key '/k':");
	render(<AskpassDialog />);
	const field = screen.getByLabelText("Enter passphrase for key '/k':");
	expect(field).toHaveAttribute("type", "password");
	fireEvent.change(field, { target: { value: "s3cret" } });
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	expect(callsTo("answer_askpass")[0][1]).toEqual({ id: 1, answer: "s3cret" });
	expect(useAskpass.getState().queue).toEqual([]);
});

it("shows a host key question in clear and asks the next one after", () => {
	ask(
		1,
		"Are you sure you want to continue connecting (yes/no/[fingerprint])?",
	);
	ask(2, "Password:");
	render(<AskpassDialog />);
	expect(screen.getByRole("textbox")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(callsTo("answer_askpass")[0][1]).toEqual({ id: 1, answer: null });
	expect(screen.getByLabelText("Password:")).toHaveAttribute(
		"type",
		"password",
	);
});

it("answers a confirmation without text", () => {
	ask(3, "Allow use of key k?", { kind: "confirm" });
	render(<AskpassDialog />);
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	expect(callsTo("answer_askpass")[0][1]).toEqual({ id: 3, answer: "" });
});

it("drops the prompts of an operation that is over, but not the others", () => {
	ask(1, "Password:");
	ask(2, "Enter passphrase for key '/k':", { network: false });
	useAskpass.getState().dropNetwork();
	expect(useAskpass.getState().queue.map((r) => r.id)).toEqual([2]);
	expect(callsTo("answer_askpass")[0][1]).toEqual({ id: 1, answer: null });
});
