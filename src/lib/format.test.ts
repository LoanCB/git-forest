import { expect, it } from "vitest";
import { formatDate } from "@/lib/format";

it("formats dates as in the reference screenshots for en and fr", () => {
	// Built in local time so the test holds in any time zone.
	const at = new Date(2026, 10, 18, 14, 58).getTime() / 1000;
	expect(formatDate(at, "en")).toBe("18 Nov 2026 14:58");
	expect(formatDate(at, "fr")).toBe("18 nov. 2026 14:58");

	const early = new Date(2026, 0, 5, 9, 3).getTime() / 1000;
	expect(formatDate(early, "en")).toBe("5 Jan 2026 09:03");
	expect(formatDate(early, "fr")).toBe("5 janv. 2026 09:03");
});
