# Jano — entorno dev (specs/002-infra-dev-aws)
#
#   data.tf      lo que Jano lee y no gestiona (cuenta, zona tekhos.com)
#   network.tf   VPC mínima y Aurora con Data API
#   identity.tf  Cognito y trigger pre-token
#   platform.tf  bucket de assets, presupuesto y correo saliente
#   web.tf       formulario de acceso anticipado (y Amplify en la fase 5)
#   outputs.tf   lo que consumen 001 y 003
#
# Nada de este directorio se aplica sin plan revisado (AGENTS.md §8):
# `infra/scripts/deploy-dev.sh` hace init, plan y apply con confirmación.
