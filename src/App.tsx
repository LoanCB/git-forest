import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@/theme/ThemeProvider";

function AppContent() {
	const { t } = useTranslation();
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
