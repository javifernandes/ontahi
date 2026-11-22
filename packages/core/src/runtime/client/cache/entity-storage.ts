import type { AnyEntityRef } from '../../../model/entity/ref/model.js';

import type { GraphClientCacheEntityRecord } from './records.js';

export const createGraphClientEntityStorage = () => {
  const recordsByCanonicalRef = new Map<string, GraphClientCacheEntityRecord>();
  const canonicalKeysByAliasRef = new Map<string, string>();
  const refsByKey = new Map<string, AnyEntityRef>();
  const aliasKeysByCanonicalRef = new Map<string, Set<string>>();

  return {
    recordsByCanonicalRef,
    canonicalKeysByAliasRef,
    refsByKey,
    aliasKeysByCanonicalRef,
    clear: () => {
      recordsByCanonicalRef.clear();
      canonicalKeysByAliasRef.clear();
      refsByKey.clear();
      aliasKeysByCanonicalRef.clear();
    },
  };
};
