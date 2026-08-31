'use client';

import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';

export type ExplorerInstanceNodePosition = {
  x: number;
  y: number;
};

type DragState = {
  height: number;
  moved: boolean;
  offsetX: number;
  offsetY: number;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
};

export function ExplorerDraggableInstanceNode({
  children,
  constraintWidth = 432,
  maxHeight,
  onActivate,
  onDoubleClick,
  onMove,
  position,
  zIndex,
}: {
  children: (dragging: boolean) => ReactNode;
  constraintWidth?: number;
  maxHeight: string;
  onActivate: () => void;
  onDoubleClick?: () => void;
  onMove: (position: ExplorerInstanceNodePosition) => void;
  position: ExplorerInstanceNodePosition;
  zIndex: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>();
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const startDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const handle = event.target.closest('[data-explorer-instance-drag-handle]');
    if (!handle) return;
    const interactive = event.target.closest('a, button, input, select, textarea');
    if (interactive && interactive !== handle) return;
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return;

    suppressClickRef.current = false;
    dragRef.current = {
      height: bounds.height,
      moved: false,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: Math.max(bounds.width, Math.min(constraintWidth, globalThis.innerWidth - 24)),
    };
    onActivate();
  };

  const moveNode = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) {
      return;
    }

    drag.moved = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressClickRef.current = true;
    setDragging(true);
    event.preventDefault();
    const margin = 12;
    onMove({
      x: Math.min(
        Math.max(margin, event.clientX - drag.offsetX),
        Math.max(margin, globalThis.innerWidth - drag.width - margin),
      ),
      y: Math.min(
        Math.max(margin, event.clientY - drag.offsetY),
        Math.max(margin, globalThis.innerHeight - drag.height - margin),
      ),
    });
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = undefined;
    setDragging(false);
    if (drag.moved) {
      globalThis.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const suppressClickAfterDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleFromDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickAfterDrag(event);
      return;
    }
    if (!onDoubleClick || !(event.target instanceof Element)) return;
    const handle = event.target.closest('[data-explorer-instance-drag-handle]');
    if (!handle) return;
    const interactive = event.target.closest('a, button, input, select, textarea');
    if (interactive && interactive !== handle) return;

    event.preventDefault();
    event.stopPropagation();
    onDoubleClick();
  };

  return (
    <div
      ref={rootRef}
      className='pointer-events-none absolute flex max-h-full'
      style={{ left: position.x, top: position.y, maxHeight, zIndex }}
      onPointerDown={startDragging}
      onPointerMove={moveNode}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onClickCapture={suppressClickAfterDrag}
      onDoubleClickCapture={toggleFromDoubleClick}
    >
      {children(dragging)}
    </div>
  );
}
