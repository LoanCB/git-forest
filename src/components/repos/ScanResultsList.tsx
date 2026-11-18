import { Checkbox } from "@/components/ui/checkbox";

interface ScanResultsListProps {
	paths: string[];
	checked: Set<string>;
	onToggle: (path: string, on: boolean) => void;
}

export function ScanResultsList({
	paths,
	checked,
	onToggle,
}: ScanResultsListProps) {
	return (
		<ul className="max-h-60 overflow-y-auto text-[13px]">
			{paths.map((path) => (
				<li key={path}>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: the base-ui checkbox is the control */}
					<label className="flex items-center gap-2 py-0.5">
						<Checkbox
							checked={checked.has(path)}
							onCheckedChange={(on) => onToggle(path, on)}
						/>
						<span className="truncate" title={path}>
							{path}
						</span>
					</label>
				</li>
			))}
		</ul>
	);
}
