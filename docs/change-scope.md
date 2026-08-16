# Change scope for agents and contributors

Ontahi treats code volume as an engineering constraint, not a target. Prefer the smallest useful
vertical slice for the risk being reduced.

Before implementing, identify:

1. the behavior being unlocked;
2. the primary product, architecture, runtime, data, UI, integration, or operational risk;
3. the smallest abstraction that isolates that risk;
4. infrastructure that can wait;
5. the point at which the change should split into another pull request.

Practical rules:

- Do not build the final platform when a focused proof answers the next question.
- Prefer injectable seams and in-process proofs while implementation choices remain uncertain.
- Do not mock away the risk the work is meant to explore.
- Keep public APIs smaller than their future imagination.
- Avoid scaffolding that does not participate in the current acceptance path.
- Stop and re-scope when a small feature starts requiring broad unrelated edits.
- Separate behavioral changes from mechanical file moves when practical.
- Preserve unrelated worktree changes and avoid destructive Git operations.

When reviewing a change, ask what behavior became possible, which abstractions pay rent now, and
whether the tests cover behavior rather than implementation ceremony.
