# Arranque de Terraform en CI

El rol `jano-dev-github-actions` lo crea Terraform (`module.github_oidc`) con una política permanente mínima (actualizar el código de las Lambdas `jano-dev-*`). Para que `infra-apply.yml` pueda aplicar todo lo demás hace falta, una vez, la política de arranque de este directorio: `Allow *` hasta el 2027-01-31 con `Deny` de guarda. Es el patrón de Fenora, en la forma que le dio Cardea (`cardea/infra/bootstrap`).

Es un paso manual **por CLI**, nunca desde la consola, y queda fuera del estado de Terraform.

## Qué impide la política

| Sid | Qué cierra |
|---|---|
| `NoDejarseSinAcceso` | Borrar el propio rol de CI, sus políticas o el proveedor OIDC. |
| `NoTocarFenoraNiCardea` | Cualquier acción sobre recursos con `fenora`, `fintrack` o `cardea` en el ARN (salvo S3 y DynamoDB, abajo). |
| `NoTocarRecursosEtiquetadosDeFenoraNiCardea` | EC2, ELB, RDS y Auto Scaling con `Project=fenora` o `Project=cardea` (sus ARN no llevan el nombre). |
| `SoloS3DeJanoYSuEstado` | Todo S3 salvo los buckets `jano-*` y la clave `jano/` del bucket de estado de Fenora. Es la diferencia con Cardea: el estado de Jano vive en ese bucket (FR-001) y un `Deny` por nombre `fenora-*` lo bloquearía. |
| `ElBucketDeEstadoSoloSeLeeYSeEscribeEnJano` | En el bucket de estado, cualquier acción distinta de listar, leer, escribir y borrar objetos: ni políticas, ni versionado, ni ciclo de vida, ni borrar el bucket. |
| `SoloDynamoDBDeJanoYLocks` | Todo DynamoDB salvo las tablas `jano-*` y la tabla de locks compartida. |
| `LaTablaDeLocksSoloBloquea` | En la tabla de locks, cualquier acción distinta de leer, poner y quitar el lock. |
| `NoEngancharPoliticasDeAdministradorANadie` | Adjuntar `AdministratorAccess`, `IAMFullAccess` o `PowerUserAccess`. |
| `NoRepintarPoliticasNiUsuariosNiGrupos` | Versiones de políticas gestionadas y políticas inline de usuarios y grupos. |
| `NoCrearCredencialesDeLargaVida` | Usuarios IAM, claves de acceso, contraseñas de consola. |
| `NoOrganizacionesNiCambiosDeFacturacion` | Organizations, cierre de cuenta, métodos de pago. |

Lo que **no** puede impedir, igual que en Cardea: con `Allow *` vigente, el rol puede crear otro rol con una política inline propia equivalente a administrador, o reescribir esta misma política con `put-role-policy` y el mismo nombre. Tampoco protege lo compartido sin nombre de proyecto: la zona `tekhos.com` y la identidad SES de `tekhos.com`. La barrera real es que todo lo que ejecuta el rol entra por PR a `main` y pasa la guardia del plan. `.github/scripts/test_politica_arranque.py` comprueba que la política no bloquea lo que Terraform necesita y que los `Deny` siguen cerrando lo que deben.

Riesgo recíproco: los roles de CI de Fenora y Cardea tienen su propia política `Allow *` y **sí** pueden tocar recursos de Jano. Eso solo se corrige en sus repos.

## Adjuntarla (una vez)

```bash
cd infra/bootstrap
aws iam put-role-policy \
  --role-name jano-dev-github-actions \
  --policy-name arranque-ci-caduca-2027-01-31 \
  --policy-document file://politica-arranque-ci.json \
  --profile fintrack-dev
aws iam list-role-policies --role-name jano-dev-github-actions --profile fintrack-dev
# Debe listar jano-dev-github-actions-deploy y arranque-ci-caduca-2027-01-31.
```

## Renovarla antes de que caduque

Primero se pone la nueva, después se borra la vieja; al revés hay una ventana sin permisos.

1. Mover la fecha en `politica-arranque-ci.json` (Sid y condición) en un PR con sus tests.
2. `put-role-policy` con el nombre nuevo (`arranque-ci-caduca-<fecha>`).
3. `list-role-policies` y comprobar que están las dos.
4. `delete-role-policy` de la vieja, desde la sesión SSO de Andrés: el propio rol de CI no puede (`NoDejarseSinAcceso`).

## Sustituirla

El objetivo es retirarla: una política permanente acotada a recursos `jano-*` con permissions boundary para los roles que cree Terraform. Hasta entonces, la fecha de caducidad obliga a revisarla.
