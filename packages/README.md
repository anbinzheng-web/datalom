# Datalom packages

Workspace packages expose stable boundaries for the Node runtime. Public cross-language data contracts live in server-generated `packages/shared/openapi.json` and `@datalom/shared/api`.

Platform research lives in `platform-*/research/` as independent `@datalom/research-*` workspace packages. Browser and analysis dependencies stay there; production platform packages must not depend on them.
