"""Tests de `guardia_plan.py` (portados de Fenora y Cardea con las direcciones de Jano).

    python3 -m pytest .github/scripts -q
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import guardia_plan  # noqa: E402

GUARDIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guardia_plan.py")


def plan(*cambios):
    return {
        "format_version": "1.2",
        "resource_changes": [
            {"address": direccion, "type": tipo, "change": {"actions": acciones}}
            for direccion, acciones, tipo in cambios
        ],
    }


def ejecuta(p, permitir=""):
    """Corre el guardia como lo corre el workflow: proceso aparte, plan en fichero."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(p, f)
        ruta = f.name
    try:
        entorno = {**os.environ, "PERMITIR_DESTRUCCION": permitir}
        r = subprocess.run([sys.executable, GUARDIA, ruta], capture_output=True, text=True, env=entorno)
        return r.returncode, r.stdout + r.stderr
    finally:
        os.unlink(ruta)


class Base(unittest.TestCase):
    def setUp(self):
        self._env = mock.patch.dict(os.environ, {"PERMITIR_DESTRUCCION": ""})
        self._env.start()

    def tearDown(self):
        self._env.stop()

    def revisa(self, p):
        codigo, lineas = guardia_plan.revisa(p)
        return codigo, "\n".join(lineas)


class SinDestruccion(Base):
    def test_un_plan_sin_cambios_pasa(self):
        self.assertEqual(self.revisa(plan())[0], 0)

    def test_crear_y_actualizar_pasa(self):
        p = plan(
            ("module.aurora.aws_rds_cluster.main", ["create"], "aws_rds_cluster"),
            ("module.waitlist.aws_dynamodb_table.waitlist", ["update"], "aws_dynamodb_table"),
            ("module.cognito.aws_cognito_user_pool.main", ["no-op"], "aws_cognito_user_pool"),
        )
        self.assertEqual(self.revisa(p)[0], 0)


class TiposSegurosSeAutorizanSolos(Base):
    def test_reemplazos_de_computo_red_e_integraciones_pasan(self):
        p = plan(
            ("module.waitlist.aws_lambda_function.waitlist", ["delete", "create"], "aws_lambda_function"),
            ("module.waitlist.aws_apigatewayv2_api.waitlist", ["delete", "create"], "aws_apigatewayv2_api"),
            ("module.api_gateway.aws_apigatewayv2_authorizer.cognito", ["delete", "create"], "aws_apigatewayv2_authorizer"),
            ("module.messaging.aws_sqs_queue.usage", ["delete", "create"], "aws_sqs_queue"),
            ("module.github_oidc.aws_iam_role.github_actions_plan", ["delete"], "aws_iam_role"),
            ("module.vpc.aws_subnet.private[0]", ["delete", "create"], "aws_subnet"),
            ("aws_security_group.lambdas_vpc", ["create", "delete"], "aws_security_group"),
            ("module.aurora.aws_vpc_security_group_ingress_rule.aurora[\"sg-1\"]", ["delete"], "aws_vpc_security_group_ingress_rule"),
            ("module.aurora.aws_db_subnet_group.aurora", ["delete", "create"], "aws_db_subnet_group"),
            ("module.reports.aws_s3_bucket_policy.reports", ["delete", "create"], "aws_s3_bucket_policy"),
            ("module.ecr.aws_ecr_lifecycle_policy.cleanup[\"usage-ingest\"]", ["delete"], "aws_ecr_lifecycle_policy"),
        )
        self.assertEqual(self.revisa(p)[0], 0)

    def test_reemplazar_el_conjunto_de_configuracion_ses_pasa(self):
        p = plan(
            ("module.email.aws_sesv2_configuration_set.main", ["delete", "create"], "aws_sesv2_configuration_set"),
            ("module.email.aws_sesv2_configuration_set_event_destination.cloudwatch", ["delete", "create"], "aws_sesv2_configuration_set_event_destination"),
        )
        self.assertEqual(self.revisa(p)[0], 0)


class PerdidaDeDatosPara(Base):
    def test_destruir_la_tabla_de_la_waitlist_para(self):
        # US4.2 de la spec 002: el apply se detiene si el plan destruye datos.
        codigo, texto = self.revisa(plan(("module.waitlist.aws_dynamodb_table.waitlist", ["delete"], "aws_dynamodb_table")))
        self.assertEqual(codigo, 1)
        self.assertIn("module.waitlist.aws_dynamodb_table.waitlist", texto)
        self.assertIn("tabla DynamoDB", texto)

    def test_reemplazar_aurora_para_y_dice_que_se_pierde(self):
        codigo, texto = self.revisa(plan(("module.aurora.aws_rds_cluster.main", ["delete", "create"], "aws_rds_cluster")))
        self.assertEqual(codigo, 1)
        self.assertIn("los datos de todos los tenants", texto)

    def test_create_before_destroy_tambien_para(self):
        codigo, _ = self.revisa(plan(("module.aurora.aws_rds_cluster.main", ["create", "delete"], "aws_rds_cluster")))
        self.assertEqual(codigo, 1)

    def test_cognito_s3_secretos_y_zona_paran(self):
        for direccion, tipo in [
            ("module.cognito.aws_cognito_user_pool.main", "aws_cognito_user_pool"),
            ("module.cognito.aws_cognito_user_pool_client.app", "aws_cognito_user_pool_client"),
            ("module.cognito.aws_cognito_user_pool_domain.main", "aws_cognito_user_pool_domain"),
            ("module.reports.aws_s3_bucket.reports", "aws_s3_bucket"),
            ("module.x.aws_secretsmanager_secret.y", "aws_secretsmanager_secret"),
            ("module.x.aws_route53_zone.y", "aws_route53_zone"),
        ]:
            with self.subTest(tipo=tipo):
                self.assertEqual(self.revisa(plan((direccion, ["delete"], tipo)))[0], 1)

    def test_bastion_y_nat_paran(self):
        for direccion in ["module.bastion.aws_instance.bastion", "module.nat_instance.aws_instance.nat"]:
            with self.subTest(direccion=direccion):
                codigo, texto = self.revisa(plan((direccion, ["delete", "create"], "aws_instance")))
                self.assertEqual(codigo, 1)
                self.assertIn("bastión", texto)

    def test_repositorio_ecr_para_a_diferencia_de_fenora(self):
        codigo, texto = self.revisa(plan(("module.ecr.aws_ecr_repository.services[\"identity-service\"]", ["delete"], "aws_ecr_repository")))
        self.assertEqual(codigo, 1)
        self.assertIn("imágenes", texto)

    def test_amplify_sin_clasificar_para(self):
        for direccion, tipo in [
            ("module.landing.aws_amplify_app.this", "aws_amplify_app"),
            ("module.panel.aws_amplify_domain_association.this", "aws_amplify_domain_association"),
        ]:
            with self.subTest(tipo=tipo):
                self.assertEqual(self.revisa(plan((direccion, ["delete", "create"], tipo)))[0], 1)

    def test_una_perdida_entre_muchos_cambios_inocentes_para(self):
        p = plan(
            ("module.waitlist.aws_lambda_function.waitlist", ["delete", "create"], "aws_lambda_function"),
            ("module.messaging.aws_sqs_queue.usage", ["update"], "aws_sqs_queue"),
            ("module.waitlist.aws_dynamodb_table.waitlist", ["delete", "create"], "aws_dynamodb_table"),
        )
        codigo, texto = self.revisa(p)
        self.assertEqual(codigo, 1)
        self.assertNotIn("aws_lambda_function.waitlist\n", texto)
        self.assertIn("PERMITIR_DESTRUCCION='module.waitlist.aws_dynamodb_table.waitlist'", texto)


class TipoDesconocidoEsProtegido(Base):
    def test_destruir_un_tipo_no_clasificado_para(self):
        codigo, texto = self.revisa(plan(("module.x.aws_tipo_nuevo.y", ["delete"], "aws_tipo_nuevo")))
        self.assertEqual(codigo, 1)
        self.assertIn("desconocido = protegido", texto)

    def test_crear_un_tipo_no_clasificado_pasa(self):
        self.assertEqual(self.revisa(plan(("module.x.aws_tipo_nuevo.y", ["create"], "aws_tipo_nuevo")))[0], 0)

    def test_ningun_tipo_esta_en_las_dos_listas(self):
        self.assertFalse(guardia_plan.SEGUROS & set(guardia_plan.PERDIDA_POR_TIPO))


class Autorizacion(Base):
    def test_direccion_exacta_autoriza_esa_perdida(self):
        with mock.patch.dict(os.environ, {"PERMITIR_DESTRUCCION": "module.aurora.aws_rds_cluster.main"}):
            codigo, texto = self.revisa(plan(("module.aurora.aws_rds_cluster.main", ["delete"], "aws_rds_cluster")))
        self.assertEqual(codigo, 0)
        self.assertIn("AUTORIZADO A MANO", texto)

    def test_autorizar_una_no_autoriza_las_demas(self):
        with mock.patch.dict(os.environ, {"PERMITIR_DESTRUCCION": "module.aurora.aws_rds_cluster.main"}):
            codigo, _ = self.revisa(
                plan(
                    ("module.aurora.aws_rds_cluster.main", ["delete"], "aws_rds_cluster"),
                    ("module.cognito.aws_cognito_user_pool.main", ["delete"], "aws_cognito_user_pool"),
                )
            )
        self.assertEqual(codigo, 1)

    def test_comodin_no_autoriza_nada(self):
        for comodin in ["*", "module.*", "module.aurora.*"]:
            with self.subTest(comodin=comodin), mock.patch.dict(os.environ, {"PERMITIR_DESTRUCCION": comodin}):
                self.assertEqual(self.revisa(plan(("module.aurora.aws_rds_cluster.main", ["delete"], "aws_rds_cluster")))[0], 1)


class EjecucionDeCodigoEnElRunner(Base):
    def test_crear_un_terraform_data_para_y_no_dice_se_perderia(self):
        codigo, texto = self.revisa(plan(("terraform_data.x", ["create"], "terraform_data")))
        self.assertEqual(codigo, 1)
        self.assertIn("ejecutaria", texto)
        self.assertNotIn("se perderia", texto)

    def test_crear_un_null_resource_para(self):
        self.assertEqual(self.revisa(plan(("null_resource.x", ["create"], "null_resource")))[0], 1)

    def test_data_external_o_http_diferidos_paran(self):
        for tipo in ["external", "http"]:
            with self.subTest(tipo=tipo):
                self.assertEqual(self.revisa(plan((f"data.{tipo}.x", ["read"], tipo)))[0], 1)

    def test_leer_un_data_source_normal_no_cuenta(self):
        self.assertEqual(self.revisa(plan(("data.aws_route53_zone.base", ["read"], "aws_route53_zone")))[0], 0)

    def test_ejecucion_declarada_pasa_y_no_autoriza_perdidas(self):
        declarada = {"null_resource.empaquetar": "empaqueta código"}
        with mock.patch.object(guardia_plan, "EJECUCION_DECLARADA", declarada):
            self.assertEqual(self.revisa(plan(("null_resource.empaquetar", ["create"], "null_resource")))[0], 0)
            self.assertEqual(self.revisa(plan(("null_resource.empaquetarr", ["create"], "null_resource")))[0], 1)
        with mock.patch.object(guardia_plan, "EJECUCION_DECLARADA", {"module.aurora.aws_rds_cluster.main": "x"}):
            self.assertEqual(self.revisa(plan(("module.aurora.aws_rds_cluster.main", ["delete"], "aws_rds_cluster")))[0], 1)

    def test_ejecucion_declarada_bien_formada(self):
        for direccion in guardia_plan.EJECUCION_DECLARADA:
            tipo = direccion.split(".")[-2]
            self.assertIn(tipo, guardia_plan.TIPOS_QUE_EJECUTAN, direccion)
            self.assertNotIn("*", direccion)


class EsoNoEsUnPlan(unittest.TestCase):
    def test_lo_que_no_es_un_plan_sale_con_2(self):
        for contenido in [
            {"format_version": "1.2"},
            {"resource_changes": []},
            [],
            {"format_version": "1.2", "resource_changes": None},
            {"format_version": "1.2", "resource_changes": [{"address": "x"}]},
            {"format_version": "1.2", "resource_changes": [{"address": "x", "change": {"actions": []}}]},
        ]:
            with self.subTest(contenido=contenido):
                self.assertEqual(ejecuta(contenido)[0], 2)

    def test_un_plan_de_verdad_sin_cambios_pasa(self):
        self.assertEqual(ejecuta(plan())[0], 0)

    def test_fichero_ilegible_sale_con_2(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write("{no es json")
        try:
            r = subprocess.run([sys.executable, GUARDIA, f.name], capture_output=True, text=True)
            self.assertEqual(r.returncode, 2)
        finally:
            os.unlink(f.name)


class ComoLoEjecutaElWorkflow(unittest.TestCase):
    def test_perdida_sin_autorizar_sale_con_1(self):
        codigo, texto = ejecuta(plan(("module.waitlist.aws_dynamodb_table.waitlist", ["delete"], "aws_dynamodb_table")))
        self.assertEqual(codigo, 1)
        self.assertIn("[PARA]", texto)

    def test_perdida_autorizada_sale_con_0(self):
        codigo, _ = ejecuta(
            plan(("module.waitlist.aws_dynamodb_table.waitlist", ["delete"], "aws_dynamodb_table")),
            permitir="module.waitlist.aws_dynamodb_table.waitlist",
        )
        self.assertEqual(codigo, 0)


if __name__ == "__main__":
    unittest.main()
