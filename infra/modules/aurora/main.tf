# Aurora PostgreSQL Serverless v2 de Jano (forma de Fenora y Cardea, plan 002).
#
# Diferencias deliberadas:
#   - Data API activada (`enable_http_endpoint`): es la única vía desde las Lambdas,
#     que viven fuera de VPC (ADR-001 §3). Por eso el SG no tiene ingress.
#   - Sin RDS Proxy (Fenora) ni bastión (Cardea): sin conexiones TCP no hacen falta.
#   - PostgreSQL 16: la Data API y `min_capacity = 0` están soportados en 16.x.
# Con `min_acu = 0` el cluster se pausa a los `seconds_until_auto_pause` sin
# actividad; la primera llamada tras la pausa devuelve `DatabaseResumingException`
# y quien llama reintenta (plan 002, riesgos).

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.1" }
  }
}

variable "environment" { type = string }
variable "vpc_id" { type = string }

variable "subnet_ids" {
  type        = list(string)
  description = "Subredes privadas, al menos dos AZ."
}

variable "engine_version" {
  type    = string
  default = "16.15"
}

variable "min_acu" {
  type        = number
  default     = 0
  description = "0 = auto-pause (dev)."
}

variable "max_acu" {
  type    = number
  default = 4
}

variable "seconds_until_auto_pause" {
  type    = number
  default = 300
}

locals {
  prefix = "jano-${var.environment}"
}

resource "aws_security_group" "aurora" {
  name_prefix = "${local.prefix}-aurora-"
  description = "Aurora de Jano: sin ingress, solo Data API"
  vpc_id      = var.vpc_id
  tags        = { Name = "${local.prefix}-aurora-sg", Component = "aurora" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${local.prefix}-aurora"
  subnet_ids = var.subnet_ids
  tags       = { Component = "aurora" }
}

resource "aws_rds_cluster_parameter_group" "aurora" {
  name   = "${local.prefix}-aurora-pg16"
  family = "aurora-postgresql16"
  tags   = { Component = "aurora" }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier              = local.prefix
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  engine_version                  = var.engine_version
  database_name                   = "jano_${var.environment}"
  master_username                 = "jano_admin"
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.aurora.id]
  storage_encrypted               = true
  enable_http_endpoint            = true
  deletion_protection             = var.environment == "prod"
  skip_final_snapshot             = var.environment != "prod"
  final_snapshot_identifier       = var.environment == "prod" ? "${local.prefix}-final" : null
  apply_immediately               = var.environment != "prod"
  backup_retention_period         = 1
  copy_tags_to_snapshot           = true
  tags                            = { Component = "aurora" }

  serverlessv2_scaling_configuration {
    min_capacity             = var.min_acu
    max_capacity             = var.max_acu
    seconds_until_auto_pause = var.min_acu == 0 ? var.seconds_until_auto_pause : null
  }
}

resource "aws_rds_cluster_instance" "main" {
  identifier          = "${local.prefix}-1"
  cluster_identifier  = aws_rds_cluster.main.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.main.engine
  engine_version      = aws_rds_cluster.main.engine_version
  publicly_accessible = false
  tags                = { Component = "aurora" }
}

output "cluster_arn" { value = aws_rds_cluster.main.arn }
output "cluster_endpoint" { value = aws_rds_cluster.main.endpoint }
output "master_user_secret_arn" { value = aws_rds_cluster.main.master_user_secret[0].secret_arn }
output "database_name" { value = aws_rds_cluster.main.database_name }
