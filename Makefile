# AWS EKS Infrastructure Makefile
#
# Common targets for development, testing, and deployment
#

.PHONY: help install build test lint synth deploy diff destroy validate clean

# Default target
help:
	@echo "AWS EKS Infrastructure - Available Targets"
	@echo ""
	@echo "Development:"
	@echo "  install        Install npm dependencies"
	@echo "  build          Build TypeScript"
	@echo "  test           Run unit tests"
	@echo "  test-coverage  Run tests with coverage"
	@echo "  lint           Run linter"
	@echo "  clean          Clean build artifacts"
	@echo ""
	@echo "CDK Operations:"
	@echo "  synth          Synthesize all environments"
	@echo "  synth-dev      Synthesize dev environment"
	@echo "  synth-staging  Synthesize staging environment"
	@echo "  synth-prod     Synthesize production environment"
	@echo ""
	@echo "  diff           Show diff for all environments"
	@echo "  diff-dev       Show diff for dev"
	@echo "  diff-staging   Show diff for staging"
	@echo "  diff-prod      Show diff for production"
	@echo ""
	@echo "  deploy-dev     Deploy to dev"
	@echo "  deploy-staging Deploy to staging"
	@echo "  deploy-prod    Deploy to production (requires approval)"
	@echo ""
	@echo "  destroy-dev    Destroy dev environment"
	@echo "  destroy-staging Destroy staging environment"
	@echo "  destroy-prod   Destroy production (requires confirmation)"
	@echo ""
	@echo "Validation:"
	@echo "  validate       Run all validation checks"
	@echo "  validate-install Install validation tools"
	@echo ""
	@echo "Operations:"
	@echo "  backup-verify  Verify Velero backups"
	@echo ""
	@echo "Variables:"
	@echo "  ACCOUNT        AWS Account ID (required for deploy)"
	@echo "  REGION         AWS Region (default: us-west-2)"

# Variables
ACCOUNT ?= $(shell aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
REGION ?= us-west-2
CDK_CONTEXT = -c account=$(ACCOUNT) -c region=$(REGION)

# Development targets
install:
	npm ci

build: install
	npm run build

test: build
	npm test

test-coverage: build
	npm test -- --coverage

lint:
	npx tsc --noEmit
	@if command -v eslint &> /dev/null; then npx eslint . --ext .ts; fi

clean:
	rm -rf cdk.out node_modules lib/**/*.js lib/**/*.d.ts test/**/*.js test/**/*.d.ts

# CDK Synth targets
synth: synth-dev synth-staging synth-prod

synth-dev: build
	@echo "Synthesizing dev environment..."
	npx cdk synth -c environment=dev $(CDK_CONTEXT) -o cdk.out/dev --quiet

synth-staging: build
	@echo "Synthesizing staging environment..."
	npx cdk synth -c environment=staging $(CDK_CONTEXT) -o cdk.out/staging --quiet

synth-prod: build
	@echo "Synthesizing production environment..."
	npx cdk synth -c environment=production $(CDK_CONTEXT) -o cdk.out/production --quiet

# CDK Diff targets
diff: diff-dev diff-staging diff-prod

diff-dev: build
	@echo "Showing diff for dev environment..."
	npx cdk diff --all -c environment=dev $(CDK_CONTEXT)

diff-staging: build
	@echo "Showing diff for staging environment..."
	npx cdk diff --all -c environment=staging $(CDK_CONTEXT)

diff-prod: build
	@echo "Showing diff for production environment..."
	npx cdk diff --all -c environment=production $(CDK_CONTEXT)

# CDK Deploy targets (uses scripts/deploy.sh for pre-flight checks, tests, diff, and health validation)
deploy-dev:
	bash scripts/deploy.sh --environment dev --region $(REGION)

deploy-staging:
	bash scripts/deploy.sh --environment staging --region $(REGION)

deploy-prod:
	bash scripts/deploy.sh --environment production --region $(REGION)

# CDK Destroy targets (uses scripts/destroy.sh for graceful teardown)
destroy-dev:
	bash scripts/destroy.sh --environment dev --region $(REGION)

destroy-staging:
	bash scripts/destroy.sh --environment staging --region $(REGION)

destroy-prod:
	bash scripts/destroy.sh --environment production --region $(REGION)

# Validation targets
validate-install:
	chmod +x scripts/validation/install-tools.sh
	./scripts/validation/install-tools.sh

validate: synth-dev
	chmod +x scripts/validation/validate-all.sh
	./scripts/validation/validate-all.sh cdk.out/dev

# Operations targets
backup-verify:
	chmod +x scripts/backup-verify.sh
	./scripts/backup-verify.sh
