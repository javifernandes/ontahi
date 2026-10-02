import {
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
  type AnyEntityRef,
  type GraphJsonSchema,
  type GraphReadRequest,
} from '../../data-graph/index.js';
import {
  graphReadApplication,
  graphReadApplicationHolePositions,
  lowerGraphReadApplication,
  substituteGraphReadApplication,
  type GraphReadApplication,
} from '../../semantic-program/graph-read-application.js';
import { isRecord } from '../../value/object.js';

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
export const openModelGraphReadSchema = (schema: GraphJsonSchema): GraphJsonSchema => {
  if (isRefSchema(schema)) return { anyOf: [schema, holeSchema] };
  if ('anyOf' in schema && Array.isArray(schema.anyOf))
    return { ...schema, anyOf: schema.anyOf.map(openModelGraphReadSchema) };
  if ('properties' in schema && isRecord(schema.properties))
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [
          key,
          openModelGraphReadSchema(value as GraphJsonSchema),
        ]),
      ),
    };
  if ('items' in schema && isRecord(schema.items))
    return { ...schema, items: openModelGraphReadSchema(schema.items as GraphJsonSchema) };
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
  const bindings: Record<string, ModelEntityMatch> = {};
  for (const hole of holes) {
    const binding = raw.bindings[hole.holeId];
    if (
      !isRecord(binding) ||
      Object.keys(binding).length !== 2 ||
      binding.kind !== 'entity-match' ||
      typeof binding.text !== 'string' ||
      !binding.text.trim()
    )
      return undefined;
    bindings[hole.holeId] = { kind: 'entity-match', text: binding.text };
  }
  if (Object.keys(raw.bindings).some(key => !(key in bindings))) return undefined;
  return { application, bindings };
};

const normalized = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();

export type ModelGraphReadApplicationResolution =
  | { readonly status: 'resolved'; readonly request: GraphReadRequest }
  | {
      readonly status: 'choice';
      readonly prompt: string;
      readonly options: readonly { id: string; label: string; request: GraphReadRequest }[];
    }
  | { readonly status: 'unresolved'; readonly reason: string };

export const resolveModelGraphReadApplication = ({
  proposal,
  entities,
  candidates,
}: {
  proposal: ModelGraphReadApplicationProposal;
  entities: readonly AnyEntityDefinition[];
  candidates: readonly ModelEntityCandidate[];
}): ModelGraphReadApplicationResolution => {
  let applications: { application: GraphReadApplication; labels: string[]; ids: string[] }[] = [
    { application: proposal.application, labels: [], ids: [] },
  ];
  for (const position of graphReadApplicationHolePositions(proposal.application)) {
    const entity = entities.find(item => item.name === position.entityName);
    const field = entity?.fields[position.fieldName];
    if (!field || !isReferenceFieldDefinition(field))
      return { status: 'unresolved', reason: `Cannot resolve ${position.fieldName} as an entity.` };
    const hint = proposal.bindings[position.holeId];
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
        const substitution = substituteGraphReadApplication(
          current.application,
          entities,
          position.holeId,
          candidate.ref,
        );
        return substitution.success
          ? [
              {
                application: substitution.application,
                labels: [...current.labels, candidate.label],
                ids: [...current.ids, JSON.stringify(candidate.ref)],
              },
            ]
          : [];
      }),
    );
  }
  const lowered = applications.flatMap(current => {
    const result = lowerGraphReadApplication(current.application, entities);
    return result.success ? [{ ...current, request: result.request }] : [];
  });
  if (lowered.length === 0)
    return { status: 'unresolved', reason: 'The proposed read could not be completed.' };
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
