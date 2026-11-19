import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, it } from "vitest";
import i18n from "@/i18n";
import { useWatchNotice } from "@/store/watchNotice";
import { WatchNotice } from "./WatchNotice";

beforeAll(() => i18n.changeLanguage("en"));
beforeEach(() => useWatchNotice.setState({ message: null, dismissed: false }));

it("shows the reason once and stays quiet after a dismissal", async () => {
	render(<WatchNotice />);
	expect(screen.queryByRole("status")).toBeNull();
	useWatchNotice.getState().show("ENOSPC");
	expect(await screen.findByRole("status")).toHaveTextContent(/ENOSPC/);
	await userEvent.click(screen.getByRole("button"));
	expect(screen.queryByRole("status")).toBeNull();
	useWatchNotice.getState().show("again");
	expect(screen.queryByRole("status")).toBeNull();
});
