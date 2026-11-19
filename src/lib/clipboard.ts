/**
 * Copies `text` to the clipboard. Falls back to a hidden textarea and
 * `execCommand` where the async Clipboard API is missing or refused, as in
 * some WebKitGTK webviews.
 */
export async function copyText(text: string): Promise<void> {
	try {
		if (navigator.clipboard) {
			await navigator.clipboard.writeText(text);
			return;
		}
	} catch {
		// Refused: try the fallback below.
	}
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	document.body.append(area);
	area.select();
	try {
		document.execCommand("copy");
	} finally {
		area.remove();
	}
}
