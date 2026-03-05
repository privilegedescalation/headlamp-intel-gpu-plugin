# Architecture Decision Records

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision made along with its context and consequences. ADRs are used to document the reasoning behind significant technical choices so that future contributors can understand why the system is built the way it is.

## Format

This project follows the [Nygard-style ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

- **Title**: Short noun phrase describing the decision
- **Status**: Proposed, Accepted, Deprecated, or Superseded
- **Date**: When the decision was made
- **Deciders**: Who was involved in making the decision
- **Context**: What is the issue that motivated the decision
- **Decision**: What is the change that was decided
- **Consequences**: What becomes easier or more difficult as a result
- **Alternatives Considered**: What other options were evaluated

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-react-context-state.md) | React Context for Centralized GPU State | Accepted | 2026-03-05 |
| [002](002-dual-data-fetching.md) | Dual Data Fetching Strategy (Hooks + ApiProxy) | Accepted | 2026-03-05 |
| [003](003-graceful-crd-degradation.md) | Graceful CRD Degradation | Accepted | 2026-03-05 |
| [004](004-native-view-integration.md) | Headlamp View Integration via Detail Sections and Column Processors | Accepted | 2026-03-05 |

## Creating New ADRs

1. Copy an existing ADR as a template.
2. Assign the next sequential number (e.g., `005`).
3. Fill in all sections: Status, Date, Deciders, Context, Decision, Consequences, and Alternatives Considered.
4. Set the status to `Proposed` until the team reviews and accepts the decision.
5. Update this README index table with the new entry.
6. Submit as part of a pull request for team review.

## References

- [Michael Nygard - Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR GitHub Organization](https://adr.github.io/)
- [Headlamp Plugin Development](https://headlamp.dev/docs/latest/development/plugins/)
