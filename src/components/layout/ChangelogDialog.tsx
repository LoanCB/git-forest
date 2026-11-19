import { useTranslation } from "react-i18next";
import { ChangelogList } from "@/components/layout/ChangelogList";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getDisplayVersions } from "@/lib/changelog";

interface ChangelogDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

export function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
	const { t } = useTranslation();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[min(85vh,40rem)] max-h-[520px] flex-col sm:max-w-md">
				<DialogHeader className="border-b pb-3">
					<DialogTitle>{t("changelog.title")}</DialogTitle>
					<DialogDescription>{t("changelog.description")}</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
					<ChangelogList versions={getDisplayVersions()} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
