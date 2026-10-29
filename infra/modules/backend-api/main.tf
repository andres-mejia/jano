# Lambdas del backend de Jano: la API (spec 007) y el motor (spec 008, ADR-003).
# La API sirve el contrato; EventBridge Scheduler invoca el motor cada minuto.
#
#   - Entran en Aurora por Data API con el rol `jano_api` (sin BYPASSRLS ni tablas
#     propias): el aislamiento por fila de la base de datos se aplica también a ellas.
#   - El secreto `jano/<env>/aurora-api` lo crea Terraform vacío y lo rellena
#     `backend/scripts/migrar.ts`, que fija esa misma contraseña en el rol. Terraform
#     no lee su valor, así que el rol de plan de CI sigue sin GetSecretValue.
#   - El código lo construye `pnpm --filter @jano/backend build` antes del plan
#     (backend/dist/api y backend/dist/motor).
#   - Las rutas concretas ganan a las comodín: con `demo_data`, lo que el backend no
#     sirva sale de @jano/demo (datos inventados) tras la misma autorización.
#   - El motor mira primero un parámetro de SSM (el «despertador»): sin pasos
#     vencidos termina sin despertar Aurora. La API lo adelanta al planificar.
#   - MAIL_ALLOWLIST: fuera de producción solo se escribe a esas direcciones
#     (spec 008 FR-021); vacía, no sale ningún correo.

terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.1" }
    archive = { source = "hashicorp/archive", version = "~> 2.0" }
  }
}

variable "environment" { type = string }
variable "cluster_arn" { type = string }
variable "database_name" { type = string }
variable "user_pool_id" { type = string }
variable "user_pool_arn" { type = string }
variable "api_id" { type = string }
variable "authorizer_id" { type = string }
variable "api_execution_arn" { type = string }

variable "codigo_dir" {
  type        = string
  description = "Directorio con el index.mjs empaquetado de la API (backend/dist/api)."
}

variable "motor_codigo_dir" {
  type        = string
  description = "Directorio con el index.mjs empaquetado del motor (backend/dist/motor)."
}

variable "mail_allowlist" {
  type        = string
  default     = ""
  description = "Destinatarios permitidos fuera de producción, separados por comas; admite alias con + (spec 008 FR-021). Vacía: no sale ningún correo."
}

variable "demo_day_minutes" {
  type        = number
  default     = 1440
  description = "Minutos que dura un «día» de secuencia (DEMO_DAY_MINUTES): 1440 en real, menos para la demo."
  validation {
    condition     = var.demo_day_minutes >= 1 && var.demo_day_minutes <= 1440
    error_message = "demo_day_minutes va de 1 a 1440."
  }
}

variable "motor_enabled" {
  type        = bool
  default     = true
  description = "Si EventBridge Scheduler invoca el motor cada minuto."
}

variable "routes" {
  type        = list(string)
  description = "Rutas del contrato que sirve el backend con el autorizador JWT (prefijo /v1). backend/test/infra.test.ts comprueba que están todas."
  default = [
    "GET /v1/tenant",
    "GET /v1/tenant/users",
    "POST /v1/tenant/users",
    "POST /v1/tenant/users/{userId}/disable",
    "POST /v1/tenant/users/{userId}/enable",
    "POST /v1/tenant/users/{userId}/resend-invitation",
    "GET /v1/dashboard/summary",
    "GET /v1/campaigns",
    "POST /v1/campaigns",
    "GET /v1/campaigns/{campaignId}",
    "GET /v1/campaigns/{campaignId}/icp",
    "POST /v1/campaigns/{campaignId}/icp",
    "PUT /v1/campaigns/{campaignId}/status",
    "GET /v1/campaigns/{campaignId}/flow",
    "GET /v1/campaigns/{campaignId}/flow/{stage}/events",
    "GET /v1/campaigns/{campaignId}/accounts",
    "POST /v1/campaigns/{campaignId}/accounts/candidates",
    "POST /v1/campaigns/{campaignId}/accounts/approve",
    "POST /v1/campaigns/{campaignId}/accounts/discard",
    "GET /v1/prospects/{prospectId}",
    "GET /v1/prospects/{prospectId}/events",
    "POST /v1/prospects/{prospectId}/stop",
    "POST /v1/prospects/{prospectId}/steps/{stepId}/approve",
    "GET /v1/inbox",
    "GET /v1/inbox/{itemId}",
    "POST /v1/inbox/{itemId}/approve",
    "POST /v1/inbox/{itemId}/discard",
    "POST /v1/inbox/{itemId}/regenerate",
    "GET /v1/compliance/summary",
    "GET /v1/compliance/audit",
    "GET /v1/compliance/guardrails",
    "PUT /v1/compliance/guardrails",
    "GET /v1/connections",
    "GET /v1/opportunities",
    "GET /v1/opportunities/export",
  ]
}

variable "public_routes" {
  type        = list(string)
  description = "Rutas sin JWT: la baja desde el pie de un correo (spec 008 FR-022), que resuelve su tenant por el token."
  default     = ["GET /v1/baja/{token}"]
}

variable "demo_data" {
  type        = bool
  default     = false
  description = "Sirve el resto del contrato con datos de ejemplo (@jano/demo) por rutas comodín. Solo dev, hasta la spec 003."
}

variable "log_retention_days" {
  type    = number
  default = 30
}

locals {
  function_name = "jano-${var.environment}-api"
  motor_name    = "jano-${var.environment}-motor"
  # Lo que comparten la API y el motor: base de datos, lista blanca y despertador.
  entorno_motor = {
    CLUSTER_ARN      = var.cluster_arn
    DB_SECRET_ARN    = aws_secretsmanager_secret.api_db.arn
    DB_NAME          = var.database_name
    JANO_ENV         = var.environment
    MAIL_ALLOWLIST   = var.mail_allowlist
    DEMO_DAY_MINUTES = tostring(var.demo_day_minutes)
    MOTOR_PARAMETER  = aws_ssm_parameter.despertador.name
  }
  # Las rutas concretas ganan a las comodín: el equipo va a sus casos de uso y el resto, a la demo.
  rutas_demo = var.demo_data ? ["GET /v1/{proxy+}", "POST /v1/{proxy+}", "PUT /v1/{proxy+}", "DELETE /v1/{proxy+}"] : []
}

resource "aws_secretsmanager_secret" "api_db" {
  name        = "jano/${var.environment}/aurora-api"
  description = "Credenciales del rol jano_api de Aurora ({username, password}); las escribe backend/scripts/migrar.ts."
  tags        = { Component = "api" }
}

# El despertador del motor (ADR-003): cuándo vence el próximo paso, fuera de Aurora.
# Terraform lo crea vacío y no vuelve a tocar su valor: lo escriben la API y el motor.
resource "aws_ssm_parameter" "despertador" {
  name        = "/jano/${var.environment}/motor/proximo"
  description = "Próximo paso vencido según la última revisión del motor; lo escriben ${local.function_name} y ${local.motor_name}."
  type        = "String"
  value       = "{}"
  tags        = { Component = "motor" }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_iam_role" "api" {
  name = "${local.function_name}-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
  tags = { Component = "api" }
}

resource "aws_iam_role_policy" "api" {
  name = "${local.function_name}-policy"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DataApi"
        Effect   = "Allow"
        Action   = ["rds-data:ExecuteStatement", "rds-data:BeginTransaction", "rds-data:CommitTransaction", "rds-data:RollbackTransaction"]
        Resource = var.cluster_arn
      },
      {
        Sid      = "SecretoDelRolApi"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.api_db.arn
      },
      {
        Sid      = "Despertador"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = aws_ssm_parameter.despertador.arn
      },
      {
        Sid    = "EquipoEnCognito"
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminCreateUser", "cognito-idp:AdminDeleteUser", "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser", "cognito-idp:AdminGetUser", "cognito-idp:AdminUserGlobalSignOut",
          "cognito-idp:ListUsers",
        ]
        Resource = var.user_pool_arn
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.api.arn}:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "api" }
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = var.codigo_dir
  output_path = "${path.module}/api.zip"
}

resource "aws_lambda_function" "api" {
  function_name    = local.function_name
  description      = "API de Jano (backend/): el contrato sobre Aurora."
  role             = aws_iam_role.api.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 29 # tope de la integración de HTTP API (30 s): da tiempo a que Aurora despierte
  memory_size      = 256
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  tags             = { Component = "api" }

  environment {
    variables = merge(local.entorno_motor, {
      USER_POOL_ID = var.user_pool_id
      DEMO_DATA    = var.demo_data ? "on" : "off"
    })
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = var.api_id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api" {
  for_each           = toset(concat(var.routes, local.rutas_demo))
  api_id             = var.api_id
  route_key          = each.value
  authorization_type = "JWT"
  authorizer_id      = var.authorizer_id
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "publica" {
  for_each           = toset(var.public_routes)
  api_id             = var.api_id
  route_key          = each.value
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_execution_arn}/*/*"
}

# ── Motor (spec 008 FR-004, ADR-003) ─────────────────────────────────────

resource "aws_iam_role" "motor" {
  name = "${local.motor_name}-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
  tags = { Component = "motor" }
}

resource "aws_iam_role_policy" "motor" {
  name = "${local.motor_name}-policy"
  role = aws_iam_role.motor.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DataApi"
        Effect   = "Allow"
        Action   = ["rds-data:ExecuteStatement", "rds-data:BeginTransaction", "rds-data:CommitTransaction", "rds-data:RollbackTransaction"]
        Resource = var.cluster_arn
      },
      {
        Sid      = "SecretoDelRolApi"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.api_db.arn
      },
      {
        Sid      = "Despertador"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = aws_ssm_parameter.despertador.arn
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.motor.arn}:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "motor" {
  name              = "/aws/lambda/${local.motor_name}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "motor" }
}

data "archive_file" "motor" {
  type        = "zip"
  source_dir  = var.motor_codigo_dir
  output_path = "${path.module}/motor.zip"
}

resource "aws_lambda_function" "motor" {
  function_name    = local.motor_name
  description      = "Motor de Jano (ADR-003): pasos vencidos con FOR UPDATE SKIP LOCKED, en lotes de 50."
  role             = aws_iam_role.motor.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 120 # Aurora en pausa tarda 15-30 s en despertar; el lote cabe con margen
  memory_size      = 256
  filename         = data.archive_file.motor.output_path
  source_code_hash = data.archive_file.motor.output_base64sha256
  tags             = { Component = "motor" }

  environment {
    variables = local.entorno_motor
  }

  depends_on = [aws_cloudwatch_log_group.motor]
}

# EventBridge Scheduler invoca el motor cada minuto. Sin reintentos: la pasada
# siguiente llega en un minuto y el motor es idempotente.
data "aws_caller_identity" "actual" {}

resource "aws_iam_role" "scheduler" {
  name = "${local.motor_name}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "scheduler.amazonaws.com" }
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.actual.account_id } }
    }]
  })
  tags = { Component = "motor" }
}

resource "aws_iam_role_policy" "scheduler" {
  name = "${local.motor_name}-scheduler-policy"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Sid = "InvocarMotor", Effect = "Allow", Action = "lambda:InvokeFunction", Resource = aws_lambda_function.motor.arn }]
  })
}

resource "aws_scheduler_schedule" "motor" {
  name                = local.motor_name
  description         = "Pasada del motor de Jano cada minuto (ADR-003)."
  schedule_expression = "rate(1 minute)"
  state               = var.motor_enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.motor.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ origen = "scheduler" })

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

output "function_name" { value = aws_lambda_function.api.function_name }
output "motor_function_name" { value = aws_lambda_function.motor.function_name }
output "api_secret_arn" { value = aws_secretsmanager_secret.api_db.arn }
