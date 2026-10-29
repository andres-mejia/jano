# Variables del entorno dev. Los módulos se componen en main.tf a medida que
# los crea la spec 002 (specs/002-infra-dev-aws).

variable "environment" {
  type    = string
  default = "dev"
}

variable "parent_zone_name" {
  type        = string
  description = "Zona de Route 53 ya existente bajo la que cuelgan los subdominios de Jano. Terraform solo la lee."
  default     = "tekhos.com"
}

variable "landing_fqdn" {
  type        = string
  description = "FQDN de la landing (Amplify WEB). Mismo lineamiento que Cardea: subdominio del dominio principal hasta decidir dominio propio."
  default     = "jano.tekhos.com"
}

variable "app_fqdn" {
  type        = string
  description = "FQDN de la app (Amplify WEB_COMPUTE)."
  default     = "jano-app.tekhos.com"
}

variable "ses_from_address" {
  type        = string
  description = "Remitente de los correos del producto y de la waitlist, sobre la identidad SES ya verificada del dominio principal."
  default     = "jano@tekhos.com"
}

variable "ses_notify_address" {
  type        = string
  description = "Destino del aviso de cada alta en la waitlist y de los avisos del presupuesto. Como en Cardea, una dirección de tekhos.com: el catch-all de us-east-1 la redirige a Andrés."
  default     = "jano@tekhos.com"
}

variable "github_repository" {
  type        = string
  description = "URL HTTPS del repo que despliega Amplify."
  default     = "https://github.com/andres-mejia/jano"
}

variable "github_access_token" {
  type        = string
  default     = ""
  sensitive   = true
  description = "GitHub PAT con scopes repo + admin:repo_hook. Si vacío, el repo se cablea una vez desde la consola de Amplify."
}

variable "aurora_min_acu" {
  type        = number
  default     = 0
  description = "0 = auto-pause."
}

variable "aurora_max_acu" {
  type    = number
  default = 4
}

variable "monthly_budget_usd" {
  type        = string
  default     = "50"
  description = "Límite mensual del presupuesto de Jano (FR-009)."
}

variable "pnpm_version" {
  type        = string
  default     = "10.4.0"
  description = "Igual que packageManager en package.json."
}

variable "github_repo" {
  type        = string
  default     = "andres-mejia/jano"
  description = "owner/repo que asume los roles OIDC."
}

# El repo usa el formato inmutable del claim `sub` de GitHub (owner y repo con su id
# numérico): el trust con `repo:andres-mejia/jano:...` nunca casa. Se consulta con
# `gh api repos/andres-mejia/jano/actions/oidc/customization/sub`.
variable "github_oidc_sub_prefix" {
  type    = string
  default = "repo:andres-mejia@49398769/jano@1437715854"
}

# Motor (spec 008). La lista blanca no va en el repo: se fija en terraform.tfvars en
# local y como variable TF_VAR_mail_allowlist en CI. Vacía, el Contact Finder no
# tiene destinatario de prueba (los prospects quedan sin verificar) y no sale nada.
variable "mail_allowlist" {
  type        = string
  default     = ""
  description = "Destinatarios de prueba separados por comas (spec 008 FR-021); admite alias con +."
}

variable "demo_day_minutes" {
  type        = number
  default     = 1440
  description = "Duración de un «día» de secuencia en minutos (DEMO_DAY_MINUTES). Para la demo, p. ej. 5."
}
