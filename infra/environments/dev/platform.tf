module "assets" {
  source      = "../../modules/assets"
  environment = var.environment
}

# Presupuesto de Jano (FR-009). Filtra por la etiqueta de costes `Project=jano`, que
# hubo que activar una vez por CLI (research.md, T003); sin el filtro mediría la
# cuenta entera, que ya vigila `fenora-dev-mensual`. Budgets trabaja en USD.
resource "aws_budgets_budget" "monthly" {
  name         = "jano-${var.environment}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$jano"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.ses_notify_address]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.ses_notify_address]
  }
}

module "email" {
  source      = "../../modules/email"
  environment = var.environment
  alert_email = var.ses_notify_address
}
