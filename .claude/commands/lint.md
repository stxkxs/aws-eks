# /lint - Lint & Format

Run linting and formatting checks, optionally with auto-fix.

## Usage
```
/lint [--fix]
```

## Arguments
- `--fix`: Optional. Auto-fix lint errors and format files

## What it does
- **Without `--fix`**: Runs typecheck, lint, and format check (read-only)
- **With `--fix`**: Auto-fixes lint errors and formats all files

## Example
```
/lint
/lint --fix
```

---

When this command is invoked:

1. If `$ARGUMENTS` contains `--fix`:
```bash
npm run lint:fix && npm run format
```

2. Otherwise, run checks (no modifications):
```bash
npm run typecheck && npm run lint && npm run format:check
```

3. Report results. For failures without `--fix`, suggest running `/lint --fix`.
