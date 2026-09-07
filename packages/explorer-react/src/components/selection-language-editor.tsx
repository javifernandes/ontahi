'use client';

import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SelectionLanguageEntityReflection } from '@ontahi/language';
import { selectionExpressionExtensions } from '@ontahi/language-codemirror';
import { useEffect, useRef } from 'react';

import { cx } from '../internal/cx.js';

export type ExplorerSelectionLanguageEditorProps = {
  readonly label: string;
  readonly value: string;
  readonly entity: SelectionLanguageEntityReflection;
  readonly className?: string;
  readonly onChange: (value: string) => void;
};

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
    padding: '0.625rem 0.75rem',
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
  value,
}: ExplorerSelectionLanguageEditorProps) {
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
          languageCompartmentRef.current.of(selectionExpressionExtensions(entity)),
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
      effects: languageCompartmentRef.current.reconfigure(selectionExpressionExtensions(entity)),
    });
  }, [entity]);

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
      ref={hostRef}
      className={cx(
        'overflow-hidden rounded-md border bg-background text-foreground focus-within:border-primary',
        className,
      )}
    />
  );
}
