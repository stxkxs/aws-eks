# /validate - Validate Configuration

Validate the project configuration and CDK constructs.

## Usage
```
/validate [environment]
```

## Arguments
- `environment`: Optional. dev, staging, or production (validates all if not specified)

## What it does
1. Runs TypeScript compilation
2. Runs Jest tests
3. Synthesizes CDK templates
4. Validates CloudFormation with cfn-lint (if installed)

## Example
```
/validate
/validate dev
```

---

When this command is invoked:

```bash
# Build
npm run build

# Test
npm run test

# Synth all environments or specific one
if [ -n "${1}" ]; then
  npx cdk synth -c environment=${1}
else
  for env in dev staging production; do
    echo "Synthesizing $env..."
    npx cdk synth -c environment=$env
  done
fi
```

Report any failures with specific error details.
