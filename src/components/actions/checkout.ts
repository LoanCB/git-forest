import { checkoutBranch, checkoutRemoteBranch } from "@/git/api";
import i18n from "@/i18n";
import { useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";

export function checkoutLocalBranch(name: string) {
	const repo = useRepoView.getState().repo;
	if (!repo) return;
	void useOperations
		.getState()
		.runLocal(i18n.t("actions.label.checkout", { name }), () =>
			checkoutBranch(repo, name),
		);
}

export function checkoutRemote(remote: string, name: string) {
	const repo = useRepoView.getState().repo;
	if (!repo) return;
	void useOperations
		.getState()
		.runLocal(
			i18n.t("actions.label.checkout", { name: `${remote}/${name}` }),
			() => checkoutRemoteBranch(repo, remote, name),
		);
}
