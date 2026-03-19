# Repository Rules

- Root `package.json` is the version source of truth for this repository.
- Every repository update must also update the root `package.json` version before commit, push, or PR creation.
- Treat backend and frontend version metadata as derived from root `package.json`, and validate version-sensitive changes against that source of truth.
