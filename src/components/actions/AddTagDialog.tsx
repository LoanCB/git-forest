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
import { addTag, pushTag } from "@/git/api";
import { selectLocalBusy, useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";
import { defaultRemote } from "./remotes";

interface AddTagDialogProps {
	hash: string;
	onClose: () => void;
}

const fieldRow = "grid grid-cols-[6.5rem_1fr] items-center gap-2";

export function AddTagDialog({ hash, onClose }: AddTagDialogProps) {
	const { t } = useTranslation();
	const remotes = useRepoView((s) => s.refs?.remoteNames ?? []);
	const busy = useOperations(selectLocalBusy);
	const [name, setName] = useState("");
	const [annotated, setAnnotated] = useState(true);
	const [message, setMessage] = useState("");
	const [push, setPush] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		const repo = useRepoView.getState().repo;
		if (!repo || !name) return;
		const { runLocal, runNetwork } = useOperations.getState();
		// git refuses an empty annotation, so the tag's own name stands in for it.
		const text = annotated ? message.trim() || name : null;
		const result = await runLocal(
			t("actions.label.addTag", { name }),
			() => addTag(repo, name, hash, text),
			{ inlineInvalidName: true },
		);
		if (result.error?.kind === "invalidName") {
			setError(result.error.message);
			return;
		}
		if (!result.ok) {
			onClose();
			return;
		}
		onClose();
		// A failed tag never gets pushed; a failed push leaves the tag local.
		if (push) {
			const remote = defaultRemote(remotes);
			void runNetwork(t("actions.label.pushTag", { name, remote }), (opId) =>
				pushTag(opId, repo, remote, name),
			);
		}
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent showCloseButton={false}>
				<form onSubmit={submit} className="grid gap-3">
					<DialogHeader>
						<DialogTitle className="text-center font-normal">
							{t("actions.addTagDialog.title", { hash: hash.slice(0, 8) })}
						</DialogTitle>
					</DialogHeader>
					<div className={fieldRow}>
						<label htmlFor="tag-name">{t("actions.addTagDialog.name")}</label>
						<Input
							id="tag-name"
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
					<div className={fieldRow}>
						<label htmlFor="tag-type">{t("actions.addTagDialog.type")}</label>
						<select
							id="tag-type"
							value={annotated ? "annotated" : "lightweight"}
							onChange={(e) => setAnnotated(e.target.value === "annotated")}
							className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
						>
							<option value="annotated">
								{t("actions.addTagDialog.annotated")}
							</option>
							<option value="lightweight">
								{t("actions.addTagDialog.lightweight")}
							</option>
						</select>
					</div>
					<div className={fieldRow}>
						<label htmlFor="tag-message">
							{t("actions.addTagDialog.message")}
						</label>
						<Input
							id="tag-message"
							value={message}
							disabled={!annotated}
							placeholder={t("actions.addTagDialog.optional")}
							autoComplete="off"
							onChange={(e) => setMessage(e.target.value)}
						/>
					</div>
					<div className={fieldRow}>
						<label htmlFor="tag-push">{t("actions.addTagDialog.push")}</label>
						<Checkbox
							id="tag-push"
							checked={push}
							disabled={remotes.length === 0}
							onCheckedChange={setPush}
						/>
					</div>
					{error && (
						<p role="alert" className="whitespace-pre-wrap text-destructive">
							{error}
						</p>
					)}
					<DialogFooter>
						<Button type="submit" disabled={!name || busy}>
							{t("actions.addTagDialog.submit")}
						</Button>
						<Button type="button" variant="outline" onClick={onClose}>
							{t("actions.cancel")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
