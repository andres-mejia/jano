# Lo que publica la landing: formulario de acceso anticipado (US2). Landing y app
# en Amplify se añaden en la fase 5.

module "waitlist" {
  source                 = "../../modules/waitlist"
  environment            = var.environment
  allowed_origins        = [local.landing_url, local.app_url, "http://localhost:4321", "http://localhost:3000"]
  ses_from_address       = var.ses_from_address
  notify_address         = var.ses_notify_address
  configuration_set_name = module.email.configuration_set_name
  site_url               = local.landing_url
}
