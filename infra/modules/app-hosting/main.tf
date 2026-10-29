# App de Jano en Amplify Hosting `WEB_COMPUTE` (Next.js SSR), en `jano-app.tekhos.com`.
#
# Forma de `cardea/infra/modules/amplify-site` (y antes `fintrack/infra/modules/cdn`):
#   - Conexión con GitHub por token en el apply que crea la app; después
#     `ignore_changes` evita que un apply sin token la borre (research.md, T002).
#   - `build_spec` igual a la entrada `frontend/jano-app` del `amplify.yml` de la raíz:
#     el `cd ../..` es lo que permite a pnpm resolver `workspace:*`.
#   - Solo `main` construye; sin previews de PR (US1.3).
#   - Dominio: subdominio de la zona existente; Amplify escribe la validación y el CNAME.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.1" }
  }
}

variable "environment" { type = string }

variable "parent_domain" {
  type        = string
  description = "Zona existente (tekhos.com)."
}

variable "fqdn" { type = string }

variable "github_repository" { type = string }

variable "github_access_token" {
  type      = string
  default   = ""
  sensitive = true
}

variable "pnpm_version" { type = string }

variable "environment_variables" {
  type    = map(string)
  default = {}
}

locals {
  name     = "jano-${var.environment}-app"
  app_root = "frontend/jano-app"
  prefix   = trimsuffix(var.fqdn, ".${var.parent_domain}")
}

resource "aws_iam_role" "amplify" {
  name = "${local.name}-amplify"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "amplify.amazonaws.com" } }]
  })
  tags = { Component = "app-hosting" }
}

resource "aws_iam_role_policy_attachment" "amplify" {
  role       = aws_iam_role.amplify.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmplifyBackendDeployFullAccess"
}

resource "aws_amplify_app" "this" {
  name                 = local.name
  repository           = var.github_access_token != "" ? var.github_repository : null
  access_token         = var.github_access_token != "" ? var.github_access_token : null
  iam_service_role_arn = aws_iam_role.amplify.arn
  platform             = "WEB_COMPUTE"
  tags                 = { Component = "app-hosting" }

  build_spec = <<-EOT
    version: 1
    applications:
      - appRoot: ${local.app_root}
        frontend:
          phases:
            preBuild:
              commands:
                - corepack enable
                - corepack prepare pnpm@${var.pnpm_version} --activate
                - cd ../.. && pnpm install --frozen-lockfile && cd ${local.app_root}
            build:
              commands:
                - pnpm run build
          artifacts:
            baseDirectory: .next
            files:
              - '**/*'
          cache:
            paths:
              - ../../node_modules/**/*
              - node_modules/**/*
              - .next/cache/**/*
  EOT

  environment_variables = merge(var.environment_variables, {
    AMPLIFY_MONOREPO_APP_ROOT = local.app_root
    AMPLIFY_DIFF_DEPLOY       = "false"
  })

  lifecycle {
    # La conexión con GitHub se cablea con el token en el apply que crea la app; los
    # applies posteriores (CI, sin token) no deben borrarla.
    ignore_changes = [repository, access_token]
  }
}

resource "aws_amplify_branch" "main" {
  app_id                      = aws_amplify_app.this.id
  branch_name                 = "main"
  framework                   = "Next.js - SSR"
  stage                       = "PRODUCTION"
  enable_auto_build           = true
  enable_pull_request_preview = false
  tags                        = { Component = "app-hosting" }
}

resource "aws_amplify_domain_association" "this" {
  app_id                = aws_amplify_app.this.id
  domain_name           = var.parent_domain
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = local.prefix
  }
}

output "app_id" { value = aws_amplify_app.this.id }
output "default_domain" { value = aws_amplify_app.this.default_domain }
