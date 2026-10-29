# Correo saliente de Jano (forma de Cardea, que ya redujo la de Fenora). La identidad SES es la de
# `tekhos.com`, que no gestiona Jano (stack `tekhos-email-sending`); aquí solo vive el
# conjunto de configuración con el que envía Jano y sus alarmas. La recepción de
# `tekhos.com` (us-east-1) ya reenvía cualquier dirección del dominio, `jano@` incluida
# (research.md, T002): no hay regla de recepción propia.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.1" }
  }
}

variable "environment" { type = string }

variable "alert_email" {
  type        = string
  description = "Destino de las alarmas de reputación. La suscripción SNS se confirma desde el correo."
}

variable "bounce_rate_threshold" {
  type    = number
  default = 0.05
}

variable "complaint_rate_threshold" {
  type    = number
  default = 0.001
}

locals {
  name = "jano-${var.environment}"
}

resource "aws_sesv2_configuration_set" "main" {
  configuration_set_name = local.name

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }
}

resource "aws_sesv2_configuration_set_event_destination" "cloudwatch" {
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "cloudwatch-events"

  event_destination {
    enabled              = true
    matching_event_types = ["SEND", "BOUNCE", "COMPLAINT", "DELIVERY", "REJECT", "RENDERING_FAILURE"]

    cloud_watch_destination {
      dimension_configuration {
        dimension_name          = "ses:configuration-set"
        dimension_value_source  = "MESSAGE_TAG"
        default_dimension_value = local.name
      }
    }
  }
}

resource "aws_sns_topic" "ses_alerts" {
  name = "${local.name}-ses-alerts"
}

resource "aws_sns_topic_subscription" "ses_alerts_email" {
  topic_arn = aws_sns_topic.ses_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Reputation.* es una métrica de cuenta en SES: refleja también los envíos de Fenora, Cardea y tekhos.
resource "aws_cloudwatch_metric_alarm" "bounce_rate" {
  alarm_name          = "${local.name}-ses-bounce-rate"
  alarm_description   = "SES BounceRate de la cuenta por encima del umbral; AWS suspende con >5% sostenido"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Average"
  period              = 900
  evaluation_periods  = 1
  threshold           = var.bounce_rate_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ses_alerts.arn]
  ok_actions          = [aws_sns_topic.ses_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "complaint_rate" {
  alarm_name          = "${local.name}-ses-complaint-rate"
  alarm_description   = "SES ComplaintRate de la cuenta por encima del umbral; AWS suspende con >0.1% sostenido"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Average"
  period              = 900
  evaluation_periods  = 1
  threshold           = var.complaint_rate_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ses_alerts.arn]
  ok_actions          = [aws_sns_topic.ses_alerts.arn]
}

output "configuration_set_name" { value = aws_sesv2_configuration_set.main.configuration_set_name }
