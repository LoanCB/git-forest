import { CloudDownloadIcon, RotateCwIcon, SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ManageReposDialog } from "@/components/repos/ManageReposDialog";
import { RepoSelect } from "@/components/repos/RepoSelect";
import { BranchFilter } from "@/components/toolbar/BranchFilter";
import { SearchBox } from "@/components/toolbar/SearchBox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { fetch as gitFetch } from "@/git/api";
import { useOperations } from "@/store/operations";
import { useRepoView } from "@/store/repoView";

function runFetch(prune: boolean, label: string) {
	const repo = useRepoView.getState().repo;
	if (!repo) return;
	void useOperations
		.getState()
		.runNetwork(label, (opId) => gitFetch(opId, repo, prune));
}

export function Toolbar() {
	const { t } = useTranslation();
	const repo = useRepoView((s) => s.repo);
	const showRemotes = useRepoView((s) => s.prefs.showRemotes);
	const [manageOpen, setManageOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const viewError = useRepoView((s) => s.error);
	const hasRepo = repo !== null;
	// Nothing to fetch from a folder that is gone or no longer a repository.
	const canFetch =
		hasRepo &&
		viewError?.kind !== "repoNotFound" &&
		viewError?.kind !== "notARepo";

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
				// The native find bar and the search box must not fight over a dialog.
				if (document.querySelector('[role="dialog"]')) return;
				e.preventDefault();
				searchRef.current?.focus();
				searchRef.current?.select();
			} else if (e.key === "F5") {
				e.preventDefault();
				void useRepoView.getState().refresh();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	return (
		<header className="flex items-center gap-3 border-b px-3 py-1.5 text-[13px]">
			<div className="flex items-center gap-1.5">
				<span>{t("toolbar.repo")}</span>
				<RepoSelect onManage={() => setManageOpen(true)} />
			</div>
			<div className="flex items-center gap-1.5">
				<span>{t("toolbar.branches")}</span>
				<BranchFilter />
			</div>
			{/* biome-ignore lint/a11y/noLabelWithoutControl: the base-ui checkbox is the control */}
			<label className="flex items-center gap-1.5">
				<Checkbox
					checked={showRemotes}
					disabled={!hasRepo}
					onCheckedChange={(on) =>
						void useRepoView.getState().setShowRemotes(on)
					}
				/>
				{t("toolbar.showRemotes")}
			</label>
			<div className="ml-auto flex items-center gap-1">
				<SearchBox inputRef={searchRef} />
				<ContextMenu>
					<ContextMenuTrigger render={<span className="inline-flex" />}>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t("toolbar.fetch")}
							title={t("toolbar.fetch")}
							disabled={!canFetch}
							onClick={() => runFetch(false, t("actions.label.fetch"))}
						>
							<CloudDownloadIcon />
						</Button>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem
							disabled={!canFetch}
							onClick={() => runFetch(true, t("actions.label.fetchPrune"))}
						>
							{t("actions.fetchAndPrune")}
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("toolbar.settings")}
					title={t("toolbar.settings")}
				>
					<SettingsIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("toolbar.refresh")}
					title={t("toolbar.refresh")}
					disabled={!hasRepo}
					onClick={() => void useRepoView.getState().refresh()}
				>
					<RotateCwIcon />
				</Button>
			</div>
			<ManageReposDialog open={manageOpen} onOpenChange={setManageOpen} />
		</header>
	);
}
