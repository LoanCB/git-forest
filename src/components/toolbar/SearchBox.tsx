import { SearchIcon } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { resolveCommit } from "@/git/api";
import { searchCommits } from "@/graph/search";
import { useRepoView } from "@/store/repoView";
import { useSearch } from "@/store/search";

const HEX_PREFIX = /^[0-9a-f]{4,40}$/i;

export function SearchBox({
	inputRef,
}: {
	inputRef: RefObject<HTMLInputElement | null>;
}) {
	const { t } = useTranslation();
	const repo = useRepoView((s) => s.repo);
	const commits = useRepoView((s) => s.commits);
	const { query, matches, index, setQuery, setMatches } = useSearch();
	const [notice, setNotice] = useState<string | null>(null);
	// True until the first Enter after the query changed: it goes to match 1, not 2.
	const fresh = useRef(true);

	useEffect(() => {
		setMatches(searchCommits(commits, query));
	}, [commits, query, setMatches]);

	// Another repository starts with a clean search.
	// biome-ignore lint/correctness/useExhaustiveDependencies: repo is the trigger
	useEffect(() => {
		useSearch.getState().clear();
		setNotice(null);
	}, [repo]);

	useEffect(() => {
		if (notice === null) return;
		const timer = setTimeout(() => setNotice(null), 4000);
		return () => clearTimeout(timer);
	}, [notice]);

	const goTo = async (hash: string) => {
		const opened = useRepoView.getState().repo;
		const found = await useRepoView.getState().requestScrollTo(hash);
		if (useRepoView.getState().repo !== opened) return;
		if (found) useSearch.getState().select(hash);
		else setNotice(t("graph.commitNotInView"));
	};

	// A hash that is not in the loaded pages may still be in the history.
	const resolveUnloaded = async (q: string) => {
		if (!repo || !HEX_PREFIX.test(q))
			return setNotice(t("graph.commitNotInView"));
		try {
			const hash = await resolveCommit(repo, q);
			if (hash === null) return setNotice(t("graph.commitNotInView"));
			await goTo(hash);
		} catch {
			setNotice(t("graph.commitNotInView"));
		}
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			useSearch.getState().clear();
			setNotice(null);
			e.currentTarget.blur();
			return;
		}
		if (e.key !== "Enter") return;
		e.preventDefault();
		const q = query.trim();
		if (!q) return;
		const state = useSearch.getState();
		if (state.matches.length === 0) {
			void resolveUnloaded(q);
			return;
		}
		const delta = e.shiftKey ? -1 : fresh.current ? 0 : 1;
		fresh.current = false;
		const hash = state.step(delta);
		if (hash) void goTo(hash);
	};

	return (
		<div className="relative flex items-center">
			<SearchIcon className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
			<Input
				ref={inputRef}
				type="search"
				role="searchbox"
				aria-label={t("toolbar.search")}
				placeholder={t("toolbar.searchPlaceholder")}
				value={query}
				className="h-7 w-56 pl-7 text-[13px] md:text-[13px]"
				onChange={(e) => {
					fresh.current = true;
					setNotice(null);
					setQuery(e.target.value);
				}}
				onKeyDown={onKeyDown}
			/>
			{matches.length > 0 && (
				<span className="absolute right-2 text-xs text-muted-foreground">
					{t("toolbar.searchCount", {
						current: index + 1,
						total: matches.length,
					})}
				</span>
			)}
			{notice && (
				<span
					role="status"
					className="absolute top-full right-0 z-30 mt-1 w-max rounded border bg-popover px-2 py-1 text-xs shadow"
				>
					{notice}
				</span>
			)}
		</div>
	);
}
