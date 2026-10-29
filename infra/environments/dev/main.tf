# Jano — entorno dev (specs/002-infra-dev-aws)
#
#   data.tf      lo que Jano lee y no gestiona (cuenta, zona tekhos.com)
#   network.tf   VPC mínima y Aurora con Data API
#   platform.tf  bucket de assets y presupuesto
#   outputs.tf   lo que consumen 001 y 003
#
# Nada de este directorio se aplica sin plan revisado (AGENTS.md §8):
# `infra/scripts/deploy-dev.sh` hace init, plan y apply con confirmación.
