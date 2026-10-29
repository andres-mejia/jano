# Jano — entorno dev (specs/002-infra-dev-aws)
#
#   data.tf      lo que Jano lee y no gestiona (cuenta, zona tekhos.com)
#   network.tf   VPC mínima y Aurora con Data API
#   identity.tf  Cognito, trigger pre-token y HTTP API con autorizador
#   platform.tf  bucket de assets, presupuesto y correo saliente
#   web.tf       landing y app en Amplify y formulario de acceso anticipado
#   outputs.tf   lo que consumen 001 y 003
#
# Nada de este directorio se aplica sin plan revisado (AGENTS.md §8):
# `infra/scripts/deploy-dev.sh` hace init, plan y apply con confirmación.
