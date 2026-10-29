# Cognito de la app (spec 002, US3; Google en la spec 006). La app redirige a `/` tras el login y a `/login` tras
# el logout (frontend/jano-app/src/lib/auth/amplify-config.ts).

# Client OAuth de Google (spec 006): el del proyecto de Google de Jano, cargado por CLI
# en un secreto (docs/guias/despliegue-dev.md). Sin `try()`, como en Fenora: si el secreto
# falta o viene vacío, el plan debe fallar y no proponer borrar el IdP de Google.
data "aws_secretsmanager_secret_version" "google_oauth" {
  secret_id = "jano/${var.environment}/google-oauth"

  lifecycle {
    postcondition {
      condition     = jsondecode(self.secret_string).client_id != "" && jsondecode(self.secret_string).client_secret != ""
      error_message = "jano/${var.environment}/google-oauth existe pero client_id o client_secret vienen vacíos (o faltan)."
    }
  }
}

locals {
  google_oauth = jsondecode(data.aws_secretsmanager_secret_version.google_oauth.secret_string)
}

module "cognito" {
  source               = "../../modules/cognito"
  environment          = var.environment
  domain_prefix        = "jano-${var.environment}"
  callback_urls        = ["${local.app_url}/", "http://localhost:3000/"]
  logout_urls          = ["${local.app_url}/login", "http://localhost:3000/login"]
  google_client_id     = local.google_oauth.client_id
  google_client_secret = local.google_oauth.client_secret
}

# HTTP API con autorizador JWT del pool (US3, fase 4). Solo rutas del contrato.
module "api_gateway" {
  source            = "../../modules/api-gateway"
  environment       = var.environment
  allowed_origins   = [local.app_url, "http://localhost:3000"]
  cognito_issuer    = module.cognito.issuer
  cognito_client_id = module.cognito.app_client_id
  # Sin placeholder 501: el resto del contrato lo sirve backend-api con datos de demo.
  placeholder_routes = []
}

# Backend de la API (spec 007): tenant y equipo. Antes del plan hay que construirlo
# (`pnpm --filter @jano/backend build`); deploy-dev.sh y CI lo hacen.
module "backend_api" {
  source            = "../../modules/backend-api"
  environment       = var.environment
  cluster_arn       = module.aurora.cluster_arn
  database_name     = module.aurora.database_name
  user_pool_id      = module.cognito.user_pool_id
  user_pool_arn     = module.cognito.user_pool_arn
  api_id            = module.api_gateway.api_id
  authorizer_id     = module.api_gateway.authorizer_id
  api_execution_arn = module.api_gateway.execution_arn
  codigo_dir        = "${path.root}/../../../backend/dist/api"
  motor_codigo_dir  = "${path.root}/../../../backend/dist/motor"
  mail_allowlist    = var.mail_allowlist
  demo_day_minutes  = var.demo_day_minutes
  # Comodín de demo para lo que el backend aún no sirva; con la spec 008 lo sirve todo
  # y pasa a false en la fase D (T042), cuando el tenant de prueba esté dado de alta.
  demo_data = true
  # La demo comercial sigue con datos de ejemplo; la prueba de concepto va en otro tenant.
  demo_tenants = ["tenant-rumbonorte"]
}
