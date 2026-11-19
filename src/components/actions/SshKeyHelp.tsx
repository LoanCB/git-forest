import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	listSshKeys,
	loadSshKey,
	sshAgentAvailable,
	toGitError,
} from "@/git/api";

/** The remote refused every ssh key on offer. */
export const isSshAuthFailure = (message: string) =>
	/Permission denied \([^)]*publickey/.test(message);

type Load =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "done" }
	| { status: "error"; message: string };

/**
 * Explains an ssh key refusal and, when an ssh agent is reachable, offers to
 * load a key into it; the passphrase is asked through the askpass dialog.
 */
export function SshKeyHelp() {
	const { t } = useTranslation();
	const [keys, setKeys] = useState<string[] | null>(null);
	const [key, setKey] = useState<string | null>(null);
	const [load, setLoad] = useState<Load>({ status: "idle" });

	useEffect(() => {
		let live = true;
		sshAgentAvailable()
			.then((available) => (available ? listSshKeys() : []))
			.then((found) => {
				if (!live) return;
				setKeys(found);
				setKey(found[0] ?? null);
			})
			.catch(() => live && setKeys([]));
		return () => {
			live = false;
		};
	}, []);

	const run = () => {
		if (!key) return;
		setLoad({ status: "loading" });
		loadSshKey(key).then(
			() => setLoad({ status: "done" }),
			(e) => setLoad({ status: "error", message: toGitError(e).message }),
		);
	};

	return (
		<div className="flex flex-col gap-2 text-sm">
			<p>{t("sshHelp.explain")}</p>
			{keys && keys.length > 0 && load.status !== "done" && (
				<div className="flex items-center gap-2">
					<Select
						items={keys.map((k) => ({ value: k, label: k }))}
						value={key}
						onValueChange={(v) => setKey(v)}
					>
						<SelectTrigger
							size="sm"
							className="min-w-0 flex-1"
							aria-label={t("sshHelp.key")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{keys.map((k) => (
								<SelectItem key={k} value={k}>
									{k}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button size="sm" disabled={load.status === "loading"} onClick={run}>
						{t("sshHelp.load")}
					</Button>
				</div>
			)}
			{load.status === "done" && (
				<p role="status" className="text-green-600 dark:text-green-400">
					{t("sshHelp.loaded")}
				</p>
			)}
			{load.status === "error" && (
				<p role="alert" className="whitespace-pre-wrap text-destructive">
					{load.message}
				</p>
			)}
		</div>
	);
}
