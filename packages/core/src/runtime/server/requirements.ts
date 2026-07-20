import type {
  OperationInput,
  OperationRequirement,
  OperationRequirementBindingContext,
} from './operation/requirement-types.js';

export const combineRequirements = <TInput extends OperationInput>(
  layerRequirements: ReadonlyArray<OperationRequirement<OperationInput>> | undefined,
  operationRequirements: ReadonlyArray<OperationRequirement<TInput>> | undefined,
): ReadonlyArray<OperationRequirement<TInput>> | undefined => {
  if (!layerRequirements?.length && !operationRequirements?.length) {
    return undefined;
  }

  return [
    ...((layerRequirements ?? []) as ReadonlyArray<OperationRequirement<TInput>>),
    ...(operationRequirements ?? []),
  ];
};

export const bindRequirements = <TInput extends OperationInput>(
  requirements: ReadonlyArray<OperationRequirement<TInput>> | undefined,
  context: OperationRequirementBindingContext,
): ReadonlyArray<OperationRequirement<TInput>> | undefined =>
  requirements?.map(requirement => requirement.bind?.(context) ?? requirement);
