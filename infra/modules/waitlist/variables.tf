variable "environment" { type = string }

variable "allowed_origins" {
  type        = list(string)
  description = "Orígenes CORS: landing, app y localhost (US2.4)."
}

variable "ses_from_address" {
  type        = string
  description = "Remitente, sobre la identidad SES ya verificada de su dominio."
}

variable "notify_address" {
  type        = string
  description = "Destino del aviso de cada alta."
}

variable "configuration_set_name" { type = string }

variable "site_url" {
  type        = string
  description = "URL de la landing que firma el correo de confirmación."
}

variable "rate_limit_per_ip_per_hour" {
  type    = number
  default = 5
}

variable "log_retention_days" {
  type    = number
  default = 30
}
