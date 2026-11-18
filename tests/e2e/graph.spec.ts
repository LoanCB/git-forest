import { expect, type Page, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
	expect(await page.evaluate(() => window.__unstubbed)).toEqual([]);
});

const calls = (page: Page) => page.evaluate(() => window.__calls);

test("open a repository, read the graph, inspect a commit, add a tag", async ({
	page,
}) => {
	await page.goto("/index.test.html");

	await expect(page.getByText("Uncommitted Changes (3)")).toBeVisible();

	// develop and origin/develop sit on one commit: one badge carrying both.
	const develop = page
		.locator('[data-badge="local"]')
		.filter({ hasText: "develop" });
	await expect(develop).toContainText("origin");
	await expect(
		page.locator('[data-badge="tag"]').filter({ hasText: "v0.1.0" }),
	).toBeVisible();

	// A commit opens its details; a file opens its diff.
	const merge = page.locator("[data-row]", {
		hasText: "Merge branch 'develop'",
	});
	await merge.click();
	await expect(page.getByText("Files (2)")).toBeVisible();
	await page.getByRole("button", { name: /src\/loader\.ts/ }).click();
	await expect(page.getByText("+", { exact: true }).first()).toBeVisible();
	await expect(
		page.getByText("const kept = lines.filter(Boolean);"),
	).toBeVisible();
	await merge.click();

	// Add a tag from the context menu.
	const target = page.locator("[data-row]", {
		hasText: "grey out the merge commits",
	});
	// Gitmoji shortcodes are rendered, not shown raw.
	await expect(target).toContainText("✨");
	await target.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Add tag…" }).click();
	await page.getByLabel("Name:").fill("v0.2.0");
	await page.getByRole("button", { name: "Add Tag" }).click();

	await expect(
		page.locator('[data-badge="tag"]').filter({ hasText: "v0.2.0" }),
	).toBeVisible();
	expect(await calls(page)).toContainEqual({
		cmd: "add_tag",
		args: expect.objectContaining({ name: "v0.2.0", message: "" }),
	});

	// Search highlights the first match.
	await page.getByRole("searchbox", { name: "Search" }).fill("feat");
	const current = page.locator('[data-row][data-match="current"]');
	await expect(current).toHaveCount(1);
	await expect(current).toContainText("feat");
	await expect(page.getByText("1 / ")).toBeVisible();
});

test("a failed push shows git's message", async ({ page }) => {
	const message = "! [rejected] main -> main (non-fast-forward)";
	await page.addInitScript((m) => {
		window.__failures = { push_branch: { kind: "failed", message: m } };
	}, message);
	await page.goto("/index.test.html");

	await expect(page.getByText("Uncommitted Changes (3)")).toBeVisible();
	await page
		.locator('[data-badge="local"]')
		.filter({ hasText: "main" })
		.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Push…" }).click();
	await page.getByRole("button", { name: "Push", exact: true }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toContainText(message);
	await expect(dialog).toContainText("Push main to origin failed");
	expect(await calls(page)).toContainEqual({
		cmd: "push_branch",
		args: expect.objectContaining({ remote: "origin", name: "main" }),
	});
});
