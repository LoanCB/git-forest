import { Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useOperations } from "@/store/operations";

export function OperationBar() {
	const { t } = useTranslation();
	const running = useOperations((s) => s.running);
	const cancel = useOperations((s) => s.cancel);
	if (running.length === 0) return null;
	return (
		<ul
			aria-label={t("actions.operations")}
			className="border-t bg-muted/40 px-3 py-1 text-[13px]"
		>
			{running.map((op) => (
				<li key={op.id} className="flex items-center gap-2">
					<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
					<span className="min-w-0 flex-1 truncate">{op.label}</span>
					{op.cancellable && (
						<Button size="xs" variant="outline" onClick={() => cancel(op.id)}>
							{t("actions.cancel")}
						</Button>
					)}
				</li>
			))}
		</ul>
	);
}
