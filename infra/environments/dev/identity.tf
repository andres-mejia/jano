# Cognito de la app (spec 002, US3; Google en la spec 006). La app redirige a `/` tras el login y a `/login` tras
# el logout (frontend/jano-app/src/lib/auth/amplify-config.ts).

# Client OAuth de Google (spec 006): el de Fenora, copiado una vez por CLI a un secreto
# de Jano (docs/guias/despliegue-dev.md). Sin `try()`, como en Fenora: si el secreto
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
}
