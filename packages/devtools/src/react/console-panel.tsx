'use client';

import { history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  createEntityRef,
  isEntityMutationDelta,
  isGraphReadCapabilities,
  isReferenceFieldDefinition,
  graphOutput,
  selectionAll,
  toGraphSchemaDescriptor,
  type GraphClientCache,
  type AnyEntityDefinition,
  type AnyFieldDefinition,
  type GraphSchemaDefinition,
  type GraphReadCapabilities,
  type GraphReadRequest,
  type GraphReadOrder,
} from '@ontahi/core/data-graph';
import {
  graphReadApplicationHoles,
  graphReadApplicationHolePositions,
  lowerGraphReadApplication,
  substituteGraphReadApplication,
  type GraphReadApplication,
} from '@ontahi/core/experimental/semantic-program';
import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  anonymousExecutionIdentity,
  executionIdentityCacheKey,
  type ExecutionIdentity,
} from '@ontahi/core/runtime/identity';
import {
  createRuntimeProtocolExchange,
  type RuntimeTransport,
  type RuntimeProtocolGraphObservationBody,
} from '@ontahi/core/runtime/protocol';
import {
  analyzeConsoleDocument,
  convertConsoleDocument,
  editConsoleOrderBy,
  editConsoleLimit,
  isConsoleOrderableField,
  reflectSelectionLanguageEntity,
  reflectConsoleApplicationVariants,
  parseConsoleDocument,
  resolveConsoleContext,
  type ConsoleLanguageApplicationReflection,
  type ConsoleDocumentAnalysis,
  type ConsoleDialect,
  type ConsoleRequest,
  type ConsoleLanguageOperationReflection,
} from '@ontahi/language';
import {
  authoringDialectPreference,
  consoleExpressionExtensions,
  consoleExpressionDialect,
  setConsoleExpressionDialect,
} from '@ontahi/language-codemirror';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import { useConsoleCommandCapabilities } from './console-command-capabilities.js';
import { useConsoleReadCapabilities } from './console-read-capabilities.js';
import { ConsoleResultLimit } from './console-result-limit.js';
import { styles } from './devtools-styles.js';
import { DurableOperationRun, operationTaskRunIdentity } from './durable-operation-run.js';
import { JsonView } from './json-view.js';
import { ResultTable, SemanticPayload, type ResultTableOrdering } from './semantic-payload.js';

type ConsoleOperationSource = {
  readonly id: string;
  readonly entityName: string;
  readonly name: string;
  readonly description?: string;
  readonly input?: GraphSchemaDefinition;
  readonly durable?: unknown;
};

type ConsoleEntitySource =
  | AnyEntityDefinition
  | {
      readonly definition: AnyEntityDefinition;
      readonly domain: Readonly<Record<string, ConsoleOperationSource>>;
    };

export type OntahiDevtoolsConsoleOptions = {
  /** Entity schemas or generated client Entities. Client Entities also expose their Operations. */
  readonly entities: readonly ConsoleEntitySource[];
  readonly initialDocument?: string;
  readonly initialDialect?: ConsoleDialect;
  readonly limit?: number;
  /** Host cache identity, not credentials. Update principal/cacheScope on authority changes. */
  readonly identity?: ExecutionIdentity;
  /** Reconcile host-owned read caches after a Console Command or Operation succeeds. */
  readonly onActionExecuted?: (event: {
    readonly execution: Exclude<ConsoleRequest, { readonly family: 'graph.read' }>;
    readonly response: unknown;
  }) => void | Promise<void>;
};

export type ConsolePanelProps = {
  readonly clientCache?: GraphClientCache;
  readonly options: OntahiDevtoolsConsoleOptions;
  readonly runtimeTransport?: RuntimeTransport<any>;
};

type ConsoleResultSnapshot = {
  readonly document: string;
  readonly exists: boolean;
  readonly execution: ConsoleRequest;
  readonly request?: GraphReadRequest;
  readonly value: unknown;
  readonly durationMs: number;
  readonly observed?: boolean;
  readonly capabilities?: GraphReadCapabilities;
  readonly transport?: RuntimeTransport<any>;
  readonly route?: string;
};

type ConsoleResult = { readonly snapshot?: ConsoleResultSnapshot } & (
  | { readonly status: 'idle' | 'executing' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string }
);

type ConsoleResultMode = 'visual' | 'json';

const consoleEntityDefinition = (source: ConsoleEntitySource): AnyEntityDefinition =>
  'definition' in source ? source.definition : source;

const reconcileEntityMutationResult = (
  clientCache: GraphClientCache | undefined,
  sources: readonly ConsoleEntitySource[],
  response: unknown,
) => {
  if (!clientCache || !isRecord(response) || !isEntityMutationDelta(response.value)) return;
  const entities = new Map(
    sources.map(source => {
      const definition = consoleEntityDefinition(source);
      return [definition.name, definition] as const;
    }),
  );
  for (const fact of [...response.value.created, ...response.value.updated]) {
    const definition = entities.get(fact.entityName);
    if (!definition) continue;
    const previous = fact.ref
      ? clientCache.readEntity<Record<string, unknown>>(fact.ref)
      : undefined;
    clientCache.writeEntity(definition, { ...previous, ...fact.values });
  }
  for (const fact of response.value.deleted) {
    if (fact.ref) clientCache.invalidateEntity(fact.ref);
  }
};

const reflectConsoleOperations = (
  sources: readonly ConsoleEntitySource[],
): readonly ConsoleLanguageOperationReflection[] =>
  sources.flatMap(source =>
    'domain' in source
      ? Object.values(source.domain).map(operation => ({
          id: operation.id,
          entityName: operation.entityName,
          name: operation.name,
          ...(operation.description ? { description: operation.description } : {}),
          ...(operation.input ? { input: toGraphSchemaDescriptor(operation.input) } : {}),
        }))
      : [],
  );

const nextConsoleOrder = (
  current: GraphReadOrder | undefined,
  fieldName: string,
): GraphReadOrder | undefined => {
  if (current?.fieldName !== fieldName) return { fieldName, direction: 'asc' };
  if (current.direction === 'asc') return { fieldName, direction: 'desc' };
  return undefined;
};

const consoleReadSummary = (analysis: ConsoleDocumentAnalysis, limit: number) => {
  const request =
    analysis.execution?.family === 'graph.read'
      ? analysis.execution.body
      : analysis.openExecution?.family === 'graph.read'
        ? analysis.openExecution.body.request
        : undefined;
  if (!request) {
    const expression = analysis.syntax.expression;
    return expression?.kind === 'operation'
      ? `invoke ${expression.operation?.text ?? ''}`
      : (expression?.action ?? 'invalid');
  }
  if (analysis.syntax.expression?.terminal?.kind === 'exists-member') return 'exists';
  if (request.mode === 'count') return 'count';
  return 'limit ' + (request.limit ?? limit);
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
      analysis.syntax.expression?.entity?.text ?? 'No Entity',
      analysis.execution?.family ??
        (analysis.openExecution ? `${analysis.openExecution.family} application` : 'No request'),
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

const parseConsoleHoleInput = (input: string): unknown => {
  const value = input.trim();
  if (value === 'true' || value === 'false' || value === 'null') return JSON.parse(value);
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('{') && value.endsWith('}'))
  )
    return JSON.parse(value);
  return value;
};

type PreparedOpenGraphRead =
  | { readonly execution?: undefined; readonly error?: undefined }
  | { readonly execution: ConsoleRequest; readonly error?: undefined }
  | { readonly execution?: undefined; readonly error: string };

const consoleHoleInput = (
  inputs: Readonly<Record<string, unknown>>,
  holeId: string,
): string | undefined => {
  const input = inputs[holeId];
  return Object.prototype.hasOwnProperty.call(inputs, holeId) && typeof input === 'string'
    ? input
    : undefined;
};

const consoleHoleBinding = (inputs: Readonly<Record<string, unknown>>, holeId: string): unknown =>
  Object.prototype.hasOwnProperty.call(inputs, holeId) ? inputs[holeId] : undefined;

const prepareOpenGraphRead = (
  application: GraphReadApplication | undefined,
  entities: readonly AnyEntityDefinition[],
  inputs: Readonly<Record<string, unknown>>,
): PreparedOpenGraphRead => {
  if (!application) return {};
  let current = application;
  for (const holeId of graphReadApplicationHoles(application)) {
    const binding = consoleHoleBinding(inputs, holeId);
    if (binding === undefined || (typeof binding === 'string' && !binding.trim())) return {};
    let parsedValue: unknown = binding;
    let rawValue: string | undefined;
    if (typeof binding === 'string') {
      rawValue = binding.trim();
      try {
        parsedValue = parseConsoleHoleInput(binding);
      } catch {
        return { error: `?${holeId} is not valid JSON.` };
      }
    }
    let substituted = substituteGraphReadApplication(current, entities, holeId, parsedValue);
    if (!substituted.success && rawValue !== undefined && parsedValue !== rawValue)
      substituted = substituteGraphReadApplication(current, entities, holeId, rawValue);
    if (!substituted.success)
      return {
        error:
          substituted.reason === 'invalid-substitution'
            ? substituted.issues.map(issue => issue.message).join(' ')
            : `Unknown Hole ?${holeId}.`,
      };
    current = substituted.application;
  }
  const lowered = lowerGraphReadApplication(current, entities);
  if (!lowered.success)
    return {
      error:
        lowered.reason === 'open-application'
          ? `Complete ${lowered.holes.map(id => `?${id}`).join(', ')} before running.`
          : lowered.error.error.message,
    };
  return { execution: { family: 'graph.read', body: lowered.request } };
};

type ConsoleReferenceHole = {
  readonly target: AnyEntityDefinition;
  readonly identityField: string;
};

type ConsoleHoleField = {
  readonly entityName: string;
  readonly fieldName: string;
  readonly field: AnyFieldDefinition;
};

const holeFields = (
  application: GraphReadApplication,
  entities: readonly AnyEntityDefinition[],
  holeId: string,
): readonly ConsoleHoleField[] =>
  graphReadApplicationHolePositions(application).flatMap(position => {
    if (position.holeId !== holeId) return [];
    const field = entities.find(entity => entity.name === position.entityName)?.fields[
      position.fieldName
    ];
    return field ? [{ ...position, field }] : [];
  });

const referenceHole = (
  application: GraphReadApplication,
  entities: readonly AnyEntityDefinition[],
  holeId: string,
): ConsoleReferenceHole | undefined => {
  const targets = holeFields(application, entities, holeId).map(({ field }) => {
    if (!field || !isReferenceFieldDefinition(field)) return undefined;
    const identityName = field.target.identityLocatorName;
    const identity = identityName ? field.target.refLocators[identityName] : undefined;
    const identityFields = identity?.fields;
    return identityFields?.length === 1
      ? { target: field.target, identityField: identityFields[0]! }
      : undefined;
  });
  const first = targets[0];
  return first && targets.every(candidate => candidate?.target === first.target)
    ? first
    : undefined;
};

type ConsoleBooleanHole = {
  readonly nullable: boolean;
  readonly labels?: {
    readonly true?: string;
    readonly false?: string;
    readonly unset?: string;
  };
};

const booleanHole = (
  application: GraphReadApplication,
  entities: readonly AnyEntityDefinition[],
  holeId: string,
): ConsoleBooleanHole | undefined => {
  const fields = holeFields(application, entities, holeId).map(position => position.field);
  const first = fields[0];
  return first && fields.every(field => field.fieldType === 'boolean')
    ? {
        nullable: fields.every(field => field.nullable),
        ...(first.presentation?.booleanLabels ? { labels: first.presentation.booleanLabels } : {}),
      }
    : undefined;
};

const holeDescription = (
  application: GraphReadApplication,
  entities: readonly AnyEntityDefinition[],
  holeId: string,
): string | undefined => {
  const descriptions = holeFields(application, entities, holeId).flatMap(position =>
    position.field.description
      ? [`${position.entityName}.${position.fieldName}: ${position.field.description}`]
      : [],
  );
  return descriptions.length > 0 ? [...new Set(descriptions)].join('\n') : undefined;
};

type ConsoleReferenceCandidate = {
  readonly value: string | number;
  readonly label: string;
  readonly detail?: string;
};

const ConsoleReferenceHoleInput = ({
  holeId,
  reference,
  runtimeTransport,
  identityKey,
  onChange,
}: {
  readonly holeId: string;
  readonly reference: ConsoleReferenceHole;
  readonly runtimeTransport?: RuntimeTransport<any>;
  readonly identityKey: string;
  readonly onChange: (value: unknown) => void;
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | number>();
  const [state, setState] = useState<{
    readonly loading: boolean;
    readonly options: readonly ConsoleReferenceCandidate[];
    readonly error?: string;
  }>({ loading: Boolean(runtimeTransport), options: [] });
  useEffect(() => {
    setSelected(undefined);
    onChange(undefined);
    if (!runtimeTransport) {
      setState({ loading: false, options: [], error: 'Runtime Transport unavailable.' });
      return;
    }
    let active = true;
    const controller = new AbortController();
    const exchange = createRuntimeProtocolExchange({ transport: runtimeTransport });
    setState({ loading: true, options: [] });
    void exchange(
      {
        family: 'graph.read',
        body: {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          cardinality: 'many',
          selection: {
            kind: 'selection',
            entityName: reference.target.name,
            expression: selectionAll(),
          },
          orderBy: [],
          limit: 25,
        },
      },
      { signal: controller.signal },
    )
      .then(response => {
        const result = graphReadResult(response);
        if (!Array.isArray(result.value)) throw new Error('Reference discovery expected a list.');
        const primary = reference.target.displayMetadata?.primary;
        const secondary = reference.target.displayMetadata?.secondary ?? [];
        const options = result.value.flatMap(row => {
          if (!isRecord(row)) return [];
          const identity = row[reference.identityField];
          if (typeof identity !== 'string' && typeof identity !== 'number') return [];
          const label = primary && row[primary] != null ? String(row[primary]) : String(identity);
          const detail = secondary
            .flatMap(fieldName => (row[fieldName] == null ? [] : [String(row[fieldName])]))
            .join(' · ');
          return [{ value: identity, label, ...(detail ? { detail } : {}) }];
        });
        if (active) setState({ loading: false, options });
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted)
          setState({
            loading: false,
            options: [],
            error: error instanceof Error ? error.message : 'Reference discovery failed.',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [identityKey, reference.identityField, reference.target.name, runtimeTransport]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const options = state.options.filter(option =>
    [option.label, option.detail, option.value].some(text =>
      String(text ?? '')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    ),
  );
  return (
    <div style={styles.consoleReferenceHole}>
      <input
        aria-label={`Search ${reference.target.name} for ${holeId}`}
        style={styles.consoleHoleInput}
        placeholder={`Search ${reference.target.name}`}
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      <div style={styles.consoleReferenceChoices} role='listbox' aria-label={`${holeId} choices`}>
        {state.loading ? <span>Loading…</span> : null}
        {state.error ? <span role='alert'>{state.error}</span> : null}
        {!state.loading && !state.error && options.length === 0 ? <span>No matches</span> : null}
        {options.map(option => (
          <button
            key={String(option.value)}
            type='button'
            role='option'
            aria-selected={selected === option.value}
            style={{ ...styles.mode, ...(selected === option.value ? styles.activeMode : {}) }}
            onClick={() => {
              setSelected(option.value);
              onChange(
                createEntityRef(reference.target, { [reference.identityField]: option.value }),
              );
            }}
          >
            {option.label}
            {option.detail ? ` · ${option.detail}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
};

const ConsoleBooleanHoleInput = ({
  holeId,
  definition,
  value,
  onChange,
}: {
  readonly holeId: string;
  readonly definition: ConsoleBooleanHole;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) => (
  <div role='group' aria-label={`Value for ${holeId}`} style={styles.consoleBooleanChoices}>
    {[
      { value: true, label: definition.labels?.true ?? 'True' },
      { value: false, label: definition.labels?.false ?? 'False' },
      ...(definition.nullable ? [{ value: null, label: definition.labels?.unset ?? 'Null' }] : []),
    ].map(option => (
      <button
        key={String(option.value)}
        type='button'
        aria-pressed={value === option.value}
        style={{ ...styles.mode, ...(value === option.value ? styles.activeMode : {}) }}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const ConsoleResultContent = ({
  result,
  mode,
  ordering,
  onDurableOperationCompleted,
  onDurableObservationFinished,
}: {
  readonly result: ConsoleResult;
  readonly mode: ConsoleResultMode;
  readonly ordering: ResultTableOrdering;
  readonly onDurableOperationCompleted?: (snapshot: TaskSnapshot) => void | Promise<void>;
  readonly onDurableObservationFinished?: () => void;
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
  const taskRun = operationTaskRunIdentity(snapshot.value);
  if (taskRun && snapshot.transport)
    return (
      <DurableOperationRun
        run={taskRun}
        transport={snapshot.transport}
        onCompleted={onDurableOperationCompleted}
        onObservationFinished={onDurableObservationFinished}
        view={mode}
      />
    );
  if (mode === 'json') return <JsonView value={snapshot.value} label='Console result JSON' />;
  if (snapshot.request?.mode === 'run' && Array.isArray(snapshot.value))
    return <ResultTable value={snapshot.value} ordering={ordering} />;
  return <SemanticPayload value={snapshot.value} />;
};

const resultNotice = (result: ConsoleResult, matchesDraft: boolean): string => {
  if (result.status === 'executing') return 'Running…';
  if (result.status === 'error' && result.snapshot) return 'Previous result';
  if (result.snapshot && !matchesDraft) return 'Changes not run';
  return '';
};

type ConsoleEditorProps = {
  readonly application: ConsoleLanguageApplicationReflection;
  readonly label: string;
  readonly limit: number;
  readonly dialect: ConsoleDialect;
  readonly onChange: (document: string, dialect: ConsoleDialect) => void;
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
  dialect,
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
              colorScheme: 'dark',
              dialect,
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
              (update.docChanged ||
                update.state.field(consoleExpressionDialect) !==
                  update.startState.field(consoleExpressionDialect)) &&
              !update.transactions.some(transaction =>
                transaction.annotation(externalDocumentChange),
              )
            ) {
              onChangeRef.current(
                update.state.doc.toString(),
                update.state.field(consoleExpressionDialect),
              );
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
          colorScheme: 'dark',
          dialect: viewRef.current?.state.field(consoleExpressionDialect) ?? dialect,
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
  matchesDraft,
  limit,
  resultMode,
  setResultMode,
  limitDisabledReason,
  changeLimit,
  ordering,
  onDurableOperationCompleted,
  onDurableObservationFinished,
}: {
  readonly result: ConsoleResult;
  readonly matchesDraft: boolean;
  readonly limit: number;
  readonly resultMode: ConsoleResultMode;
  readonly setResultMode: (mode: ConsoleResultMode) => void;
  readonly limitDisabledReason?: string;
  readonly changeLimit: (limit: number) => void;
  readonly ordering: ResultTableOrdering;
  readonly onDurableOperationCompleted?: (snapshot: TaskSnapshot) => void | Promise<void>;
  readonly onDurableObservationFinished?: () => void;
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
              aria-label={snapshot.observed ? 'Last snapshot arrival' : 'Last query duration'}
              title={
                snapshot.observed
                  ? 'Time from Observe until this snapshot arrived'
                  : 'Last successful round-trip time (including transport)'
              }
            >
              {Math.round(snapshot.durationMs)} ms{snapshot.observed ? ' since Observe' : ''}
            </span>
          ) : null}
          {snapshot?.request?.mode === 'run' && Array.isArray(snapshot.value) ? (
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
            {resultNotice(result, matchesDraft)}
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
        <ConsoleResultContent
          result={result}
          mode={resultMode}
          ordering={ordering}
          onDurableOperationCompleted={onDurableOperationCompleted}
          onDurableObservationFinished={onDurableObservationFinished}
        />
      </div>
    </div>
  );
};

export const ConsolePanel = ({ options, runtimeTransport, clientCache }: ConsolePanelProps) => {
  const preferredDialect = useSyncExternalStore(
    authoringDialectPreference.subscribe,
    authoringDialectPreference.getSnapshot,
    authoringDialectPreference.getServerSnapshot,
  );
  const [preferenceNotice, setPreferenceNotice] = useState('');
  const limit = options.limit ?? 25;
  const entityDefinitions = useMemo(
    () => options.entities.map(consoleEntityDefinition),
    [options.entities],
  );
  const baseEntities = useMemo(
    () => entityDefinitions.map(entity => reflectSelectionLanguageEntity(entity)),
    [entityDefinitions],
  );
  const operations = useMemo(() => reflectConsoleOperations(options.entities), [options.entities]);
  const durableOperationIds = useMemo(
    () =>
      new Set(
        options.entities.flatMap(source =>
          'domain' in source
            ? Object.values(source.domain).flatMap(operation =>
                operation.durable ? [operation.id] : [],
              )
            : [],
        ),
      ),
    [options.entities],
  );
  const identityKey = JSON.stringify(
    executionIdentityCacheKey(options.identity ?? anonymousExecutionIdentity),
  );
  const commandEntityNames = useMemo(
    () =>
      options.entities.flatMap(entity => ('definition' in entity ? [entity.definition.name] : [])),
    [options.entities],
  );
  const commandCapabilities = useConsoleCommandCapabilities(
    runtimeTransport,
    identityKey,
    commandEntityNames,
  );
  const commands = useMemo(
    () =>
      options.entities.flatMap(entity =>
        'definition' in entity
          ? [
              {
                entityName: entity.definition.name,
                actions: commandCapabilities(entity.definition.name)?.actions ?? [],
                selectionActions:
                  commandCapabilities(entity.definition.name)?.selectionActions ?? [],
                affordances: commandCapabilities(entity.definition.name)?.affordances,
                relationshipAffordances: commandCapabilities(entity.definition.name)
                  ?.relationshipAffordances,
              },
            ]
          : [],
      ),
    [commandCapabilities, options.entities],
  );
  const initialTerminal = options.initialDialect === 'declarative' ? '' : '.many()';
  const initialDocument =
    options.initialDocument ?? (baseEntities[0] ? baseEntities[0].name + initialTerminal : '');
  const [{ document, dialect }, setDraft] = useState({
    document: initialDocument,
    dialect: options.initialDialect ?? 'ts',
  });
  const [storedResult, setStoredResult] = useState<{
    readonly identityKey: string;
    readonly result: ConsoleResult;
  }>();
  const result: ConsoleResult =
    storedResult?.identityKey === identityKey ? storedResult.result : { status: 'idle' };
  const setResult = (update: SetStateAction<ConsoleResult>) =>
    setStoredResult(previous => ({
      identityKey,
      result:
        typeof update === 'function'
          ? update(previous?.identityKey === identityKey ? previous.result : { status: 'idle' })
          : update,
    }));
  const [resultMode, setResultMode] = useState<ConsoleResultMode>('visual');
  const [holeInputs, setHoleInputs] = useState<Readonly<Record<string, unknown>>>({});
  const [activeDurableRun, setActiveDurableRun] = useState<TaskRunIdentity>();
  const viewRef = useRef<EditorView>();
  const executingRef = useRef<AbortController>();
  const observationRef = useRef<{
    controller: AbortController;
    iterator: AsyncIterator<RuntimeProtocolGraphObservationBody>;
  }>();
  const [observation, setObservation] = useState<{
    status: 'observing' | 'stopped' | 'completed';
    updates: number;
  }>();
  const stopObservation = () => {
    const active = observationRef.current;
    if (!active) return;
    observationRef.current = undefined;
    active.controller.abort();
    if (executingRef.current === active.controller) executingRef.current = undefined;
    void Promise.resolve(active.iterator.return?.()).catch(() => undefined);
    setObservation(previous => previous && { ...previous, status: 'stopped' });
    setResult(previous => ({
      status: previous.snapshot ? 'success' : 'idle',
      snapshot: previous.snapshot,
    }));
  };
  useEffect(() => () => stopObservation(), [runtimeTransport, clientCache, identityKey]);

  useEffect(() => {
    setStoredResult(undefined);
    setObservation(undefined);
    setActiveDurableRun(undefined);
    return () => {
      executingRef.current?.abort();
      executingRef.current = undefined;
    };
  }, [identityKey]);
  const exchange = useMemo(
    () =>
      runtimeTransport ? createRuntimeProtocolExchange({ transport: runtimeTransport }) : undefined,
    [runtimeTransport],
  );
  const draftSyntax = useMemo(
    () => parseConsoleDocument(document, dialect).syntax.expression,
    [document, dialect],
  );
  const discoveryTarget =
    resolveConsoleContext(draftSyntax, { entities: baseEntities })?.name ??
    draftSyntax?.entity?.text;
  const discovery = useConsoleReadCapabilities(
    runtimeTransport,
    discoveryTarget,
    identityKey,
    baseEntities.map(entity => entity.name),
  );
  const application = useMemo(
    () => ({
      ...reflectConsoleApplicationVariants(baseEntities, discovery.variants),
      operations,
      commands,
    }),
    [baseEntities, discovery.variants, operations, commands],
  );
  const analysis = useMemo(
    () => analyzeConsoleDocument(document, application, { limit, dialect }),
    [application, document, limit, dialect],
  );
  const openApplication =
    analysis.openExecution?.family === 'graph.read' ? analysis.openExecution.body : undefined;
  const holeIds = openApplication ? graphReadApplicationHoles(openApplication) : [];
  const referenceHoles = useMemo(
    () =>
      new Map(
        openApplication
          ? holeIds.flatMap(holeId => {
              const reference = referenceHole(openApplication, entityDefinitions, holeId);
              return reference ? [[holeId, reference] as const] : [];
            })
          : [],
      ),
    [openApplication, entityDefinitions],
  );
  const booleanHoles = useMemo(
    () =>
      new Map(
        openApplication
          ? holeIds.flatMap(holeId => {
              const definition = booleanHole(openApplication, entityDefinitions, holeId);
              return definition ? [[holeId, definition] as const] : [];
            })
          : [],
      ),
    [openApplication, entityDefinitions],
  );
  const holeDescriptions = useMemo(
    () =>
      new Map(
        openApplication
          ? holeIds.flatMap(holeId => {
              const description = holeDescription(openApplication, entityDefinitions, holeId);
              return description ? [[holeId, description] as const] : [];
            })
          : [],
      ),
    [openApplication, entityDefinitions],
  );
  const preparedOpenRead = useMemo(
    () => prepareOpenGraphRead(openApplication, entityDefinitions, holeInputs),
    [openApplication, entityDefinitions, holeInputs],
  );
  const effectiveExecution = analysis.execution ?? preparedOpenRead.execution;
  const durableInvocation =
    analysis.execution?.family === 'operation' &&
    durableOperationIds.has(analysis.execution.body.operationId);
  const entityName = resolveConsoleContext(analysis.syntax.expression, application)?.name;
  const targetDiscovery = discovery.forEntity(entityName);

  const runDocument = (source: string) => {
    if (executingRef.current || activeDurableRun) return;
    setObservation(undefined);
    const executedAnalysis = analyzeConsoleDocument(source, application, {
      limit,
      dialect: viewRef.current?.state.field(consoleExpressionDialect) ?? dialect,
    });
    const executedOpenApplication =
      executedAnalysis.openExecution?.family === 'graph.read'
        ? executedAnalysis.openExecution.body
        : undefined;
    const prepared = prepareOpenGraphRead(executedOpenApplication, entityDefinitions, holeInputs);
    const execution = executedAnalysis.execution ?? prepared.execution;
    if (!execution) {
      setResult(previous => ({
        snapshot: previous.snapshot,
        status: 'error',
        message:
          prepared.error ??
          (executedOpenApplication
            ? 'Complete every Hole before running it.'
            : 'Fix the Console expression before running it.'),
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

    const controller = new AbortController();
    executingRef.current = controller;
    const startedAt = performance.now();
    setResult(previous => ({ status: 'executing', snapshot: previous.snapshot }));
    const execute = async () => {
      const request = execution.family === 'graph.read' ? execution.body : undefined;
      if (request?.version === 2) {
        const response = await exchange(
          {
            family: 'graph.read',
            body: {
              version: 1,
              kind: 'graph-read-capabilities',
              entityName: request.selection.entityName,
            },
          },
          { signal: controller.signal },
        );
        if (isRecord(response) && response.kind === 'protocol-error') graphReadResult(response);
        if (
          !isRecord(response) ||
          response.kind !== 'graph-read-capabilities-result' ||
          response.entityName !== request.selection.entityName ||
          !isGraphReadCapabilities(response.capabilities)
        )
          throw new Error('This server did not return valid Graph Read capabilities.');
        if (response.capabilities.relationSelections?.version !== 2)
          throw new Error('This Graph Read provider does not support contextual Selections (v2).');
      }
      if (controller.signal.aborted) throw new Error('Console execution was cancelled.');
      if (execution.family === 'graph.read')
        return exchange(
          { family: 'graph.read', body: { ...execution.body, includeCapabilities: true } },
          { signal: controller.signal },
        );
      if (execution.family === 'graph.command')
        return exchange(execution, { signal: controller.signal });
      return exchange(execution, { signal: controller.signal });
    };
    void execute()
      .then(async response => {
        if (controller.signal.aborted) return;
        if (execution.family !== 'graph.read') {
          if (isRecord(response) && response.kind === 'protocol-error') {
            const error = response.error;
            throw new Error(
              isRecord(error) && typeof error.message === 'string'
                ? error.message
                : 'Console execution was rejected.',
            );
          }
          if (
            !isRecord(response) ||
            (execution.family === 'operation' &&
              (response.kind !== 'invocation-result' ||
                !isRecord(response.result) ||
                typeof response.result.ok !== 'boolean')) ||
            (execution.family === 'graph.command' && response.kind !== 'graph-command-result')
          )
            throw new Error(
              execution.family === 'operation'
                ? 'Operation returned an invalid result.'
                : 'Graph Command returned an invalid result.',
            );
          if (
            execution.family === 'operation' &&
            isRecord(response.result) &&
            response.result.ok !== true
          )
            throw new Error(
              typeof response.result.message === 'string'
                ? response.result.message
                : 'Operation failed.',
            );
          if (execution.family === 'graph.command')
            reconcileEntityMutationResult(clientCache, options.entities, response);
          const taskRun =
            execution.family === 'operation' ? operationTaskRunIdentity(response) : undefined;
          if (taskRun) setActiveDurableRun(taskRun);
          else await options.onActionExecuted?.({ execution, response });
          setResult({
            status: 'success',
            snapshot: {
              document: source,
              exists: false,
              execution,
              value: response,
              transport: runtimeTransport,
              durationMs: Math.max(0, performance.now() - startedAt),
            },
          });
          return;
        }
        const result = graphReadResult(response);
        const exists = executedAnalysis.syntax.expression?.terminal?.kind === 'exists-member';
        if (exists && result.value !== null && !isRecord(result.value))
          throw new Error('Graph Read exists expected an Entity record or null.');
        setResult({
          status: 'success',
          snapshot: {
            document: source,
            exists,
            execution,
            request: execution.body,
            ...result,
            // Match the application Graph Read exists intent over nullable get.
            value: exists ? result.value !== null : result.value,
            transport: runtimeTransport,
            route: discovery.route,
            durationMs: Math.max(0, performance.now() - startedAt),
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ConsoleGraphReadError && error.code === 'access_denied')
          discovery.refresh();
        setResult(previous => ({
          snapshot:
            previous.snapshot &&
            error instanceof ConsoleGraphReadError &&
            error.code === 'access_denied'
              ? { ...previous.snapshot, capabilities: undefined }
              : previous.snapshot,
          status: 'error',
          message: error instanceof Error ? error.message : 'Graph Read failed.',
        }));
      })
      .finally(() => {
        if (executingRef.current === controller) executingRef.current = undefined;
      });
  };

  const observeDisabledReason = () => {
    if (!runtimeTransport?.graph)
      return 'The configured transport does not support query observation.';
    if (!analysis.request) return 'Fix the Console expression before observing it.';
    if (analysis.request.version !== 1)
      return 'Contextual Selections (v2) do not support observation yet.';
    if (analysis.request.mode !== 'run' || analysis.request.cardinality === 'one')
      return 'Observe requires a many query.';
    if (result.status === 'executing' || observation?.status === 'observing')
      return 'Stop the observation or wait for Run to finish.';
    return undefined;
  };
  const observe = () => {
    if (executingRef.current || observeDisabledReason()) return;
    const source = viewRef.current?.state.doc.toString() ?? document;
    const request = analyzeConsoleDocument(source, application, {
      limit,
      dialect: viewRef.current?.state.field(consoleExpressionDialect) ?? dialect,
    }).request;
    if (
      !request ||
      request.version !== 1 ||
      request.mode !== 'run' ||
      request.cardinality === 'one' ||
      !runtimeTransport?.graph
    )
      return;
    const controller = new AbortController();
    const startedAt = performance.now();
    executingRef.current = controller;
    setObservation({ status: 'observing', updates: 0 });
    setResult(previous => ({ status: 'executing', snapshot: previous.snapshot }));
    // Freeze the submitted read, authority and cache; later editor changes remain drafts.
    const reflected = application.entities.find(
      entity => entity.name === request.selection.entityName,
    );
    const entity = entityDefinitions.find(
      entity =>
        entity.name === (reflected?.variant?.baseEntityName ?? request.selection.entityName),
    );
    void (async () => {
      let updates = 0;
      try {
        // Observation frames carry rows only; use the separate capability discovery request.
        const iterator = runtimeTransport
          .graph!.observe(request, { signal: controller.signal })
          [Symbol.asyncIterator]();
        observationRef.current = { controller, iterator };
        for await (const response of { [Symbol.asyncIterator]: () => iterator }) {
          if (controller.signal.aborted) break;
          const snapshot = graphReadResult(response);
          if (!Array.isArray(snapshot.value) || !snapshot.value.every(isRecord))
            throw new Error('Graph observation expected an array of Entity records.');
          if (clientCache && entity)
            clientCache.normalizeOutput(
              graphOutput.array(graphOutput.entity(entity)),
              snapshot.value,
            );
          if (controller.signal.aborted) break;
          updates += 1;
          setObservation({ status: 'observing', updates });
          setResult({
            status: 'success',
            snapshot: {
              document: source,
              exists: false,
              observed: true,
              execution: { family: 'graph.read', body: request },
              request,
              ...snapshot,
              transport: runtimeTransport,
              route: discovery.route,
              durationMs: Math.max(0, performance.now() - startedAt),
            },
          });
        }
        if (!controller.signal.aborted) {
          setObservation({ status: 'completed', updates });
          setResult(previous => ({
            status: previous.snapshot ? 'success' : 'idle',
            snapshot: previous.snapshot,
          }));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ConsoleGraphReadError && error.code === 'access_denied')
          discovery.refresh();
        setObservation({ status: 'stopped', updates });
        setResult(previous => ({
          status: 'error',
          snapshot: previous.snapshot,
          message: error instanceof Error ? error.message : 'Query observation failed.',
        }));
      } finally {
        controller.abort();
        if (observationRef.current?.controller === controller) observationRef.current = undefined;
        if (executingRef.current === controller) executingRef.current = undefined;
      }
    })();
  };
  const run = () => runDocument(viewRef.current?.state.doc.toString() ?? document);
  const changeDialect = (nextDialect: ConsoleDialect, focus = true): boolean => {
    const view = viewRef.current;
    if (!view) return false;
    const currentDialect = view.state.field(consoleExpressionDialect);
    if (nextDialect === currentDialect) return true;
    const source = view.state.doc.toString();
    const converted =
      source.trim() === ''
        ? source
        : convertConsoleDocument(source, application, nextDialect, {
            limit,
            dialect: currentDialect,
          });
    if (converted === undefined) return false;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: converted },
      effects: setConsoleExpressionDialect.of(nextDialect),
      annotations: isolateHistory.of('full'),
      userEvent: 'input.console-dialect',
    });
    if (focus) view.focus();
    setPreferenceNotice('');
    return true;
  };
  useEffect(() => {
    if (options.initialDialect) return;
    if (!changeDialect(preferredDialect ?? 'ts', false)) {
      setPreferenceNotice(
        'Preferred dialect changed; this incomplete draft keeps its current dialect. Fix it and use the Console switch to convert.',
      );
    }
  }, [preferredDialect, options.initialDialect]);
  const snapshot = result.snapshot;
  const snapshotRequest = snapshot?.request;
  const orderingCapabilities = targetDiscovery.capabilities;
  const orderableFields = discovery.orderableFields;
  const orderingCompletionNotice = () => {
    const syntax = analysis.syntax.expression;
    const entityName = resolveConsoleContext(syntax, application)?.name;
    if (!syntax?.orderBy || !application.entities.some(entity => entity.name === entityName))
      return null;
    if (!runtimeTransport) return 'Ordering suggestions require a configured Runtime Transport.';
    if (targetDiscovery.loading) return 'Loading ordering permissions…';
    if (targetDiscovery.error) return `Ordering permissions unavailable: ${targetDiscovery.error}`;
    return orderingCapabilities?.orderBy.length === 0
      ? 'The current Graph Read policy allows no ordering Fields for this Entity.'
      : null;
  };
  const resultEntity = application.entities.find(
    entity => entity.name === snapshotRequest?.selection.entityName,
  );
  const sortDisabledReason = (fieldName: string): string | undefined => {
    if (observation?.status === 'observing')
      return 'Stop observing before changing the executed query.';
    if (result.status === 'executing') return 'Wait for the current query to finish.';
    if (!exchange) return 'Ordering requires a configured Runtime Transport.';
    if (snapshot?.transport !== runtimeTransport || snapshot?.route !== discovery.route)
      return 'Run the query to refresh ordering permissions for this transport.';
    if (
      !snapshotRequest ||
      !orderingCapabilities ||
      entityName !== snapshotRequest.selection.entityName
    )
      return 'Ordering permissions unavailable for the current Entity.';
    if (!orderingCapabilities.orderBy.includes(fieldName))
      return `Ordering by ${snapshotRequest.selection.entityName}.${fieldName} is not allowed by the Graph Read policy.`;
    if (!analysis.request) return 'Fix the Console expression before changing ordering.';
    if (
      snapshotRequest.mode !== 'run' ||
      analysis.request.mode !== 'run' ||
      analysis.request.selection.entityName !== snapshotRequest.selection.entityName
    )
      return 'Run a many query for the current Entity before changing ordering.';
    return undefined;
  };
  const sortBy = (fieldName: string) => {
    const view = viewRef.current;
    if (sortDisabledReason(fieldName) || !view || executingRef.current) return;
    const source = view.state.doc.toString();
    const request = analyzeConsoleDocument(source, application, { limit, dialect }).request;
    if (
      request?.mode !== 'run' ||
      request.selection.entityName !== snapshotRequest?.selection.entityName
    )
      return;
    const nextOrder = nextConsoleOrder(request.orderBy[0], fieldName);
    const changes = editConsoleOrderBy(source, application, nextOrder, { dialect });
    if (!changes) return;
    view.dispatch({
      changes,
      annotations: isolateHistory.of('full'),
      userEvent: 'input.console-sort',
    });
    runDocument(view.state.doc.toString());
  };

  const limitDisabledReason = () => {
    if (observation?.status === 'observing')
      return 'Stop observing before changing the executed query.';
    if (result.status === 'executing') return 'Wait for the current query to finish.';
    if (
      !exchange ||
      snapshot?.transport !== runtimeTransport ||
      snapshot?.route !== discovery.route
    )
      return 'Run the query with the current Runtime Transport before changing its limit.';
    if (!analysis.request) return 'Fix the Console expression before changing its limit.';
    if (
      analysis.request.mode !== 'run' ||
      analysis.request.selection.entityName !== snapshotRequest?.selection.entityName
    )
      return 'Run a many query for the current Entity before changing its limit.';
    return undefined;
  };
  const changeLimit = (nextLimit: number) => {
    const view = viewRef.current;
    if (limitDisabledReason() || !view || executingRef.current) return;
    const source = view.state.doc.toString();
    const request = analyzeConsoleDocument(source, application, { limit, dialect }).request;
    if (
      request?.mode !== 'run' ||
      request.selection.entityName !== snapshotRequest?.selection.entityName
    )
      return;
    const changes = editConsoleLimit(source, application, nextLimit, { dialect });
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
            <span style={styles.consoleHint}>Read · Command · Operation · Mod-Enter to run</span>
          </span>
          <span style={styles.consoleResultControls}>
            <fieldset style={{ ...styles.modes, margin: 0 }} aria-label='Console dialect'>
              {(['ts', 'declarative'] as const).map(value => (
                <button
                  key={value}
                  type='button'
                  style={{ ...styles.mode, ...(dialect === value ? styles.activeMode : {}) }}
                  aria-pressed={dialect === value}
                  disabled={
                    value !== dialect &&
                    document.trim() !== '' &&
                    !analysis.execution &&
                    !analysis.openExecution
                  }
                  title={
                    !analysis.execution && !analysis.openExecution && document.trim() !== ''
                      ? 'Fix the expression before switching dialect. Your draft will be kept.'
                      : 'Convert syntax without running the query. Undo restores the original text and dialect.'
                  }
                  onClick={() => changeDialect(value)}
                >
                  {value === 'ts' ? 'TS' : 'Declarative'}
                </button>
              ))}
            </fieldset>
            <button
              type='button'
              style={{
                ...styles.primaryButton,
                ...(!effectiveExecution ||
                result.status === 'executing' ||
                observation?.status === 'observing' ||
                activeDurableRun
                  ? styles.disabledButton
                  : {}),
              }}
              disabled={
                !effectiveExecution ||
                result.status === 'executing' ||
                observation?.status === 'observing' ||
                Boolean(activeDurableRun)
              }
              title={
                durableInvocation
                  ? 'Start this durable Operation and observe its run until it finishes.'
                  : undefined
              }
              onClick={run}
            >
              {activeDurableRun
                ? 'Observing…'
                : result.status === 'executing' && observation?.status !== 'observing'
                  ? durableInvocation
                    ? 'Starting…'
                    : 'Running…'
                  : durableInvocation
                    ? 'Start & observe'
                    : 'Run'}
            </button>
            {durableInvocation ? null : observation?.status === 'observing' ? (
              <button type='button' style={styles.primaryButton} onClick={stopObservation}>
                Stop
              </button>
            ) : (
              <button
                type='button'
                style={{
                  ...styles.primaryButton,
                  ...(observeDisabledReason() ? styles.disabledButton : {}),
                }}
                disabled={Boolean(observeDisabledReason())}
                title={observeDisabledReason() ?? 'Observe this query until stopped.'}
                onClick={observe}
              >
                Observe
              </button>
            )}
          </span>
        </div>
        <ConsoleEditor
          application={application}
          dialect={dialect}
          label='Ontahí Console expression'
          limit={limit}
          onChange={(document, dialect) => setDraft({ document, dialect })}
          orderableFields={orderableFields}
          run={run}
          value={document}
          viewRef={viewRef}
        />
        {holeIds.length > 0 ? (
          <div style={styles.consoleHoleBindings} aria-label='Graph Read Hole values'>
            {holeIds.map(holeId => {
              const setHoleInput = (value: unknown) =>
                setHoleInputs(previous => ({ ...previous, [holeId]: value }));
              return (
                <div key={holeId} style={styles.consoleHoleRow}>
                  <span style={styles.consoleHoleLabel}>{holeId}</span>
                  <div style={styles.consoleHoleControl}>
                    {referenceHoles.has(holeId) ? (
                      <ConsoleReferenceHoleInput
                        holeId={holeId}
                        reference={referenceHoles.get(holeId)!}
                        runtimeTransport={runtimeTransport}
                        identityKey={identityKey}
                        onChange={setHoleInput}
                      />
                    ) : booleanHoles.has(holeId) ? (
                      <ConsoleBooleanHoleInput
                        holeId={holeId}
                        definition={booleanHoles.get(holeId)!}
                        value={consoleHoleBinding(holeInputs, holeId)}
                        onChange={setHoleInput}
                      />
                    ) : (
                      <input
                        aria-label={`Value for ${holeId}`}
                        style={styles.consoleHoleInput}
                        placeholder='value'
                        value={consoleHoleInput(holeInputs, holeId) ?? ''}
                        onChange={event => setHoleInput(event.target.value)}
                      />
                    )}
                  </div>
                  {holeDescriptions.has(holeId) ? (
                    <span
                      aria-label={`Help for ${holeId}`}
                      role='img'
                      title={holeDescriptions.get(holeId)}
                      style={styles.consoleHoleHelp}
                    >
                      ?
                    </span>
                  ) : (
                    <span aria-hidden='true' />
                  )}
                </div>
              );
            })}
            {preparedOpenRead.error ? (
              <span role='alert' style={styles.consoleDiagnostic}>
                {preparedOpenRead.error}
              </span>
            ) : null}
          </div>
        ) : null}
        <div style={styles.consoleStatus} aria-live='polite'>
          <ConsoleAnalysisStatus analysis={analysis} limit={limit} />
          {observation ? (
            <span role='status'>
              {observation.status === 'observing'
                ? 'Observing'
                : observation.status === 'completed'
                  ? 'Observation completed'
                  : 'Observation stopped'}{' '}
              · {observation.updates} updates.
              {observation.status === 'observing'
                ? ' Edits remain drafts. Stop before running another query; closing Devtools stops observation.'
                : ''}
            </span>
          ) : null}

          <span>{orderingCompletionNotice()}</span>
          {analysis.syntax.expression?.orderBy && targetDiscovery.error ? (
            <button type='button' style={styles.mode} onClick={discovery.refresh}>
              Retry ordering permissions
            </button>
          ) : null}
          {preferenceNotice ? <span>{preferenceNotice}</span> : null}
        </div>
      </div>
      <ConsoleResultPanel
        result={result}
        matchesDraft={
          JSON.stringify(result.snapshot?.execution) === JSON.stringify(effectiveExecution) &&
          result.snapshot?.exists ===
            (analysis.syntax.expression?.terminal?.kind === 'exists-member')
        }
        limit={limit}
        resultMode={resultMode}
        setResultMode={setResultMode}
        limitDisabledReason={limitDisabledReason()}
        changeLimit={changeLimit}
        ordering={{
          fields:
            resultEntity?.fields.filter(isConsoleOrderableField).map(field => field.name) ?? [],
          order: snapshotRequest?.orderBy[0],
          disabledReason: sortDisabledReason,
          onSort: sortBy,
        }}
        onDurableOperationCompleted={snapshot => {
          const execution = result.snapshot?.execution;
          if (execution?.family !== 'operation') return;
          return options.onActionExecuted?.({ execution, response: snapshot });
        }}
        onDurableObservationFinished={() => setActiveDurableRun(undefined)}
      />
    </section>
  );
};
