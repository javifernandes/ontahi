import {
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
  type GraphCommandRequest,
} from '../../../../data-graph/index.js';
import {
  graphCommandApplication,
  graphCommandApplicationHolePositions,
  lowerGraphCommandApplication,
  substituteGraphCommandApplication,
  type GraphCommandApplication,
} from '../../../../semantic-program/graph-command-application.js';
import { isRecord } from '../../../../value/object.js';
import type {
  ModelEntityCandidate,
  ModelEntityMatch,
  ModelEntityMatchRequest,
} from '../read/application.js';

export type ModelGraphCommandApplicationProposal = {
  readonly application: GraphCommandApplication;
  readonly bindings: Readonly<Record<string, ModelEntityMatch>>;
};

export const modelGraphCommandApplicationEntityMatches = (
  proposal: ModelGraphCommandApplicationProposal,
  entities: readonly AnyEntityDefinition[],
): readonly ModelEntityMatchRequest[] | undefined => {
  const requests = graphCommandApplicationHolePositions(proposal.application).map(position => {
    const entity = entities.find(item => item.name === position.entityName);
    const field = entity?.fields[position.fieldName];
    const match = proposal.bindings[position.holeId];
    return field && isReferenceFieldDefinition(field) && match
      ? { target: field.target, match }
      : undefined;
  });
  return requests.every(request => request !== undefined) ? requests : undefined;
};

export const parseModelGraphCommandApplication = (
  raw: unknown,
): ModelGraphCommandApplicationProposal | undefined => {
  if (!isRecord(raw) || !isRecord(raw.application) || !isRecord(raw.bindings)) return undefined;
  if (raw.application.kind !== 'graph-command-application' || !isRecord(raw.application.request))
    return undefined;
  const request = raw.application.request;
  if (
    request.kind !== 'graph-command' ||
    request.version !== 3 ||
    !isRecord(request.command) ||
    request.command.kind !== 'entity-mutation-command' ||
    (request.command.action !== 'update' && request.command.action !== 'delete') ||
    !isRecord(request.command.target) ||
    request.command.target.kind !== 'selection'
  )
    return undefined;
  const application = graphCommandApplication(request as GraphCommandRequest);
  let positions: ReturnType<typeof graphCommandApplicationHolePositions>;
  try {
    positions = graphCommandApplicationHolePositions(application);
  } catch {
    return undefined;
  }
  const holeIds = [...new Set(positions.map(position => position.holeId))];
  if (holeIds.length === 0) return undefined;
  const bindings: Record<string, ModelEntityMatch> = {};
  for (const holeId of holeIds) {
    const binding = raw.bindings[holeId];
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
  if (Object.keys(raw.bindings).some(key => !(key in bindings))) return undefined;
  return { application, bindings };
};

const normalized = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();

export type ModelGraphCommandApplicationResolution =
  | { readonly status: 'resolved'; readonly request: GraphCommandRequest }
  | {
      readonly status: 'choice';
      readonly prompt: string;
      readonly options: readonly { id: string; label: string; request: GraphCommandRequest }[];
    }
  | { readonly status: 'unresolved'; readonly reason: string };

export const resolveModelGraphCommandApplication = ({
  proposal,
  entities,
  candidates,
}: {
  proposal: ModelGraphCommandApplicationProposal;
  entities: readonly AnyEntityDefinition[];
  candidates: readonly ModelEntityCandidate[];
}): ModelGraphCommandApplicationResolution => {
  let applications: { application: GraphCommandApplication; labels: string[]; ids: string[] }[] = [
    { application: proposal.application, labels: [], ids: [] },
  ];
  const positions = graphCommandApplicationHolePositions(proposal.application);
  const handled = new Set<string>();
  for (const position of positions) {
    if (handled.has(position.holeId)) continue;
    handled.add(position.holeId);
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
        const substitution = substituteGraphCommandApplication(
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
    const result = lowerGraphCommandApplication(current.application, entities);
    return result.success ? [{ ...current, request: result.request }] : [];
  });
  if (lowered.length === 0)
    return { status: 'unresolved', reason: 'The proposed command could not be completed.' };
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
