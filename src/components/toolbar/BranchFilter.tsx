import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useRepoView } from "@/store/repoView";

export function BranchFilter() {
	const { t } = useTranslation();
	const repo = useRepoView((s) => s.repo);
	const refs = useRepoView((s) => s.refs);
	const prefs = useRepoView((s) => s.prefs);
	const setBranches = useRepoView((s) => s.setBranches);

	const names = [
		...(refs?.locals.map((b) => b.name) ?? []),
		...(prefs.showRemotes
			? (refs?.remotes.map((b) => `${b.remote}/${b.name}`) ?? [])
			: []),
	];
	const selected = prefs.branches;
	const selectedSet = new Set(selected);

	const toggle = (name: string, on: boolean) => {
		const current = selected ?? [];
		const next = on ? [...current, name] : current.filter((n) => n !== name);
		void setBranches(next.length > 0 ? next : null);
	};

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="min-w-28"
						disabled={repo === null}
					/>
				}
			>
				{selected
					? t("toolbar.branchesSelected", { count: selected.length })
					: t("toolbar.showAll")}
			</PopoverTrigger>
			<PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto">
				<Button
					variant={selected === null ? "secondary" : "ghost"}
					size="sm"
					className="justify-start"
					onClick={() => void setBranches(null)}
				>
					{t("toolbar.showAll")}
				</Button>
				{names.map((name) => (
					// biome-ignore lint/a11y/noLabelWithoutControl: the base-ui checkbox is the control
					<label
						key={name}
						className="flex items-center gap-2 px-1 text-[13px]"
					>
						<Checkbox
							checked={selectedSet.has(name)}
							onCheckedChange={(on) => toggle(name, on)}
						/>
						<span className="truncate">{name}</span>
					</label>
				))}
			</PopoverContent>
		</Popover>
	);
}
