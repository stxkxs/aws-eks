# /destroy - Safe Destroy

Safely destroy EKS infrastructure for a given environment with dry-run preview.

## Usage
```
/destroy <environment>
```

## Arguments
- `environment`: Required. One of: dev, staging, production

## What it does
1. For production: shows a danger banner and requires explicit confirmation
2. Runs a dry-run destroy first to show what will be removed
3. Asks for confirmation before executing the actual destroy
4. Executes the destroy

## Safety
- Production requires typing "destroy production" to confirm
- Always shows dry-run output before actual destroy
- The PreToolUse hook blocks direct `cdk destroy` on production outside this command

## Example
```
/destroy dev
/destroy staging
/destroy production
```

---

When this command is invoked:

1. Validate that `$ARGUMENTS` is one of: dev, staging, production. If missing or invalid, show usage and stop.

2. If environment is "production":
   - Show a prominent danger banner:
     ```
     !! DANGER: You are about to destroy PRODUCTION infrastructure !!
     This action is irreversible and will cause downtime.
     ```
   - Ask the user to type "destroy production" to confirm. If they don't, abort.

3. Run dry-run to preview what will be destroyed:
```bash
npx cdk destroy --all -c environment=$ARGUMENTS --dry-run 2>&1 || true
```

4. Show the dry-run output and ask "Proceed with actual destroy?"

5. If confirmed, execute:
```bash
npx cdk destroy --all -c environment=$ARGUMENTS --require-approval never
```

6. Report the results.
