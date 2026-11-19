import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useOperations } from "@/store/operations";
import { isSshAuthFailure, SshKeyHelp } from "./SshKeyHelp";

const repoName = (path: string | null) =>
	path?.split(/[\\/]/).filter(Boolean).pop() ?? "";

/** Shows the failure of the last action, git's own words untouched. */
export function GitErrorDialog() {
	const { t } = useTranslation();
	const error = useOperations((s) => s.lastError);
	const label = useOperations((s) => s.lastErrorLabel);
	const repo = useOperations((s) => s.lastErrorRepo);
	const clearError = useOperations((s) => s.clearError);
	return (
		<Dialog
			open={error !== null}
			onOpenChange={(open) => {
				if (!open) clearError();
			}}
		>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{t("actions.errorTitle", { label, repo: repoName(repo) })}
					</DialogTitle>
				</DialogHeader>
				{error && isSshAuthFailure(error.message) && <SshKeyHelp />}
				<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs">
					{error?.message}
				</pre>
				<DialogFooter>
					<Button variant="outline" onClick={clearError}>
						{t("actions.close")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
