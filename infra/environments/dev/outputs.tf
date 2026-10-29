# Outputs que consumen 001 (frontends) y 003 (backend); plan 002, «Outputs».
# Cambiar un nombre aquí es un cambio de contrato para esas specs.

output "aurora_cluster_arn" { value = module.aurora.cluster_arn }
output "aurora_secret_arn" { value = module.aurora.master_user_secret_arn }
output "aurora_database_name" { value = module.aurora.database_name }
output "assets_bucket" { value = module.assets.bucket }
output "vpc_id" { value = module.vpc.vpc_id }

output "cognito_user_pool_id" { value = module.cognito.user_pool_id }
output "cognito_client_id" { value = module.cognito.app_client_id }
output "cognito_domain" { value = module.cognito.hosted_ui_domain }
output "cognito_issuer" { value = module.cognito.issuer }

output "waitlist_endpoint_url" { value = module.waitlist.endpoint_url }
output "waitlist_table" { value = module.waitlist.table_name }
output "ses_configuration_set" { value = module.email.configuration_set_name }
