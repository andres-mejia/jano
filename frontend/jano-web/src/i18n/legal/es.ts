import { routes } from "../routes";
import { titular } from "../titular";
import type { LegalSet } from "./types";

const owner = titular.razonSocial;
const mail = `<a href="mailto:${titular.email}">${titular.email}</a>`;
const privacy = `<a href="${routes.privacy.es}">política de privacidad</a>`;
const notice = `<a href="${routes.notice.es}">aviso legal</a>`;
const cookies = `<a href="${routes.cookies.es}">política de cookies</a>`;

export const legalEs: LegalSet = {
  holderLabels: {
    razonSocial: "Razón social",
    nif: "NIF",
    domicilio: "Domicilio",
    registro: "Datos registrales",
    email: "Contacto",
    web: "Web corporativa",
  },
  docs: {
    privacy: {
      title: "Política de privacidad",
      description: `Qué datos personales trata ${owner} en Jano, para qué, dónde se guardan y cómo ejercer tus derechos.`,
      sections: [
        {
          heading: "Quién trata tus datos",
          body: [
            `El responsable es ${owner}, titular de Jano (jano.tekhos.com y jano-app.tekhos.com). Sus datos identificativos están en el ${notice}. Para cualquier cuestión de privacidad escribe a ${mail}.`,
          ],
        },
        {
          heading: "Qué datos tratamos y para qué",
          body: [
            `<strong>Lista de acceso anticipado.</strong> El email que dejas en el formulario de esta web, el idioma de la página y la fecha. Lo usamos solo para avisarte cuando abramos plaza en el piloto. La base es tu consentimiento, que puedes retirar en cualquier momento escribiéndonos; lo conservamos hasta que te demos acceso, nos pidas que lo borremos o cerremos el piloto.`,
            `<strong>Cuenta en la app.</strong> Tu email, tu nombre, la empresa a la que perteneces y tu rol en ella. Los introduce el responsable de tu empresa o el equipo de Jano al darte de alta. Los usamos para identificarte, darte acceso a los datos de tu empresa y registrar quién hace cada acción. La base es el contrato con tu empresa y nuestro interés legítimo en mantener un registro de actividad fiable.`,
            `<strong>Inicio de sesión con Google.</strong> Si eliges «Continuar con Google», Google nos facilita únicamente tu dirección de email, si está verificada, tu nombre, la dirección de tu foto de perfil y el identificador de tu cuenta de Google (permisos <code>openid</code>, <code>email</code> y <code>profile</code>). Los usamos solo para comprobar que ese email corresponde a una cuenta que tu empresa ya dio de alta en Jano, para que puedas entrar sin contraseña y para mostrar tu foto junto a tu nombre en la app. Si no existe esa cuenta, no guardamos nada.`,
            `<strong>Registro de actividad.</strong> Las acciones que haces en la app (aprobar, editar o descartar un mensaje, cambiar una regla) quedan registradas con tu usuario y la hora, para que tu empresa pueda auditar qué salió y por qué.`,
            `<strong>Contactos comerciales de nuestros clientes.</strong> Cuando una empresa cliente usa Jano para buscar cuentas y escribir a sus contactos, esa empresa es la responsable de esos datos y ${owner} los trata por encargo suyo, siguiendo sus instrucciones y las reglas descritas en las condiciones de uso. Cada dato guarda su origen.`,
          ],
        },
        {
          heading: "Uso de los datos de Google",
          body: [
            `No accedemos a tu correo de Gmail, tus contactos, tu calendario, tus archivos ni a ningún otro dato de tu cuenta de Google. Los datos que recibimos de Google no se venden, no se ceden a terceros, no se usan para publicidad y no se usan para entrenar modelos de inteligencia artificial. El uso que hace Jano de la información recibida de las API de Google se ajusta a la <a href="https://developers.google.com/terms/api-services-user-data-policy">Política de datos de usuario de los servicios de API de Google</a>, incluidos sus requisitos de uso limitado.`,
          ],
        },
        {
          heading: "Dónde se guardan y quién más interviene",
          body: [
            `En Amazon Web Services, en la región de Irlanda (eu-west-1). El modelo de IA se ejecuta en Amazon Bedrock en la misma región y no usa tus datos para entrenarse. El correo sale desde el buzón de Microsoft 365 de tu empresa. Estos proveedores actúan como encargados del tratamiento con contrato y garantías del RGPD. Las contraseñas y las credenciales de terceros nunca pasan por el modelo de IA ni se guardan en claro.`,
            `No vendemos datos personales ni los usamos para publicidad.`,
          ],
        },
        {
          heading: "Cuánto tiempo",
          body: [
            `Mientras tu cuenta o la de tu empresa estén activas. Cuando se dan de baja, o si lo pides, borramos tus datos de acceso; el registro de actividad se conserva el tiempo que exija la ley. El email de la lista de acceso anticipado se borra cuando lo pidas o al cerrar el piloto.`,
          ],
        },
        {
          heading: "Tus derechos",
          body: [
            `Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad, y retirar tu consentimiento, escribiendo a ${mail}. También puedes retirar el acceso de Jano a tu cuenta de Google en <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> y reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es">aepd.es</a>).`,
          ],
        },
        {
          heading: "Cookies",
          body: [`Esta web no instala cookies ni carga rastreadores de terceros. Los detalles están en la ${cookies}.`],
        },
        {
          heading: "Cambios",
          body: [
            `Si cambiamos esta política, publicaremos aquí la nueva versión con su fecha. Si el cambio afecta a cómo usamos datos que ya tenemos, te avisaremos antes.`,
          ],
        },
      ],
    },
    terms: {
      title: "Condiciones de uso",
      description: "Las condiciones con las que una empresa usa Jano durante el piloto.",
      sections: [
        {
          heading: "El servicio",
          body: [
            `Jano es un servicio de ${owner} para empresas: ayuda a su equipo comercial a encontrar cuentas, preparar mensajes y agendar reuniones. La IA propone; cada mensaje lo aprueba una persona de tu empresa salvo que tu empresa active el piloto automático. Durante la fase piloto el servicio puede cambiar o interrumpirse.`,
          ],
        },
        {
          heading: "Cuentas",
          body: [
            `No hay registro abierto. El equipo de Jano da de alta a cada empresa y a su responsable, que invita y desactiva a las personas de su equipo. Eres responsable de lo que se haga con tu cuenta; si crees que alguien la usa sin permiso, avísanos en ${mail}.`,
          ],
        },
        {
          heading: "Uso aceptable",
          body: [
            `Tu empresa se compromete a usar Jano conforme a la normativa aplicable a las comunicaciones comerciales y a la protección de datos, a no enviar mensajes a quien se haya dado de baja y a no intentar acceder a datos de otras empresas. Jano aplica reglas que no se pueden saltar (límites de envío, lista de supresión, detener la secuencia cuando alguien responde) y puede suspender una cuenta que las incumpla.`,
          ],
        },
        {
          heading: "Datos",
          body: [
            `Los datos de tu empresa son tuyos; en la app solo los ven las personas de tu empresa. Cómo tratamos los datos personales se explica en la ${privacy}.`,
          ],
        },
        {
          heading: "Propiedad intelectual",
          body: [
            `El software, la marca Jano y los contenidos de la web y de la app pertenecen a ${owner}. Los mensajes que tu empresa aprueba y envía son suyos.`,
          ],
        },
        {
          heading: "Responsabilidad",
          body: [
            `Jano se presta tal cual durante la fase piloto, sin garantía de resultados comerciales. Tu empresa decide qué mensajes se envían y es responsable de su contenido. Nada de lo anterior limita los derechos que la ley reconoce a tu empresa.`,
          ],
        },
        {
          heading: "Cambios y baja",
          body: [
            `Podemos actualizar estas condiciones; te avisaremos con antelación de cualquier cambio relevante. Tu empresa puede dejar de usar Jano cuando quiera escribiendo a ${mail}.`,
          ],
        },
        {
          heading: "Ley aplicable",
          body: [`Estas condiciones se rigen por la ley española.`],
        },
      ],
    },
    cookies: {
      title: "Política de cookies",
      description: "Esta web no instala cookies ni carga rastreadores de terceros, por eso no te pide consentimiento.",
      sections: [
        {
          heading: "Esta web no usa cookies",
          body: [
            `jano.tekhos.com no instala cookies, no guarda nada en el almacenamiento de tu navegador y no usa herramientas de analítica ni de publicidad. Tampoco carga recursos de terceros: las fuentes tipográficas, las imágenes y los vídeos se sirven desde el propio dominio.`,
            `Por eso no verás ningún aviso de consentimiento de cookies: no hay nada que aceptar ni rechazar.`,
          ],
        },
        {
          heading: "El formulario de acceso anticipado",
          body: [
            `Si dejas tu email, se envía directamente a nuestra infraestructura en AWS, sin pasar por servicios de terceros. Cómo lo tratamos se explica en la ${privacy}.`,
          ],
        },
        {
          heading: "La app",
          body: [
            `La app (jano-app.tekhos.com) solo usa el almacenamiento técnico imprescindible para mantener tu sesión iniciada. Ese almacenamiento está exento de consentimiento porque sin él el servicio que pides no funciona.`,
          ],
        },
        {
          heading: "Si esto cambia",
          body: [
            `Si algún día añadimos una cookie que no sea estrictamente necesaria, actualizaremos esta política y te pediremos consentimiento antes de instalarla. Para cualquier duda, escribe a ${mail}.`,
          ],
        },
      ],
    },
    notice: {
      title: "Aviso legal",
      description: `Datos del titular de Jano y condiciones de uso de este sitio web.`,
      sections: [
        {
          heading: "Titular",
          holder: true,
          body: [
            `Este sitio web y la app Jano son propiedad de ${owner}, en cumplimiento del artículo 10 de la Ley 34/2002 de servicios de la sociedad de la información y de comercio electrónico (LSSI).`,
          ],
        },
        {
          heading: "Objeto",
          body: [
            `Esta web presenta Jano, un equipo comercial de IA para pymes B2B, y permite apuntarse a la lista de acceso anticipado. El uso de la app se rige por sus condiciones de uso.`,
          ],
        },
        {
          heading: "Propiedad intelectual e industrial",
          body: [
            `Los textos, imágenes, el diseño, el código y la marca Jano pertenecen a ${owner} o se usan con licencia. No se permite reproducirlos con fines comerciales sin autorización. Las capturas de la app muestran empresas y personas ficticias.`,
          ],
        },
        {
          heading: "Responsabilidad",
          body: [
            `Intentamos que la información de esta web sea exacta y esté al día, pero puede cambiar sin aviso mientras el producto está en piloto. No respondemos del contenido de webs de terceros a las que se enlace.`,
          ],
        },
        {
          heading: "Privacidad y cookies",
          body: [`Los datos personales se tratan según la ${privacy}. Esta web no usa cookies (${cookies}).`],
        },
        {
          heading: "Ley aplicable",
          body: [`Este aviso se rige por la ley española.`],
        },
      ],
    },
  },
};
