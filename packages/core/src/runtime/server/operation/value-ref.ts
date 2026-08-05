export type ServerRuntimeValueRef = {
  entity: string;
  kind: string;
  id?: ReadonlyArray<string | number | boolean | null>;
};

type RuntimeValueRefSegment = string | number | boolean | null;

export type RuntimeValueRefDeclaration<TArgs extends readonly unknown[] = readonly unknown[]> = (
  ...args: TArgs
) => ReadonlyArray<RuntimeValueRefSegment>;

export type RuntimeValueRefDeclarations = Record<string, RuntimeValueRefDeclaration<any>>;

export type BoundRuntimeValueRefs<TDeclarations extends RuntimeValueRefDeclarations> = {
  [TName in keyof TDeclarations]: (
    ...args: Parameters<TDeclarations[TName]>
  ) => ServerRuntimeValueRef;
};

export function valueRef(): RuntimeValueRefDeclaration<[]>;
export function valueRef<TArgs extends readonly unknown[]>(
  key: (...args: TArgs) => ReadonlyArray<RuntimeValueRefSegment>,
): RuntimeValueRefDeclaration<TArgs>;
export function valueRef(
  key: (...args: readonly unknown[]) => ReadonlyArray<RuntimeValueRefSegment> = () => [],
): RuntimeValueRefDeclaration {
  return key;
}

export const bindRuntimeValueRefs = <TDeclarations extends RuntimeValueRefDeclarations>(
  entity: string,
  declarations: TDeclarations,
): BoundRuntimeValueRefs<TDeclarations> =>
  Object.fromEntries(
    Object.entries(declarations).map(([kind, key]) => [
      kind,
      (...args: readonly unknown[]): ServerRuntimeValueRef => {
        const id = key(...args);
        return {
          entity,
          kind,
          ...(id.length > 0 ? { id } : {}),
        };
      },
    ]),
  ) as unknown as BoundRuntimeValueRefs<TDeclarations>;

export const normalizeOperationValueRef = (ref: ServerRuntimeValueRef) =>
  `${ref.entity}.${ref.kind}:${JSON.stringify(ref.id ?? [])}`;

export const resolveOperationValueRefs = (
  refs: ReadonlyArray<ServerRuntimeValueRef> | undefined,
): string[] => [...new Set((refs ?? []).map(normalizeOperationValueRef))];
