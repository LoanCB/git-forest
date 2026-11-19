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
import { checkoutRemote } from "./checkout";

interface RemoteBranchContextMenuProps {
	remote: string;
	name: string;
	children: ReactNode;
}

export function RemoteBranchContextMenu({
	remote,
	name,
	children,
}: RemoteBranchContextMenuProps) {
	const { t } = useTranslation();
	const busy = useOperations(selectLocalBusy);
	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={<span className="inline-flex" />}
				onContextMenu={(e) => e.stopPropagation()}
			>
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem
					disabled={busy}
					onClick={() => checkoutRemote(remote, name)}
				>
					{t("actions.branch.checkout")}
				</ContextMenuItem>
				<ContextMenuItem
					onClick={() =>
						useActionDialog
							.getState()
							.open({ kind: "deleteRemoteBranch", remote, name })
					}
				>
					{t("actions.branch.deleteRemote")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={() => void copyText(`${remote}/${name}`)}>
					{t("actions.copyName")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
