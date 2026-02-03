# /test - Run Tests

Run Jest tests for the project.

## Usage
```
/test [pattern]
```

## Arguments
- `pattern`: Optional. Test file path pattern to filter tests

## What it does
1. Runs Jest tests (all or filtered by pattern)
2. Reports pass/fail results with details

## Example
```
/test
/test network
/test stacks/cluster
```

---

When this command is invoked:

1. If `$ARGUMENTS` is provided, run filtered tests:
```bash
npx jest --testPathPattern="$ARGUMENTS" --verbose
```

2. If no arguments, run full test suite:
```bash
npm test
```

3. Report the results, highlighting any failures with file paths and error details.
