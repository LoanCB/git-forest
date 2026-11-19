import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Commit } from "@/git/types";
import i18n from "@/i18n";
import { useRepoView } from "@/store/repoView";
import { useSearch } from "@/store/search";
import { SearchBox } from "./SearchBox";

const api = vi.hoisted(() => ({ resolveCommit: vi.fn() }));
vi.mock("@/git/api", async (orig) => ({
	...(await orig<typeof import("@/git/api")>()),
	...api,
}));

const commit = (hash: string, subject: string): Commit => ({
	hash,
	parents: [],
	authorName: "Ada",
	authorEmail: "ada@example.com",
	authorDate: 0,
	subject,
});
const h = (c: string) => c.repeat(40);

const requestScrollTo = vi.fn();
beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => {
	vi.resetAllMocks();
	requestScrollTo.mockResolvedValue(true);
	useSearch.getState().clear();
	useRepoView.setState({
		repo: "/r",
		commits: [
			commit(h("a"), "fix one"),
			commit(h("b"), "other"),
			commit(h("c"), "fix two"),
		],
		requestScrollTo,
	});
});

const setup = () => {
	render(<SearchBox inputRef={createRef()} />);
	return screen.getByRole("searchbox");
};

it("Enter / Shift+Enter cycle through matches and scroll to them", async () => {
	const input = setup();
	fireEvent.change(input, { target: { value: "fix" } });
	await screen.findByText("1 / 2");

	fireEvent.keyDown(input, { key: "Enter" });
	await waitFor(() => expect(requestScrollTo).toHaveBeenLastCalledWith(h("a")));
	fireEvent.keyDown(input, { key: "Enter" });
	await waitFor(() => expect(requestScrollTo).toHaveBeenLastCalledWith(h("c")));
	expect(screen.getByText("2 / 2")).toBeInTheDocument();
	fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
	await waitFor(() => expect(requestScrollTo).toHaveBeenLastCalledWith(h("a")));
});

it("an unloaded full or short hash is resolved then loaded with loadUntil", async () => {
	api.resolveCommit.mockResolvedValue(h("9"));
	const input = setup();
	fireEvent.change(input, { target: { value: "9999abc" } });
	fireEvent.keyDown(input, { key: "Enter" });
	await waitFor(() => expect(requestScrollTo).toHaveBeenCalledWith(h("9")));
	expect(api.resolveCommit).toHaveBeenCalledWith("/r", "9999abc");
});

it("reports a hash that does not resolve", async () => {
	api.resolveCommit.mockResolvedValue(null);
	const input = setup();
	fireEvent.change(input, { target: { value: "deadbeef" } });
	fireEvent.keyDown(input, { key: "Enter" });
	expect(
		await screen.findByText(/not in the current view/i),
	).toBeInTheDocument();
	expect(requestScrollTo).not.toHaveBeenCalled();
});

it("Escape clears the search", async () => {
	const input = setup();
	fireEvent.change(input, { target: { value: "fix" } });
	await screen.findByText("1 / 2");
	fireEvent.keyDown(input, { key: "Escape" });
	expect(useSearch.getState().query).toBe("");
	expect(useSearch.getState().matches).toEqual([]);
});
