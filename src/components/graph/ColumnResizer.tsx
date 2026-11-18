import { type KeyboardEvent, type PointerEvent, useRef } from "react";

const MIN_WIDTH = 40;
const KEY_STEP = 10;

interface ColumnResizerProps {
	width: number;
	label: string;
	/** Called on every move while dragging. */
	onResize(width: number): void;
	/** Called once with the final width, to persist it. */
	onResizeEnd(width: number): void;
}

export function ColumnResizer({
	width,
	label,
	onResize,
	onResizeEnd,
}: ColumnResizerProps) {
	const drag = useRef<{ x: number; width: number; last: number } | null>(null);

	const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = { x: e.clientX, width, last: width };
	};
	const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		if (!d) return;
		d.last = Math.max(MIN_WIDTH, Math.round(d.width + e.clientX - d.x));
		onResize(d.last);
	};
	const onPointerUp = () => {
		const d = drag.current;
		drag.current = null;
		if (d && d.last !== d.width) onResizeEnd(d.last);
	};
	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const step =
			e.key === "ArrowLeft" ? -KEY_STEP : e.key === "ArrowRight" ? KEY_STEP : 0;
		if (!step) return;
		e.preventDefault();
		const next = Math.max(MIN_WIDTH, width + step);
		onResize(next);
		onResizeEnd(next);
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: an <hr> cannot be focused or dragged.
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={label}
			aria-valuenow={width}
			tabIndex={0}
			className="absolute top-0 right-0 z-10 h-full w-1.5 translate-x-1/2 cursor-col-resize touch-none outline-none hover:bg-ring/60 focus-visible:bg-ring"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onKeyDown={onKeyDown}
		/>
	);
}
