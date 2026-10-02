import type { TaskChoiceInteractionRequest } from '../runtime/server/tasks/types.js';

import type {
  OperationApplicationHoleResolution,
  OperationApplicationResolutionCandidate,
} from './operation-application-resolution.js';
import {
  operationApplicationHoles,
  substituteOperationApplication,
  type OperationApplication,
  type OperationApplicationContract,
  type OperationApplicationSubstitutionResult,
} from './operation-application.js';

type OperationApplicationChoiceResolution = Extract<
  OperationApplicationHoleResolution,
  { readonly status: 'choice' }
>;

export type OperationApplicationCandidatePresentation = {
  readonly id: string;
  readonly label: string;
};

export type OperationApplicationChoicePresentation = {
  readonly prompt: string;
  readonly presentCandidate: (
    candidate: OperationApplicationResolutionCandidate,
    index: number,
  ) => OperationApplicationCandidatePresentation;
};

export type PreparedOperationApplicationChoice = {
  readonly kind: 'operation-application-choice';
  readonly application: OperationApplication;
  readonly holeId: string;
  readonly prompt: string;
  readonly options: readonly (OperationApplicationCandidatePresentation & {
    readonly candidate: OperationApplicationResolutionCandidate;
  })[];
};

export type OperationApplicationFormProjection = {
  readonly kind: 'form';
  readonly fields: readonly [
    {
      readonly kind: 'choice';
      readonly name: string;
      readonly label: string;
      readonly required: true;
      readonly options: readonly OperationApplicationCandidatePresentation[];
    },
  ];
};

export type OperationApplicationChoiceSelectionResult =
  | {
      readonly success: true;
      readonly application: OperationApplication;
      readonly candidate: OperationApplicationResolutionCandidate;
    }
  | {
      readonly success: false;
      readonly reason: 'unknown-option';
      readonly optionId: string;
    }
  | Extract<OperationApplicationSubstitutionResult, { readonly success: false }>;

const assertPresentation = (
  presentation: OperationApplicationCandidatePresentation,
  seen: Set<string>,
) => {
  if (presentation.id.trim().length === 0)
    throw new Error('Operation application choice option id must not be empty.');
  if (presentation.label.trim().length === 0)
    throw new Error('Operation application choice option label must not be empty.');
  if (seen.has(presentation.id))
    throw new Error(`Duplicate Operation application choice option id "${presentation.id}".`);
  seen.add(presentation.id);
};

export const prepareOperationApplicationChoice = (
  application: OperationApplication,
  resolution: OperationApplicationChoiceResolution,
  presentation: OperationApplicationChoicePresentation,
): PreparedOperationApplicationChoice => {
  if (presentation.prompt.trim().length === 0)
    throw new Error('Operation application choice prompt must not be empty.');
  if (resolution.candidates.length < 2)
    throw new Error('Operation application choice requires at least two candidates.');
  if (!operationApplicationHoles(application).includes(resolution.holeId))
    throw new Error(
      `Operation application choice Hole "${resolution.holeId}" is not open in ${application.operationId}.`,
    );

  const seen = new Set<string>();
  const options = resolution.candidates.map((candidate, index) => {
    const projected = presentation.presentCandidate(candidate, index);
    assertPresentation(projected, seen);
    return { ...projected, candidate };
  });

  return {
    kind: 'operation-application-choice',
    application,
    holeId: resolution.holeId,
    prompt: presentation.prompt,
    options,
  };
};

export const projectOperationApplicationChoiceToForm = (
  choice: PreparedOperationApplicationChoice,
): OperationApplicationFormProjection => ({
  kind: 'form',
  fields: [
    {
      kind: 'choice',
      name: choice.holeId,
      label: choice.prompt,
      required: true,
      options: choice.options.map(({ id, label }) => ({ id, label })),
    },
  ],
});

export const projectOperationApplicationChoiceToTaskInteraction = (
  choice: PreparedOperationApplicationChoice,
): TaskChoiceInteractionRequest<OperationApplicationResolutionCandidate> => ({
  id: `${choice.application.operationId}:${choice.holeId}`,
  prompt: choice.prompt,
  options: choice.options.map(({ id, label, candidate }) => ({ id, label, value: candidate })),
});

export const selectOperationApplicationChoice = (
  contract: OperationApplicationContract,
  choice: PreparedOperationApplicationChoice,
  optionId: string,
): OperationApplicationChoiceSelectionResult => {
  const option = choice.options.find(candidate => candidate.id === optionId);
  if (!option) return { success: false, reason: 'unknown-option', optionId };

  const substitution = substituteOperationApplication(
    contract,
    choice.application,
    choice.holeId,
    option.candidate.value,
  );
  return substitution.success
    ? {
        success: true,
        application: substitution.application,
        candidate: option.candidate,
      }
    : substitution;
};
