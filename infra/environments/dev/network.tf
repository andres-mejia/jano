# VPC mínima para el subnet group de Aurora (plan 002, decisión 2). Ninguna Lambda
# entra en ella: acceden a Aurora por la Data API.

module "vpc" {
  source      = "../../modules/vpc"
  environment = var.environment
}

module "aurora" {
  source      = "../../modules/aurora"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids
  min_acu     = var.aurora_min_acu
  max_acu     = var.aurora_max_acu
}
