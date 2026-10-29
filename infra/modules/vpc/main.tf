# VPC mínima de Jano (plan 002, decisión 2): solo alberga el subnet group de Aurora.
#
# Sin IGW, sin subredes públicas, sin NAT y sin endpoints: ninguna Lambda entra
# aquí (ADR-001 §3) y la Data API llega a Aurora sin pasar por la VPC. Forma de
# `fintrack/infra/modules/vpc` y `cardea/infra/modules/vpc`, recortada a lo privado.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.1" }
  }
}

variable "environment" { type = string }

variable "cidr_block" {
  type        = string
  default     = "10.30.0.0/16"
  description = "Distinto de Fenora (10.0.0.0/16) y Cardea (10.20.0.0/16) por si alguna vez hay que emparejarlas."
}

variable "az_count" {
  type        = number
  default     = 2
  description = "Aurora exige al menos dos AZ en su subnet group."
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  prefix = "jano-${var.environment}"
}

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "${local.prefix}-vpc", Component = "vpc" }
}

resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "${local.prefix}-private-${count.index}", Tier = "private", Component = "vpc" }
}

# Tabla sin rutas de salida: lo privado se queda privado.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-private-rt", Component = "vpc" }
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

output "vpc_id" { value = aws_vpc.main.id }
output "vpc_cidr" { value = aws_vpc.main.cidr_block }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
