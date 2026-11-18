import { AlertCircle, ArrowUp, CheckCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUpdaterContext } from "@/hooks/useUpdater";
import { useSettings } from "@/store/settings";

export function UpdateBanner() {
	const { t } = useTranslation();
	const updateChannel = useSettings((s) => s.updateChannel);
	const {
		status,
		available,
		progress,
		error,
		downloadAndInstall,
		dismiss,
		relaunchApp,
		checkForUpdate,
	} = useUpdaterContext();

	// A failed check (dev build, placeholder key, offline) stays silent; only a
	// failure after an update was offered is worth surfacing.
	if (
		status === "idle" ||
		status === "checking" ||
		(status === "available" && !available) ||
		(status === "error" && !available)
	)
		return null;

	return (
		<div
			role="status"
			className="flex items-center gap-3 border-b bg-card px-3 py-1.5 text-[13px]"
		>
			{status === "available" && available && (
				<>
					<ArrowUp
						className={`h-4 w-4 shrink-0 ${available.isBeta ? "text-amber-500" : "text-primary"}`}
					/>
					<span className="text-[13px] flex-1">
						{available.isBeta
							? t("settings.betaUpdateAvailable", {
									version: available.version,
								})
							: t("settings.updateAvailableVersion", {
									version: available.version,
								})}
					</span>
					<Button variant="ghost" size="sm" onClick={dismiss}>
						{t("settings.dismissLater")}
					</Button>
					<Button size="sm" onClick={downloadAndInstall}>
						{t("settings.updateNow")}
					</Button>
				</>
			)}
			{status === "downloading" && (
				<>
					<Loader2 className="h-4 w-4 animate-spin shrink-0" />
					<span className="text-[13px] flex-1">
						{t("settings.downloading")}
					</span>
					<div
						role="progressbar"
						aria-valuenow={progress}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label={t("settings.downloadProgressLabel")}
						className="w-32 h-1.5 bg-muted rounded-full overflow-hidden"
					>
						<div
							className="h-full w-full bg-primary origin-left transition-transform"
							style={{ transform: `scaleX(${progress / 100})` }}
						/>
					</div>
					<span className="text-[13px] text-muted-foreground w-10 text-right">
						{progress}%
					</span>
				</>
			)}
			{status === "ready" && (
				<>
					<CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
					<span className="text-[13px] flex-1">
						{t("settings.updateInstalled")}
					</span>
					<Button size="sm" onClick={relaunchApp}>
						{t("settings.restartNow")}
					</Button>
				</>
			)}
			{status === "error" && (
				<>
					<AlertCircle className="h-4 w-4 text-destructive shrink-0" />
					<div className="flex flex-col flex-1 min-w-0">
						<span className="text-[13px] text-destructive">
							{t("settings.updateFailed")}
						</span>
						{error && (
							<span
								className="text-xs text-muted-foreground truncate"
								title={error}
							>
								{error}
							</span>
						)}
					</div>
					<Button variant="ghost" size="sm" onClick={dismiss}>
						{t("settings.dismiss")}
					</Button>
					<Button
						size="sm"
						onClick={() => checkForUpdate(updateChannel === "beta")}
					>
						{t("settings.retry")}
					</Button>
				</>
			)}
		</div>
	);
}
