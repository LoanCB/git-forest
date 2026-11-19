import { useEffect } from "react";
import { useRepoView } from "@/store/repoView";

/** How close to the end of the list, in rows, the next page starts loading. */
const PREFETCH_ROWS = 50;

/**
 * Loads the next page of history once the rendered rows come within
 * PREFETCH_ROWS of the end of the list. Stops on an error, so a failing page
 * is not retried in a loop.
 */
export function useLoadMoreOnScroll(
	lastRenderedIndex: number,
	rowCount: number,
) {
	const hasMore = useRepoView((s) => s.hasMore);
	const loading = useRepoView((s) => s.loading);
	const error = useRepoView((s) => s.error);
	const loadMore = useRepoView((s) => s.loadMore);

	useEffect(() => {
		if (!hasMore || loading || error || lastRenderedIndex < 0) return;
		if (lastRenderedIndex >= rowCount - PREFETCH_ROWS) void loadMore();
	}, [hasMore, loading, error, lastRenderedIndex, rowCount, loadMore]);
}
