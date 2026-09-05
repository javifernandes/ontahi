import type {
  ExchangeDiagnosticEvent,
  ObservationDiagnosticEvent,
  OntahiDiagnosticEvent,
  RuntimeDiagnosticOutcome,
} from '../diagnostics.js';

export type ExchangeStarted = Extract<ExchangeDiagnosticEvent, { kind: 'exchange.started' }>;
export type ExchangeSettled = Extract<ExchangeDiagnosticEvent, { kind: 'exchange.settled' }>;
export type ObservationStarted = Extract<
  ObservationDiagnosticEvent,
  { kind: 'observation.started' }
>;
export type ObservationSnapshot = Extract<
  ObservationDiagnosticEvent,
  { kind: 'observation.snapshot' }
>;
export type ObservationSettled = Extract<
  ObservationDiagnosticEvent,
  { kind: 'observation.settled' }
>;
export type RecordValue = Record<string, unknown>;

export type ExchangeActivity = {
  readonly id: string;
  readonly started?: ExchangeStarted;
  readonly settled?: ExchangeSettled;
  readonly at: number;
};

export type OperationProgressActivity = {
  readonly id: string;
  readonly started?: ObservationStarted;
  readonly snapshots: readonly ObservationSnapshot[];
  readonly settled?: ObservationSettled;
  readonly at: number;
};

export type ActivityEntry =
  | {
      readonly kind: 'exchange';
      readonly id: string;
      readonly at: number;
      readonly exchange: ExchangeActivity;
      readonly observation?: OperationProgressActivity;
    }
  | {
      readonly kind: 'observation';
      readonly id: string;
      readonly at: number;
      readonly observation: OperationProgressActivity;
    };

export const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const outcomeColor = (outcome: RuntimeDiagnosticOutcome | 'pending') => {
  if (outcome === 'success' || outcome === 'completed') return '#62d899';
  if (outcome === 'pending') return '#ddb45f';
  if (outcome === 'aborted' || outcome === 'consumer-closed') return '#93a69c';
  return '#ec7d78';
};

export const formatClock = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  });

export const matchesFilter = (values: Array<string | number | undefined>, filter: string) =>
  values.some(value =>
    String(value ?? '')
      .toLowerCase()
      .includes(filter),
  );

const formatInlineValue = (value: unknown) => {
  const formatted =
    typeof value === 'string' ? `"${value}"` : (JSON.stringify(value) ?? String(value));
  return formatted.length > 42 ? `${formatted.slice(0, 39)}…` : formatted;
};

export const formatSelectionExpression = (value: unknown): string => {
  if (!isRecord(value) || typeof value.kind !== 'string') return 'selection';
  if (value.kind === 'all' || value.kind === 'none') return value.kind;
  if (value.kind === 'references' && Array.isArray(value.refs)) {
    return `byRef(${value.refs.length})`;
  }
  if (value.kind === 'predicate' && typeof value.fieldName === 'string') {
    if (value.operator === 'in' && Array.isArray(value.values)) {
      return `where(${value.fieldName} in ${formatInlineValue(value.values)})`;
    }
    if (value.operator === 'isNull') return `where(${value.fieldName} is null)`;
    return `where(${value.fieldName} ${String(value.operator)} ${formatInlineValue(value.value)})`;
  }
  if ((value.kind === 'and' || value.kind === 'or') && Array.isArray(value.operands)) {
    const operator = value.kind === 'and' ? ' && ' : ' || ';
    const operands = value.operands
      .map(formatSelectionExpression)
      .map(part => (part.startsWith('where(') && part.endsWith(')') ? part.slice(6, -1) : part));
    return `where(${operands.join(operator)})`;
  }
  if (value.kind === 'not') return `not(${formatSelectionExpression(value.operand)})`;
  return `${value.kind}(…)`;
};

export const graphReadSummary = (body: RecordValue): string | undefined => {
  if (body.kind !== 'graph-read' || !isRecord(body.selection)) return undefined;
  const entity =
    typeof body.selection.entityName === 'string' ? body.selection.entityName : 'UnknownEntity';
  const clauses = [`${entity}.${formatSelectionExpression(body.selection.expression)}`];
  if (Array.isArray(body.orderBy) && body.orderBy.length > 0) {
    const ordering = body.orderBy
      .map(order =>
        isRecord(order) && typeof order.fieldName === 'string'
          ? `${order.fieldName}${typeof order.direction === 'string' ? ` ${order.direction}` : ''}`
          : undefined,
      )
      .filter((value): value is string => Boolean(value));
    if (ordering.length > 0) clauses.push(`orderBy ${ordering.join(', ')}`);
  }
  if (typeof body.limit === 'number') clauses.push(`limit ${body.limit}`);
  if (isRecord(body.view) && typeof body.view.name === 'string') {
    clauses.push(`as ${body.view.name}`);
  }
  return clauses.join(' · ');
};

const graphCommandSummary = (body: RecordValue): string | undefined => {
  if (body.kind !== 'graph-command' || !isRecord(body.command)) return undefined;
  const command = body.command;
  if (command.kind === 'entity-mutation-command') {
    const entity = typeof command.entityName === 'string' ? command.entityName : 'Entity';
    const action = typeof command.action === 'string' ? command.action : 'mutate';
    return `${entity}.${action}`;
  }
  if (
    (command.kind === 'relationship-command' ||
      command.kind === 'many-to-many-relationship-command') &&
    isRecord(command.relation)
  ) {
    const relation =
      typeof command.relation.fieldName === 'string'
        ? command.relation.fieldName
        : typeof command.relation.relationName === 'string'
          ? command.relation.relationName
          : 'relation';
    return `${relation}.${String(command.action ?? 'change')}`;
  }
  return typeof command.kind === 'string' ? command.kind : 'Graph command';
};

export const semanticSummary = (activity: ExchangeActivity): string => {
  const event = activity.started ?? activity.settled;
  const body = activity.started?.request?.body;
  if (isRecord(body)) {
    const graphRead = graphReadSummary(body);
    if (graphRead) return graphRead;
    const graphCommand = graphCommandSummary(body);
    if (graphCommand) return graphCommand;
    if (event?.family === 'operation' && typeof body.operationId === 'string') {
      return body.kind === 'check-permission'
        ? `can ${body.operationId}()`
        : `${body.operationId}()`;
    }
  }
  return event?.family ?? 'Runtime exchange';
};

export const viewFields = (view: unknown, prefix = ''): string[] => {
  if (!isRecord(view) || !isRecord(view.fields)) return [];
  return Object.entries(view.fields).flatMap(([name, field]) => {
    if (!isRecord(field)) return [`${prefix}${name}`];
    if (field.kind !== 'relation-view') return [`${prefix}${name}`];
    const nested = viewFields(field.view, `${prefix}${name}.`);
    return nested.length > 0 ? nested : [`${prefix}${name}`];
  });
};

const buildExchangeActivities = (
  events: readonly ExchangeDiagnosticEvent[],
): ExchangeActivity[] => {
  const activities = new Map<string, ExchangeActivity>();
  events.forEach(event => {
    const current = activities.get(event.exchangeId) ?? { id: event.exchangeId, at: event.at };
    activities.set(event.exchangeId, {
      ...current,
      at: Math.max(current.at, event.at),
      ...(event.kind === 'exchange.started' ? { started: event } : { settled: event }),
    });
  });
  return [...activities.values()].sort((left, right) => right.at - left.at);
};

const buildOperationProgressActivities = (
  events: readonly ObservationDiagnosticEvent[],
): OperationProgressActivity[] => {
  type MutableOperationProgressActivity = {
    id: string;
    started?: ObservationStarted;
    snapshots: ObservationSnapshot[];
    settled?: ObservationSettled;
    at: number;
  };

  const activities = new Map<string, MutableOperationProgressActivity>();
  events.forEach(event => {
    let current = activities.get(event.observationId);
    if (!current) {
      current = { id: event.observationId, snapshots: [], at: event.at };
      activities.set(event.observationId, current);
    }
    current.at = Math.max(current.at, event.at);
    if (event.kind === 'observation.started') current.started = event;
    else if (event.kind === 'observation.snapshot') current.snapshots.push(event);
    else current.settled = event;
  });
  return [...activities.values()].sort((left, right) => right.at - left.at);
};

const runKey = (run: { readonly taskId: string; readonly runId: string }) =>
  `${run.taskId}:${run.runId}`;

const exchangeTaskRun = (
  activity: ExchangeActivity,
): { readonly taskId: string; readonly runId: string } | undefined => {
  const body = activity.settled?.response?.body;
  if (!isRecord(body) || body.kind !== 'invocation-result' || !isRecord(body.result)) {
    return undefined;
  }
  const value =
    body.result.ok === true && isRecord(body.result.value) ? body.result.value : undefined;
  return value && typeof value.taskId === 'string' && typeof value.runId === 'string'
    ? { taskId: value.taskId, runId: value.runId }
    : undefined;
};

const correlateActivity = (
  exchanges: readonly ExchangeActivity[],
  observations: readonly OperationProgressActivity[],
): ActivityEntry[] => {
  const observationsByRun = new Map<string, OperationProgressActivity[]>();
  observations.forEach(observation => {
    const event = observation.started ?? observation.snapshots[0] ?? observation.settled;
    if (!event) return;
    const key = runKey(event.run);
    const grouped = observationsByRun.get(key);
    if (grouped) grouped.push(observation);
    else observationsByRun.set(key, [observation]);
  });
  const attached = new Set<string>();
  const exchangeEntries = exchanges.map<ActivityEntry>(exchange => {
    const run = exchangeTaskRun(exchange);
    const observation = run ? observationsByRun.get(runKey(run))?.[0] : undefined;
    if (observation) attached.add(observation.id);
    return {
      kind: 'exchange',
      id: `exchange:${exchange.id}`,
      at: Math.max(exchange.at, observation?.at ?? 0),
      exchange,
      ...(observation ? { observation } : {}),
    };
  });
  const observationEntries = observations
    .filter(observation => !attached.has(observation.id))
    .map<ActivityEntry>(observation => ({
      kind: 'observation',
      id: `observation:${observation.id}`,
      at: observation.at,
      observation,
    }));
  return [...exchangeEntries, ...observationEntries].sort((left, right) => right.at - left.at);
};

export const buildActivityEntries = (events: readonly OntahiDiagnosticEvent[]) =>
  correlateActivity(
    buildExchangeActivities(
      events.filter((event): event is ExchangeDiagnosticEvent =>
        event.kind.startsWith('exchange.'),
      ),
    ),
    buildOperationProgressActivities(
      events.filter((event): event is ObservationDiagnosticEvent =>
        event.kind.startsWith('observation.'),
      ),
    ),
  );

export const activityEntryEvent = (entry: ActivityEntry) =>
  entry.kind === 'exchange'
    ? (entry.exchange.settled ?? entry.exchange.started)
    : (entry.observation.settled ??
      entry.observation.snapshots[entry.observation.snapshots.length - 1] ??
      entry.observation.started);

export const activityEntryOutcome = (entry: ActivityEntry): RuntimeDiagnosticOutcome | 'pending' =>
  entry.observation?.settled?.outcome ??
  (entry.kind === 'exchange' ? entry.exchange.settled?.outcome : undefined) ??
  'pending';

export const activityEntryTitle = (entry: ActivityEntry) => {
  if (entry.kind === 'exchange') return semanticSummary(entry.exchange);
  const event =
    entry.observation.settled ??
    entry.observation.snapshots[entry.observation.snapshots.length - 1] ??
    entry.observation.started;
  return event ? `${event.run.taskId}()` : 'Runtime activity';
};
