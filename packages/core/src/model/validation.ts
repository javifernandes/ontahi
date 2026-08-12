import type { tags } from 'typia';

export type NonEmptyString = string & tags.MinLength<1>;
export type NullableNonEmptyString = NonEmptyString | null;
export type NonEmptyStringUpTo200 = NonEmptyString & tags.MaxLength<200>;
export type NonEmptyStringUpTo4000 = NonEmptyString & tags.MaxLength<4000>;
export type NonNegativeInt = number & tags.Type<'int32'> & tags.Minimum<0>;
export type PositiveInt = number & tags.Type<'int32'> & tags.Minimum<1>;
export type PositiveIntUpTo20 = PositiveInt & tags.Maximum<20>;
export type PositiveIntUpTo100 = PositiveInt & tags.Maximum<100>;
