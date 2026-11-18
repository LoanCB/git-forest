import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionDialogs } from "@/components/actions/ActionDialogs";
import { GitErrorDialog } from "@/components/actions/GitErrorDialog";
import { OperationBar } from "@/components/actions/OperationBar";
import { CommitTable } from "@/components/graph/CommitTable";
import { RepoMissing } from "@/components/layout/RepoMissing";
import { Toolbar } from "@/components/layout/Toolbar";
import { useRepoWatcher } from "@/hooks/useRepoWatcher";
import { useReposStore } from "@/store/repos";
import { useRepoView } from "@/store/repoView";
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
			<div className="min-h-0 flex-1">
				<CommitTable />
			</div>
			<ActionDialogs />
		</div>
	);
}

export default function App() {
	useRepoWatcher();
	return (
		<ThemeProvider defaultMode="dark">
			<main className="flex h-screen flex-col">
				<Toolbar />
				<Content />
				<OperationBar />
				<GitErrorDialog />
			</main>
		</ThemeProvider>
	);
}
