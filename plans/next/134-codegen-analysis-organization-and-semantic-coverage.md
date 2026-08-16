# 134. Codegen Analysis Organization And Semantic Coverage

Status: next

Canonical ID: `ontahi://plans/134-codegen-analysis-organization-and-semantic-coverage`

Related plans:

1. [133. Nominal Model Registry And Codegen Reuse](../done/133-nominal-model-registry-and-codegen-reuse.md)
2. [128. Data Graph Execution Bridge](./128-ontahi-data-graph-execution-bridge.md)

## Summary

Split Ontahi codegen's growing analyzer and renderer into focused modules while preserving the
serializable application IR, deterministic output, and semantic generated-module tests.

## Scope

1. Extract named-definition discovery and validation from `metadata-analyzer.mjs`.
2. Separate analyzed-model construction from source rendering.
3. Replace brittle generated-text assertions with semantic execution or TypeScript proofs where
   practical, retaining narrow textual checks only for syntax and import boundaries.
4. Add coverage thresholds gradually around the extracted responsibilities.
5. Keep output byte-stable or document intentional generated-artifact changes with drift updates.

## Non-Goals

1. Do not redesign Entity, Value, View, Query, Selection, or Operation APIs.
2. Do not create a server registry for caller-authored Views.
3. Do not combine this maintenance work with the remote Query/Command protocol.

## Completion Signal

This plan closes when discovery, validation, IR assembly, and rendering have explicit module
boundaries and important generated behavior is tested semantically against real Core types and
runtime values.
