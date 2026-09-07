'use client';

import type { GraphReadRequestV1, SelectionAst } from '@ontahi/core/data-graph';
import { createRuntimeProtocolExchange } from '@ontahi/core/runtime/protocol';
import {
  analyzeSelectionDocument,
  type SelectionDocumentAnalysis,
  type SelectionLanguageEntityReflection,
} from '@ontahi/language';
import { useRuntimeTransportCapability } from '@ontahi/react/graph';
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';

import type { ExplorerEntityDetail } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { ExplorerEntityValue, getExplorerRowRef } from './entity-instance-values.js';
import {
  explorerInstanceWindowKey,
  useExplorerEntityInstanceWorkspace,
} from './entity-instance-workspace.js';
import { ExplorerSelectionLanguageEditor } from './selection-language-editor.js';

export type ExplorerSelectionLanguageDataPanelProps = {
  readonly entity: ExplorerEntityDetail;
  readonly embedded?: boolean;
  readonly initialDocument?: string;
};

type ExplorerSelectionLanguageRows = readonly Record<string, unknown>[];

type EntityValue<TValue> = {
  readonly entityName: string;
  readonly value: TValue;
};

const entityScopedValue = <TValue,>(current: EntityValue<TValue> | undefined, entityName: string) =>
  current?.entityName === entityName ? current.value : undefined;

const selectionRowsStatus = (
  rows: ExplorerSelectionLanguageRows | undefined,
  executionError: string | undefined,
  isExecuting: boolean,
) => {
  if (isExecuting) return 'Updating rows…';
  if (executionError && rows) {
    return `Showing ${rows.length} row(s) from the last successful Selection.`;
  }
  return `${rows?.length ?? 0} row(s) from a fixed limit of 25.`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readGraphRows = (response: unknown): ExplorerSelectionLanguageRows => {
  if (!isRecord(response)) throw new Error('Graph Read returned an invalid response.');
  if (response.kind === 'protocol-error') {
    const error = response.error;
    throw new Error(
      isRecord(error) && typeof error.message === 'string'
        ? error.message
        : 'Graph Read was rejected.',
    );
  }
  if (
    response.kind !== 'graph-read-result' ||
    !Array.isArray(response.value) ||
    !response.value.every(isRecord)
  ) {
    throw new Error('Graph Read returned invalid Entity rows.');
  }
  return response.value;
};

export const toSelectionLanguageEntityReflection = (
  entity: ExplorerEntityDetail,
): SelectionLanguageEntityReflection => ({
  name: entity.name,
  fields: entity.fields.map(field => ({
    name: field.name,
    type: field.type,
    nullable: field.nullable,
    ...(field.valueType ? { valueType: field.valueType } : {}),
    ...(field.enumValues ? { enumValues: field.enumValues } : {}),
    ...(field.reference ? { reference: { entityName: field.reference.entityName } } : {}),
  })),
  relations: entity.relations.map(relation => ({ name: relation.name })),
});

const hostSelection = (
  document: string,
  entity: SelectionLanguageEntityReflection,
  analysis: SelectionDocumentAnalysis,
): SelectionAst | undefined =>
  document.trim().length === 0
    ? {
        kind: 'selection',
        entityName: entity.name,
        expression: { kind: 'all' },
      }
    : analysis.selection;

const diagnostics = (analysis: SelectionDocumentAnalysis) => [
  ...analysis.syntaxDiagnostics,
  ...analysis.semanticDiagnostics,
];

const isInteractiveRowTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('a, button, input, select, textarea'));

export function ExplorerSelectionLanguageDataPanel({
  embedded = false,
  entity,
  initialDocument = '',
}: ExplorerSelectionLanguageDataPanelProps) {
  const runtimeTransport = useRuntimeTransportCapability();
  const instanceWorkspace = useExplorerEntityInstanceWorkspace();
  const reflection = useMemo(() => toSelectionLanguageEntityReflection(entity), [entity]);
  const documentKey = `${entity.name}\u0000${initialDocument}`;
  const [documentState, setDocumentState] = useState({ key: documentKey, value: initialDocument });
  const document = documentState.key === documentKey ? documentState.value : initialDocument;
  const setDocument = (value: string) => setDocumentState({ key: documentKey, value });
  const [rowResult, setRowResult] = useState<EntityValue<ExplorerSelectionLanguageRows>>();
  const rows = entityScopedValue(rowResult, entity.name);
  const [executionFailure, setExecutionFailure] = useState<EntityValue<string>>();
  const executionError = entityScopedValue(executionFailure, entity.name);
  const [executionState, setExecutionState] = useState<EntityValue<boolean>>();
  const [retryVersion, setRetryVersion] = useState(0);
  const isExecuting = entityScopedValue(executionState, entity.name) ?? false;
  const analysis = useMemo(
    () => analyzeSelectionDocument(document, reflection),
    [document, reflection],
  );
  const selection = hostSelection(document, reflection, analysis);
  const selectionKey = selection ? JSON.stringify(selection) : undefined;
  const exchange = useMemo(
    () =>
      runtimeTransport ? createRuntimeProtocolExchange({ transport: runtimeTransport }) : null,
    [runtimeTransport],
  );

  useEffect(() => {
    if (!selection || !selectionKey) {
      setExecutionFailure(undefined);
      setExecutionState({ entityName: entity.name, value: false });
      return;
    }
    if (!exchange) {
      setExecutionFailure({
        entityName: entity.name,
        value: 'Selection execution requires a configured Runtime Transport.',
      });
      setExecutionState({ entityName: entity.name, value: false });
      return;
    }

    const controller = new AbortController();
    let active = true;
    const request: GraphReadRequestV1 = {
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection,
      orderBy: [],
      limit: 25,
    };
    setExecutionFailure(undefined);
    setExecutionState({ entityName: entity.name, value: true });
    void exchange({ family: 'graph.read', body: request }, { signal: controller.signal })
      .then(readGraphRows)
      .then(nextRows => {
        if (active) setRowResult({ entityName: entity.name, value: nextRows });
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setExecutionFailure({
            entityName: entity.name,
            value: error instanceof Error ? error.message : 'Graph Read failed.',
          });
        }
      })
      .finally(() => {
        if (active) setExecutionState({ entityName: entity.name, value: false });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [entity.name, exchange, retryVersion, selectionKey]);

  const documentDiagnostics = diagnostics(analysis);

  return (
    <section
      className={cx('grid content-start', embedded ? 'gap-0' : 'gap-3 rounded-lg border p-5')}
    >
      <div className='grid gap-2 bg-muted/10 p-3'>
        <ExplorerSelectionLanguageEditor
          label={`Selection expression for ${entity.name}`}
          value={document}
          entity={reflection}
          onChange={setDocument}
        />
        {documentDiagnostics.length > 0 ? (
          <div className='grid gap-1' aria-live='polite'>
            {documentDiagnostics.map(diagnostic => (
              <div
                key={`${diagnostic.channel}-${diagnostic.code}-${diagnostic.from}`}
                data-diagnostic-channel={diagnostic.channel}
                className='text-xs text-destructive'
              >
                {diagnostic.message}
              </div>
            ))}
          </div>
        ) : null}
        {executionError ? (
          <div className='flex flex-wrap items-center gap-2 text-xs text-destructive'>
            <div data-diagnostic-channel='execution' role='alert'>
              {executionError}
            </div>
            <button
              type='button'
              aria-label='Retry Selection'
              onClick={() => setRetryVersion(version => version + 1)}
              className='rounded-md border border-destructive/25 px-2 py-1 font-medium transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30'
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <div className='overflow-x-auto border-y bg-card'>
        <table className='min-w-[720px] w-full text-left text-sm'>
          <thead className='border-b bg-muted/35 text-xs uppercase tracking-wide text-muted-foreground'>
            <tr>
              {entity.fields.map(field => (
                <th key={field.name} className='whitespace-nowrap px-3 py-2.5 font-medium'>
                  <div className='grid gap-1'>
                    <span className='font-mono text-foreground'>{field.name}</span>
                    <span className='font-mono normal-case text-muted-foreground'>
                      {field.valueType ?? field.type}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y'>
            {rows?.map((row, rowIndex) => {
              const source = getExplorerRowRef(entity, row);
              const rowKey = source ? JSON.stringify(source.locator) : String(rowIndex);
              const windowKey = source ? explorerInstanceWindowKey(source) : undefined;
              const canOpen = Boolean(source && instanceWorkspace);
              const selected = windowKey === instanceWorkspace?.activeKey;
              const selectInstance = (
                event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>,
              ) => {
                if (!source || !instanceWorkspace || isInteractiveRowTarget(event.target)) return;
                if ('key' in event && !['Enter', ' '].includes(event.key)) return;
                if ('key' in event) event.preventDefault();
                instanceWorkspace.open({ entity, row, source });
              };

              return (
                <tr
                  key={`${entity.name}-${rowKey}`}
                  tabIndex={canOpen ? 0 : undefined}
                  onClick={selectInstance}
                  onKeyDown={selectInstance}
                  className={cx(
                    'group',
                    canOpen &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
                    selected ? 'bg-primary/10' : 'hover:bg-muted/25',
                  )}
                >
                  {entity.fields.map(field => (
                    <td key={field.name} className='max-w-[280px] px-3 py-2.5 align-top'>
                      <div className='truncate font-mono text-xs text-foreground'>
                        <ExplorerEntityValue field={field} value={row[field.name]} />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
            {!isExecuting && rows?.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, entity.fields.length)}
                  className='px-4 py-8 text-center text-muted-foreground'
                >
                  No rows match this Selection.
                </td>
              </tr>
            ) : null}
            {isExecuting && !rows && !executionError ? (
              <tr>
                <td
                  colSpan={Math.max(1, entity.fields.length)}
                  className='px-4 py-8 text-center text-muted-foreground'
                >
                  Running Selection…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className='border-t px-3 py-2 text-xs text-muted-foreground' aria-live='polite'>
          {selectionRowsStatus(rows, executionError, isExecuting)}
        </div>
      </div>
    </section>
  );
}
