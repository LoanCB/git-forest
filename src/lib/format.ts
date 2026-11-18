const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string): Intl.DateTimeFormat {
	let f = formatters.get(locale);
	if (!f) {
		f = new Intl.DateTimeFormat(locale, {
			day: "numeric",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(locale, f);
	}
	return f;
}

/** `18 Nov 2026 14:58` (en) / `18 nov. 2026 14:58` (fr), in local time. */
export function formatDate(unixSeconds: number, locale: string): string {
	const parts: Record<string, string> = {};
	for (const p of formatter(locale).formatToParts(unixSeconds * 1000))
		parts[p.type] = p.value;
	return `${parts.day} ${parts.month} ${parts.year} ${parts.hour}:${parts.minute}`;
}
