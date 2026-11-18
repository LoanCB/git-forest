import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { DEFAULT_REPO_PREFS } from "@/store/prefs.types";
import { useRepoView } from "@/store/repoView";
import { BranchFilter } from "./BranchFilter";

const setBranches = vi.fn();
beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => {
	setBranches.mockReset();
	useRepoView.setState({
		repo: "/r",
		setBranches,
		prefs: { ...DEFAULT_REPO_PREFS, branches: ["main"], showRemotes: false },
		refs: {
			head: { branch: "main", commit: null },
			locals: [
				{ name: "main", commit: "a", upstream: null },
				{ name: "dev", commit: "b", upstream: null },
			],
			remotes: [{ remote: "origin", name: "main", commit: "a", isHead: false }],
			tags: [],
			remoteNames: ["origin"],
		},
	});
});

it("Show All clears the selection; picking branches calls setBranches", () => {
	render(<BranchFilter />);
	fireEvent.click(screen.getByRole("button", { name: "1 selected" }));

	// Remote branches are listed only while Show Remote Branches is on.
	expect(screen.queryByText("origin/main")).not.toBeInTheDocument();

	fireEvent.click(screen.getByRole("checkbox", { name: "dev" }));
	expect(setBranches).toHaveBeenLastCalledWith(["main", "dev"]);

	fireEvent.click(screen.getByRole("checkbox", { name: "main" }));
	expect(setBranches).toHaveBeenLastCalledWith(null);

	setBranches.mockClear();
	fireEvent.click(screen.getByRole("button", { name: "Show All" }));
	expect(setBranches).toHaveBeenCalledTimes(1);
	expect(setBranches).toHaveBeenCalledWith(null);
});

it("lists remote branches when they are shown", () => {
	useRepoView.setState({ prefs: { ...DEFAULT_REPO_PREFS, branches: null } });
	render(<BranchFilter />);
	fireEvent.click(screen.getByRole("button", { name: "Show All" }));
	expect(screen.getByText("origin/main")).toBeInTheDocument();
});
