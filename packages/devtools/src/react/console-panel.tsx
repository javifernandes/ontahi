'use client';

import { history, historyKeymap } from '@codemirror/commands';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { AnyEntityDefinition } from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolExchange,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import {
  analyzeConsoleDocument,
  reflectSelectionLanguageEntity,
  type ConsoleLanguageApplicationReflection,
} from '@ontahi/language';
import { consoleExpressionExtensions } from '@ontahi/language-codemirror';
import { useEffect, useMemo, useRef, useState } from 'react';

import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';
import { SemanticPayload } from './semantic-payload.js';

export type OntahiDevtoolsConsoleOptions = {
  readonly entities: readonly AnyEntityDefinition[];
  readonly initialDocument?: string;
  readonly limit?: number;
};

export type ConsolePanelProps = {
  readonly options: OntahiDevtoolsConsoleOptions;
  readonly runtimeTransport?: RuntimeTransport<any>;
};

type ConsoleResult =
  | { readonly status: 'idle' | 'executing' }
  | { readonly status: 'success'; readonly value: unknown }
  | { readonly status: 'error'; readonly message: string };

type ConsoleResultMode = 'visual' | 'json';

type ConsoleEditorProps = {
  readonly application: ConsoleLanguageApplicationReflection;
  readonly label: string;
  readonly limit: number;
  readonly onChange: (document: string) => void;
  readonly run: () => void;
  readonly value: string;
};

const externalDocumentChange = Annotation.define<boolean>();

const consoleEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: '#dce8e1',
    backgroundColor: '#09110d',
    fontSize: '0.8125rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    minHeight: '7rem',
    padding: '0.875rem',
    caretColor: '#dffbea',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.6',
  },
  '.cm-gutters': {
    borderRight: '1px solid #1f3128',
    color: '#587064',
    backgroundColor: '#0b1410',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#102019' },
  '.cm-selectionBackground': { backgroundColor: '#284c3a !important' },
  '.cm-cursor': { borderLeftColor: '#dffbea' },
  '.cm-tooltip-lint': { fontFamily: 'inherit' },
});

const ConsoleEditor = ({ application, label, limit, onChange, run, value }: ConsoleEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const languageCompartmentRef = useRef(new Compartment());
  const labelCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const runRef = useRef(run);

  onChangeRef.current = onChange;
  runRef.current = run;

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
            consoleExpressionExtensions(application, {
              limit,
              run: () => runRef.current(),
            }),
          ),
          labelCompartmentRef.current.of(EditorView.contentAttributes.of({ 'aria-label': label })),
          EditorView.lineWrapping,
          consoleEditorTheme,
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
        consoleExpressionExtensions(application, {
          limit,
          run: () => runRef.current(),
        }),
      ),
    });
  }, [application, limit]);

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

  return <div ref={hostRef} style={styles.consoleEditor} />;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const graphReadValue = (response: unknown): unknown => {
  if (!isRecord(response)) throw new Error('Graph Read returned an invalid response.');
  if (response.kind === 'protocol-error') {
    const error = response.error;
    throw new Error(
      isRecord(error) && typeof error.message === 'string'
        ? error.message
        : 'Graph Read was rejected.',
    );
  }
  if (response.kind !== 'graph-read-result' || !('value' in response)) {
    throw new Error('Graph Read returned an invalid result.');
  }
  return response.value;
};

export const ConsolePanel = ({ options, runtimeTransport }: ConsolePanelProps) => {
  const limit = options.limit ?? 25;
  const application = useMemo<ConsoleLanguageApplicationReflection>(
    () => ({ entities: options.entities.map(reflectSelectionLanguageEntity) }),
    [options.entities],
  );
  const initialDocument =
    options.initialDocument ??
    (application.entities[0] ? application.entities[0].name + '.where(all).many()' : '');
  const [document, setDocument] = useState(initialDocument);
  const [result, setResult] = useState<ConsoleResult>({ status: 'idle' });
  const [resultMode, setResultMode] = useState<ConsoleResultMode>('visual');
  const exchange = useMemo(
    () =>
      runtimeTransport ? createRuntimeProtocolExchange({ transport: runtimeTransport }) : undefined,
    [runtimeTransport],
  );
  const analysis = useMemo(
    () => analyzeConsoleDocument(document, application, { limit }),
    [application, document, limit],
  );
  const documentDiagnostics = [...analysis.syntaxDiagnostics, ...analysis.semanticDiagnostics];

  const run = () => {
    if (result.status === 'executing') return;
    if (!analysis.request) {
      setResult({ status: 'error', message: 'Fix the Console expression before running it.' });
      return;
    }
    if (!exchange) {
      setResult({
        status: 'error',
        message: 'Console execution requires a configured Runtime Transport.',
      });
      return;
    }

    setResult({ status: 'executing' });
    void exchange({ family: 'graph.read', body: analysis.request })
      .then(graphReadValue)
      .then(value => setResult({ status: 'success', value }))
      .catch((error: unknown) =>
        setResult({
          status: 'error',
          message: error instanceof Error ? error.message : 'Graph Read failed.',
        }),
      );
  };

  return (
    <section style={styles.consolePage} aria-label='Devtools Console'>
      <div style={styles.consoleComposer}>
        <div style={styles.consoleHeading}>
          <span>
            <strong style={styles.consoleTitle}>Semantic Console</strong>
            <span style={styles.consoleHint}>Graph Read walking skeleton · Mod-Enter to run</span>
          </span>
          <button
            type='button'
            style={{
              ...styles.primaryButton,
              ...(!analysis.request || result.status === 'executing' ? styles.disabledButton : {}),
            }}
            disabled={!analysis.request || result.status === 'executing'}
            onClick={run}
          >
            {result.status === 'executing' ? 'Running…' : 'Run'}
          </button>
        </div>
        <ConsoleEditor
          application={application}
          label='Ontahí Console expression'
          limit={limit}
          onChange={setDocument}
          run={run}
          value={document}
        />
        <div style={styles.consoleStatus} aria-live='polite'>
          {documentDiagnostics.length > 0
            ? documentDiagnostics.map(diagnostic => (
                <span
                  key={[diagnostic.channel, diagnostic.code, diagnostic.from, diagnostic.to].join(
                    '-',
                  )}
                  style={styles.consoleDiagnostic}
                  data-diagnostic-channel={diagnostic.channel}
                >
                  {diagnostic.message}
                </span>
              ))
            : [
                analysis.request?.selection.entityName ?? 'No Entity',
                'graph.read',
                'limit ' + limit,
              ].join(' · ')}
        </div>
      </div>
      <div style={styles.consoleResult} aria-label='Console result'>
        <div style={styles.consoleResultHeader}>
          <strong>Result</strong>
          <span style={styles.consoleResultControls}>
            {result.status === 'success' ? (
              <span style={styles.modes} aria-label='Console result view mode'>
                {(
                  [
                    ['visual', 'Visual'],
                    ['json', 'JSON'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type='button'
                    style={{ ...styles.mode, ...(resultMode === value ? styles.activeMode : {}) }}
                    onClick={() => setResultMode(value)}
                    aria-pressed={resultMode === value}
                  >
                    {label}
                  </button>
                ))}
              </span>
            ) : null}
            <span style={styles.consoleResultStatus}>{result.status}</span>
          </span>
        </div>
        <div style={styles.consoleResultBody} aria-live='polite'>
          {result.status === 'success' ? (
            resultMode === 'visual' ? (
              <SemanticPayload value={result.value} />
            ) : (
              <JsonView value={result.value} label='Console result JSON' />
            )
          ) : result.status === 'error' ? (
            <span role='alert' style={styles.consoleError}>
              {result.message}
            </span>
          ) : (
            <span style={styles.consoleEmpty}>
              {result.status === 'executing'
                ? 'Executing through the configured Runtime Transport…'
                : 'Run the expression to inspect its semantic result.'}
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
