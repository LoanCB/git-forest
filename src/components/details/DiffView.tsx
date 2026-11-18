import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { parseUnifiedDiff } from "@/lib/diff";
import type { DiffLineKind } from "@/lib/diff.types";
import { cn } from "@/lib/utils";

export const MAX_DIFF_LINES = 5000;

const KIND_CLASS: Record<DiffLineKind, string> = {
	add: "bg-green-500/15",
	del: "bg-red-500/15",
	ctx: "",
	hunk: "bg-accent text-muted-foreground",
	meta: "text-muted-foreground",
};
const MARKER: Record<DiffLineKind, string> = {
	add: "+",
	del: "-",
	ctx: " ",
	hunk: "",
	meta: "",
};

export function DiffView({ text }: { text: string }) {
	const { t } = useTranslation();
	const { lines, truncated } = useMemo(() => {
		const all = parseUnifiedDiff(text);
		return {
			lines: all.length > MAX_DIFF_LINES ? all.slice(0, MAX_DIFF_LINES) : all,
			truncated: all.length > MAX_DIFF_LINES,
		};
	}, [text]);

	if (lines.length === 0)
		return (
			<p className="p-2 text-muted-foreground">{t("details.emptyDiff")}</p>
		);
	return (
		<div>
			<div className="max-h-96 overflow-auto font-mono text-xs">
				<div className="w-max min-w-full">
					{lines.map((l, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static list of lines
							key={i}
							className={cn("flex whitespace-pre", KIND_CLASS[l.kind])}
						>
							<span className="w-10 shrink-0 select-none pr-1 text-right text-muted-foreground">
								{l.oldNo}
							</span>
							<span className="w-10 shrink-0 select-none pr-1 text-right text-muted-foreground">
								{l.newNo}
							</span>
							<span className="select-none pl-1">{MARKER[l.kind]}</span>
							<span>{l.text}</span>
						</div>
					))}
				</div>
			</div>
			{truncated && (
				<p className="p-2 text-muted-foreground">
					{t("details.diffTruncated", { count: MAX_DIFF_LINES })}
				</p>
			)}
		</div>
	);
}
