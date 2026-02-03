# /synth - Synthesize CDK Templates

Synthesize CloudFormation templates for the specified environment.

## Usage
```
/synth [environment]
```

## Arguments
- `environment`: dev, staging, or production (default: dev)

## What it does
1. Runs `npm run build` to compile TypeScript
2. Runs `npx cdk synth` for the specified environment
3. Reports any synthesis errors

## Example
```
/synth dev
/synth production
```

---

When this command is invoked, execute:

```bash
npm run build && npx cdk synth -c environment=${1:-dev}
```

Then analyze the output for any errors or warnings.
