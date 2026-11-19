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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { addTag, pushTag } from "@/git/api";
import { selectLocalBusy, useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";
import { defaultRemote } from "./remotes";

interface AddTagDialogProps {
	hash: string;
	repo: string;
	onClose: () => void;
}

const fieldRow = "grid grid-cols-[6.5rem_1fr] items-center gap-2";

export function AddTagDialog({
	repo: openedOn,
	hash,
	onClose,
}: AddTagDialogProps) {
	const { t } = useTranslation();
	const remotes = useRepoView((s) => s.refs?.remoteNames ?? []);
	const busy = useOperations(selectLocalBusy);
	const typeItems = [
		{ value: "annotated", label: t("actions.addTagDialog.annotated") },
		{ value: "lightweight", label: t("actions.addTagDialog.lightweight") },
	];
	const [name, setName] = useState("");
	const [annotated, setAnnotated] = useState(true);
	const [message, setMessage] = useState("");
	const [push, setPush] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		const repo = useRepoView.getState().repo === openedOn ? openedOn : null;
		if (!repo || !name) return;
		const { runLocal, runNetwork } = useOperations.getState();
		// An annotated tag may carry an empty message; a lightweight one has none.
		const text = annotated ? message.trim() : null;
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
						<Select
							items={typeItems}
							value={annotated ? "annotated" : "lightweight"}
							onValueChange={(v) => setAnnotated(v === "annotated")}
						>
							<SelectTrigger id="tag-type" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{typeItems.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
