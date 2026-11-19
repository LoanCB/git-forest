import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ConfirmDialogProps {
	title: string;
	description?: string;
	confirmLabel: string;
	destructive?: boolean;
	/** The confirm button stays disabled until this exact text is typed. */
	requireText?: string;
	/** Optional checkboxes; `onConfirm` receives which ones are checked. */
	options?: { id: string; label: string }[];
	disabled?: boolean;
	onConfirm: (checked: Record<string, boolean>) => void;
	onClose: () => void;
}

/** Mounted only while open, so its state is fresh each time. */
export function ConfirmDialog({
	title,
	description,
	confirmLabel,
	destructive = false,
	requireText,
	options = [],
	disabled = false,
	onConfirm,
	onClose,
}: ConfirmDialogProps) {
	const { t } = useTranslation();
	const [typed, setTyped] = useState("");
	const [checked, setChecked] = useState<Record<string, boolean>>({});
	const ready = requireText === undefined || typed === requireText;
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				{requireText !== undefined && (
					<Input
						aria-label={requireText}
						placeholder={requireText}
						value={typed}
						autoComplete="off"
						onChange={(e) => setTyped(e.target.value)}
					/>
				)}
				{options.map((o) => (
					// biome-ignore lint/a11y/noLabelWithoutControl: the base-ui checkbox is the control
					<label key={o.id} className="flex items-center gap-2">
						<Checkbox
							checked={checked[o.id] ?? false}
							onCheckedChange={(on) =>
								setChecked((c) => ({ ...c, [o.id]: on }))
							}
						/>
						{o.label}
					</label>
				))}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						disabled={!ready || disabled}
						onClick={() => onConfirm(checked)}
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
