# Roles de GitHub Actions por OIDC (forma de Cardea, portada de Fenora).
#
# El proveedor `token.actions.githubusercontent.com` ya existe en la cuenta y lo gestiona
# el estado de Fenora: aquí se lee, nunca se crea (crearlo falla con EntityAlreadyExists).
#
# - `jano-<env>-github-actions`: escritura, solo desde `main` y solo desde los workflows
#   de `deploy_workflows`. Su política permanente solo actualiza el código de las Lambdas
#   `jano-<env>-*`; el resto del apply lo cubre la política de arranque que se adjunta por
#   CLI (infra/bootstrap/README.md).
# - `jano-<env>-github-actions-plan`: lectura para `terraform plan` en PR, sin leer datos.
#
# Diferencia con Cardea: el estado vive en el bucket y la tabla de Fenora (FR-001), así que
# todo lo del estado se acota a la clave `state_key_prefix`.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.1" }
  }
}

variable "environment" { type = string }

variable "github_repo" {
  type        = string
  description = "owner/repo."
}

variable "deploy_workflows" {
  type        = list(string)
  default     = ["infra-apply.yml", "landing-deploy.yml"]
  description = "Ficheros de .github/workflows/ que pueden asumir el rol de escritura desde main."
}

variable "amplify_manual_deploy_app_arns" {
  type        = list(string)
  default     = []
  description = "Apps de Amplify sin conexión a GitHub que se publican por despliegue manual desde CI."
}

variable "oidc_sub_prefix" {
  type        = string
  default     = ""
  description = "Prefijo del claim `sub`. Vacío = `repo:<owner/repo>`. Con el formato inmutable de GitHub es `repo:<owner>@<id>/<repo>@<id>` (lo da `gh api repos/<owner/repo>/actions/oidc/customization/sub`)."
}

variable "state_bucket" { type = string }
variable "lock_table" { type = string }

variable "state_key_prefix" {
  type        = string
  default     = "jano/"
  description = "Prefijo de las claves de estado de Jano dentro del bucket compartido."
}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  prefix           = "jano-${var.environment}"
  account_id       = data.aws_caller_identity.current.account_id
  region           = data.aws_region.current.region
  oidc_aud         = "token.actions.githubusercontent.com:aud"
  oidc_sub         = "token.actions.githubusercontent.com:sub"
  oidc_wf          = "token.actions.githubusercontent.com:job_workflow_ref"
  sub_prefix       = var.oidc_sub_prefix != "" ? var.oidc_sub_prefix : "repo:${var.github_repo}"
  sub_main         = "${local.sub_prefix}:ref:refs/heads/main"
  sub_pr           = "${local.sub_prefix}:pull_request"
  deploy_wf_refs   = [for f in var.deploy_workflows : "${var.github_repo}/.github/workflows/${f}@refs/heads/main"]
  plan_wf_pattern  = "${var.github_repo}/.github/workflows/infra-plan.yml@*"
  state_arn        = "arn:aws:s3:::${var.state_bucket}"
  state_keys_arn   = "arn:aws:s3:::${var.state_bucket}/${var.state_key_prefix}*"
  lock_arn         = "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.lock_table}"
  motor_param_arn  = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/jano/${var.environment}/motor/*"
  google_oauth_arn = "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:jano/${var.environment}/google-oauth-*"
}

# ── Rol de escritura ────────────────────────────────────────────────

resource "aws_iam_role" "github_actions" {
  name                 = "${local.prefix}-github-actions"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DespliegueDesdeMain"
        Effect    = "Allow"
        Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { (local.oidc_aud) = "sts.amazonaws.com", (local.oidc_sub) = local.sub_main }
          StringLike   = { (local.oidc_wf) = local.deploy_wf_refs }
        }
      },
      {
        # Red, como en Fenora, por si el token no trae `job_workflow_ref`: con la clave
        # ausente, cualquier workflow de main; con la clave presente, esta sentencia no casa.
        Sid       = "TokenSinJobWorkflowRef"
        Effect    = "Allow"
        Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { (local.oidc_aud) = "sts.amazonaws.com", (local.oidc_sub) = local.sub_main }
          Null         = { (local.oidc_wf) = "true" }
        }
      },
    ]
  })
  tags = { Component = "github-oidc" }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "${local.prefix}-github-actions-deploy"
  role = aws_iam_role.github_actions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "LambdaUpdate"
        Effect   = "Allow"
        Action   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
        Resource = "arn:aws:lambda:${local.region}:${local.account_id}:function:${local.prefix}-*"
      },
    ]
  })
}

# ── Rol de plan (PR) ────────────────────────────────────────────────

resource "aws_iam_role" "github_actions_plan" {
  name                 = "${local.prefix}-github-actions-plan"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PlanDesdePullRequest"
        Effect    = "Allow"
        Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { (local.oidc_aud) = "sts.amazonaws.com", (local.oidc_sub) = local.sub_pr }
          StringLike   = { (local.oidc_wf) = local.plan_wf_pattern }
        }
      },
      {
        Sid       = "TokenSinJobWorkflowRef"
        Effect    = "Allow"
        Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { (local.oidc_aud) = "sts.amazonaws.com", (local.oidc_sub) = local.sub_pr }
          Null         = { (local.oidc_wf) = "true" }
        }
      },
    ]
  })
  tags = { Component = "github-oidc" }
}

# `terraform plan` refresca todos los recursos: necesita los Get/Describe/List de ReadOnlyAccess.
resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.github_actions_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state" {
  name = "${local.prefix}-github-actions-plan-state"
  role = aws_iam_role.github_actions_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "ListarEstado", Effect = "Allow", Action = ["s3:ListBucket"], Resource = local.state_arn },
      # ReadOnlyAccess no incluye GetSecretValue: el plan lo necesita para el client OAuth
      # de Google (spec 006), y solo ese secreto (ver `SinSecretosSalvoGoogleOAuth`).
      { Sid = "LeerGoogleOAuth", Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = local.google_oauth_arn },
      { Sid = "LeerEstado", Effect = "Allow", Action = ["s3:GetObject"], Resource = local.state_keys_arn },
      { Sid = "Bloqueo", Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"], Resource = local.lock_arn },
      {
        # ReadOnlyAccess abre los planos de datos (objetos, ítems, secretos, mensajes,
        # usuarios). Un plan no los necesita: se cierran salvo el estado y los locks.
        Sid         = "SinDatosFueraDelEstado"
        Effect      = "Deny"
        Action      = ["s3:GetObject", "s3:GetObjectVersion"]
        NotResource = [local.state_keys_arn]
      },
      {
        Sid         = "SinItemsFueraDeLocks"
        Effect      = "Deny"
        Action      = ["dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:GetRecords"]
        NotResource = [local.lock_arn]
      },
      {
        Sid    = "SinPlanosDeDatos"
        Effect = "Deny"
        Action = [
          "sqs:ReceiveMessage", "rds-db:connect", "rds-data:*",
          "cognito-idp:ListUsers", "cognito-idp:AdminGetUser", "cognito-idp:ListUsersInGroup",
          "logs:GetLogEvents", "logs:FilterLogEvents", "logs:StartQuery",
          "kinesis:GetRecords", "athena:GetQueryResults",
        ]
        Resource = "*"
      },
      {
        # El plan refresca el parámetro del despertador del motor (spec 008), que solo
        # guarda la hora del próximo paso; ningún otro parámetro.
        Sid         = "SinParametrosSalvoMotor"
        Effect      = "Deny"
        Action      = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        NotResource = [local.motor_param_arn]
      },
      {
        # El plan lee con `data` el client OAuth de Google (spec 006); ningún otro secreto.
        Sid         = "SinSecretosSalvoGoogleOAuth"
        Effect      = "Deny"
        Action      = ["secretsmanager:GetSecretValue"]
        NotResource = [local.google_oauth_arn]
      },
      {
        Sid      = "SinEscrituras"
        Effect   = "Deny"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "*"
      },
    ]
  })
}

output "role_arn" { value = aws_iam_role.github_actions.arn }
output "role_name" { value = aws_iam_role.github_actions.name }
output "plan_role_arn" { value = aws_iam_role.github_actions_plan.arn }
