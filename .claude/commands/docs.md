# /docs - Generate API Documentation

Generate TypeDoc API documentation for the project.

## Usage
```
/docs
```

## Arguments
None.

## What it does
1. Runs TypeDoc to generate API documentation
2. Reports output location and any warnings

## Example
```
/docs
```

---

When this command is invoked:

1. Generate the documentation:
```bash
npm run docs:generate
```

2. Report the output location (`docs/api/`) and any warnings from TypeDoc.

3. Let the user know they can serve the docs locally with `npm run docs:serve`.
