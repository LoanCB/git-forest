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
import { checkoutLocalBranch } from "./checkout";

interface BranchContextMenuProps {
	name: string;
	/** The checked-out branch: it can be neither checked out again nor deleted. */
	current: boolean;
	hasUpstream: boolean;
	children: ReactNode;
}

export function BranchContextMenu({
	name,
	current,
	hasUpstream,
	children,
}: BranchContextMenuProps) {
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
				<ContextMenuItem
					disabled={busy || current}
					onClick={() => checkoutLocalBranch(name)}
				>
					{t("actions.branch.checkout")}
				</ContextMenuItem>
				<ContextMenuItem
					disabled={busy}
					onClick={() => open({ kind: "renameBranch", name })}
				>
					{t("actions.branch.rename")}
				</ContextMenuItem>
				<ContextMenuItem
					disabled={busy || current}
					onClick={() => open({ kind: "deleteBranch", name })}
				>
					{t("actions.branch.delete")}
				</ContextMenuItem>
				<ContextMenuItem
					onClick={() => open({ kind: "pushBranch", name, hasUpstream })}
				>
					{t("actions.branch.push")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={() => void copyText(name)}>
					{t("actions.copyName")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
