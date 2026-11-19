import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	checkoutCommit,
	deleteBranch,
	deleteRemoteBranch,
	deleteRemoteTag,
	deleteTag,
} from "@/git/api";
import { useActionDialog } from "@/store/actionDialog";
import { selectLocalBusy, useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";
import { AddTagDialog } from "./AddTagDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { CreateBranchDialog } from "./CreateBranchDialog";
import { PushDialog } from "./PushDialog";
import { RenameBranchDialog } from "./RenameBranchDialog";
import { defaultRemote } from "./remotes";

/** Opens the push dialog for the current branch (Ctrl/Cmd+Shift+P). */
function useCurrentBranchPushShortcut() {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (
				!(e.ctrlKey || e.metaKey) ||
				!e.shiftKey ||
				e.key.toLowerCase() !== "p"
			)
				return;
			if (
				useActionDialog.getState().request ||
				document.querySelector('[role="dialog"]')
			)
				return;
			const { repo, refs } = useRepoView.getState();
			const name = refs?.head.branch;
			if (!repo || !name) return;
			e.preventDefault();
			const upstream = refs.locals.find((b) => b.name === name)?.upstream;
			useActionDialog
				.getState()
				.open({ kind: "pushBranch", name, hasUpstream: !!upstream });
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);
}

/** Renders whichever dialog was requested. */
export function ActionDialogs() {
	const { t } = useTranslation();
	const request = useActionDialog((s) => s.request);
	const close = useActionDialog((s) => s.close);
	const busy = useOperations(selectLocalBusy);
	useCurrentBranchPushShortcut();

	// The repository the dialog was opened on, only while it is still the open one.
	const openRepo = () =>
		request && request.repo === useRepoView.getState().repo
			? request.repo
			: null;

	const run = (
		label: string,
		fn: (repo: string) => Promise<void>,
		after?: () => void,
	) => {
		const repo = openRepo();
		close();
		if (!repo) return;
		void useOperations
			.getState()
			.runLocal(label, () => fn(repo))
			.then((r) => {
				if (r.ok) after?.();
			});
	};

	return renderDialog();

	function renderDialog() {
		if (!request) return null;
		switch (request.kind) {
			case "checkoutCommit": {
				const { hash } = request;
				return (
					<ConfirmDialog
						title={t("actions.checkoutCommit.title", {
							hash: hash.slice(0, 8),
						})}
						description={t("actions.checkoutCommit.description")}
						confirmLabel={t("actions.checkoutCommit.confirm")}
						disabled={busy}
						onClose={close}
						onConfirm={() =>
							run(
								t("actions.label.checkoutCommit", { hash: hash.slice(0, 8) }),
								(repo) => checkoutCommit(repo, hash),
							)
						}
					/>
				);
			}
			case "createBranch":
				return (
					<CreateBranchDialog
						repo={request.repo}
						hash={request.hash}
						onClose={close}
					/>
				);
			case "addTag":
				return (
					<AddTagDialog
						repo={request.repo}
						hash={request.hash}
						onClose={close}
					/>
				);
			case "renameBranch":
				return (
					<RenameBranchDialog
						repo={request.repo}
						name={request.name}
						onClose={close}
					/>
				);
			case "deleteBranch": {
				const { name } = request;
				return (
					<ConfirmDialog
						title={t("actions.deleteBranchDialog.title", { name })}
						description={t("actions.deleteBranchDialog.description")}
						confirmLabel={t("actions.deleteBranchDialog.confirm")}
						destructive
						options={[
							{ id: "force", label: t("actions.deleteBranchDialog.force") },
						]}
						disabled={busy}
						onClose={close}
						onConfirm={(checked) =>
							run(t("actions.label.deleteBranch", { name }), (repo) =>
								deleteBranch(repo, name, checked.force === true),
							)
						}
					/>
				);
			}
			case "deleteRemoteBranch": {
				const { remote, name } = request;
				return (
					<ConfirmDialog
						title={t("actions.deleteRemoteBranchDialog.title", {
							remote,
							name,
						})}
						description={t("actions.deleteRemoteBranchDialog.description")}
						confirmLabel={t("actions.deleteRemoteBranchDialog.confirm")}
						destructive
						requireText={name}
						onClose={close}
						onConfirm={() => {
							const repo = openRepo();
							close();
							if (!repo) return;
							void useOperations
								.getState()
								.runNetwork(
									t("actions.label.deleteRemoteBranch", { remote, name }),
									(opId) => deleteRemoteBranch(opId, repo, remote, name),
								);
						}}
					/>
				);
			}
			case "deleteTag": {
				const { name } = request;
				const remotes = useRepoView.getState().refs?.remoteNames ?? [];
				const remote = defaultRemote(remotes);
				return (
					<ConfirmDialog
						title={t("actions.deleteTagDialog.title", { name })}
						description={t("actions.deleteTagDialog.description")}
						confirmLabel={t("actions.deleteTagDialog.confirm")}
						destructive
						options={
							remote
								? [
										{
											id: "remote",
											label: t("actions.deleteTagDialog.alsoRemote", {
												remote,
											}),
										},
									]
								: []
						}
						disabled={busy}
						onClose={close}
						onConfirm={(checked) =>
							run(
								t("actions.label.deleteTag", { name }),
								(repo) => deleteTag(repo, name),
								() => {
									const repo = openRepo();
									if (checked.remote && repo)
										void useOperations
											.getState()
											.runNetwork(
												t("actions.label.deleteRemoteTag", { name, remote }),
												(opId) => deleteRemoteTag(opId, repo, remote, name),
											);
								},
							)
						}
					/>
				);
			}
			case "pushBranch":
				return (
					<PushDialog
						repo={request.repo}
						kind="branch"
						name={request.name}
						hasUpstream={request.hasUpstream}
						onClose={close}
					/>
				);
			case "pushTag":
				return (
					<PushDialog
						repo={request.repo}
						kind="tag"
						name={request.name}
						onClose={close}
					/>
				);
		}
	}
}
