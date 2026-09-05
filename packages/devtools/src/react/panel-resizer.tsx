import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

import { styles } from './devtools-styles.js';

export const defaultDevtoolsPanelHeight = 360;

const minimumPanelHeight = 220;
const keyboardResizeStep = 32;

const maximumPanelHeight = () => {
  const viewportHeight = typeof globalThis.window === 'undefined' ? 900 : globalThis.innerHeight;
  return Math.max(minimumPanelHeight, viewportHeight - 48);
};

const clampPanelHeight = (height: number) =>
  Math.min(maximumPanelHeight(), Math.max(minimumPanelHeight, height));

export const PanelResizer = ({
  height,
  resize,
}: {
  readonly height: number;
  readonly resize: (height: number) => void;
}) => {
  const drag = useRef<{
    readonly pointerId: number;
    readonly y: number;
    readonly height: number;
  }>();

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, y: event.clientY, height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    resize(clampPanelHeight(drag.current.height + drag.current.y - event.clientY));
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    resize(
      clampPanelHeight(
        height + (event.key === 'ArrowUp' ? keyboardResizeStep : -keyboardResizeStep),
      ),
    );
  };

  return (
    <div
      role='separator'
      aria-label='Resize Devtools'
      aria-orientation='horizontal'
      aria-valuemin={minimumPanelHeight}
      aria-valuemax={maximumPanelHeight()}
      aria-valuenow={height}
      tabIndex={0}
      style={styles.resizeHandle}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={resizeWithKeyboard}
      title='Drag to resize Devtools'
    >
      <span style={styles.resizeGrip} aria-hidden='true' />
    </div>
  );
};
