import { getVersion } from "@tauri-apps/api/app";
import { Loader2Icon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChangelogDialog } from "@/components/layout/ChangelogDialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useUpdaterContext } from "@/hooks/useUpdater";
import { useSettings } from "@/store/settings";

interface SettingsDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

interface ChoiceProps<T extends string> {
	readonly label: string;
	readonly value: T;
	readonly options: readonly { value: T; label: string }[];
	readonly onChange: (value: T) => void;
}

function Choice<T extends string>({
	label,
	value,
	options,
	onChange,
}: ChoiceProps<T>) {
	return (
		<fieldset className="flex min-w-0 flex-col gap-1.5">
			<legend className="mb-1.5 font-medium">{label}</legend>
			<div className="flex gap-1">
				{options.map((option) => (
					<Button
						key={option.value}
						size="sm"
						variant={option.value === value ? "default" : "outline"}
						aria-pressed={option.value === value}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</Button>
				))}
			</div>
		</fieldset>
	);
}

function UpdateSection(): ReactNode {
	const { t } = useTranslation();
	const updateChannel = useSettings((s) => s.updateChannel);
	const { checkForUpdate, status } = useUpdaterContext();
	const [version, setVersion] = useState<string | null>(null);
	const [hasChecked, setHasChecked] = useState(false);

	useEffect(() => {
		getVersion()
			.then(setVersion)
			.catch(() => null);
	}, []);

	async function handleCheck() {
		setHasChecked(false);
		await checkForUpdate(updateChannel === "beta");
		setHasChecked(true);
	}

	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex flex-col gap-0.5">
				<span className="font-medium">{t("settings.application")}</span>
				{version && <span className="text-muted-foreground">v{version}</span>}
				{hasChecked && status === "idle" && (
					<span className="text-xs text-green-600">
						{t("settings.upToDate")}
					</span>
				)}
				{hasChecked && status === "error" && (
					<span className="text-xs text-destructive">
						{t("settings.updateCheckError")}
					</span>
				)}
				{status === "available" && (
					<span className="text-xs text-primary">
						{t("settings.updateAvailable")}
					</span>
				)}
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={handleCheck}
				disabled={status === "checking" || status === "downloading"}
			>
				{status === "checking" ? (
					<>
						<Loader2Icon className="animate-spin" />
						{t("settings.checkingForUpdates")}
					</>
				) : (
					t("settings.checkForUpdates")
				)}
			</Button>
		</div>
	);
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
	const { t } = useTranslation();
	const theme = useSettings((s) => s.theme);
	const language = useSettings((s) => s.language);
	const updateChannel = useSettings((s) => s.updateChannel);
	const { checkForUpdate } = useUpdaterContext();
	const [changelogOpen, setChangelogOpen] = useState(false);

	function report(action: string, err: unknown) {
		console.error(`[settings] ${action} failed`, err);
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t("settings.title")}</DialogTitle>
						<DialogDescription>{t("settings.description")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4 text-[13px]">
						<Choice
							label={t("settings.theme")}
							value={theme}
							options={[
								{ value: "system", label: t("settings.themeSystem") },
								{ value: "light", label: t("settings.themeLight") },
								{ value: "dark", label: t("settings.themeDark") },
							]}
							onChange={(v) =>
								void useSettings
									.getState()
									.setTheme(v)
									.catch((e) => report("theme", e))
							}
						/>
						<Choice
							label={t("settings.language")}
							value={language}
							options={[
								{ value: "fr", label: t("settings.languageFr") },
								{ value: "en", label: t("settings.languageEn") },
							]}
							onChange={(v) =>
								void useSettings
									.getState()
									.setLanguage(v)
									.catch((e) => report("language", e))
							}
						/>
						<div className="flex flex-col gap-1.5">
							<Choice
								label={t("settings.updateChannel")}
								value={updateChannel}
								options={[
									{ value: "stable", label: t("settings.channelStable") },
									{ value: "beta", label: t("settings.channelBeta") },
								]}
								onChange={(v) =>
									void useSettings
										.getState()
										.setUpdateChannel(v)
										.then(() => checkForUpdate(v === "beta"))
										.catch((e) => report("update channel", e))
								}
							/>
							{updateChannel === "beta" && (
								<p className="text-xs text-amber-600">
									{t("settings.betaChannelWarning")}
								</p>
							)}
						</div>
						<UpdateSection />
						<div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setChangelogOpen(true)}
							>
								{t("settings.whatsNew")}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
		</>
	);
}
