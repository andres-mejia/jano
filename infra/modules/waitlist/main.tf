# Formulario de acceso anticipado de la landing (spec 002, US2; forma de
# fintrack/infra/modules/waitlist y cardea/infra/modules/contact).
#
#   - DynamoDB on-demand con `email` en minúsculas como PK: idempotencia natural (409).
#   - GSI `created_at-index` (`partition`, `created_at`) para listar altas por fecha;
#     los contadores de rate limit van en la misma tabla con `partition = ratelimit` y TTL.
#   - HTTP API y no Function URL: la cuenta bloquea las Function URL públicas.
#   - Lambda Node 22 sin dependencias empaquetadas (SDK v3 del runtime).

terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.1" }
    archive = { source = "hashicorp/archive", version = "~> 2.0" }
  }
}

locals {
  table_name    = "jano-${var.environment}-waitlist"
  function_name = "jano-${var.environment}-waitlist"
  mail_domain   = split("@", var.ses_from_address)[1]
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

resource "aws_dynamodb_table" "waitlist" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "partition"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  global_secondary_index {
    name            = "created_at-index"
    hash_key        = "partition"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod"
  }

  server_side_encryption { enabled = true }
  tags = { Component = "waitlist" }
}

resource "aws_iam_role" "waitlist" {
  name = "${local.function_name}-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
  tags = { Component = "waitlist" }
}

resource "aws_iam_role_policy" "waitlist" {
  name = "${local.function_name}-policy"
  role = aws_iam_role.waitlist.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Tabla"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.waitlist.arn
      },
      {
        Sid    = "Correo"
        Effect = "Allow"
        Action = ["ses:SendEmail"]
        Resource = [
          "arn:aws:ses:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:identity/${local.mail_domain}",
          "arn:aws:ses:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:configuration-set/${var.configuration_set_name}",
        ]
        Condition = { StringEquals = { "ses:FromAddress" = var.ses_from_address } }
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.waitlist.arn}:*"
      },
    ]
  })
}

data "archive_file" "waitlist" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/handler"
  output_path = "${path.module}/lambda/handler.zip"
  excludes    = ["index.test.mjs"]
}

resource "aws_cloudwatch_log_group" "waitlist" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "waitlist" }
}

resource "aws_lambda_function" "waitlist" {
  function_name    = local.function_name
  description      = "Altas del formulario de acceso anticipado: DynamoDB y confirmación por SES."
  role             = aws_iam_role.waitlist.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 10
  memory_size      = 256
  filename         = data.archive_file.waitlist.output_path
  source_code_hash = data.archive_file.waitlist.output_base64sha256
  tags             = { Component = "waitlist" }

  environment {
    variables = {
      WAITLIST_TABLE         = aws_dynamodb_table.waitlist.name
      SES_FROM_ADDRESS       = var.ses_from_address
      SES_CONFIG_SET         = var.configuration_set_name
      NOTIFY_ADDRESS         = var.notify_address
      SITE_URL               = var.site_url
      RATE_LIMIT_PER_IP_HOUR = tostring(var.rate_limit_per_ip_per_hour)
    }
  }

  depends_on = [aws_cloudwatch_log_group.waitlist]
}

resource "aws_apigatewayv2_api" "waitlist" {
  name          = "${local.function_name}-api"
  protocol_type = "HTTP"
  description   = "POST público del formulario de acceso anticipado."
  tags          = { Component = "waitlist" }

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type", "x-jano-source"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "waitlist" {
  api_id                 = aws_apigatewayv2_api.waitlist.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.waitlist.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}

resource "aws_apigatewayv2_route" "waitlist" {
  api_id    = aws_apigatewayv2_api.waitlist.id
  route_key = "POST /"
  target    = "integrations/${aws_apigatewayv2_integration.waitlist.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.waitlist.id
  name        = "$default"
  auto_deploy = true
  tags        = { Component = "waitlist" }

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }
}

resource "aws_lambda_permission" "waitlist" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.waitlist.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.waitlist.execution_arn}/*/*"
}

output "endpoint_url" { value = "${aws_apigatewayv2_api.waitlist.api_endpoint}/" }
output "table_name" { value = aws_dynamodb_table.waitlist.name }
output "function_name" { value = aws_lambda_function.waitlist.function_name }
