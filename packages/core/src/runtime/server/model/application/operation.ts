import {
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
  type AnyReferenceFieldDefinition,
  type GraphJsonSchema,
  type GraphSchemaDefinition,
} from '../../../../data-graph/index.js';
import {
  lowerOperationApplication,
  operationApplicationHoles,
  substituteOperationApplication,
  type OperationApplication,
  type OperationApplicationContract,
} from '../../../../semantic-program/operation-application.js';
import { hasOwn, isRecord } from '../../../../value/object.js';
import type { ModelEntityCandidate, ModelEntityMatch } from '../read/application.js';

export type ModelOperationApplicationProposal = {
  readonly application: OperationApplication;
  readonly bindings: Readonly<Record<string, ModelOperationApplicationHoleBinding>>;
};

export type ModelOperationApplicationHoleBinding =
  | ModelEntityMatch
  | { readonly kind: 'entity-choice'; readonly prompt: string }
  | { readonly kind: 'free-input'; readonly prompt: string };

const holeSchema: GraphJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'id'],
  properties: { kind: { const: 'hole' }, id: { type: 'string', minLength: 1, maxLength: 100 } },
};

export const modelOperationApplicationSchema = (
  operationId: string,
  input: GraphJsonSchema,
): GraphJsonSchema => {
  const properties = input.properties ?? {};
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'operationId', 'arguments'],
    properties: {
      kind: { const: 'operation-application' },
      operationId: { const: operationId },
      arguments: {
        type: 'object',
        additionalProperties: false,
        required: input.required ?? [],
        properties: Object.fromEntries(
          Object.entries(properties).map(([name, schema]) => [
            name,
            {
              anyOf: [
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['kind', 'value'],
                  properties: { kind: { const: 'value' }, value: schema },
                },
                holeSchema,
              ],
            },
          ]),
        ),
      },
    },
  };
};

export const parseModelOperationApplication = (
  raw: unknown,
): ModelOperationApplicationProposal | undefined => {
  if (!isRecord(raw) || !isRecord(raw.application) || !isRecord(raw.bindings)) return undefined;
  const value = raw.application;
  if (
    value.kind !== 'operation-application' ||
    typeof value.operationId !== 'string' ||
    !value.operationId ||
    !isRecord(value.arguments)
  )
    return undefined;
  const args = Object.entries(value.arguments);
  if (
    args.some(
      ([, argument]) =>
        !isRecord(argument) ||
        (argument.kind !== 'hole' && (argument.kind !== 'value' || !hasOwn(argument, 'value'))),
    )
  )
    return undefined;
  const application = value as OperationApplication;
  const holes = operationApplicationHoles(application);
  if (!holes.length) return undefined;
  const bindings: Record<string, ModelOperationApplicationHoleBinding> = {};
  for (const holeId of holes) {
    const binding = raw.bindings[holeId];
    if (
      !isRecord(binding) ||
      !(
        (Object.keys(binding).length === 2 &&
          binding.kind === 'entity-match' &&
          typeof binding.text === 'string' &&
          binding.text.trim()) ||
        (Object.keys(binding).length === 2 &&
          (binding.kind === 'entity-choice' || binding.kind === 'free-input') &&
          typeof binding.prompt === 'string' &&
          binding.prompt.trim())
      )
    )
      return undefined;
    bindings[holeId] = binding as ModelOperationApplicationHoleBinding;
  }
  return Object.keys(raw.bindings).some(key => !(key in bindings))
    ? undefined
    : { application, bindings };
};

export type ModelOperationMatchRequest = {
  holeId: string;
  target: AnyEntityDefinition;
  text: string;
};

export type ModelOperationChoiceRequest = {
  holeId: string;
  target: AnyEntityDefinition;
};

const referenceTargetForHole = (
  proposal: ModelOperationApplicationProposal,
  contract: OperationApplicationContract,
  holeId: string,
) => {
  const positions = Object.entries(proposal.application.arguments).filter(
    ([, argument]) => argument.kind === 'hole' && argument.id === holeId,
  );
  const targets = positions.map(([name]) => {
    const schema = contract.input.fields[name] as GraphSchemaDefinition | undefined;
    return schema?.kind === 'field' && isReferenceFieldDefinition(schema as never)
      ? (schema as AnyReferenceFieldDefinition).target
      : undefined;
  });
  const target = targets[0];
  return target && targets.every(candidate => candidate === target) ? target : undefined;
};

export const modelOperationApplicationEntityMatches = (
  proposal: ModelOperationApplicationProposal,
  contract: OperationApplicationContract,
): readonly ModelOperationMatchRequest[] | undefined => {
  const requests = operationApplicationHoles(proposal.application).flatMap(holeId => {
    const binding = proposal.bindings[holeId];
    if (binding?.kind !== 'entity-match') return [];
    const target = referenceTargetForHole(proposal, contract, holeId);
    return target ? { holeId, target, text: binding.text } : undefined;
  });
  return requests.every(request => request !== undefined) ? requests : undefined;
};

export const modelOperationApplicationEntityChoices = (
  proposal: ModelOperationApplicationProposal,
  contract: OperationApplicationContract,
): readonly ModelOperationChoiceRequest[] | undefined => {
  const requests = operationApplicationHoles(proposal.application).flatMap(holeId => {
    if (proposal.bindings[holeId]?.kind !== 'entity-choice') return [];
    const target = referenceTargetForHole(proposal, contract, holeId);
    return target ? [{ holeId, target }] : [undefined];
  });
  return requests.every(request => request !== undefined)
    ? (requests as readonly ModelOperationChoiceRequest[])
    : undefined;
};

export const resolveModelOperationApplication = (
  proposal: ModelOperationApplicationProposal,
  contract: OperationApplicationContract,
  candidates: Readonly<Record<string, readonly ModelEntityCandidate[]>>,
) => {
  let application = proposal.application;
  for (const holeId of operationApplicationHoles(proposal.application)) {
    const binding = proposal.bindings[holeId];
    const positions = Object.entries(application.arguments).filter(
      ([, argument]) => argument.kind === 'hole' && argument.id === holeId,
    );
    const schemas = positions.map(([name]) => contract.input.fields[name]);
    if (
      binding?.kind === 'free-input' &&
      schemas.length > 0 &&
      schemas.every(schema => {
        const definition = schema as GraphSchemaDefinition | undefined;
        return definition?.kind === 'field' && definition.fieldType === 'string';
      })
    )
      return {
        status: 'input' as const,
        prompt: binding.prompt,
        proposal: { ...proposal, application },
        candidates,
        holeId,
        input: { type: 'string' as const },
      };
    const matches = candidates[holeId] ?? [];
    if (!matches.length)
      return { status: 'unresolved' as const, reason: `No visible entity matches this request.` };
    if (matches.length > 20)
      return {
        status: 'unresolved' as const,
        reason: 'Too many matching entities. Be more specific.',
      };
    if (matches.length > 1)
      return {
        status: 'choice' as const,
        prompt:
          binding?.kind === 'entity-choice' ? binding.prompt : `Which ${holeId} did you mean?`,
        proposal: { ...proposal, application },
        candidates,
        holeId,
        options: matches.map((candidate, index) => ({
          id: `${holeId}:${index}`,
          label: candidate.label,
          candidate,
        })),
      };
    const result = substituteOperationApplication(contract, application, holeId, matches[0]!.ref);
    if (!result.success)
      return {
        status: 'unresolved' as const,
        reason: 'The proposed operation could not be completed.',
      };
    application = result.application;
  }
  const lowered = lowerOperationApplication(contract, application);
  if (!lowered.success)
    return {
      status: 'unresolved' as const,
      reason: 'The proposed operation could not be completed.',
    };
  return { status: 'resolved' as const, request: lowered.request };
};

export type ModelOperationApplicationChoice = Extract<
  ReturnType<typeof resolveModelOperationApplication>,
  { readonly status: 'choice' }
>;

export type ModelOperationApplicationInput = Extract<
  ReturnType<typeof resolveModelOperationApplication>,
  { readonly status: 'input' }
>;

export const continueModelOperationApplication = (
  choice: ModelOperationApplicationChoice,
  contract: OperationApplicationContract,
  optionId: string,
) => {
  const selected = choice.options.find(option => option.id === optionId);
  if (!selected)
    return { status: 'unresolved' as const, reason: 'The selected entity is no longer available.' };
  return resolveModelOperationApplication(choice.proposal, contract, {
    ...choice.candidates,
    [choice.holeId]: [selected.candidate],
  });
};

export const submitModelOperationApplicationInput = (
  input: ModelOperationApplicationInput,
  contract: OperationApplicationContract,
  value: string,
) => {
  const substitution = substituteOperationApplication(
    contract,
    input.proposal.application,
    input.holeId,
    value,
  );
  if (!substitution.success)
    return { status: 'unresolved' as const, reason: 'The supplied value is invalid.' };
  return resolveModelOperationApplication(
    { ...input.proposal, application: substitution.application },
    contract,
    input.candidates,
  );
};
