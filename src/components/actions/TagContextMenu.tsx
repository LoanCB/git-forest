import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { copyText } from "@/lib/clipboard";
import { useActionDialog } from "@/store/actionDialog";
import { selectLocalBusy, useOperations } from "@/store/operations";

interface TagContextMenuProps {
	name: string;
	children: ReactNode;
}

export function TagContextMenu({ name, children }: TagContextMenuProps) {
	const { t } = useTranslation();
	const busy = useOperations(selectLocalBusy);
	const open = useActionDialog.getState().open;
	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={<span className="inline-flex" />}
				onContextMenu={(e) => e.stopPropagation()}
			>
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={() => open({ kind: "pushTag", name })}>
					{t("actions.tag.push")}
				</ContextMenuItem>
				<ContextMenuItem
					disabled={busy}
					onClick={() => open({ kind: "deleteTag", name })}
				>
					{t("actions.tag.delete")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={() => void copyText(name)}>
					{t("actions.copyName")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
