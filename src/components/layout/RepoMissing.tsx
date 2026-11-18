import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { GitError } from "@/git/types";
import { useReposStore } from "@/store/repos";

export function RepoMissing({
	path,
	error,
}: {
	path: string;
	error: GitError;
}) {
	const { t } = useTranslation();
	return (
		<div
			role="alert"
			className="flex h-full flex-col items-center justify-center gap-3 text-center"
		>
			<h2 className="text-base font-medium">{t("repos.missing")}</h2>
			<p className="text-[13px] text-muted-foreground">
				{t("repos.missingHelp", { path })}
			</p>
			<p className="text-xs text-muted-foreground">{error.message}</p>
			<Button
				variant="outline"
				size="sm"
				onClick={() => void useReposStore.getState().remove(path)}
			>
				{t("repos.removeFromList")}
			</Button>
		</div>
	);
}
