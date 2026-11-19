import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAskpass } from "@/store/askpass";
import type { AskpassRequest } from "@/store/askpass.types";

/** Prompts whose answer is not a secret: usernames and host key questions. */
const VISIBLE = /username|yes\/no/i;

/** Shows the oldest question from ssh or git and sends back the answer. */
export function AskpassDialog() {
	const request = useAskpass((s) => s.queue[0]);
	if (!request) return null;
	// Keyed so each question starts with an empty field.
	return <AskpassForm key={request.id} request={request} />;
}

function AskpassForm({ request }: { request: AskpassRequest }) {
	const { t } = useTranslation();
	const [value, setValue] = useState("");
	const answer = useAskpass.getState().answer;
	const cancel = () => answer(request.id, null);
	const confirm = request.kind === "confirm";
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) cancel();
			}}
		>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						answer(request.id, confirm ? "" : value);
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("askpass.title")}</DialogTitle>
						<DialogDescription className="whitespace-pre-wrap break-words">
							{request.prompt}
						</DialogDescription>
					</DialogHeader>
					{!confirm && (
						<Input
							aria-label={request.prompt}
							type={VISIBLE.test(request.prompt) ? "text" : "password"}
							autoComplete="off"
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={cancel}>
							{t("actions.cancel")}
						</Button>
						<Button type="submit">
							{confirm ? t("askpass.allow") : t("askpass.submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
