import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { renameBranch } from "@/git/api";
import { selectLocalBusy, useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";

interface RenameBranchDialogProps {
	name: string;
	repo: string;
	onClose: () => void;
}

export function RenameBranchDialog({
	repo: openedOn,
	name,
	onClose,
}: RenameBranchDialogProps) {
	const { t } = useTranslation();
	const busy = useOperations(selectLocalBusy);
	const [newName, setNewName] = useState(name);
	const [error, setError] = useState<string | null>(null);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		const repo = useRepoView.getState().repo === openedOn ? openedOn : null;
		if (!repo || !newName || newName === name) return;
		const result = await useOperations
			.getState()
			.runLocal(
				t("actions.label.renameBranch", { name, newName }),
				() => renameBranch(repo, name, newName),
				{ inlineInvalidName: true },
			);
		if (result.error?.kind === "invalidName") setError(result.error.message);
		else onClose();
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<form onSubmit={submit} className="grid gap-3">
					<DialogHeader>
						<DialogTitle>
							{t("actions.renameBranchDialog.title", { name })}
						</DialogTitle>
					</DialogHeader>
					<div className="grid gap-1">
						<label htmlFor="branch-new-name">
							{t("actions.renameBranchDialog.name")}
						</label>
						<Input
							id="branch-new-name"
							value={newName}
							autoFocus
							autoComplete="off"
							aria-invalid={error !== null}
							onChange={(e) => {
								setNewName(e.target.value);
								setError(null);
							}}
						/>
					</div>
					{error && (
						<p role="alert" className="whitespace-pre-wrap text-destructive">
							{error}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{t("actions.cancel")}
						</Button>
						<Button
							type="submit"
							disabled={!newName || newName === name || busy}
						>
							{t("actions.renameBranchDialog.submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
