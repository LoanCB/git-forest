import { useTranslation } from "react-i18next";
import type { FileChange } from "@/git/types";
import { cn } from "@/lib/utils";

interface FileListProps {
	files: FileChange[];
	selected: FileChange | null;
	onSelect: (file: FileChange) => void;
}

export function FileList({ files, selected, onSelect }: FileListProps) {
	const { t } = useTranslation();
	return (
		<ul className="max-h-60 overflow-auto">
			{files.map((f) => {
				const counts = f.additions !== null && f.deletions !== null;
				return (
					<li key={`${f.oldPath ?? ""}>${f.path}`}>
						<button
							type="button"
							aria-pressed={selected === f}
							onClick={() => onSelect(f)}
							className={cn(
								"flex w-full items-center gap-2 px-2 py-0.5 text-left hover:bg-accent",
								selected === f && "bg-accent",
							)}
						>
							<span className="w-4 shrink-0 text-center font-mono font-bold">
								{f.status}
							</span>
							<span className="min-w-0 flex-1 truncate">
								{f.path}
								{f.oldPath && (
									<span className="ml-1 text-muted-foreground">
										{t("details.renamedFrom", { path: f.oldPath })}
									</span>
								)}
							</span>
							<span className="shrink-0 font-mono">
								{counts ? (
									<>
										<span className="text-green-600">+{f.additions}</span>{" "}
										<span className="text-red-600">-{f.deletions}</span>
									</>
								) : (
									"-"
								)}
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
