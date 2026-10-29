"""Tests de `infra/bootstrap/politica-arranque-ci.json` (portados de Fenora y Cardea).

Una política que se adjunta una vez por CLI y nadie vuelve a mirar tiene dos formas de
estar mal que no saltan solas: un `Deny` que bloquea algo que Terraform necesita (el apply
revienta a mitad) y un `Deny` vaciado por su `Resource` (sigue en la lista, ya no protege).
Más dos propias de Jano: la cuenta es compartida con Fenora y Cardea, y el estado vive en el
bucket y la tabla de locks de Fenora, así que el estado de Jano tiene que seguir accesible
mientras todo lo demás de Fenora queda cerrado.
"""

import datetime as dt
import fnmatch
import json
import os
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POLITICA = os.path.join(RAIZ, "infra", "bootstrap", "politica-arranque-ci.json")
CUENTA = "966378755474"
ROL_CI = f"arn:aws:iam::{CUENTA}:role/jano-dev-github-actions"
OIDC = f"arn:aws:iam::{CUENTA}:oidc-provider/token.actions.githubusercontent.com"
ESTADO = f"arn:aws:s3:::fenora-terraform-state-{CUENTA}"
LOCKS = f"arn:aws:dynamodb:eu-west-1:{CUENTA}:table/fenora-terraform-locks"


def carga():
    with open(POLITICA, encoding="utf-8") as f:
        return json.load(f)


def _lista(valor):
    return [valor] if isinstance(valor, str) else list(valor)


def bloque(sid):
    return next(s for s in carga()["Statement"] if s["Sid"] == sid)


def _casa(valor, patrones):
    return any(p == "*" or fnmatch.fnmatchcase(valor, p.lower()) for p in patrones)


def denegada(accion, recurso="*", etiquetas=None):
    """¿`accion` sobre `recurso` cae bajo algún Deny? Comodines, NotAction y NotResource como IAM."""
    etiquetas = etiquetas or {}
    accion = accion.lower()
    for s in carga()["Statement"]:
        if s["Effect"] != "Deny":
            continue
        if "Action" in s and not _casa(accion, [a.lower() for a in _lista(s["Action"])]):
            continue
        if "NotAction" in s and _casa(accion, [a.lower() for a in _lista(s["NotAction"])]):
            continue
        if "Resource" in s and not any(r == "*" or fnmatch.fnmatchcase(recurso, r) for r in _lista(s["Resource"])):
            continue
        if "NotResource" in s and any(fnmatch.fnmatchcase(recurso, r) for r in _lista(s["NotResource"])):
            continue
        condicion = s.get("Condition", {}).get("StringEquals", {})
        if any(k.startswith("aws:ResourceTag/") and etiquetas.get(k.split("/", 1)[1]) not in _lista(v) for k, v in condicion.items()):
            continue
        if "ArnEquals" in s.get("Condition", {}):
            continue
        return True
    return False


class EsUnaPoliticaValida(unittest.TestCase):
    def test_json_y_sids_validos(self):
        for s in carga()["Statement"]:
            self.assertTrue(s["Sid"].isalnum(), s["Sid"])
            self.assertEqual(len({"Action", "NotAction"} & s.keys()), 1, s["Sid"])
            self.assertEqual(len({"Resource", "NotResource"} & s.keys()), 1, s["Sid"])

    def test_los_arn_no_llevan_comodin_en_el_servicio(self):
        # IAM rechaza `arn:aws:*:...` y los ARN de IAM con región (MalformedPolicyDocument).
        for s in carga()["Statement"]:
            for r in _lista(s.get("Resource", s.get("NotResource"))):
                if r == "*":
                    continue
                with self.subTest(recurso=r):
                    self.assertNotEqual(r.split(":")[2], "*")
                    if r.split(":")[2] == "iam":
                        self.assertEqual(r.split(":")[3], "")

    def test_cabe_en_una_politica_inline(self):
        tamano = len(json.dumps(carga(), separators=(",", ":")))
        self.assertLess(tamano, 10240)


class CaducaSola(unittest.TestCase):
    def test_el_allow_caduca_en_fecha_iso_utc(self):
        allow = bloque("AdministradorHastaEl31DeEneroDe2027")
        fecha = allow["Condition"]["DateLessThan"]["aws:CurrentTime"]
        self.assertTrue(fecha.endswith("Z"))
        self.assertEqual(dt.datetime.fromisoformat(fecha.replace("Z", "+00:00")).date(), dt.date(2027, 1, 31))

    def test_es_el_unico_allow(self):
        self.assertEqual([s["Sid"] for s in carga()["Statement"] if s["Effect"] == "Allow"], ["AdministradorHastaEl31DeEneroDe2027"])


class NoRompeLoQueTerraformNecesita(unittest.TestCase):
    NECESARIAS = [
        ("iam:PutRolePolicy", ROL_CI),
        ("iam:UpdateAssumeRolePolicy", ROL_CI),
        ("iam:CreateRole", f"arn:aws:iam::{CUENTA}:role/jano-dev-waitlist-role"),
        ("iam:DeleteRole", f"arn:aws:iam::{CUENTA}:role/jano-dev-otro"),
        ("iam:GetOpenIDConnectProvider", OIDC),
        ("s3:ListBucket", ESTADO),
        ("s3:GetObject", f"{ESTADO}/jano/dev/terraform.tfstate"),
        ("s3:PutObject", f"{ESTADO}/jano/dev/terraform.tfstate"),
        ("dynamodb:GetItem", LOCKS),
        ("dynamodb:PutItem", LOCKS),
        ("dynamodb:DeleteItem", LOCKS),
        ("s3:CreateBucket", f"arn:aws:s3:::jano-dev-assets-{CUENTA}"),
        ("s3:PutBucketPolicy", f"arn:aws:s3:::jano-dev-assets-{CUENTA}"),
        ("dynamodb:CreateTable", f"arn:aws:dynamodb:eu-west-1:{CUENTA}:table/jano-dev-waitlist"),
        ("rds:CreateDBCluster", f"arn:aws:rds:eu-west-1:{CUENTA}:cluster:jano-dev"),
        ("lambda:CreateFunction", f"arn:aws:lambda:eu-west-1:{CUENTA}:function:jano-dev-waitlist"),
        ("amplify:CreateApp", f"arn:aws:amplify:eu-west-1:{CUENTA}:apps/*"),
        ("route53:ChangeResourceRecordSets", "arn:aws:route53:::hostedzone/Z025408038NPHX3W382AH"),
    ]

    def test_ninguna_accion_que_terraform_necesita_esta_denegada(self):
        for accion, recurso in self.NECESARIAS:
            with self.subTest(accion=accion, recurso=recurso):
                self.assertFalse(denegada(accion, recurso))


class SigueCerrandoLoQueDebe(unittest.TestCase):
    CERRADAS = [
        "iam:CreateUser", "iam:CreateAccessKey", "organizations:CreateAccount", "iam:CreatePolicyVersion",
        "iam:SetDefaultPolicyVersion", "iam:PutUserPolicy", "account:CloseAccount", "payments:CreatePaymentInstrument",
    ]

    def test_lo_peligroso_sigue_denegado(self):
        for accion in self.CERRADAS:
            with self.subTest(accion=accion):
                self.assertTrue(denegada(accion))

    def test_el_lockout_esta_cerrado_sobre_el_rol_de_ci_y_el_proveedor(self):
        self.assertTrue(denegada("iam:DeleteRole", ROL_CI))
        self.assertTrue(denegada("iam:DeleteRolePolicy", ROL_CI))
        self.assertTrue(denegada("iam:DeleteOpenIDConnectProvider", OIDC))

    def test_los_deny_globales_valen_para_cualquier_recurso(self):
        for sid in ("NoCrearCredencialesDeLargaVida", "NoOrganizacionesNiCambiosDeFacturacion",
                    "NoRepintarPoliticasNiUsuariosNiGrupos", "NoEngancharPoliticasDeAdministradorANadie"):
            with self.subTest(sid=sid):
                self.assertEqual(bloque(sid)["Resource"], "*")

    def test_no_se_puede_enganchar_administrator_access(self):
        arns = bloque("NoEngancharPoliticasDeAdministradorANadie")["Condition"]["ArnEquals"]["iam:PolicyARN"]
        self.assertIn("arn:aws:iam::aws:policy/AdministratorAccess", arns)


class ElEstadoCompartidoSoloSeTocaEnJano(unittest.TestCase):
    def test_el_estado_de_fenora_no_se_lee_ni_se_escribe(self):
        for accion in ("s3:GetObject", "s3:PutObject", "s3:DeleteObject"):
            with self.subTest(accion=accion):
                self.assertTrue(denegada(accion, f"{ESTADO}/dev/terraform.tfstate"))

    def test_el_bucket_de_estado_no_se_reconfigura_ni_se_borra(self):
        for accion in ("s3:DeleteBucket", "s3:PutBucketPolicy", "s3:PutBucketVersioning",
                       "s3:PutLifecycleConfiguration", "s3:PutEncryptionConfiguration"):
            with self.subTest(accion=accion):
                self.assertTrue(denegada(accion, ESTADO))
        self.assertTrue(denegada("s3:DeleteObjectVersion", f"{ESTADO}/jano/dev/terraform.tfstate"))

    def test_la_tabla_de_locks_no_se_borra_ni_se_lee_entera(self):
        for accion in ("dynamodb:DeleteTable", "dynamodb:UpdateTable", "dynamodb:Scan", "dynamodb:Query"):
            with self.subTest(accion=accion):
                self.assertTrue(denegada(accion, LOCKS))


class NoTocaFenoraNiCardea(unittest.TestCase):
    def test_buckets_y_tablas_ajenos_denegados(self):
        for accion, recurso in [
            ("s3:GetObject", f"arn:aws:s3:::fenora-dev-assets-{CUENTA}/x.pdf"),
            ("s3:DeleteBucket", f"arn:aws:s3:::cardea-terraform-state-{CUENTA}"),
            ("s3:GetObject", f"arn:aws:s3:::tekhos-inbound-mail-{CUENTA}/inbound/x"),
            ("dynamodb:DeleteTable", f"arn:aws:dynamodb:eu-west-1:{CUENTA}:table/fenora-waitlist-dev"),
            ("dynamodb:Scan", f"arn:aws:dynamodb:eu-west-1:{CUENTA}:table/cardea-contact-dev"),
            ("dynamodb:DeleteTable", f"arn:aws:dynamodb:eu-west-1:{CUENTA}:table/cardea-terraform-locks"),
        ]:
            with self.subTest(accion=accion, recurso=recurso):
                self.assertTrue(denegada(accion, recurso))

    def test_recursos_con_nombre_de_fenora_o_cardea_denegados(self):
        for accion, recurso in [
            ("rds:DeleteDBCluster", f"arn:aws:rds:eu-west-1:{CUENTA}:cluster:fenora-dev"),
            ("rds:DeleteDBCluster", f"arn:aws:rds:eu-west-1:{CUENTA}:cluster:cardea-dev"),
            ("iam:PutRolePolicy", f"arn:aws:iam::{CUENTA}:role/fenora-github-actions-deploy"),
            ("iam:PutRolePolicy", f"arn:aws:iam::{CUENTA}:role/cardea-dev-github-actions"),
            ("lambda:UpdateFunctionCode", f"arn:aws:lambda:eu-west-1:{CUENTA}:function:fenora-dev-email-forwarder"),
            ("cognito-idp:DeleteUserPool", f"arn:aws:cognito-idp:eu-west-1:{CUENTA}:userpool/cardea-dev"),
        ]:
            with self.subTest(recurso=recurso):
                self.assertTrue(denegada(accion, recurso))

    def test_recursos_etiquetados_denegados_aunque_el_arn_no_lo_diga(self):
        instancia = f"arn:aws:ec2:eu-west-1:{CUENTA}:instance/i-0abc"
        self.assertTrue(denegada("ec2:TerminateInstances", instancia, {"Project": "fenora"}))
        self.assertTrue(denegada("ec2:TerminateInstances", instancia, {"Project": "cardea"}))
        self.assertFalse(denegada("ec2:TerminateInstances", instancia, {"Project": "jano"}))

    def test_leer_el_proveedor_oidc_etiquetado_de_fenora_sigue_permitido(self):
        # El proveedor lo gestiona Fenora y lleva Project=fenora; Jano lo lee con un data source.
        self.assertFalse(denegada("iam:GetOpenIDConnectProvider", OIDC, {"Project": "fenora"}))
        self.assertFalse(denegada("iam:ListOpenIDConnectProviders", "*", {"Project": "fenora"}))


if __name__ == "__main__":
    unittest.main()
