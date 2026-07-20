export type ServerRuntimeValueRef = {
  entity: string;
  kind: string;
  id?: ReadonlyArray<string | number | boolean | null>;
};

export const normalizeOperationValueRef = (ref: ServerRuntimeValueRef) =>
  `${ref.entity}.${ref.kind}:${JSON.stringify(ref.id ?? [])}`;

export const resolveOperationValueRefs = (
  refs: ReadonlyArray<ServerRuntimeValueRef> | undefined,
): string[] => [...new Set((refs ?? []).map(normalizeOperationValueRef))];
