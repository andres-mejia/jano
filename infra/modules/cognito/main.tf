# Identidad de la app (forma de Cardea, que ya recortó la de Fenora).
#
# Pool con el correo como usuario, alta solo por administrador (B2B), contraseña
# como Cardea y MFA TOTP opcional. Diferencias con Cardea:
#   - Tier ESSENTIALS: la app inicia sesión con USER_AUTH (`authFlowType` en
#     frontend/jano-app/src/lib/auth/session.ts), que solo existe a partir de ese
#     tier; primer factor solo contraseña (sin passkeys ni OTP en el MVP).
#   - Atributos `tenant_id` y `role` y el trigger pre-token que los copia al ID token.
#   - Google como IdP (spec 006) solo para usuarios ya dados de alta: el trigger
#     PreSignUp enlaza la identidad de Google con el usuario del mismo email o la
#     rechaza. Sin passkeys ni otros IdP (ADR-001 §3).

terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.1" }
    archive = { source = "hashicorp/archive", version = "~> 2.0" }
  }
}

variable "environment" { type = string }

variable "domain_prefix" {
  type        = string
  description = "Hosted UI en <prefijo>.auth.<región>.amazoncognito.com."
}

variable "callback_urls" { type = list(string) }
variable "logout_urls" { type = list(string) }

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "google_client_id" {
  type        = string
  default     = ""
  description = "Client OAuth del proyecto de Google de Jano (secreto jano/<env>/google-oauth). Vacío = sin Google."
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

data "aws_caller_identity" "current" {}

locals {
  prefix        = "jano-${var.environment}"
  function_name = "jano-${var.environment}-pre-token"
  signup_name   = "jano-${var.environment}-pre-signup"
  google        = var.google_client_id != ""
  # El ARN del pool depende de sus triggers: los permisos van sobre los pools de la
  # cuenta y la región para no crear un ciclo.
  pools_arn = "arn:aws:cognito-idp:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:userpool/*"
}

# ── Trigger pre-token-generation ────────────────────────────────────

resource "aws_iam_role" "pre_token" {
  name = "${local.function_name}-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
  tags = { Component = "cognito" }
}

resource "aws_iam_role_policy" "pre_token" {
  name = "${local.function_name}-policy"
  role = aws_iam_role.pre_token.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.pre_token.arn}:*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "pre_token" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "cognito" }
}

data "archive_file" "pre_token" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/pre-token"
  output_path = "${path.module}/lambda/pre-token.zip"
  excludes    = ["index.test.mjs"]
}

resource "aws_lambda_function" "pre_token" {
  function_name    = local.function_name
  description      = "Copia custom:tenant_id y custom:role al ID token."
  role             = aws_iam_role.pre_token.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 5
  memory_size      = 128
  filename         = data.archive_file.pre_token.output_path
  source_code_hash = data.archive_file.pre_token.output_base64sha256
  tags             = { Component = "cognito" }

  depends_on = [aws_cloudwatch_log_group.pre_token]
}

resource "aws_lambda_permission" "pre_token" {
  statement_id  = "AllowCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_token.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

# ── Trigger PreSignUp (enlace con Google) ───────────────────────────

resource "aws_iam_role" "pre_signup" {
  name = "${local.signup_name}-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
  tags = { Component = "cognito" }
}

resource "aws_iam_role_policy" "pre_signup" {
  name = "${local.signup_name}-policy"
  role = aws_iam_role.pre_signup.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EnlazarConUsuarioExistente"
        Effect   = "Allow"
        Action   = ["cognito-idp:ListUsers", "cognito-idp:AdminLinkProviderForUser"]
        Resource = local.pools_arn
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.pre_signup.arn}:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "pre_signup" {
  name              = "/aws/lambda/${local.signup_name}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "cognito" }
}

data "archive_file" "pre_signup" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/pre-signup"
  output_path = "${path.module}/lambda/pre-signup.zip"
  excludes    = ["index.test.mjs"]
}

resource "aws_lambda_function" "pre_signup" {
  function_name    = local.signup_name
  description      = "Enlaza una identidad de Google con el usuario dado de alta con ese email; si no hay, rechaza."
  role             = aws_iam_role.pre_signup.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  timeout          = 5
  memory_size      = 128
  filename         = data.archive_file.pre_signup.output_path
  source_code_hash = data.archive_file.pre_signup.output_base64sha256
  tags             = { Component = "cognito" }

  depends_on = [aws_cloudwatch_log_group.pre_signup]
}

resource "aws_lambda_permission" "pre_signup" {
  statement_id  = "AllowCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

# ── Pool, cliente y dominio ─────────────────────────────────────────

resource "aws_cognito_user_pool" "main" {
  name                     = local.prefix
  user_pool_tier           = "ESSENTIALS"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"
  mfa_configuration        = "OPTIONAL"
  tags                     = { Component = "cognito" }

  # Producto B2B: las cuentas las da de alta un administrador, no hay registro abierto.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  sign_in_policy {
    allowed_first_auth_factors = ["PASSWORD"]
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  # Con `email` escribible por el cliente, un cambio de email no surte efecto hasta
  # verificar el nuevo: nadie se apropia de otro email ni pierde el suyo por error.
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Solo el administrador escribe tenant y rol (el cliente no tiene permiso de escritura).
  schema {
    name                     = "tenant_id"
    attribute_data_type      = "String"
    mutable                  = true
    developer_only_attribute = false
    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    mutable                  = true
    developer_only_attribute = false
    string_attribute_constraints {
      min_length = 1
      max_length = 16
    }
  }

  lambda_config {
    pre_token_generation = aws_lambda_function.pre_token.arn
    pre_sign_up          = aws_lambda_function.pre_signup.arn
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Tu código de verificación · Jano"
    email_message        = "Tu código de verificación de Jano es {####}. Si no has sido tú, ignora este correo."
  }
}

resource "aws_cognito_user_pool_client" "app" {
  name                                 = "jano-app-${var.environment}"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = false
  explicit_auth_flows                  = ["ALLOW_USER_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  supported_identity_providers         = local.google ? ["COGNITO", "Google"] : ["COGNITO"]
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 1
  id_token_validity                    = 1
  refresh_token_validity               = 30
  read_attributes                      = ["email", "email_verified", "name", "custom:tenant_id", "custom:role"]
  # El mapeo de atributos de Google solo escribe lo que el cliente puede escribir: sin
  # `email` aquí, el trigger PreSignUp no lo recibe (Cognito no deja escribir `email_verified`).
  write_attributes = ["name", "email"]

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Sin esto Cognito rechaza el cliente: «The provider Google does not exist».
  depends_on = [aws_cognito_identity_provider.google]
}

# Google (forma de fintrack/infra/modules/cognito). Los endpoints van explícitos: si no,
# el provider los lee de vuelta tras crearlos y el plan propone borrarlos en cada
# ejecución (drift que vio Fenora en su PR #88).
resource "aws_cognito_identity_provider" "google" {
  count         = local.google ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id                     = var.google_client_id
    client_secret                 = var.google_client_secret
    authorize_scopes              = "openid email profile"
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

data "aws_region" "current" {}

output "user_pool_id" { value = aws_cognito_user_pool.main.id }
output "user_pool_arn" { value = aws_cognito_user_pool.main.arn }
output "app_client_id" { value = aws_cognito_user_pool_client.app.id }
output "hosted_ui_domain" { value = "${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.region}.amazoncognito.com" }
output "issuer" { value = "https://${aws_cognito_user_pool.main.endpoint}" }
