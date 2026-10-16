# Domain docs

Use one shared domain context for the portal, backend, and shared schemas.

## Before exploring

Read root `GLOSSARY.md` when it exists.
Read decisions in root `docs/adr/` relevant to the work.

If either is absent, proceed silently. The domain-modeling skill creates
glossary entries and ADRs when terms or decisions are resolved.

## Layout

- `GLOSSARY.md`: shared PMS terminology.
- `docs/adr/`: shared architectural decisions, numbered sequentially.

Package boundaries do not create separate domain contexts.

## Vocabulary and decisions

Use glossary terms in issue titles, proposals, code, and tests.
If a needed concept is missing, reconsider the term or note the gap for
domain-modeling.

When a proposal contradicts an ADR, identify the ADR and explain why the
decision should be reconsidered.
