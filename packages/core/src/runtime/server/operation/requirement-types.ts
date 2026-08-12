export type OperationInput = object;

export type OperationRequirementBindingContext = {
  operationId?: string;
  description?: string;
  scope: string;
};

export type OperationFeatureRequirement = {
  id?: string;
  description?: string;
  defaultValue?: boolean;
  providerKey?: string;
};

export type OperationRequirement<TInput extends OperationInput = OperationInput> = {
  run: (
    input: TInput,
  ) => import('effect').Effect.Effect<
    void,
    import('./types.js').OperationFailure | import('./types.js').OperationRuntimeError
  >;
  bind?: (context: OperationRequirementBindingContext) => OperationRequirement<TInput>;
  feature?: OperationFeatureRequirement;
};
