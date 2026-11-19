import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { deleteBranch, getMergedBranches, toGitError } from "@/git/api";
import { useOperations } from "@/store/operations";

/** Long-lived branches: offered, but left unticked. */
const KEPT_BY_DEFAULT = new Set(["main", "master", "develop"]);

interface PruneBranchesDialogProps {
	repo: string;
	onClose: () => void;
}

type Candidates =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; names: string[] };

/**
 * Lists the local branches already merged into HEAD and deletes the ticked
 * ones with `git branch -d`, which refuses anything not fully merged.
 * Mounted only while open, so the list is fresh each time.
 */
export function PruneBranchesDialog({
	repo,
	onClose,
}: PruneBranchesDialogProps) {
	const { t } = useTranslation();
	const [candidates, setCandidates] = useState<Candidates>({
		status: "loading",
	});
	const [ticked, setTicked] = useState<Set<string>>(new Set());

	useEffect(() => {
		let live = true;
		getMergedBranches(repo).then(
			(names) => {
				if (!live) return;
				setCandidates({ status: "ready", names });
				setTicked(new Set(names.filter((n) => !KEPT_BY_DEFAULT.has(n))));
			},
			(e) =>
				live &&
				setCandidates({ status: "error", message: toGitError(e).message }),
		);
		return () => {
			live = false;
		};
	}, [repo]);

	const toggle = (name: string, on: boolean) =>
		setTicked((cur) => {
			const next = new Set(cur);
			if (on) next.add(name);
			else next.delete(name);
			return next;
		});

	const confirm = () => {
		const names = [...ticked];
		onClose();
		void useOperations
			.getState()
			.runLocal(t("actions.label.pruneBranches", { count: names.length }), () =>
				deleteAll(repo, names),
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
				<DialogHeader>
					<DialogTitle>{t("actions.pruneDialog.title")}</DialogTitle>
					<DialogDescription>
						{t("actions.pruneDialog.description")}
					</DialogDescription>
				</DialogHeader>
				{candidates.status === "loading" && (
					<p className="text-sm">{t("actions.pruneDialog.loading")}</p>
				)}
				{candidates.status === "error" && (
					<p
						role="alert"
						className="text-sm whitespace-pre-wrap text-destructive"
					>
						{candidates.message}
					</p>
				)}
				{candidates.status === "ready" && candidates.names.length === 0 && (
					<p className="text-sm">{t("actions.pruneDialog.none")}</p>
				)}
				{candidates.status === "ready" && candidates.names.length > 0 && (
					<ul className="flex max-h-64 flex-col gap-1 overflow-y-auto py-2 text-sm">
						{candidates.names.map((name) => (
							<li key={name}>
								{/* biome-ignore lint/a11y/noLabelWithoutControl: the base-ui checkbox is the control */}
								<label className="flex items-center gap-2">
									<Checkbox
										checked={ticked.has(name)}
										onCheckedChange={(on) => toggle(name, on)}
									/>
									<span className="truncate font-mono">{name}</span>
								</label>
							</li>
						))}
					</ul>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button
						variant="destructive"
						disabled={ticked.size === 0}
						onClick={confirm}
					>
						{t("actions.pruneDialog.confirm", { count: ticked.size })}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Deletes one by one; a refusal does not stop the others, and is reported. */
async function deleteAll(repo: string, names: string[]): Promise<void> {
	const failed: string[] = [];
	await names.reduce(
		(previous, name) =>
			previous.then(() =>
				deleteBranch(repo, name, false).catch((e) => {
					failed.push(`${name}: ${toGitError(e).message}`);
				}),
			),
		Promise.resolve(),
	);
	if (failed.length > 0) throw { kind: "failed", message: failed.join("\n") };
}
