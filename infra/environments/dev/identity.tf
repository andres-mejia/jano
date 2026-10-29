# Cognito de la app (US3). La app redirige a `/` tras el login y a `/login` tras
# el logout (frontend/jano-app/src/lib/auth/amplify-config.ts).

module "cognito" {
  source        = "../../modules/cognito"
  environment   = var.environment
  domain_prefix = "jano-${var.environment}"
  callback_urls = ["${local.app_url}/", "http://localhost:3000/"]
  logout_urls   = ["${local.app_url}/login", "http://localhost:3000/login"]
}
