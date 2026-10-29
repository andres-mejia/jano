#!/usr/bin/env bash
# Jano — despliegue del entorno dev (forma de fintrack/infra/deploy-dev.sh).
#
# Construye el backend (Terraform empaqueta backend/dist/api, dist/motor y dist/cuentas), init con el bucket de
# estado de Fenora (FR-001), validate, plan a fichero y apply de ese mismo plan tras
# confirmar; después aplica las migraciones de Aurora (spec 007). Nada se aplica sin
# plan revisado (AGENTS.md §8).
#
# Uso:
#   aws sso login --profile fintrack-dev
#   infra/scripts/deploy-dev.sh                 # plan + confirmación + apply
#   infra/scripts/deploy-dev.sh --plan-only     # solo plan
#   infra/scripts/deploy-dev.sh -- -var foo=bar     # args extra para plan
#   El token de GitHub de Amplify va por TF_VAR_github_access_token (docs/guias/despliegue-dev.md).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR="${SCRIPT_DIR}/../environments/dev"
PROFILE="${AWS_PROFILE_JANO:-fintrack-dev}"
REGION="eu-west-1"

PLAN_ONLY=""
if [ "${1:-}" = "--plan-only" ]; then PLAN_ONLY=1; shift; fi
if [ "${1:-}" = "--" ]; then shift; fi

ACCOUNT_ID="$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)"
BUCKET="fenora-terraform-state-${ACCOUNT_ID}"
echo "cuenta ${ACCOUNT_ID} · bucket ${BUCKET} · clave jano/dev/terraform.tfstate"

pnpm --dir "${SCRIPT_DIR}/../.." --filter @jano/backend build

cd "$ENV_DIR"
terraform init -input=false -reconfigure \
  -backend-config="bucket=${BUCKET}" \
  -backend-config="region=${REGION}" \
  -backend-config="profile=${PROFILE}"
terraform validate
terraform plan -input=false -out=tfplan -var "aws_profile=${PROFILE}" "$@"

[ -n "$PLAN_ONLY" ] && exit 0

read -r -p "¿Aplicar este plan? Escribe 'si': " respuesta
[ "$respuesta" = "si" ] || { echo "No se aplica."; exit 1; }
terraform apply -input=false tfplan
AWS_PROFILE="$PROFILE" pnpm --dir "${SCRIPT_DIR}/../.." --filter @jano/backend migrar
