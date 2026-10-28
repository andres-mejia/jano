# Variables del entorno dev. Los módulos se componen en main.tf a medida que
# los crea la spec 002 (specs/002-infra-dev-aws).

variable "environment" {
  type    = string
  default = "dev"
}

variable "domain_name" {
  type        = string
  description = "Apex del producto. Placeholder hasta decidir el dominio (ADR-001); la hosted zone debe existir en Route 53 antes del primer apply."
  default     = "jano.example"
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
