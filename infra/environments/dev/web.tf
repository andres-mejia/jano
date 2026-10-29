# Landing y app en Amplify (US1) y formulario de acceso anticipado de la landing (US2).

module "waitlist" {
  source                 = "../../modules/waitlist"
  environment            = var.environment
  allowed_origins        = [local.landing_url, local.app_url, "http://localhost:4321", "http://localhost:3000"]
  ses_from_address       = var.ses_from_address
  notify_address         = var.ses_notify_address
  configuration_set_name = module.email.configuration_set_name
  site_url               = local.landing_url
}

module "landing" {
  source              = "../../modules/landing"
  environment         = var.environment
  parent_domain       = var.parent_zone_name
  fqdn                = var.landing_fqdn
  github_repository   = var.github_repository
  github_access_token = var.github_access_token
  pnpm_version        = var.pnpm_version
  environment_variables = {
    PUBLIC_WAITLIST_ENDPOINT = module.waitlist.endpoint_url
    PUBLIC_APP_URL           = local.app_url
    PUBLIC_SITE_URL          = local.landing_url
  }
}

module "app_hosting" {
  source              = "../../modules/app-hosting"
  environment         = var.environment
  parent_domain       = var.parent_zone_name
  fqdn                = var.app_fqdn
  github_repository   = var.github_repository
  github_access_token = var.github_access_token
  pnpm_version        = var.pnpm_version
  environment_variables = {
    NEXT_PUBLIC_AUTH_MODE            = "cognito"
    NEXT_PUBLIC_ENVIRONMENT          = var.environment
    NEXT_PUBLIC_AWS_REGION           = "eu-west-1"
    NEXT_PUBLIC_COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    NEXT_PUBLIC_COGNITO_CLIENT_ID    = module.cognito.app_client_id
    NEXT_PUBLIC_COGNITO_DOMAIN       = module.cognito.hosted_ui_domain
    NEXT_PUBLIC_API_BASE_URL         = module.api_gateway.api_base_url
  }
}
