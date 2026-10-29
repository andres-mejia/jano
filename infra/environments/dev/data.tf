# Recursos que Jano usa y no gestiona.

data "aws_caller_identity" "current" {}

# tekhos.com: zona ajena a Jano (la comparten Cardea y tekhos). Amplify escribe en
# ella los registros de jano y jano-app; Terraform solo la lee.
data "aws_route53_zone" "parent" {
  name         = var.parent_zone_name
  private_zone = false
}

locals {
  landing_url = "https://${var.landing_fqdn}"
  app_url     = "https://${var.app_fqdn}"
}
