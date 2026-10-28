# Backend S3 — misma cuenta, mismo bucket de estado y misma tabla de locks que
# Fenora (ADR-001): el bucket `fenora-terraform-state-<ACCOUNT_ID>` y la tabla
# `fenora-terraform-locks` ya existen; Jano solo usa otra clave. El nombre del
# bucket se pasa con `-backend-config=bucket=...` desde el script de deploy o
# el workflow, igual que en Fenora.

terraform {
  backend "s3" {
    key            = "jano/dev/terraform.tfstate"
    region         = "eu-west-1"
    encrypt        = true
    dynamodb_table = "fenora-terraform-locks"
    # bucket = ... → -backend-config
  }
}
