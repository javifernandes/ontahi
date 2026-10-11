import type { AnyEntityDefinition, GraphCommandRequest } from '../../../../data-graph/index.js';
import {
  graphCommandApplication,
  graphCommandApplicationHolePositions,
  lowerGraphCommandApplication,
  substituteGraphCommandApplication,
  type GraphCommandApplication,
} from '../../../../semantic-program/graph-command-application.js';
import { isRecord } from '../../../../value/object.js';
import {
  modelEntityApplicationEntityMatches,
  parseModelEntityMatchBindings,
  resolveModelEntityApplication,
  type ModelEntityCandidate,
  type ModelEntityMatch,
  type ModelEntityMatchRequest,
  type ModelEntityApplicationResolution,
} from '../read/application.js';

export type ModelGraphCommandApplicationProposal = {
  readonly application: GraphCommandApplication;
  readonly bindings: Readonly<Record<string, ModelEntityMatch>>;
};

export const modelGraphCommandApplicationEntityMatches = (
  proposal: ModelGraphCommandApplicationProposal,
  entities: readonly AnyEntityDefinition[],
): readonly ModelEntityMatchRequest[] | undefined =>
  modelEntityApplicationEntityMatches(
    graphCommandApplicationHolePositions(proposal.application),
    proposal.bindings,
    entities,
  );

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
  const bindings = parseModelEntityMatchBindings(raw.bindings, holeIds);
  if (!bindings) return undefined;
  return { application, bindings };
};

export type ModelGraphCommandApplicationResolution =
  ModelEntityApplicationResolution<GraphCommandRequest>;

export const resolveModelGraphCommandApplication = ({
  proposal,
  entities,
  candidates,
}: {
  proposal: ModelGraphCommandApplicationProposal;
  entities: readonly AnyEntityDefinition[];
  candidates: readonly ModelEntityCandidate[];
}): ModelGraphCommandApplicationResolution =>
  resolveModelEntityApplication({
    application: proposal.application,
    bindings: proposal.bindings,
    positions: graphCommandApplicationHolePositions(proposal.application),
    entities,
    candidates,
    substitute: substituteGraphCommandApplication,
    lower: lowerGraphCommandApplication,
    incompleteReason: 'The proposed command could not be completed.',
  });
