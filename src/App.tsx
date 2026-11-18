import { useTranslation } from "react-i18next";
import { CommitTable } from "@/components/graph/CommitTable";
import { useRepoView } from "@/store/repoView";
import { ThemeProvider } from "@/theme/ThemeProvider";

function AppContent() {
	const { t } = useTranslation();
	const repo = useRepoView((s) => s.repo);
	if (repo)
		return (
			<main className="h-screen">
				<CommitTable />
			</main>
		);
	return (
		<main className="flex h-screen items-center justify-center text-muted-foreground">
			<p>{t("repos.empty")}</p>
		</main>
	);
}

export default function App() {
	return (
		<ThemeProvider defaultMode="dark">
			<AppContent />
		</ThemeProvider>
	);
}
