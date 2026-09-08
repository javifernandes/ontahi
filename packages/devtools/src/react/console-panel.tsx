'use client';

import { history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  isGraphReadCapabilities,
  type AnyEntityDefinition,
  type GraphReadCapabilities,
  type GraphReadRequestV1,
  type GraphReadOrder,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolExchange,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import {
  analyzeConsoleDocument,
  editConsoleOrderBy,
  editConsoleLimit,
  isConsoleOrderableField,
  reflectSelectionLanguageEntity,
  type ConsoleLanguageApplicationReflection,
  type ConsoleDocumentAnalysis,
} from '@ontahi/language';
import { consoleExpressionExtensions } from '@ontahi/language-codemirror';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { ConsoleResultLimit } from './console-result-limit.js';
import { styles } from './devtools-styles.js';
import { JsonView } from './json-view.js';
import { ResultTable, SemanticPayload, type ResultTableOrdering } from './semantic-payload.js';

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
  readonly durationMs: number;
  readonly capabilities?: GraphReadCapabilities;
  readonly transport?: RuntimeTransport<any>;
};

type ConsoleResult = { readonly snapshot?: ConsoleResultSnapshot } & (
  | { readonly status: 'idle' | 'executing' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string }
);

type ConsoleResultMode = 'visual' | 'json';

const nextConsoleOrder = (
  current: GraphReadOrder | undefined,
  fieldName: string,
): GraphReadOrder | undefined => {
  if (current?.fieldName !== fieldName) return { fieldName, direction: 'asc' };
  if (current.direction === 'asc') return { fieldName, direction: 'desc' };
  return undefined;
};

const consoleReadSummary = (analysis: ConsoleDocumentAnalysis, limit: number) => {
  if (analysis.syntax.expression?.terminal?.kind === 'exists-member') return 'exists';
  if (analysis.request?.mode === 'count') return 'count';
  return 'limit ' + (analysis.request?.limit ?? limit);
};

const ConsoleAnalysisStatus = ({
  analysis,
  limit,
}: {
  readonly analysis: ConsoleDocumentAnalysis;
  readonly limit: number;
}) => {
  const diagnostics = [...analysis.syntaxDiagnostics, ...analysis.semanticDiagnostics];
  if (diagnostics.length === 0)
    return [
      analysis.request?.selection.entityName ?? 'No Entity',
      'graph.read',
      consoleReadSummary(analysis, limit),
    ].join(' · ');
  return diagnostics.map(diagnostic => (
    <span
      key={[diagnostic.channel, diagnostic.code, diagnostic.from, diagnostic.to].join('-')}
      style={styles.consoleDiagnostic}
      data-diagnostic-channel={diagnostic.channel}
    >
      {diagnostic.message}
    </span>
  ));
};

const ConsoleResultContent = ({
  result,
  mode,
  ordering,
}: {
  readonly result: ConsoleResult;
  readonly mode: ConsoleResultMode;
  readonly ordering: ResultTableOrdering;
}) => {
  const snapshot = result.snapshot;
  if (!snapshot) {
    if (result.status === 'error') return null;
    return (
      <span style={styles.consoleEmpty}>
        {result.status === 'executing'
          ? 'Executing through the configured Runtime Transport…'
          : 'Run the expression to inspect its semantic result.'}
      </span>
    );
  }
  if (mode === 'json') return <JsonView value={snapshot.value} label='Console result JSON' />;
  if (snapshot.request.mode === 'run' && Array.isArray(snapshot.value))
    return <ResultTable value={snapshot.value} ordering={ordering} />;
  return <SemanticPayload value={snapshot.value} />;
};

const resultNotice = (result: ConsoleResult, document: string): string => {
  if (result.status === 'executing') return 'Running…';
  if (result.status === 'error' && result.snapshot) return 'Previous result';
  if (result.snapshot && result.snapshot.document !== document) return 'Changes not run';
  return '';
};

type ConsoleEditorProps = {
  readonly application: ConsoleLanguageApplicationReflection;
  readonly label: string;
  readonly limit: number;
  readonly onChange: (document: string) => void;
  readonly orderableFields: (entityName: string) => readonly string[];
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
  orderableFields,
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
              orderableFields,
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
          orderableFields,
          limit,
          run: () => runRef.current(),
        }),
      ),
    });
  }, [application, limit, orderableFields]);

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

const ConsoleResultPanel = ({
  result,
  document,
  limit,
  resultMode,
  setResultMode,
  limitDisabledReason,
  changeLimit,
  ordering,
}: {
  readonly result: ConsoleResult;
  readonly document: string;
  readonly limit: number;
  readonly resultMode: ConsoleResultMode;
  readonly setResultMode: (mode: ConsoleResultMode) => void;
  readonly limitDisabledReason?: string;
  readonly changeLimit: (limit: number) => void;
  readonly ordering: ResultTableOrdering;
}) => {
  const snapshot = result.snapshot;
  return (
    <div style={styles.consoleResult} aria-label='Console result'>
      <fieldset
        style={{ border: 0, margin: 0, minWidth: 0, ...styles.consoleResultHeader }}
        aria-label='Console result toolbar'
      >
        <div style={styles.consoleResultControls}>
          {snapshot ? (
            <span
              style={styles.consoleResultStatus}
              aria-label='Last query duration'
              title='Last successful round-trip time (including transport)'
            >
              {Math.round(snapshot.durationMs)} ms
            </span>
          ) : null}
          {snapshot?.request.mode === 'run' && Array.isArray(snapshot.value) ? (
            <ConsoleResultLimit
              request={snapshot.request}
              defaultLimit={limit}
              disabledReason={limitDisabledReason}
              onApply={changeLimit}
            />
          ) : null}
          <output
            style={styles.consoleResultStatus}
            title={snapshot ? 'Showing the last successful result.' : undefined}
          >
            {resultNotice(result, document)}
          </output>
        </div>
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
        </span>
      </fieldset>
      <div style={styles.consoleResultBody} aria-live='polite'>
        {result.status === 'error' ? (
          <span role='alert' style={styles.consoleError}>
            {result.message}
          </span>
        ) : null}
        <ConsoleResultContent result={result} mode={resultMode} ordering={ordering} />
      </div>
    </div>
  );
};

export const ConsolePanel = ({ options, runtimeTransport }: ConsolePanelProps) => {
  const limit = options.limit ?? 25;
  const application = useMemo<ConsoleLanguageApplicationReflection>(
    () => ({ entities: options.entities.map(entity => reflectSelectionLanguageEntity(entity)) }),
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

  const runDocument = (source: string) => {
    if (executingRef.current) return;
    const executedAnalysis = analyzeConsoleDocument(source, application, { limit });
    const request = executedAnalysis.request;
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
    const startedAt = performance.now();
    setResult(previous => ({ status: 'executing', snapshot: previous.snapshot }));
    void exchange({ family: 'graph.read', body: { ...request, includeCapabilities: true } })
      .then(graphReadResult)
      .then(result => {
        const exists = executedAnalysis.syntax.expression?.terminal?.kind === 'exists-member';
        if (exists && result.value !== null && !isRecord(result.value)) {
          throw new Error('Graph Read exists expected an Entity record or null.');
        }
        setResult({
          status: 'success',
          snapshot: {
            document: source,
            request,
            ...result,
            // Match the application Graph Read exists intent over nullable get.
            value: exists ? result.value !== null : result.value,
            transport: runtimeTransport,
            durationMs: Math.max(0, performance.now() - startedAt),
          },
        });
      })
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
  const orderingCapabilities =
    snapshot?.transport === runtimeTransport ? snapshot?.capabilities : undefined;
  const orderableFields = useMemo(
    () => (entityName: string) =>
      entityName === snapshot?.request.selection.entityName
        ? (orderingCapabilities?.orderBy ?? [])
        : [],
    [snapshot?.request.selection.entityName, orderingCapabilities],
  );
  const resultEntity = application.entities.find(
    entity => entity.name === snapshot?.request.selection.entityName,
  );
  const sortDisabledReason = (fieldName: string): string | undefined => {
    if (result.status === 'executing') return 'Wait for the current query to finish.';
    if (!exchange) return 'Ordering requires a configured Runtime Transport.';
    if (snapshot?.transport !== runtimeTransport)
      return 'Run the query to refresh ordering permissions for this transport.';
    if (!snapshot || !orderingCapabilities)
      return 'Ordering permissions unavailable. Run a successful query against a server that reports Graph Read capabilities.';
    if (!orderingCapabilities.orderBy.includes(fieldName))
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
    const nextOrder = nextConsoleOrder(request.orderBy[0], fieldName);
    const changes = editConsoleOrderBy(source, application, nextOrder);
    if (!changes) return;
    view.dispatch({
      changes,
      annotations: isolateHistory.of('full'),
      userEvent: 'input.console-sort',
    });
    runDocument(view.state.doc.toString());
  };

  const limitDisabledReason = () => {
    if (result.status === 'executing') return 'Wait for the current query to finish.';
    if (!exchange || snapshot?.transport !== runtimeTransport)
      return 'Run the query with the current Runtime Transport before changing its limit.';
    if (!analysis.request) return 'Fix the Console expression before changing its limit.';
    if (
      analysis.request.mode !== 'run' ||
      analysis.request.selection.entityName !== snapshot?.request.selection.entityName
    )
      return 'Run a many query for the current Entity before changing its limit.';
    return undefined;
  };
  const changeLimit = (nextLimit: number) => {
    const view = viewRef.current;
    if (limitDisabledReason() || !view || executingRef.current) return;
    const source = view.state.doc.toString();
    const request = analyzeConsoleDocument(source, application, { limit }).request;
    if (
      request?.mode !== 'run' ||
      request.selection.entityName !== snapshot?.request.selection.entityName
    )
      return;
    const changes = editConsoleLimit(source, application, nextLimit);
    if (!changes) return;
    view.dispatch({
      changes,
      annotations: isolateHistory.of('full'),
      userEvent: 'input.console-limit',
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
          orderableFields={orderableFields}
          run={run}
          value={document}
          viewRef={viewRef}
        />
        <div style={styles.consoleStatus} aria-live='polite'>
          <ConsoleAnalysisStatus analysis={analysis} limit={limit} />
        </div>
      </div>
      <ConsoleResultPanel
        result={result}
        document={document}
        limit={limit}
        resultMode={resultMode}
        setResultMode={setResultMode}
        limitDisabledReason={limitDisabledReason()}
        changeLimit={changeLimit}
        ordering={{
          fields:
            resultEntity?.fields.filter(isConsoleOrderableField).map(field => field.name) ?? [],
          order: snapshot?.request.orderBy[0],
          disabledReason: sortDisabledReason,
          onSort: sortBy,
        }}
      />
    </section>
  );
};
