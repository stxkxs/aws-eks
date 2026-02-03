# /diff - Show Infrastructure Changes

Show what changes would be made to the deployed infrastructure.

## Usage
```
/diff <environment>
```

## Arguments
- `environment`: Required. One of: dev, staging, production

## What it does
1. Runs `npm run build` to compile TypeScript
2. Runs `npx cdk diff` for the specified environment
3. Summarizes additions, modifications, and deletions

## Example
```
/diff dev
/diff production
```

---

When this command is invoked:

```bash
npm run build && npx cdk diff --all -c environment=${1}
```

Summarize the output highlighting:
- Resources to be added (green)
- Resources to be modified (yellow)
- Resources to be deleted (red)
