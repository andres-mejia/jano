# Bucket de evidencias y adjuntos de Jano (forma de `fintrack/infra/modules/assets`).
#
# Recortes respecto a Fenora: sin CloudFront ni URL firmadas (el backend de 003
# firmará URL de S3 si hace falta) y SSE-S3 en vez de CMK, que cuesta 1 $/mes por
# clave y no aporta nada en dev. Cada clave lleva el `tenant_id` como prefijo
# (AGENTS.md §4); lo impone el backend, no el bucket.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.1" }
  }
}

variable "environment" { type = string }

variable "noncurrent_version_days" {
  type        = number
  default     = 90
  description = "Días que se conservan las versiones sobrescritas o borradas."
}

data "aws_caller_identity" "current" {}

locals {
  bucket = "jano-${var.environment}-assets-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "assets" {
  bucket = local.bucket
  tags   = { Name = local.bucket, Component = "assets" }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "versiones-antiguas"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.assets]
}

# Solo TLS: cualquier petición sin HTTPS se rechaza.
resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SoloTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.assets]
}

output "bucket" { value = aws_s3_bucket.assets.bucket }
output "bucket_arn" { value = aws_s3_bucket.assets.arn }
