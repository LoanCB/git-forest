import { GitBranch, Tag } from "lucide-react";
import { memo } from "react";
import { BranchContextMenu } from "@/components/actions/BranchContextMenu";
import {
	checkoutLocalBranch,
	checkoutRemote,
} from "@/components/actions/checkout";
import { RemoteBranchContextMenu } from "@/components/actions/RemoteBranchContextMenu";
import { TagContextMenu } from "@/components/actions/TagContextMenu";
import type { RefBadge } from "@/graph/refs.types";
import { cn } from "@/lib/utils";

interface RefBadgesProps {
	badges: RefBadge[];
	/** Lane colour of the commit the refs point at. */
	color: string;
}

const badgeKey = (b: RefBadge) =>
	b.kind === "remote" ? `r:${b.remote}/${b.name}` : `${b.kind}:${b.name}`;

function Badge({ badge, color }: { badge: RefBadge; color: string }) {
	const Icon = badge.kind === "tag" ? Tag : GitBranch;
	const current = badge.kind === "local" && badge.current;
	const label =
		badge.kind === "remote" ? `${badge.remote}/${badge.name}` : badge.name;
	const body = (
		// biome-ignore lint/a11y/noStaticElementInteractions: a mouse shortcut; the context menu does the same
		<span
			className="inline-flex shrink-0 items-center gap-1"
			onDoubleClick={() => {
				if (badge.kind === "tag") return;
				if (badge.kind === "local") checkoutLocalBranch(badge.name);
				else if (!badge.isHead) checkoutRemote(badge.remote, badge.name);
			}}
		>
			{current && (
				<span
					className="size-[7px] rounded-full border-[1.5px]"
					style={{ borderColor: color }}
				/>
			)}
			<span
				data-badge={badge.kind}
				className={cn(
					"inline-flex h-[18px] items-stretch overflow-hidden rounded-[3px] border border-muted-foreground/45 text-foreground text-xs leading-none",
					current && "font-bold",
				)}
				style={current ? { borderColor: color } : undefined}
			>
				<span
					className="flex items-center px-[3px] text-white"
					style={{ backgroundColor: color }}
				>
					<Icon className="size-3" strokeWidth={2.25} />
				</span>
				<span className="flex items-center bg-foreground/5 px-1.5">
					{label}
				</span>
				{badge.kind === "local" &&
					badge.remotes.map((remote) => (
						<span
							key={remote}
							className="flex items-center border-muted-foreground/45 border-l bg-foreground/5 px-1.5 font-normal italic"
						>
							{remote}
						</span>
					))}
			</span>
		</span>
	);
	if (badge.kind === "tag")
		return <TagContextMenu name={badge.name}>{body}</TagContextMenu>;
	if (badge.kind === "remote")
		return badge.isHead ? (
			body
		) : (
			<RemoteBranchContextMenu remote={badge.remote} name={badge.name}>
				{body}
			</RemoteBranchContextMenu>
		);
	return (
		<BranchContextMenu
			name={badge.name}
			current={badge.current}
			hasUpstream={!!badge.upstream}
		>
			{body}
		</BranchContextMenu>
	);
}

export const RefBadges = memo(function RefBadges({
	badges,
	color,
}: RefBadgesProps) {
	return (
		<>
			{badges.map((b) => (
				<Badge key={badgeKey(b)} badge={b} color={color} />
			))}
		</>
	);
});
