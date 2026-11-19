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

interface CommitContextMenuProps {
	/** Full hash. */
	hash: string;
	children: ReactNode;
}

export function CommitContextMenu({ hash, children }: CommitContextMenuProps) {
	const { t } = useTranslation();
	const busy = useOperations(selectLocalBusy);
	const open = useActionDialog.getState().open;
	return (
		<ContextMenu>
			<ContextMenuTrigger render={<div className="contents" />}>
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem
					disabled={busy}
					onClick={() => open({ kind: "checkoutCommit", hash })}
				>
					{t("actions.commit.checkout")}
				</ContextMenuItem>
				<ContextMenuItem
					disabled={busy}
					onClick={() => open({ kind: "createBranch", hash })}
				>
					{t("actions.commit.createBranch")}
				</ContextMenuItem>
				<ContextMenuItem
					disabled={busy}
					onClick={() => open({ kind: "addTag", hash })}
				>
					{t("actions.commit.addTag")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={() => void copyText(hash)}>
					{t("actions.copyHash")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
