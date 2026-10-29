# Lambda de la API de Jano (spec 007; la spec 003 le añade rutas). Sirve las rutas
# del contrato que ya tienen backend; el resto sigue en el placeholder 501 del
# módulo api-gateway.
#
#   - Entra en Aurora por Data API con el rol `jano_api` (sin BYPASSRLS ni tablas
#     propias): el aislamiento por fila de la base de datos se aplica también a ella.
#   - El secreto `jano/<env>/aurora-api` lo crea Terraform vacío y lo rellena
#     `backend/scripts/migrar.ts`, que fija esa misma contraseña en el rol. Terraform
#     no lee su valor, así que el rol de plan de CI sigue sin GetSecretValue.
#   - El código lo construye `pnpm --filter @jano/backend build` antes del plan.
#   - Con `demo_data`, rutas comodín sirven el resto del contrato con @jano/demo
#     (datos inventados) tras la misma autorización y comprobación de acceso.

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
  description = "Directorio con el index.mjs empaquetado (backend/dist/api)."
}

variable "routes" {
  type        = list(string)
  description = "Rutas del contrato que sirve el backend (con el prefijo /v1)."
  default = [
    "GET /v1/tenant",
    "GET /v1/tenant/users",
    "POST /v1/tenant/users",
    "POST /v1/tenant/users/{userId}/disable",
    "POST /v1/tenant/users/{userId}/enable",
    "POST /v1/tenant/users/{userId}/resend-invitation",
  ]
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
  # Las rutas concretas ganan a las comodín: el equipo va a sus casos de uso y el resto, a la demo.
  rutas_demo = var.demo_data ? ["GET /v1/{proxy+}", "POST /v1/{proxy+}", "PUT /v1/{proxy+}", "DELETE /v1/{proxy+}"] : []
}

resource "aws_secretsmanager_secret" "api_db" {
  name        = "jano/${var.environment}/aurora-api"
  description = "Credenciales del rol jano_api de Aurora ({username, password}); las escribe backend/scripts/migrar.ts."
  tags        = { Component = "api" }
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
  description      = "API de Jano (backend/): tenant y equipo; las demás rutas llegan con la spec 003."
  role             = aws_iam_role.api.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 29 # tope de la integración de HTTP API (30 s): da tiempo a que Aurora despierte
  memory_size      = 256
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  tags             = { Component = "api" }

  environment {
    variables = {
      CLUSTER_ARN   = var.cluster_arn
      DB_SECRET_ARN = aws_secretsmanager_secret.api_db.arn
      DB_NAME       = var.database_name
      USER_POOL_ID  = var.user_pool_id
      DEMO_DATA     = var.demo_data ? "on" : "off"
    }
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

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_execution_arn}/*/*"
}

output "function_name" { value = aws_lambda_function.api.function_name }
output "api_secret_arn" { value = aws_secretsmanager_secret.api_db.arn }
