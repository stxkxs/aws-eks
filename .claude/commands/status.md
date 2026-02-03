# /status - Stack Status

Show the status of deployed CloudFormation stacks and cluster health.

## Usage
```
/status [environment]
```

## Arguments
- `environment`: Optional. One of: dev, staging, production (default: dev)

## What it does
1. Lists CloudFormation stacks filtered by environment prefix
2. If kubectl is configured: shows node count and unhealthy pods

## Example
```
/status
/status dev
/status production
```

---

When this command is invoked:

1. Set environment to `$ARGUMENTS` if provided, otherwise default to "dev".

2. List CloudFormation stacks for this environment:
```bash
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE UPDATE_ROLLBACK_COMPLETE --query "StackSummaries[?starts_with(StackName, 'EKS-${ENV^}') || starts_with(StackName, 'eks-${ENV}')].[StackName,StackStatus,LastUpdatedTime]" --output table
```

3. If kubectl is available, also show cluster status:
```bash
kubectl get nodes -o wide 2>/dev/null || echo "kubectl not configured for this cluster"
kubectl get pods --all-namespaces --field-selector status.phase!=Running,status.phase!=Succeeded 2>/dev/null || true
```

4. Summarize the status: number of stacks, their states, node count, and any unhealthy pods.
