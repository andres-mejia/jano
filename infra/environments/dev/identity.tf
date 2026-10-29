# Cognito de la app (US3). La app redirige a `/` tras el login y a `/login` tras
# el logout (frontend/jano-app/src/lib/auth/amplify-config.ts).

module "cognito" {
  source        = "../../modules/cognito"
  environment   = var.environment
  domain_prefix = "jano-${var.environment}"
  callback_urls = ["${local.app_url}/", "http://localhost:3000/"]
  logout_urls   = ["${local.app_url}/login", "http://localhost:3000/login"]
}

# HTTP API con autorizador JWT del pool (US3, fase 4). Solo rutas del contrato.
module "api_gateway" {
  source            = "../../modules/api-gateway"
  environment       = var.environment
  allowed_origins   = [local.app_url, "http://localhost:3000"]
  cognito_issuer    = module.cognito.issuer
  cognito_client_id = module.cognito.app_client_id
}
