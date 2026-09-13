---
'@ontahi/mysql': minor
---

Support contextual Selection reads in MySQL using the shared SQL correlated-EXISTS compiler, including nested/self navigation, set composition, many-to-many membership and final read shaping. MySQL storage now advertises Graph Read v2 relational Selection support; receivers retain per-hop grants and policy scopes. No source-ID prefetch is used. Contextual Commands, composite many-to-many identities and virtual filter fields remain unsupported.
