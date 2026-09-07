'use client';

import { history, historyKeymap } from '@codemirror/commands';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { ReflectedEntityDataReader } from '@ontahi/core/data-graph';
import type { SelectionLanguageEntityReflection } from '@ontahi/language';
import {
  selectionExpressionExtensions,
  type SelectionReferenceValueOption,
  type SelectionReferenceValueProvider,
} from '@ontahi/language-codemirror';
import { CircleHelp } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { cx } from '../internal/cx.js';

import {
  getExplorerReferenceRowPrimaryLabel,
  getExplorerReferenceRowSecondaryLabel,
  toExplorerReferenceDisplayString,
} from './entity-reference-presentation.js';

export type ExplorerSelectionLanguageEditorProps = {
  readonly label: string;
  readonly value: string;
  readonly entity: SelectionLanguageEntityReflection;
  readonly className?: string;
  readonly onChange: (value: string) => void;
  readonly referenceValues?: SelectionReferenceValueProvider;
};

const referenceOption = (
  row: Record<string, unknown>,
  identityField: string,
  display: Parameters<typeof getExplorerReferenceRowPrimaryLabel>[1],
): SelectionReferenceValueOption | undefined => {
  const value = toExplorerReferenceDisplayString(row[identityField]);
  if (!value) return undefined;
  const label = getExplorerReferenceRowPrimaryLabel(row, display);
  const detail = getExplorerReferenceRowSecondaryLabel(row, display);
  return { value, label, ...(detail && detail !== label ? { detail } : {}) };
};

export const createExplorerSelectionReferenceValueProvider = (
  reader: ReflectedEntityDataReader,
): SelectionReferenceValueProvider => ({
  search: async ({ identityField, query, signal, targetEntityName }) => {
    if (signal.aborted) return [];
    const result = await reader.readEntityData({
      entityName: targetEntityName,
      search: query,
      page: 1,
      pageSize: 6,
    });
    return signal.aborted
      ? []
      : result.rows.flatMap(row => referenceOption(row, identityField, result.display) ?? []);
  },
  resolve: async ({ identityField, signal, targetEntityName, value }) => {
    if (signal.aborted) return undefined;
    const result = await reader.readEntityData({
      entityName: targetEntityName,
      filters: [{ field: identityField, operator: 'equals', value }],
      page: 1,
      pageSize: 1,
    });
    return signal.aborted
      ? undefined
      : referenceOption(result.rows[0] ?? {}, identityField, result.display);
  },
});

const explorerSelectionEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '0.875rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    caretColor: 'currentColor',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    minHeight: '2.5rem',
    padding: '0.625rem 2.75rem 0.625rem 0.75rem',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-tooltip-lint': {
    fontFamily: 'inherit',
  },
});

const externalDocumentChange = Annotation.define<boolean>();

export function ExplorerSelectionLanguageEditor({
  className,
  entity,
  label,
  onChange,
  referenceValues,
  value,
}: ExplorerSelectionLanguageEditorProps) {
  const helpId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const languageCompartmentRef = useRef(new Compartment());
  const labelCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of(historyKeymap),
          languageCompartmentRef.current.of(
            selectionExpressionExtensions(entity, {
              finiteValueProjections: true,
              ...(referenceValues ? { referenceValues } : {}),
            }),
          ),
          labelCompartmentRef.current.of(EditorView.contentAttributes.of({ 'aria-label': label })),
          EditorView.lineWrapping,
          explorerSelectionEditorTheme,
          EditorView.updateListener.of(update => {
            if (
              update.docChanged &&
              !update.transactions.some(transaction =>
                transaction.annotation(externalDocumentChange),
              )
            ) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        selectionExpressionExtensions(entity, {
          finiteValueProjections: true,
          ...(referenceValues ? { referenceValues } : {}),
        }),
      ),
    });
  }, [entity, referenceValues]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: labelCompartmentRef.current.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': label }),
      ),
    });
  }, [label]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalDocumentChange.of(true),
    });
  }, [value]);

  return (
    <div
      className={cx(
        'relative rounded-md border bg-background text-foreground focus-within:border-primary',
        className,
      )}
    >
      <div ref={hostRef} className='overflow-hidden rounded-md' />
      <div className='group/help absolute right-2 top-1/2 z-20 -translate-y-1/2'>
        <button
          type='button'
          aria-label='Selection editor help'
          aria-describedby={helpId}
          className='flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
        >
          <CircleHelp aria-hidden='true' className='size-4' />
        </button>
        <div
          id={helpId}
          role='tooltip'
          className='pointer-events-none invisible absolute right-0 top-full mt-2 w-72 rounded-lg border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-lg transition group-hover/help:visible group-hover/help:opacity-100 group-focus-within/help:visible group-focus-within/help:opacity-100'
        >
          Ctrl-Space for suggestions. Hover a Field or operator for details. Press Escape on a value
          control to edit its source text.
        </div>
      </div>
    </div>
  );
}
