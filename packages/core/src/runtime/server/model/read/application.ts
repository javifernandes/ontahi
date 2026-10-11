import {
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
  type AnyEntityRef,
  type GraphJsonSchema,
  type GraphReadRequest,
} from '../../../../data-graph/index.js';
import {
  graphReadApplication,
  graphReadApplicationHolePositions,
  lowerGraphReadApplication,
  substituteGraphReadApplication,
  type GraphReadApplication,
} from '../../../../semantic-program/graph-read-application.js';
import { isRecord } from '../../../../value/object.js';

export type ModelEntityMatch = { readonly kind: 'entity-match'; readonly text: string };
export type ModelGraphReadApplicationProposal = {
  readonly application: GraphReadApplication;
  readonly bindings: Readonly<Record<string, ModelEntityMatch>>;
};
export type ModelEntityCandidate = {
  readonly ref: AnyEntityRef;
  readonly label: string;
  readonly aliases?: readonly string[];
};
export type ModelEntityMatchRequest = {
  readonly target: AnyEntityDefinition;
  readonly match: ModelEntityMatch;
};

type ModelApplicationHolePosition = {
  readonly holeId: string;
  readonly entityName: string;
  readonly fieldName: string;
};

export const modelEntityApplicationEntityMatches = (
  positions: readonly ModelApplicationHolePosition[],
  bindings: Readonly<Record<string, ModelEntityMatch>>,
  entities: readonly AnyEntityDefinition[],
): readonly ModelEntityMatchRequest[] | undefined => {
  const requests = positions.map(position => {
    const entity = entities.find(item => item.name === position.entityName);
    const field = entity?.fields[position.fieldName];
    const match = bindings[position.holeId];
    return field && isReferenceFieldDefinition(field) && match
      ? { target: field.target, match }
      : undefined;
  });
  return requests.every(request => request !== undefined) ? requests : undefined;
};

export const parseModelEntityMatchBindings = (
  raw: Record<string, unknown>,
  holeIds: readonly string[],
): Readonly<Record<string, ModelEntityMatch>> | undefined => {
  const bindings: Record<string, ModelEntityMatch> = {};
  for (const holeId of holeIds) {
    const binding = raw[holeId];
    if (
      !isRecord(binding) ||
      Object.keys(binding).length !== 2 ||
      binding.kind !== 'entity-match' ||
      typeof binding.text !== 'string' ||
      !binding.text.trim()
    )
      return undefined;
    bindings[holeId] = { kind: 'entity-match', text: binding.text };
  }
  return Object.keys(raw).some(key => !(key in bindings)) ? undefined : bindings;
};

export type ModelEntityApplicationResolution<TRequest> =
  | { readonly status: 'resolved'; readonly request: TRequest }
  | {
      readonly status: 'choice';
      readonly prompt: string;
      readonly options: readonly { id: string; label: string; request: TRequest }[];
    }
  | { readonly status: 'unresolved'; readonly reason: string };

export const resolveModelEntityApplication = <TApplication, TRequest>({
  application,
  bindings,
  positions,
  entities,
  candidates,
  substitute,
  lower,
  incompleteReason,
}: {
  application: TApplication;
  bindings: Readonly<Record<string, ModelEntityMatch>>;
  positions: readonly ModelApplicationHolePosition[];
  entities: readonly AnyEntityDefinition[];
  candidates: readonly ModelEntityCandidate[];
  substitute: (
    application: TApplication,
    entities: readonly AnyEntityDefinition[],
    holeId: string,
    value: AnyEntityRef,
  ) => { readonly success: true; readonly application: TApplication } | { readonly success: false };
  lower: (
    application: TApplication,
    entities: readonly AnyEntityDefinition[],
  ) => { readonly success: true; readonly request: TRequest } | { readonly success: false };
  incompleteReason: string;
}): ModelEntityApplicationResolution<TRequest> => {
  let applications: { application: TApplication; labels: string[]; ids: string[] }[] = [
    { application, labels: [], ids: [] },
  ];
  const handled = new Set<string>();
  for (const position of positions) {
    if (handled.has(position.holeId)) continue;
    handled.add(position.holeId);
    const entity = entities.find(item => item.name === position.entityName);
    const field = entity?.fields[position.fieldName];
    if (!field || !isReferenceFieldDefinition(field))
      return { status: 'unresolved', reason: `Cannot resolve ${position.fieldName} as an entity.` };
    const hint = bindings[position.holeId]!;
    const needle = normalized(hint.text);
    const matches = candidates.filter(candidate => {
      if (candidate.ref.entityName !== field.target.name) return false;
      return [candidate.label, ...(candidate.aliases ?? [])].some(
        value => normalized(value) === needle,
      );
    });
    if (matches.length === 0)
      return {
        status: 'unresolved',
        reason: `No visible ${field.target.name} matches “${hint.text}”.`,
      };
    if (applications.length > 20 / matches.length)
      return { status: 'unresolved', reason: 'Too many matching entities. Be more specific.' };
    applications = applications.flatMap(current =>
      matches.flatMap(candidate => {
        const result = substitute(current.application, entities, position.holeId, candidate.ref);
        return result.success
          ? [
              {
                application: result.application,
                labels: [...current.labels, candidate.label],
                ids: [...current.ids, JSON.stringify(candidate.ref)],
              },
            ]
          : [];
      }),
    );
  }
  const lowered = applications.flatMap(current => {
    const result = lower(current.application, entities);
    return result.success ? [{ ...current, request: result.request }] : [];
  });
  if (lowered.length === 0) return { status: 'unresolved', reason: incompleteReason };
  if (lowered.length === 1) return { status: 'resolved', request: lowered[0]!.request };
  return {
    status: 'choice',
    prompt: 'Which matching entity did you mean?',
    options: lowered.slice(0, 20).map(item => ({
      id: item.ids.join('|'),
      label: item.labels.join(' · '),
      request: item.request,
    })),
  };
};

export const modelGraphReadApplicationEntityMatches = (
  proposal: ModelGraphReadApplicationProposal,
  entities: readonly AnyEntityDefinition[],
): readonly ModelEntityMatchRequest[] | undefined =>
  modelEntityApplicationEntityMatches(
    graphReadApplicationHolePositions(proposal.application),
    proposal.bindings,
    entities,
  );

const holeSchema: GraphJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'id'],
  properties: {
    kind: { const: 'hole' },
    id: { type: 'string', minLength: 1, maxLength: 100 },
  },
};

const isRefSchema = (schema: GraphJsonSchema): boolean => {
  if (!('properties' in schema) || !isRecord(schema.properties)) return false;
  const kind = schema.properties.kind;
  return isRecord(kind) && kind.const === 'entity-ref';
};

/** Adds a Hole alternative wherever an advertised request accepts an Entity Ref. */
export const openModelEntityReferenceSchema = (schema: GraphJsonSchema): GraphJsonSchema => {
  if (isRefSchema(schema)) return { anyOf: [schema, holeSchema] };
  if ('anyOf' in schema && Array.isArray(schema.anyOf))
    return { ...schema, anyOf: schema.anyOf.map(openModelEntityReferenceSchema) };
  if ('properties' in schema && isRecord(schema.properties))
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [
          key,
          openModelEntityReferenceSchema(value as GraphJsonSchema),
        ]),
      ),
    };
  if ('items' in schema && isRecord(schema.items))
    return { ...schema, items: openModelEntityReferenceSchema(schema.items as GraphJsonSchema) };
  return schema;
};

export const parseModelGraphReadApplication = (
  raw: unknown,
): ModelGraphReadApplicationProposal | undefined => {
  if (!isRecord(raw) || !isRecord(raw.application) || !isRecord(raw.bindings)) return undefined;
  if (raw.application.kind !== 'graph-read-application' || !isRecord(raw.application.request))
    return undefined;
  const request = raw.application.request;
  if (
    request.kind !== 'graph-read' ||
    request.version !== 1 ||
    (request.mode !== 'run' && request.mode !== 'count') ||
    !isRecord(request.selection) ||
    request.selection.kind !== 'selection' ||
    typeof request.selection.entityName !== 'string' ||
    !isRecord(request.selection.expression)
  )
    return undefined;
  const application = graphReadApplication(request as GraphReadApplication['request']);
  let holes: ReturnType<typeof graphReadApplicationHolePositions>;
  try {
    holes = graphReadApplicationHolePositions(application);
  } catch {
    return undefined;
  }
  if (holes.length === 0 || new Set(holes.map(hole => hole.holeId)).size !== holes.length)
    return undefined;
  const bindings = parseModelEntityMatchBindings(
    raw.bindings,
    holes.map(hole => hole.holeId),
  );
  if (!bindings) return undefined;
  return { application, bindings };
};

const normalized = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();

export type ModelGraphReadApplicationResolution =
  ModelEntityApplicationResolution<GraphReadRequest>;

export const resolveModelGraphReadApplication = ({
  proposal,
  entities,
  candidates,
}: {
  proposal: ModelGraphReadApplicationProposal;
  entities: readonly AnyEntityDefinition[];
  candidates: readonly ModelEntityCandidate[];
}): ModelGraphReadApplicationResolution =>
  resolveModelEntityApplication({
    application: proposal.application,
    bindings: proposal.bindings,
    positions: graphReadApplicationHolePositions(proposal.application),
    entities,
    candidates,
    substitute: substituteGraphReadApplication,
    lower: lowerGraphReadApplication,
    incompleteReason: 'The proposed read could not be completed.',
  });
