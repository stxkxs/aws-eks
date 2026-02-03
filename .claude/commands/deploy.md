# /deploy - Deploy to Environment

Deploy the EKS infrastructure to the specified environment.

## Usage
```
/deploy <environment>
```

## Arguments
- `environment`: Required. One of: dev, staging, production

## What it does
1. Confirms the deployment target with the user
2. Runs `npm run build` to compile TypeScript
3. Runs `npx cdk deploy --all` for the specified environment
4. Reports deployment status

## Safety
- Always requires user confirmation before deploying
- Production deployments show a warning banner

## Example
```
/deploy dev
/deploy staging
/deploy production
```

---

When this command is invoked:

1. If environment is "production", warn the user with a banner
2. Ask for confirmation before proceeding
3. Execute:
```bash
npm run build && npx cdk deploy --all -c environment=${1} --require-approval broadening
```
4. Report the deployment results
