import { render, screen } from "@testing-library/react";
import App from "./App";
import "./i18n";

it("renders the empty state when no repository is registered", async () => {
	render(<App />);
	expect(await screen.findByText(/add a repository/i)).toBeInTheDocument();
});
