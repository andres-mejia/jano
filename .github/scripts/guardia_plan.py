#!/usr/bin/env python3
"""Guardia del plan de Terraform: ningún apply automático pierde datos sin avisar.

Portado de Fenora (`andres-mejia/fintrack`) a través de Cardea (`andres-mejia/cardea`).

`infra-apply.yml` aplica en cada push a `main` que toca `infra/**`, con un rol que
durante el arranque tiene `Allow *` en la cuenta. Esta es la barrera, escrita donde
se ve y con tests versionados (`test_guardia_plan.py`).

Clasifica cada destrucción por el TIPO de recurso, no por su dirección:

  · `SEGUROS`: se recrean desde el código sin perder nada (Lambdas, API Gateway,
    colas, alarmas, IAM, red...). Su reemplazo pasa solo.
  · `PERDIDA_POR_TIPO`: destruyen algo que no vuelve con un `apply` (Aurora, Cognito,
    S3, DynamoDB, ECR, instancias...). El guardia para y dice qué se perdería.
  · Cualquier otro tipo: **desconocido = protegido**.

Un reemplazo (`["delete", "create"]` o al revés) es un borrado. Crear y modificar
in-place pasan sin más.

Los tipos que ejecutan código en el runner (`TIPOS_QUE_EJECUTAN`) también paran, salvo
las direcciones exactas de `EJECUCION_DECLARADA`. Esto es un extra barato, no la
barrera contra código arbitrario: un `local-exec` en un recurso normal no aparece en el
plan, y `init`/`plan` ya han ejecutado providers y data sources. La barrera real es
que los `.tf` entran por PR.

Para autorizar una pérdida legítima, a mano y solo en esa ejecución (sin comodines):

    PERMITIR_DESTRUCCION='module.aurora.aws_rds_cluster.main' python3 guardia_plan.py plan.json
"""

import json
import os
import sys

# Acciones que destruyen. `["delete", "create"]` y `["create", "delete"]`
# son los dos ordenes que usa Terraform para un reemplazo (el segundo es
# `create_before_destroy`). Los dos destruyen el recurso que habia.
DESTRUCTIVAS = {"delete"}

# ── Tipos que ejecutan comandos, y por que esto NO es una barrera ───
#
# LEER ANTES DE CONFIAR EN ESTO PARA ALGO.
#
# Un `terraform_data` o un `null_resource` con `provisioner "local-exec"`
# corre lo que le digan EN EL RUNNER, con las credenciales de admin ya
# cargadas. Su accion en el plan es `create`, no `delete`, asi que la
# clasificacion por perdida de datos no lo ve — esto es un riesgo
# distinto (ejecucion de codigo, no destruccion) y se trata aparte de
# `SEGUROS`/`PERDIDA_POR_TIPO`.
#
# PERO ESTE GUARDIA NO PUEDE SER LA BARRERA CONTRA EJECUCION DE CODIGO,
# y decirlo importa mas que el filtro en si:
#
#   · Un `provisioner "local-exec"` en un recurso NORMAL no aparece en
#     el JSON del plan. El guardia ve `type = aws_instance` y lo deja
#     pasar, y el provisioner corre en el apply.
#   · El guardia se ejecuta DESPUES de `terraform init` y `terraform
#     plan`, que ya han descargado providers y modulos —`source` puede
#     ser cualquier URL— y ya han leido los data sources no diferidos.
#     Para cuando este fichero opina, el codigo ajeno ya corrio.
#
# La defensa real contra codigo arbitrario en un `.tf` es que los `.tf`
# entran por PR a `main`, con revision humana. Este filtro es un extra
# barato para los tres tipos cuyo unico proposito es ejecutar algo, no
# una garantia.
TIPOS_QUE_EJECUTAN = {"terraform_data", "null_resource", "external", "http"}

# ── Tipos que se recrean desde el codigo sin perder nada ────────────
#
# Su reemplazo o borrado se autoriza SOLO, sin pedir PERMITIR_DESTRUCCION:
# computo e integraciones, no datos.
SEGUROS = {
    # Lambda
    "aws_lambda_function",
    "aws_lambda_alias",
    "aws_lambda_permission",
    "aws_lambda_function_event_invoke_config",
    "aws_lambda_event_source_mapping",
    "aws_lambda_layer_version",
    # API Gateway (REST y HTTP/v2)
    "aws_api_gateway_rest_api",
    "aws_api_gateway_resource",
    "aws_api_gateway_method",
    "aws_api_gateway_method_response",
    "aws_api_gateway_integration",
    "aws_api_gateway_integration_response",
    "aws_api_gateway_deployment",
    "aws_api_gateway_stage",
    "aws_api_gateway_base_path_mapping",
    "aws_api_gateway_domain_name",
    "aws_apigatewayv2_api",
    "aws_apigatewayv2_route",
    "aws_apigatewayv2_integration",
    "aws_apigatewayv2_stage",
    "aws_apigatewayv2_domain_name",
    "aws_apigatewayv2_deployment",
    "aws_apigatewayv2_authorizer",
    # EventBridge
    "aws_cloudwatch_event_rule",
    "aws_cloudwatch_event_target",
    "aws_cloudwatch_event_api_destination",
    "aws_cloudwatch_event_connection",
    "aws_cloudwatch_event_bus",
    # SNS / SQS
    "aws_sns_topic",
    "aws_sns_topic_subscription",
    "aws_sns_topic_policy",
    "aws_sqs_queue",
    "aws_sqs_queue_policy",
    # WAF / CloudFront
    "aws_wafv2_web_acl",
    "aws_wafv2_web_acl_association",
    "aws_wafv2_ip_set",
    "aws_wafv2_regex_pattern_set",
    "aws_cloudfront_distribution",
    "aws_cloudfront_public_key",
    "aws_cloudfront_origin_access_control",
    "aws_cloudfront_function",
    # ECR: la política de ciclo de vida. El repositorio está en PERDIDA_POR_TIPO.
    "aws_ecr_lifecycle_policy",
    # `aws_instance` NO está aquí: ver PERDIDA_POR_TIPO.
    # Observabilidad / IAM: configuracion, no datos
    "aws_cloudwatch_metric_alarm",
    "aws_cloudwatch_log_group",
    "aws_iam_role",
    "aws_iam_role_policy",
    "aws_iam_role_policy_attachment",
    "aws_iam_policy",
    "aws_iam_policy_attachment",
    "aws_iam_instance_profile",
    # DNS: un registro individual se recrea con el mismo valor
    "aws_route53_record",
    # Red: sin datos propios, se recrea identica desde el codigo
    "aws_security_group",
    "aws_subnet",
    "aws_vpc",
    "aws_route_table",
    "aws_route_table_association",
    "aws_route",
    "aws_internet_gateway",
    "aws_vpc_endpoint",
    # ACM: el certificado se reemite gratis contra el mismo dominio
    "aws_acm_certificate",
    "aws_acm_certificate_validation",
    # La app, la rama y la asociación de dominio de Amplify quedan SIN clasificar a
    # propósito: la conexión con GitHub puede haberse autorizado a mano.
    "aws_amplify_webhook",
    # Observabilidad y coste: paneles y alarmas de gasto, no datos.
    "aws_cloudwatch_dashboard",
    "aws_budgets_budget",
    "aws_ce_anomaly_subscription",
    # Configuracion de un bucket S3 (no el bucket ni su contenido). Un
    # `apply` la recrea identica desde el `.tf` — sin ventana en la que el
    # bucket quede sin ella, porque Terraform crea el reemplazo antes de
    # nada mas en el mismo apply. `aws_s3_bucket_public_access_block` es
    # el caso a vigilar si esto cambia: no pierde datos, pero un borrado
    # sin recreacion inmediata dejaria el bucket sin ese bloqueo.
    "aws_s3_bucket_policy",
    "aws_s3_bucket_versioning",
    "aws_s3_bucket_public_access_block",
    "aws_s3_bucket_server_side_encryption_configuration",
    "aws_s3_bucket_cors_configuration",
    "aws_s3_bucket_lifecycle_configuration",
    "aws_s3_bucket_notification",
    "aws_api_gateway_authorizer",
    "aws_apigatewayv2_api_mapping",
    # Red y datos: piezas sin contenido propio.
    "aws_vpc_security_group_ingress_rule",
    "aws_vpc_security_group_egress_rule",
    "aws_db_subnet_group",
    "aws_rds_cluster_parameter_group",
    "aws_sqs_queue_redrive_allow_policy",
    "aws_s3_bucket_ownership_controls",
    # Correo: el conjunto de configuración y su destino de eventos se recrean idénticos.
    "aws_sesv2_configuration_set",
    "aws_sesv2_configuration_set_event_destination",
}

# ── Tipos que destruyen algo que no vuelve con un `terraform apply` ─
#
# El motivo se imprime tal cual en el mensaje de bloqueo: tiene que
# explicar que se pierde, no solo nombrar el tipo.
PERDIDA_POR_TIPO = {
    "aws_rds_cluster": "el cluster Aurora — los datos de todos los tenants",
    "aws_rds_cluster_instance": "una instancia de Aurora — los datos de todos los tenants",
    "aws_rds_global_cluster": "un cluster global de RDS — datos de todos los tenants",
    "aws_db_instance": "una base de datos RDS",
    "aws_cognito_user_pool": "el user pool de Cognito — borra TODOS los usuarios registrados",
    "aws_s3_bucket": "un bucket S3 — su contenido (informes de evidencias...)",
    "aws_secretsmanager_secret": (
        "un secreto de Secrets Manager — un valor que puede tener solo un tercero y no se regenera solo"
    ),
    "aws_dynamodb_table": "una tabla DynamoDB y todo su contenido",
    "aws_route53_zone": (
        "la zona alojada de Route 53 — cambia los servidores de nombres y tumba "
        "los dominios hasta que se propaguen"
    ),
    "aws_kms_key": (
        "la clave KMS — todo lo cifrado con ella (Aurora, S3, Secrets Manager) queda ilegible"
    ),
    "aws_cognito_user_pool_client": (
        "el cliente de Cognito — cambia el client ID y tumba las sesiones activas y la "
        "configuracion del frontend hasta que se actualice"
    ),
    "aws_cognito_user_pool_domain": (
        "el dominio de Cognito Hosted UI — cambia la URL de login hasta que se reconfigure"
    ),
    "aws_cognito_identity_provider": (
        "el proveedor de identidad federado en Cognito — el login con el IdP del cliente "
        "deja de funcionar hasta que se reconfigure"
    ),
    "aws_secretsmanager_secret_version": "el valor guardado en una version de un secreto",
    "aws_codestarconnections_connection": (
        "la conexion de GitHub para Amplify — recuperarla exige un handshake manual en la "
        "consola de AWS; un `apply` no la reautoriza solo"
    ),
    "random_password": (
        "un valor aleatorio persistente — cambia, y puede invalidar en silencio lo que dependa del anterior"
    ),
    "tls_private_key": (
        "una clave privada generada — se pierde la anterior; cualquier URL o cookie firmada "
        "con ella deja de validar"
    ),
    "aws_instance": (
        "una instancia EC2 — el bastión o la NAT instance: sin datos propios, pero su reemplazo "
        "corta el único acceso SSM a Aurora (bastión) o la salida a internet de la red privada "
        "(NAT) mientras se recrea"
    ),
    "aws_ecr_repository": (
        "un repositorio ECR y todas sus imágenes — las Lambdas pierden la imagen de rollback "
        "y hay que volver a construir y publicar"
    ),
}

# ── Ejecución declarada en el repo ──────────────────────────────────
#
# Direcciones EXACTAS de `TIPOS_QUE_EJECUTAN` cuyo único propósito es empaquetar código,
# autorizadas siempre (en el camino `push` no hay `PERMITIR_DESTRUCCION`). Solo valen para
# la categoría "ejecución", nunca para una pérdida de datos. Sin comodines. Añadir una
# entrada es un cambio más que entra por PR; lo que la hace segura vive en el recurso.
EJECUCION_DECLARADA = {}


def clasifica_destruccion(tipo):
    """(autorizado, motivo). `motivo` solo tiene sentido si autorizado es False.

    `tipo` ausente de las dos listas cae en el `else`: desconocido se
    trata como protegido, nunca como seguro.
    """
    if tipo in SEGUROS:
        return True, None
    if tipo in PERDIDA_POR_TIPO:
        return False, PERDIDA_POR_TIPO[tipo]
    return False, f"tipo `{tipo}` no esta clasificado como seguro para destruir (desconocido = protegido)"


def cambios_a_bloquear(plan):
    """(direccion, categoria, motivo) de cada cambio que el guardia no deja pasar solo.

    `categoria` es `"ejecucion"` (un tipo de `TIPOS_QUE_EJECUTAN` corre algo
    en el runner) o `"perdida"` (una destruccion de un tipo no autorizado).
    Las dos paran el job igual, pero el mensaje no puede llamar "se
    perderia" a un riesgo que no destruye nada: son cosas distintas.
    """
    bloqueados = []
    for cambio in plan.get("resource_changes") or []:
        acciones = set((cambio.get("change") or {}).get("actions") or [])
        direccion = cambio.get("address", "<sin direccion>")
        tipo = cambio.get("type")

        # Un `["read"]` en `resource_changes` significa «este data source
        # SE LEERA DURANTE EL APPLY». Para `external` y `http` eso es
        # ejecutar un programa o pedir una URL en el runner, y todavia no
        # ha pasado: es el unico caso en que frenarlo sirve de algo.
        if tipo in TIPOS_QUE_EJECUTAN:
            if acciones <= {"no-op"}:
                continue
            bloqueados.append(
                (direccion, "ejecucion", f"el tipo `{tipo}` ejecuta codigo o llamadas HTTP en el runner")
            )
            continue

        # `["no-op"]` y `["read"]` de lo demas no cambian nada.
        if acciones <= {"no-op", "read"}:
            continue

        if acciones & DESTRUCTIVAS:
            autorizado, motivo = clasifica_destruccion(tipo)
            if not autorizado:
                bloqueados.append((direccion, "perdida", motivo))

    return bloqueados


def permitidas():
    crudo = os.environ.get("PERMITIR_DESTRUCCION", "")
    return {d.strip() for d in crudo.split(",") if d.strip()}


class NoEsUnPlan(Exception):
    """Lo que se leyo no tiene forma de plan de Terraform."""


def exige_que_sea_un_plan(plan):
    """Un JSON valido cualquiera NO es un plan seguro.

    `{"format_version": "1.2"}` no tiene `resource_changes` que recorrer: sin esta
    comprobacion pasaria en verde, igual que un plan truncado o el que quede si
    `terraform show -json` cambia de formato.

    «No pude entenderlo» tiene que significar «no puedo afirmar que sea
    seguro», nunca «no hay nada que bloquear».
    """
    if not isinstance(plan, dict):
        raise NoEsUnPlan(f"el JSON de nivel superior es {type(plan).__name__}, no un objeto")
    if "format_version" not in plan:
        raise NoEsUnPlan("falta `format_version`: esto no lo ha escrito `terraform show -json`")
    if "resource_changes" not in plan:
        # Un plan de verdad SIEMPRE trae la clave, aunque sea una lista
        # vacia cuando no hay cambios.
        raise NoEsUnPlan("falta `resource_changes`")
    cambios = plan["resource_changes"]
    # `null` no es «no hay cambios»: es un fichero que no sabemos leer.
    if not isinstance(cambios, list):
        raise NoEsUnPlan(f"`resource_changes` es {type(cambios).__name__}, no una lista")
    for i, cambio in enumerate(cambios):
        if not isinstance(cambio, dict) or "change" not in cambio:
            raise NoEsUnPlan(f"el cambio #{i} no tiene `change`: el plan esta truncado")
        acciones = (cambio.get("change") or {}).get("actions")
        if not isinstance(acciones, list) or not acciones:
            raise NoEsUnPlan(f"el cambio #{i} no tiene `actions`")


def revisa(plan):
    """Devuelve (codigo_de_salida, lineas_de_informe)."""
    bloqueados = cambios_a_bloquear(plan)
    autorizadas = permitidas()
    declaradas = EJECUCION_DECLARADA

    if not bloqueados:
        return 0, ["Guardia del plan: ningun recurso con riesgo de perdida de datos se destruye sin autorizacion."]

    def declarada_en_codigo(direccion, categoria):
        # Solo la categoria "ejecucion" se autoriza por esta via: una
        # direccion en la lista no autoriza una perdida de datos aunque
        # coincidiera por casualidad.
        return categoria == "ejecucion" and direccion in declaradas

    sin_autorizar = [
        (d, c, m) for d, c, m in bloqueados if d not in autorizadas and not declarada_en_codigo(d, c)
    ]

    etiqueta = {"perdida": "se perderia", "ejecucion": "ejecutaria"}
    lineas = []
    for direccion, categoria, motivo in sorted(bloqueados):
        if direccion in autorizadas:
            marca = "AUTORIZADO A MANO"
        elif declarada_en_codigo(direccion, categoria):
            marca = "AUTORIZADO EN CODIGO"
        else:
            marca = "PARA"
        lineas.append(f"  [{marca}] {direccion}")
        lineas.append(f"      {etiqueta[categoria]}: {motivo}")

    if sin_autorizar:
        perdida = [d for d, c, _ in sin_autorizar if c == "perdida"]
        ejecucion = [d for d, c, _ in sin_autorizar if c == "ejecucion"]
        cabeceras = []
        if perdida:
            cabeceras.append(f"Guardia del plan: {len(perdida)} recurso(s) con riesgo de perdida de datos, sin autorizar.")
        if ejecucion:
            cabeceras.append(
                f"Guardia del plan: {len(ejecucion)} recurso(s) que ejecutarian codigo/HTTP en el runner, sin autorizar."
            )
        direcciones = ",".join(d for d, _, _ in sin_autorizar)
        lineas_finales = [
            *cabeceras,
            *lineas,
            "",
            "Esto NO bloquea reemplazos normales (Lambdas, API Gateway, colas,",
            "roles IAM...): esos se aplican solos, sin pasar por aqui. Lo que para",
            "es un recurso con datos/secretos que un `apply` no recupera, o un tipo",
            "que ejecuta codigo en el runner y no esta en EJECUCION_DECLARADA.",
            "",
            "Si esto es intencionado, revisa el plan entero con ojos humanos y",
            "relanza el workflow con:",
            f"  PERMITIR_DESTRUCCION='{direcciones}'",
        ]
        if ejecucion:
            # La sugerencia solo tiene sentido para lo que bloquea por
            # EJECUTAR algo, nunca para una perdida de datos: anadir a
            # esta lista un recurso que pierde datos no es la salida.
            lineas_finales += [
                "",
                "Si el recurso solo empaqueta codigo (sin datos ni secretos), no ejecuta",
                "scripts de dependencias de terceros, y va a seguir pidiendo reemplazo en",
                "cada push, considera anadir su direccion exacta a EJECUCION_DECLARADA en",
                "guardia_plan.py — es un cambio mas que entra por PR, no una excepcion",
                "especial: lo que lo hace seguro tiene que estar en el propio recurso.",
            ]
        return 1, lineas_finales

    return 0, [
        f"Guardia del plan: {len(bloqueados)} aviso(s), todos autorizados.",
        *lineas,
    ]


def main(argv):
    if len(argv) != 2:
        print("uso: guardia_plan.py <plan.json>", file=sys.stderr)
        return 2
    try:
        with open(argv[1], encoding="utf-8") as f:
            plan = json.load(f)
        exige_que_sea_un_plan(plan)
    except (OSError, json.JSONDecodeError, NoEsUnPlan) as e:
        # No se puede leer el plan => no se puede afirmar que sea seguro.
        # Dejar pasar aqui convertiria el guardia en decorativo justo el
        # dia en que el formato de `terraform show -json` cambie.
        print(f"::error::guardia del plan: no se pudo leer {argv[1]}: {e}", file=sys.stderr)
        return 2

    codigo, lineas = revisa(plan)
    salida = sys.stderr if codigo else sys.stdout
    for linea in lineas:
        print(linea, file=salida)
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv))
