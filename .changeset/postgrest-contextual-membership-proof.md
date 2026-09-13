---
'@ontahi/supabase': minor
---

Support contextual Selection reads through native PostgREST existence filters, including nested/self hasMany navigation, belongs-to and mapped many-to-many membership. Pass the complete receiver-owned Entity registry to the Supabase runtime. Source membership stays in the database, with independent filters and RLS per hop; final projections, count, exact-one checks and buffered streams reuse the same membership plan. Graph Read v2 hosts can explicitly enable relational Selections with per-hop policies. Physical foreign keys must match declared mappings; unsupported identifiers, inverse self-navigation, composite edges and virtual filter fields remain closed.

Fix Boolean negation serialization to valid PostgREST logic syntax, including scalar negation and nested contextual complements.
