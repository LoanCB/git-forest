import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { SshKeyHelp } from "./SshKeyHelp";
import { callsTo } from "./testUtils";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => vi.mocked(invoke).mockReset());

const backend = (agent: boolean, load?: () => Promise<void>) =>
	vi.mocked(invoke).mockImplementation(async (cmd) => {
		if (cmd === "ssh_agent_available") return agent;
		if (cmd === "list_ssh_keys")
			return ["/h/.ssh/gitlab", "/h/.ssh/id_ed25519"];
		if (cmd === "load_ssh_key") return load?.();
		return undefined;
	});

it("loads the chosen key when an agent is reachable", async () => {
	backend(true);
	render(<SshKeyHelp />);
	fireEvent.click(await screen.findByRole("button", { name: "Load key" }));
	expect(await screen.findByText(/key loaded/i)).toBeInTheDocument();
	expect(callsTo("load_ssh_key")[0][1]).toEqual({ key: "/h/.ssh/gitlab" });
});

it("shows ssh-add's refusal", async () => {
	backend(true, async () => {
		throw { kind: "failed", message: "Bad passphrase" };
	});
	render(<SshKeyHelp />);
	fireEvent.click(await screen.findByRole("button", { name: "Load key" }));
	expect(await screen.findByRole("alert")).toHaveTextContent("Bad passphrase");
});

it("only explains when no agent is reachable", async () => {
	backend(false);
	render(<SshKeyHelp />);
	expect(screen.getByText(/refused your ssh keys/)).toBeInTheDocument();
	await new Promise((r) => setTimeout(r, 0));
	expect(screen.queryByRole("button", { name: "Load key" })).toBeNull();
	expect(callsTo("list_ssh_keys")).toHaveLength(0);
});
