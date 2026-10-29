# HTTP API de Jano con autorizador JWT de Cognito (forma de Cardea; la REST API +
# WAF de Fenora no aplica en dev). Contract-first (AGENTS.md §4): solo se publican
# rutas de contracts/openapi/jano-api.yaml, con el prefijo `/v1` de su `servers`.
# Hasta 003 apuntan a una Lambda placeholder que responde 501.

terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.1" }
    archive = { source = "hashicorp/archive", version = "~> 2.0" }
  }
}

variable "environment" { type = string }
variable "allowed_origins" { type = list(string) }
variable "cognito_issuer" { type = string }
variable "cognito_client_id" { type = string }

variable "placeholder_routes" {
  type        = list(string)
  default     = ["GET /v1/dashboard/summary"]
  description = "Rutas del contrato que se publican con autorizador y la Lambda placeholder."
}

variable "log_retention_days" {
  type    = number
  default = 30
}

locals {
  name          = "jano-${var.environment}-api"
  function_name = "jano-${var.environment}-api-placeholder"
}

resource "aws_apigatewayv2_api" "main" {
  name          = local.name
  protocol_type = "HTTP"
  tags          = { Component = "api" }

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = var.cognito_issuer
    audience = [var.cognito_client_id]
  }
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${local.name}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "api" }
}

# Registro de acceso solo con metadatos de la petición: nunca cuerpos.
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
  tags        = { Component = "api" }

  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 20
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      routeKey  = "$context.routeKey"
      status    = "$context.status"
      latencyMs = "$context.responseLatency"
      sub       = "$context.authorizer.claims.sub"
      tenantId  = "$context.authorizer.claims.custom:tenant_id"
    })
  }
}

# ── Placeholder (501) ───────────────────────────────────────────────

resource "aws_iam_role" "placeholder" {
  name = "${local.function_name}-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
  tags = { Component = "api" }
}

resource "aws_iam_role_policy" "placeholder" {
  name = "${local.function_name}-policy"
  role = aws_iam_role.placeholder.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.placeholder.arn}:*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "placeholder" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "api" }
}

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/placeholder"
  output_path = "${path.module}/lambda/placeholder.zip"
}

resource "aws_lambda_function" "placeholder" {
  function_name    = local.function_name
  description      = "Responde 501 en las rutas del contrato hasta que exista el backend (003)."
  role             = aws_iam_role.placeholder.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 3
  memory_size      = 128
  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256
  tags             = { Component = "api" }

  depends_on = [aws_cloudwatch_log_group.placeholder]
}

resource "aws_apigatewayv2_integration" "placeholder" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.placeholder.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "placeholder" {
  for_each           = toset(var.placeholder_routes)
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.placeholder.id}"
}

resource "aws_lambda_permission" "placeholder" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.placeholder.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

output "api_id" { value = aws_apigatewayv2_api.main.id }
output "api_endpoint" { value = aws_apigatewayv2_api.main.api_endpoint }
output "api_base_url" { value = "${aws_apigatewayv2_api.main.api_endpoint}/v1" }
output "authorizer_id" { value = aws_apigatewayv2_authorizer.cognito.id }
