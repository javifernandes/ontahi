export type EntityDisplayDescriptor = {
  primary?: string;
  secondary?: readonly string[];
  search?: readonly string[];
};

type EntityDisplayFieldPath<
  TFields extends Record<string, unknown>,
  TRelationPath extends string,
> = (keyof TFields & string) | TRelationPath;

export type EntityDisplayMetadata<
  TFields extends Record<string, unknown> = Record<string, unknown>,
  TRelationPath extends string = `${string}.${string}`,
> = {
  primary?: EntityDisplayFieldPath<TFields, TRelationPath>;
  secondary?: readonly EntityDisplayFieldPath<TFields, TRelationPath>[];
  search?: readonly EntityDisplayFieldPath<TFields, TRelationPath>[];
};

export type EntityFreshnessDescriptor = {
  hash?: string;
  updatedAt?: string;
  version?: string;
};

export type EntityFreshnessMetadata<
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = {
  hash?: keyof TFields & string;
  updatedAt?: keyof TFields & string;
  version?: keyof TFields & string;
};
