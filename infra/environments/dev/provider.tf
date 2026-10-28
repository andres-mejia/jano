# Provider AWS — eu-west-1 + alias us-east-1 (certificados ACM para Amplify).
#
# El perfil es condicional por la misma razón que en Fenora: en un runner de
# GitHub Actions las credenciales llegan por OIDC como variables de entorno y
# no existe `~/.aws/config`; el workflow pasa `-var aws_profile=""`.

variable "aws_profile" {
  description = "Perfil AWS local (SSO). Vacío en CI."
  type        = string
  default     = "fintrack-dev"
}

locals {
  aws_profile = var.aws_profile != "" ? var.aws_profile : null
}

provider "aws" {
  region  = "eu-west-1"
  profile = local.aws_profile

  default_tags {
    tags = {
      Project     = "jano"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = local.aws_profile

  default_tags {
    tags = {
      Project     = "jano"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}
