export type GraphSchemaLike<TValue = unknown> = {
  kind: string;
  __value?: TValue;
};

export interface GraphLiteralDefinition<TValue = string | number | boolean | null> {
  kind: 'schema.literal';
  value: TValue;
  description?: string;
  __value?: TValue;
}

export interface GraphVoidDefinition {
  kind: 'schema.void';
  __value?: void;
}
