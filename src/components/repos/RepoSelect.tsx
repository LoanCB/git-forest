import { useTranslation } from "react-i18next";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useReposStore } from "@/store/repos";

const MANAGE = "__manage__";

export function RepoSelect({ onManage }: { onManage: () => void }) {
	const { t } = useTranslation();
	const repos = useReposStore((s) => s.repos);
	const current = useReposStore((s) => s.current);
	const select = useReposStore((s) => s.select);
	const items = [
		...repos.map((r) => ({ value: r.path, label: r.name })),
		{ value: MANAGE, label: t("repos.manage") },
	];

	return (
		<Select
			items={items}
			value={current}
			onValueChange={(v) => {
				if (v === MANAGE) onManage();
				else if (v) void select(v);
			}}
		>
			<SelectTrigger
				size="sm"
				className="min-w-40"
				aria-label={t("toolbar.repo")}
			>
				<SelectValue placeholder={t("repos.select")} />
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				{repos.map((r) => (
					<SelectItem key={r.path} value={r.path} title={r.path}>
						{r.name}
					</SelectItem>
				))}
				{repos.length > 0 && <SelectSeparator />}
				<SelectItem value={MANAGE}>{t("repos.manage")}</SelectItem>
			</SelectContent>
		</Select>
	);
}
