import { open } from "@tauri-apps/plugin-dialog";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanResultsList } from "@/components/repos/ScanResultsList";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { scanRepos, toGitError } from "@/git/api";
import { useReposStore } from "@/store/repos";

interface ManageReposDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const pickFolder = async (): Promise<string | null> => {
	const picked = await open({ directory: true });
	return typeof picked === "string" ? picked : null;
};

export function ManageReposDialog({
	open: isOpen,
	onOpenChange,
}: ManageReposDialogProps) {
	const { t } = useTranslation();
	const repos = useReposStore((s) => s.repos);
	const [candidates, setCandidates] = useState<string[] | null>(null);
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const [errors, setErrors] = useState<string[]>([]);

	const report = (path: string, e: unknown) =>
		t("repos.dialog.failed", { path, message: toGitError(e).message });

	const addFolder = async () => {
		setErrors([]);
		try {
			const path = await pickFolder();
			if (path) await useReposStore.getState().add(path);
		} catch (e) {
			setErrors([toGitError(e).message]);
		}
	};

	const scanFolder = async () => {
		setErrors([]);
		try {
			const root = await pickFolder();
			if (!root) return;
			const known = new Set(useReposStore.getState().repos.map((r) => r.path));
			const found = (await scanRepos(root)).filter((p) => !known.has(p));
			setCandidates(found);
			setChecked(new Set(found));
		} catch (e) {
			setErrors([toGitError(e).message]);
		}
	};

	const addChecked = async () => {
		if (!candidates) return;
		const paths = candidates.filter((p) => checked.has(p));
		const { failed } = await useReposStore.getState().addMany(paths);
		setErrors(failed.map((f) => report(f.path, f.error)));
		// Failed ones stay listed so they can be retried or ignored.
		const left = failed.map((f) => f.path);
		setCandidates(left.length > 0 ? left : null);
		setChecked(new Set(left));
	};

	const remove = async (path: string) => {
		try {
			await useReposStore.getState().remove(path);
		} catch (e) {
			setErrors([report(path, e)]);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("repos.dialog.title")}</DialogTitle>
					<DialogDescription>{t("repos.dialog.description")}</DialogDescription>
				</DialogHeader>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => void addFolder()}>
						{t("repos.dialog.addFolder")}
					</Button>
					<Button variant="outline" size="sm" onClick={() => void scanFolder()}>
						{t("repos.dialog.scanFolder")}
					</Button>
				</div>
				{errors.length > 0 && (
					<ul role="alert" className="text-[13px] text-destructive">
						{errors.map((e) => (
							<li key={e}>{e}</li>
						))}
					</ul>
				)}
				{candidates && (
					<section className="flex flex-col gap-2">
						<h3 className="text-sm font-medium">
							{t("repos.dialog.scanTitle")}
						</h3>
						{candidates.length === 0 ? (
							<p className="text-[13px] text-muted-foreground">
								{t("repos.dialog.scanNone")}
							</p>
						) : (
							<>
								<ScanResultsList
									paths={candidates}
									checked={checked}
									onToggle={(path, on) =>
										setChecked((c) => {
											const next = new Set(c);
											if (on) next.add(path);
											else next.delete(path);
											return next;
										})
									}
								/>
								<Button
									size="sm"
									disabled={checked.size === 0}
									onClick={() => void addChecked()}
								>
									{t("repos.dialog.addSelected", { count: checked.size })}
								</Button>
							</>
						)}
					</section>
				)}
				{repos.length === 0 ? (
					<p className="text-[13px] text-muted-foreground">
						{t("repos.dialog.none")}
					</p>
				) : (
					<ul className="max-h-60 overflow-y-auto text-[13px]">
						{repos.map((r) => (
							<li key={r.path} className="flex items-center gap-2 py-0.5">
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium">{r.name}</div>
									<div className="truncate text-xs text-muted-foreground">
										{r.path}
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={t("repos.dialog.remove", { name: r.name })}
									onClick={() => void remove(r.path)}
								>
									<TrashIcon />
								</Button>
							</li>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
