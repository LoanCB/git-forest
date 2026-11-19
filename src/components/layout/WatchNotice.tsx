import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWatchNotice } from "@/store/watchNotice";

/** Non-blocking notice that automatic refresh could not be set up. */
export function WatchNotice() {
	const { t } = useTranslation();
	const message = useWatchNotice((s) => s.message);
	const dismiss = useWatchNotice((s) => s.dismiss);
	if (message === null) return null;
	return (
		<div
			role="status"
			className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1 text-[13px]"
		>
			<p className="min-w-0 flex-1">{t("watch.unavailable", { message })}</p>
			<Button size="xs" variant="outline" onClick={dismiss}>
				{t("watch.dismiss")}
			</Button>
		</div>
	);
}
