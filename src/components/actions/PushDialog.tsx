import { useState } from "react";
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
import { pushBranch, pushTag } from "@/git/api";
import { useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";
import { defaultRemote } from "./remotes";

type PushDialogProps = { onClose: () => void } & (
	| { kind: "branch"; name: string; hasUpstream: boolean }
	| { kind: "tag"; name: string }
);

export function PushDialog(props: PushDialogProps) {
	const { name, onClose } = props;
	const { t } = useTranslation();
	const remotes = useRepoView((s) => s.refs?.remoteNames ?? []);
	const [remote, setRemote] = useState(() => defaultRemote(remotes));
	const [setUpstream, setSetUpstream] = useState(
		props.kind === "branch" && !props.hasUpstream,
	);

	const submit = () => {
		const repo = useRepoView.getState().repo;
		if (!repo || !remote) return;
		onClose();
		// The push runs on in the operation bar, where it can be cancelled.
		if (props.kind === "branch")
			void useOperations
				.getState()
				.runNetwork(t("actions.label.pushBranch", { name, remote }), (opId) =>
					pushBranch(opId, repo, remote, name, setUpstream),
				);
		else
			void useOperations
				.getState()
				.runNetwork(t("actions.label.pushTag", { name, remote }), (opId) =>
					pushTag(opId, repo, remote, name),
				);
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
					className="grid gap-3"
				>
					<DialogHeader>
						<DialogTitle>
							{t(
								props.kind === "branch"
									? "actions.pushDialog.titleBranch"
									: "actions.pushDialog.titleTag",
								{ name },
							)}
						</DialogTitle>
					</DialogHeader>
					{remotes.length === 0 ? (
						<p>{t("actions.pushDialog.noRemote")}</p>
					) : (
						<label className="grid gap-1">
							{t("actions.pushDialog.remote")}
							<select
								value={remote}
								onChange={(e) => setRemote(e.target.value)}
								className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
							>
								{remotes.map((r) => (
									<option key={r} value={r}>
										{r}
									</option>
								))}
							</select>
						</label>
					)}
					{props.kind === "branch" && (
						// biome-ignore lint/a11y/noLabelWithoutControl: the base-ui checkbox is the control
						<label className="flex items-center gap-2">
							<Checkbox
								checked={setUpstream}
								onCheckedChange={setSetUpstream}
							/>
							{t("actions.pushDialog.setUpstream")}
						</label>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{t("actions.cancel")}
						</Button>
						<Button type="submit" disabled={!remote}>
							{t("actions.pushDialog.submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
