'use client';

import { history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  isGraphReadCapabilities,
  type AnyEntityDefinition,
  type GraphReadCapabilities,
  type GraphReadRequestV1,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolExchange,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import {
  analyzeConsoleDocument,
  editConsoleOrderBy,
  isConsoleOrderableField,
  reflectSelectionLanguageEntity,
  type ConsoleLanguageApplicationReflection,
} from '@ontahi/language';
import { consoleExpressionExtensions } from '@ontahi/language-codemirror';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';
import { ResultTable, SemanticPayload } from './semantic-payload.js';

export type OntahiDevtoolsConsoleOptions = {
  readonly entities: readonly AnyEntityDefinition[];
  readonly initialDocument?: string;
  readonly limit?: number;
};

export type ConsolePanelProps = {
  readonly options: OntahiDevtoolsConsoleOptions;
  readonly runtimeTransport?: RuntimeTransport<any>;
};

type ConsoleResultSnapshot = {
  readonly document: string;
  readonly request: GraphReadRequestV1;
  readonly value: unknown;
  readonly capabilities?: GraphReadCapabilities;
  readonly transport?: RuntimeTransport<any>;
};

type ConsoleResult = { readonly snapshot?: ConsoleResultSnapshot } & (
  | { readonly status: 'idle' | 'executing' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string }
);

type ConsoleResultMode = 'visual' | 'json';

const resultNotice = (result: ConsoleResult, document: string): string => {
  if (result.status === 'executing') return 'Running · showing previous result.';
  if (result.status === 'error') return 'Run failed · showing previous result.';
  if (result.snapshot?.document !== document) return 'Changes not run · showing previous result.';
  return 'Result matches the executed query.';
};

type ConsoleEditorProps = {
  readonly application: ConsoleLanguageApplicationReflection;
  readonly label: string;
  readonly limit: number;
  readonly onChange: (document: string) => void;
  readonly run: () => void;
  readonly value: string;
  readonly viewRef: MutableRefObject<EditorView | undefined>;
};

const externalDocumentChange = Annotation.define<boolean>();

const consoleEditorTheme = EditorView.theme({
  '&': {
    '--accent': '145 31% 18%',
    '--accent-foreground': '139 55% 91%',
    '--border': '143 20% 28%',
    '--muted-foreground': '145 12% 58%',
    '--ring': '151 45% 55%',
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

const ConsoleEditor = ({
  application,
  label,
  limit,
  onChange,
  run,
  value,
  viewRef,
}: ConsoleEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
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
              finiteValueProjections: true,
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
          finiteValueProjections: true,
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

class ConsoleGraphReadError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const graphReadResult = (
  response: unknown,
): Pick<ConsoleResultSnapshot, 'value' | 'capabilities'> => {
  if (!isRecord(response)) throw new Error('Graph Read returned an invalid response.');
  if (response.kind === 'protocol-error') {
    const error = response.error;
    throw new ConsoleGraphReadError(
      isRecord(error) && typeof error.message === 'string'
        ? error.message
        : 'Graph Read was rejected.',
      isRecord(error) && typeof error.code === 'string' ? error.code : undefined,
    );
  }
  if (response.kind !== 'graph-read-result' || !('value' in response)) {
    throw new Error('Graph Read returned an invalid result.');
  }
  return {
    value: response.value,
    capabilities: isGraphReadCapabilities(response.capabilities)
      ? response.capabilities
      : undefined,
  };
};

export const ConsolePanel = ({ options, runtimeTransport }: ConsolePanelProps) => {
  const limit = options.limit ?? 25;
  const application = useMemo<ConsoleLanguageApplicationReflection>(
    () => ({ entities: options.entities.map(reflectSelectionLanguageEntity) }),
    [options.entities],
  );
  const initialDocument =
    options.initialDocument ??
    (application.entities[0] ? application.entities[0].name + '.many()' : '');
  const [document, setDocument] = useState(initialDocument);
  const [result, setResult] = useState<ConsoleResult>({ status: 'idle' });
  const [resultMode, setResultMode] = useState<ConsoleResultMode>('visual');
  const viewRef = useRef<EditorView>();
  const executingRef = useRef(false);
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

  const runDocument = (source: string) => {
    if (executingRef.current) return;
    const request = analyzeConsoleDocument(source, application, { limit }).request;
    if (!request) {
      setResult(previous => ({
        snapshot: previous.snapshot,
        status: 'error',
        message: 'Fix the Console expression before running it.',
      }));
      return;
    }
    if (!exchange) {
      setResult(previous => ({
        snapshot: previous.snapshot,
        status: 'error',
        message: 'Console execution requires a configured Runtime Transport.',
      }));
      return;
    }

    executingRef.current = true;
    setResult(previous => ({ status: 'executing', snapshot: previous.snapshot }));
    void exchange({ family: 'graph.read', body: { ...request, includeCapabilities: true } })
      .then(graphReadResult)
      .then(result =>
        setResult({
          status: 'success',
          snapshot: { document: source, request, ...result, transport: runtimeTransport },
        }),
      )
      .catch((error: unknown) =>
        setResult(previous => ({
          snapshot:
            previous.snapshot &&
            error instanceof ConsoleGraphReadError &&
            error.code === 'access_denied'
              ? { ...previous.snapshot, capabilities: undefined }
              : previous.snapshot,
          status: 'error',
          message: error instanceof Error ? error.message : 'Graph Read failed.',
        })),
      )
      .finally(() => {
        executingRef.current = false;
      });
  };

  const run = () => runDocument(viewRef.current?.state.doc.toString() ?? document);
  const snapshot = result.snapshot;
  const resultEntity = application.entities.find(
    entity => entity.name === snapshot?.request.selection.entityName,
  );
  const sortDisabledReason = (fieldName: string): string | undefined => {
    if (result.status === 'executing') return 'Wait for the current query to finish.';
    if (!exchange) return 'Ordering requires a configured Runtime Transport.';
    if (snapshot?.transport !== runtimeTransport)
      return 'Run the query to refresh ordering permissions for this transport.';
    if (!snapshot?.capabilities)
      return 'Ordering permissions unavailable. Run a successful query against a server that reports Graph Read capabilities.';
    if (!snapshot.capabilities.orderBy.includes(fieldName))
      return `Ordering by ${snapshot.request.selection.entityName}.${fieldName} is not allowed by the Graph Read policy.`;
    if (!analysis.request) return 'Fix the Console expression before changing ordering.';
    if (
      snapshot.request.mode !== 'run' ||
      analysis.request.mode !== 'run' ||
      analysis.request.selection.entityName !== snapshot.request.selection.entityName
    )
      return 'Run a many query for the current Entity before changing ordering.';
    return undefined;
  };
  const sortBy = (fieldName: string) => {
    const view = viewRef.current;
    if (sortDisabledReason(fieldName) || !view || executingRef.current) return;
    const source = view.state.doc.toString();
    const request = analyzeConsoleDocument(source, application, { limit }).request;
    if (
      request?.mode !== 'run' ||
      request.selection.entityName !== snapshot?.request.selection.entityName
    )
      return;
    const currentOrder = request.orderBy[0];
    const nextOrder =
      currentOrder?.fieldName !== fieldName
        ? { fieldName, direction: 'asc' as const }
        : currentOrder.direction === 'asc'
          ? { fieldName, direction: 'desc' as const }
          : undefined;
    const changes = editConsoleOrderBy(source, application, nextOrder);
    if (!changes) return;
    view.dispatch({
      changes,
      annotations: isolateHistory.of('full'),
      userEvent: 'input.console-sort',
    });
    runDocument(view.state.doc.toString());
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
          viewRef={viewRef}
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
                analysis.request?.mode === 'count'
                  ? 'count'
                  : 'limit ' + (analysis.request?.limit ?? limit),
              ].join(' · ')}
        </div>
      </div>
      <div style={styles.consoleResult} aria-label='Console result'>
        <div style={styles.consoleResultHeader}>
          <strong>Result</strong>
          <span style={styles.consoleResultControls}>
            {snapshot ? (
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
          {snapshot ? (
            <div style={styles.consoleSnapshotStatus}>
              <span>{resultNotice(result, document)}</span>
              <details>
                <summary>Executed query</summary>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{snapshot.document}</pre>
              </details>
            </div>
          ) : null}
          {result.status === 'error' ? (
            <span role='alert' style={styles.consoleError}>
              {result.message}
            </span>
          ) : null}
          {snapshot ? (
            resultMode === 'visual' ? (
              snapshot.request.mode === 'run' && Array.isArray(snapshot.value) ? (
                <ResultTable
                  value={snapshot.value}
                  ordering={{
                    fields:
                      resultEntity?.fields
                        .filter(isConsoleOrderableField)
                        .map(field => field.name) ?? [],
                    order: snapshot.request.orderBy[0],
                    disabledReason: sortDisabledReason,
                    onSort: sortBy,
                  }}
                />
              ) : (
                <SemanticPayload value={snapshot.value} />
              )
            ) : (
              <JsonView value={snapshot.value} label='Console result JSON' />
            )
          ) : result.status !== 'error' ? (
            <span style={styles.consoleEmpty}>
              {result.status === 'executing'
                ? 'Executing through the configured Runtime Transport…'
                : 'Run the expression to inspect its semantic result.'}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
};
