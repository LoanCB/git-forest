import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionDialogs } from "@/components/actions/ActionDialogs";
import { AskpassDialog } from "@/components/actions/AskpassDialog";
import { GitErrorDialog } from "@/components/actions/GitErrorDialog";
import { OperationBar } from "@/components/actions/OperationBar";
import { CommitTable } from "@/components/graph/CommitTable";
import { RepoMissing } from "@/components/layout/RepoMissing";
import { Toolbar } from "@/components/layout/Toolbar";
import { UpdateBanner } from "@/components/layout/UpdateBanner";
import { WatchNotice } from "@/components/layout/WatchNotice";
import { useAskpassPrompts } from "@/hooks/useAskpassPrompts";
import { useRepoWatcher } from "@/hooks/useRepoWatcher";
import { UpdaterContext, useUpdater } from "@/hooks/useUpdater";
import { useReposStore } from "@/store/repos";
import { useRepoView } from "@/store/repoView";
import { useSettings } from "@/store/settings";
import { ThemeProvider } from "@/theme/ThemeProvider";

function Content() {
	const { t } = useTranslation();
	const current = useReposStore((s) => s.current);
	const error = useRepoView((s) => s.error);
	const viewRepo = useRepoView((s) => s.repo);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		useReposStore
			.getState()
			.load()
			.catch((e) => console.error("Could not load the repositories", e))
			.finally(() => setLoaded(true));
	}, []);

	useEffect(() => {
		if (current) void useRepoView.getState().open(current);
		else useRepoView.getState().close();
	}, [current]);

	if (!loaded) return null;
	if (current === null)
		return (
			<div className="flex flex-1 items-center justify-center text-muted-foreground">
				<p>{t("repos.empty")}</p>
			</div>
		);
	// The view may still show the previous repository for a moment.
	if (viewRepo !== current) return null;
	if (error?.kind === "repoNotFound")
		return <RepoMissing path={current} error={error} />;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{error && (
				<p role="alert" className="px-3 py-1 text-[13px] text-destructive">
					{error.message}
				</p>
			)}
			<WatchNotice />
			<div className="min-h-0 flex-1">
				<CommitTable />
			</div>
			<ActionDialogs />
		</div>
	);
}

export default function App() {
	useRepoWatcher();
	useAskpassPrompts();
	const updater = useUpdater();
	const { checkForUpdate } = updater;

	// Restore the saved settings, then look for an update on the saved channel.
	useEffect(() => {
		useSettings
			.getState()
			.load()
			.catch((e) => console.error("Could not load the settings", e))
			.finally(
				() =>
					void checkForUpdate(useSettings.getState().updateChannel === "beta"),
			);
	}, [checkForUpdate]);

	return (
		<ThemeProvider>
			<UpdaterContext.Provider value={updater}>
				<main className="flex h-screen flex-col">
					<UpdateBanner />
					<Toolbar />
					<Content />
					<OperationBar />
					<GitErrorDialog />
					<AskpassDialog />
				</main>
			</UpdaterContext.Provider>
		</ThemeProvider>
	);
}
