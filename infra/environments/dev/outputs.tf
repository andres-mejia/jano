# Outputs que consumen 001 (frontends) y 003 (backend); plan 002, «Outputs».
# Cambiar un nombre aquí es un cambio de contrato para esas specs.

output "aurora_cluster_arn" { value = module.aurora.cluster_arn }
output "aurora_secret_arn" { value = module.aurora.master_user_secret_arn }
output "aurora_database_name" { value = module.aurora.database_name }
output "assets_bucket" { value = module.assets.bucket }
output "vpc_id" { value = module.vpc.vpc_id }
