'use client';

import { Minus, TableProperties } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../internal/cx.js';

import {
  ExplorerDraggableWorkspaceNode,
  type ExplorerWorkspaceNodePosition,
} from './entity-instance-node.js';
import { useExplorerEntityInstanceWorkspace } from './entity-instance-workspace.js';

const collectionNodeWidth = 896;
const collapsedCollectionNodeWidth = 288;

export const explorerCollectionNodeInitialPosition: ExplorerWorkspaceNodePosition = {
  x: 24,
  y: 24,
};

export function ExplorerEntityCollectionNode({
  actions,
  children,
  collapsed,
  draggingLabel,
  entityName,
  entityPicker,
  onCollapseChange,
  onMove,
  position,
}: {
  actions?: ReactNode;
  children: ReactNode;
  collapsed: boolean;
  draggingLabel?: string;
  entityName: string;
  entityPicker: ReactNode;
  onCollapseChange: (collapsed: boolean) => void;
  onMove: (position: ExplorerWorkspaceNodePosition) => void;
  position: ExplorerWorkspaceNodePosition;
}) {
  const workspace = useExplorerEntityInstanceWorkspace();
  const active = workspace?.collectionActive ?? true;
  const activate = () => workspace?.activateCollection();
  const restore = () => onCollapseChange(false);

  return (
    <div
      aria-label='Open collection views'
      className='pointer-events-none fixed inset-0'
      style={{ zIndex: active ? 60 : 50 }}
    >
      <ExplorerDraggableWorkspaceNode
        position={position}
        constraintWidth={collapsed ? collapsedCollectionNodeWidth : collectionNodeWidth}
        maxHeight={`calc(100vh - ${position.y + 12}px)`}
        zIndex={1}
        onActivate={activate}
        onDoubleClick={() => onCollapseChange(!collapsed)}
        onMove={onMove}
      >
        {dragging =>
          collapsed ? (
            <button
              type='button'
              data-explorer-workspace-drag-handle
              aria-label={`Restore ${entityName} instances`}
              title='Drag to move · Double-click to restore'
              onFocus={activate}
              onPointerDown={activate}
              onClick={event => {
                if (event.detail === 0) restore();
              }}
              className={cx(
                'pointer-events-auto flex touch-none select-none items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 text-left backdrop-blur transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                dragging
                  ? 'cursor-grabbing border-primary/50 shadow-2xl ring-2 ring-primary/20'
                  : 'cursor-grab border-border/80 shadow-lg hover:border-primary/40 hover:shadow-xl',
              )}
            >
              <TableProperties className='size-4 shrink-0 text-primary' />
              <span className='min-w-0 max-w-56'>
                <span className='block truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground'>
                  Instances
                </span>
                <span className='block truncate text-sm font-medium text-foreground'>
                  {entityName}
                </span>
              </span>
            </button>
          ) : (
            <section
              aria-label={`${entityName} instances`}
              onFocusCapture={activate}
              onPointerDown={activate}
              className={cx(
                'pointer-events-auto flex max-h-full w-[min(56rem,calc(100vw-2rem))] flex-col rounded-2xl border bg-card/95 text-card-foreground backdrop-blur',
                dragging
                  ? 'border-primary/50 shadow-2xl ring-2 ring-primary/20'
                  : 'border-border/80 shadow-xl',
              )}
            >
              <header
                data-explorer-workspace-drag-handle
                title={draggingLabel ?? 'Drag to move · Double-click to minimize'}
                className={cx(
                  'flex touch-none select-none items-center gap-3 rounded-t-2xl border-b px-3 py-2.5',
                  dragging ? 'cursor-grabbing' : 'cursor-grab',
                )}
              >
                <div className='min-w-0 flex-1'>{entityPicker}</div>
                {actions}
                <button
                  type='button'
                  onClick={() => onCollapseChange(true)}
                  aria-label={`Minimize ${entityName} instances`}
                  className='inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                >
                  <Minus className='size-4' />
                </button>
              </header>
              <div className='min-h-0 overflow-y-auto rounded-b-2xl'>{children}</div>
            </section>
          )
        }
      </ExplorerDraggableWorkspaceNode>
    </div>
  );
}
