# 151a. Property Graph Storage and Query Standards

Status: research

Canonical ID: `ontahi://plans/151a-property-graph-storage-and-query-standards`

## Question

Can Ontahi execute its existing Entity/Relation model on a property graph database with the same
observable contract, and which useful graph queries would require an explicit model extension?

Keep two outcomes distinct: another storage implementation for existing applications, and new
query expressiveness such as variable-length paths and graph pattern matching. The first must not
implicitly promise the second.

This is a proposed investigation, not an implemented adapter or a statement of provider support.

## Standards and provider evidence

References checked on 2026-09-10:

- [ISO/IEC 9075-16:2023](https://webstore.iec.ch/en/publication/86055) specifies SQL Property Graph
  Queries (SQL/PGQ), part of the SQL standard.
- [ISO/IEC 39075:2024](https://www.iso.org/standard/76120.html) specifies GQL, including definition
  and manipulation of property graph structures. GQL is a published standard, not merely a proposal.
- [Neo4j GQL conformance](https://neo4j.com/docs/cypher-manual/current/appendix/gql-conformance/)
  documents Cypher's supported features and remaining gaps. Do not equate Cypher support with full
  GQL conformance.
- [TigerGraph querying choices](https://www.tigergraph.com/docs/gsql-ref/4.3/querying/query-modes)
  describes its query modes; [GSQL](https://docs.tigergraph.com/gsql-ref/4.2/querying/) is a distinct
  language. Evaluate a pinned version and its actual supported syntax rather than inferring GQL
  interoperability from participation in standardization.

## Proposed investigation

1. Choose one concrete application case whose graph traversal adds value beyond the current Todo
   path. Also retain Todo as a small portability proof.
2. Map Entity identities and locators, nullable fields, direct relations, join-table relations,
   ordered membership, and association Entities onto vertices and edges. Preserve association
   identity and lifecycle where the domain already models them as Entities.
3. Test a small Neo4j/Cypher execution prototype against a pinned real database. Record any semantic
   mismatch before considering a second provider or a common graph-language abstraction.
4. Compare current query expressiveness with variable-length paths and pattern matching. Specify
   result shape, duplicates, cycles, path identity, ordering, cardinality, and execution bounds for
   any proposed extension.
5. Evaluate one concrete SQL/PGQ implementation if it can express the same application case. Record
   exact supported standard features and versions, rather than a generic “SQL/PGQ compatible” label.
6. Produce a capability matrix and a bounded implementation proposal, or document why the current
   storage contract cannot honestly represent the required behavior.

## Acceptance

- [ ] A concrete application scenario motivates the investigation.
- [ ] A mapping specifies identity and relation semantics without silently dropping information.
- [ ] Real-provider evidence covers representative reads and atomic mutations.
- [ ] Existing semantic conformance cases identify supported behavior and explicit gaps.
- [ ] Standard features are distinguished from vendor extensions and aspirational support.
- [ ] Any new query concepts have observable semantics and a separate implementation scope.

## Non-goals and relationship to MySQL

No universal graph adapter, cross-provider federation, automatic relational-to-graph migration,
or complete GQL implementation is proposed here. TigerGraph remains an evaluation candidate, not
a committed delivery. MariaDB belongs to relational storage compatibility work.

[MySQL storage](../done/151-mysql-data-graph-storage.md) can proceed independently. Its portability
tests may inform this investigation, but graph exploration is not a prerequisite for broader SQL
database adoption.
