import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createBranch } from "@/git/api";
import { selectLocalBusy, useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";

interface CreateBranchDialogProps {
	hash: string;
	onClose: () => void;
}

export function CreateBranchDialog({ hash, onClose }: CreateBranchDialogProps) {
	const { t } = useTranslation();
	const busy = useOperations(selectLocalBusy);
	const [name, setName] = useState("");
	const [checkout, setCheckout] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		const repo = useRepoView.getState().repo;
		if (!repo || !name) return;
		const result = await useOperations
			.getState()
			.runLocal(
				t("actions.label.createBranch", { name }),
				() => createBranch(repo, name, hash, checkout),
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
							{t("actions.createBranchDialog.title", {
								hash: hash.slice(0, 8),
							})}
						</DialogTitle>
					</DialogHeader>
					<div className="grid gap-1">
						<label htmlFor="branch-name">
							{t("actions.createBranchDialog.name")}
						</label>
						<Input
							id="branch-name"
							value={name}
							autoFocus
							autoComplete="off"
							aria-invalid={error !== null}
							onChange={(e) => {
								setName(e.target.value);
								setError(null);
							}}
						/>
					</div>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: the base-ui checkbox is the control */}
					<label className="flex items-center gap-2">
						<Checkbox checked={checkout} onCheckedChange={setCheckout} />
						{t("actions.createBranchDialog.checkout")}
					</label>
					{error && (
						<p role="alert" className="whitespace-pre-wrap text-destructive">
							{error}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{t("actions.cancel")}
						</Button>
						<Button type="submit" disabled={!name || busy}>
							{t("actions.createBranchDialog.submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
