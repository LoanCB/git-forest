import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DiffView } from "@/components/details/DiffView";
import { FileList } from "@/components/details/FileList";
import {
	getCommitDetails,
	getFileDiff,
	getUncommitted,
	toGitError,
} from "@/git/api";
import type { CommitDetails, FileChange } from "@/git/types";
import { replaceShortcodes } from "@/lib/emoji";
import { formatDate } from "@/lib/format";

/** Id of the Uncommitted Changes row. */
export const UNCOMMITTED_ID = "*";

type Loaded<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; value: T };

interface PanelData {
	details: CommitDetails | null;
	files: FileChange[];
}

interface CommitDetailsPanelProps {
	repo: string;
	/** A commit hash, or `"*"` for the working tree. */
	id: string;
	onSelectParent: (hash: string) => void;
}

const errorMessage = (e: unknown) => toGitError(e).message;

export function CommitDetailsPanel({
	repo,
	id,
	onSelectParent,
}: CommitDetailsPanelProps) {
	const { t, i18n } = useTranslation();
	const [data, setData] = useState<Loaded<PanelData>>({ status: "loading" });
	const [selected, setSelected] = useState<FileChange | null>(null);
	// Tagged with its file, so a diff still loading for a new selection is
	// derived instead of reset in the effect.
	const [loadedDiff, setLoadedDiff] = useState<{
		file: FileChange;
		result: Loaded<string>;
	} | null>(null);
	const diff: Loaded<string> | null = !selected
		? null
		: loadedDiff?.file === selected
			? loadedDiff.result
			: { status: "loading" };

	// The parent keys this panel by repo and id, so state starts fresh for each.
	// `live` drops the result of a request once another row or repo took over.
	useEffect(() => {
		let live = true;
		const load =
			id === UNCOMMITTED_ID
				? getUncommitted(repo).then((files) => ({ details: null, files }))
				: getCommitDetails(repo, id).then((details) => ({
						details,
						files: details.files,
					}));
		load.then(
			(value) => live && setData({ status: "ready", value }),
			(e) => live && setData({ status: "error", message: errorMessage(e) }),
		);
		return () => {
			live = false;
		};
	}, [repo, id]);

	useEffect(() => {
		if (!selected) return;
		let live = true;
		getFileDiff(
			repo,
			id === UNCOMMITTED_ID
				? { kind: "workingTree" }
				: { kind: "commit", hash: id },
			selected.path,
			selected.oldPath,
		).then(
			(value) =>
				live &&
				setLoadedDiff({ file: selected, result: { status: "ready", value } }),
			(e) =>
				live &&
				setLoadedDiff({
					file: selected,
					result: { status: "error", message: errorMessage(e) },
				}),
		);
		return () => {
			live = false;
		};
	}, [repo, id, selected]);

	if (data.status === "loading")
		return <div className="p-3">{t("details.loading")}</div>;
	if (data.status === "error")
		return (
			<div role="alert" className="p-3 whitespace-pre-wrap text-destructive">
				{data.message}
			</div>
		);

	const { details, files } = data.value;
	const locale = i18n.language;
	return (
		<div className="flex flex-col gap-2 p-3">
			{details && (
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
					<dt className="font-bold">{t("details.commit")}</dt>
					<dd className="font-mono">{details.hash}</dd>
					<dt className="font-bold">{t("details.parents")}</dt>
					<dd className="flex flex-wrap gap-2 font-mono">
						{details.parents.map((p) => (
							<button
								key={p}
								type="button"
								title={p}
								aria-label={t("details.goToParent", { hash: p })}
								className="text-primary underline"
								onClick={() => onSelectParent(p)}
							>
								{p}
							</button>
						))}
					</dd>
					<dt className="font-bold">{t("details.author")}</dt>
					<dd>
						{details.authorName} &lt;{details.authorEmail}&gt; ·{" "}
						{formatDate(details.authorDate, locale)}
					</dd>
					<dt className="font-bold">{t("details.committer")}</dt>
					<dd>
						{details.committerName} &lt;{details.committerEmail}&gt; ·{" "}
						{formatDate(details.committerDate, locale)}
					</dd>
				</dl>
			)}
			{details && (
				<p className="whitespace-pre-wrap">
					{replaceShortcodes(details.message)}
				</p>
			)}
			<div className="font-bold">
				{t("details.files", { count: files.length })}
			</div>
			{files.length === 0 ? (
				<p className="text-muted-foreground">{t("details.noFiles")}</p>
			) : (
				<FileList files={files} selected={selected} onSelect={setSelected} />
			)}
			{diff?.status === "loading" && <p>{t("details.loadingDiff")}</p>}
			{diff?.status === "error" && (
				<p role="alert" className="whitespace-pre-wrap text-destructive">
					{diff.message}
				</p>
			)}
			{diff?.status === "ready" && <DiffView text={diff.value} />}
		</div>
	);
}
