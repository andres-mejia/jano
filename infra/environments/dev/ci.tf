# Roles OIDC de GitHub Actions (US4). El estado está en el bucket y la tabla de
# Fenora (FR-001): el rol de plan solo lee la clave `jano/`.

module "github_oidc" {
  source          = "../../modules/github-oidc"
  environment     = var.environment
  github_repo     = var.github_repo
  oidc_sub_prefix = var.github_oidc_sub_prefix
  state_bucket    = "fenora-terraform-state-${data.aws_caller_identity.current.account_id}"
  lock_table      = "fenora-terraform-locks"
}

output "github_actions_role_arn" { value = module.github_oidc.role_arn }
output "github_actions_plan_role_arn" { value = module.github_oidc.plan_role_arn }
