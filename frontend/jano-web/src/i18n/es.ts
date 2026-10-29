import type { Dict } from "./types";

export const es: Dict = {
  meta: {
    title: "Jano · Equipo comercial de IA para pymes B2B",
    description:
      "Jano es un equipo comercial de IA para pymes B2B españolas: encuentra cuentas, localiza al contacto, escribe en el momento oportuno y agenda la reunión. Tú apruebas lo que sale con tu nombre.",
    ogAlt: "Jano. Abre la puerta correcta. Equipo comercial de IA para pymes B2B.",
  },
  brand: {
    tagline: "Equipo comercial de IA",
    byline: "Jano, un producto de Tekhos",
    homeLabel: "Jano, inicio",
  },
  skip: "Saltar al contenido",
  nav: {
    label: "Principal",
    items: [
      { id: "como-funciona", label: "Cómo funciona" },
      { id: "producto", label: "Producto" },
      { id: "reglas", label: "Reglas" },
      { id: "preguntas", label: "Preguntas" },
    ],
    login: "Entrar",
    cta: "Pedir acceso",
    language: "Idioma",
  },
  hero: {
    title: "Abre la puerta correcta.",
    lead: "Jano es un equipo comercial de IA. Encuentra cuentas, localiza al contacto, escribe en el momento oportuno y agenda la reunión. Tú apruebas lo que sale con tu nombre.",
    videoLabel: "Vídeo: un recorrido por Jano, de la búsqueda de cuentas a la reunión agendada",
    videoNote: "Recorrido por la app con datos de ejemplo",
    play: "Reproducir el vídeo",
    pause: "Pausar el vídeo",
    aiLabel: "Decisión de la IA",
    aiText: "Señal de compra en Rumbo Norte: cambia a la secuencia de vacante comercial.",
  },
  form: {
    label: "Tu email de empresa",
    placeholder: "tu@empresa.com",
    submit: "Pedir acceso",
    sending: "Enviando…",
    success: "Hecho. Estás en la lista.",
    successDetail: "Te escribimos cuando abramos plaza en tu sector.",
    errorEmpty: "Escribe tu email para pedir acceso.",
    errorInvalid: "Ese email no parece completo. Revisa que tenga @ y dominio.",
    errorNetwork: "No se ha podido enviar. Prueba otra vez en un momento.",
    note: "Solo te escribimos para abrirte plaza. Sin newsletters.",
  },
  problems: {
    id: "problema",
    title: "Cuatro tareas de prospección y nadie con tiempo para hacerlas",
    lead: "Una pyme B2B no tiene a nadie dedicado a buscar clientes nuevos. Hacerlo bien son quince horas a la semana que nadie hace con constancia, y las herramientas que lo resuelven están pensadas para Estados Unidos: pocos datos de empresas españolas e inglés por defecto.",
    items: [
      {
        title: "Buscar cuentas",
        text: "Listas compradas o búsquedas a mano. La facturación real de una pyme española no está en las bases habituales.",
      },
      {
        title: "Encontrar al contacto",
        text: "Emails genéricos y datos sin verificar. Cada rebote daña el dominio desde el que escribes.",
      },
      {
        title: "Escribir e insistir",
        text: "La misma plantilla para todos. El seguimiento se abandona al segundo correo.",
      },
      {
        title: "Responder y agendar",
        text: "Las respuestas se contestan tarde y la oportunidad no queda registrada en ninguna parte.",
      },
    ],
  },
  flow: {
    id: "como-funciona",
    title: "Un orquestador y cuatro agentes. La IA decide, un motor con límites ejecuta.",
    lead: "Describes en una frase a qué empresas quieres vender. Lo demás lo hace el equipo, y cada decisión queda registrada con el razonamiento, lo que se leyó y las reglas comprobadas.",
    diagramLabel:
      "Diagrama: el Orquestador reparte el trabajo entre Account Finder, Contact Finder, Outreach y Response, y todo desemboca en reuniones agendadas.",
    orchestrator: {
      title: "Orquestador",
      text: "Convierte tu frase en un perfil de cliente, planifica la campaña y elige el siguiente paso con cada empresa.",
    },
    agents: [
      {
        title: "Account Finder",
        text: "Lee registros, webs y prensa. Puntúa cuánto encaja cada empresa y cita lo que leyó.",
      },
      {
        title: "Contact Finder",
        text: "Elige a la persona adecuada, cruza fuentes y verifica el email con un proveedor externo.",
      },
      {
        title: "Outreach",
        text: "Redacta cada mensaje con contexto y cambia de secuencia según cómo reacciona la empresa.",
      },
      {
        title: "Response",
        text: "Clasifica la respuesta, prepara la contestación, propone huecos de tu calendario y registra la oportunidad.",
      },
    ],
    meetings: "Reuniones",
    note: "Todo sale desde tu buzón de Microsoft 365.",
  },
  screens: {
    id: "producto",
    title: "Por dentro, cada decisión se puede abrir",
    lead: "Pantallas reales de la app con datos de ejemplo. Lo que propone la IA lleva su borde y su porqué; lo que sale, lo apruebas tú.",
    regionLabel: "Pantallas de Jano",
    prev: "Pantalla anterior",
    next: "Pantalla siguiente",
    pause: "Pausar el pase automático",
    play: "Reanudar el pase automático",
    slideLabel: "{n} de {total}",
    goTo: "Ir a",
    roleCarousel: "carrusel",
    roleSlide: "pantalla",
    items: [
      {
        file: "centro-de-mando",
        title: "Centro de mando",
        caption: "Lo que espera tu decisión, el embudo de la campaña y qué está haciendo cada agente ahora mismo.",
        alt: "Centro de mando de Jano: tres decisiones pendientes, siete de doce reuniones agendadas, el embudo de la campaña y la actividad de los agentes.",
      },
      {
        file: "campana",
        title: "Campaña",
        caption: "Describes a quién vender en una frase. Jano propone señales de compra y te devuelve cuentas puntuadas con su evidencia.",
        alt: "Pantalla de campaña: la frase que define el cliente ideal, las señales de compra propuestas y una tabla de cuentas puntuadas.",
      },
      {
        file: "bandeja",
        title: "Bandeja",
        caption: "La IA clasifica cada respuesta y redacta la contestación. Nada sale sin tu OK.",
        alt: "Bandeja de respuestas: un borrador de Jano que propone dos huecos de reunión y espera a ser aprobado.",
      },
      {
        file: "prospect",
        title: "Recorrido de una empresa",
        caption: "Cada paso de la secuencia, por qué la IA cambió de rama y las reglas comprobadas antes de cada envío.",
        alt: "Recorrido de una empresa: pasos enviados y omitidos, la decisión de la IA de cambiar de secuencia y las reglas comprobadas.",
      },
      {
        file: "mapa-de-flujo",
        title: "Mapa de flujo",
        caption: "Dónde está cada empresa, dónde se atasca el embudo y qué propone Jano para desatascarlo.",
        alt: "Mapa de flujo: etapas de cuentas, contactos, secuencia, respuestas y reuniones con sus registros.",
      },
      {
        file: "cumplimiento",
        title: "Cumplimiento",
        caption: "El registro de cada decisión con la regla que se aplicó, los límites de envío y la salud de tu dominio.",
        alt: "Pantalla de cumplimiento: registro de auditoría, reglas que la IA no puede saltarse y salud del dominio de envío.",
      },
    ],
  },
  rules: {
    id: "reglas",
    title: "Lo que la IA no puede saltarse",
    lead: "Competimos en precisión, no en volumen. Estas reglas viven en el motor de ejecución, no en el modelo, y la autonomía la gradúas tú.",
    items: [
      {
        title: "Máximo de envíos por buzón y día",
        text: "Protege la reputación de tu dominio. El motor aplaza lo que sobra; la IA no puede subir el límite.",
      },
      {
        title: "Nada a emails sin verificar",
        text: "Si el verificador no lo confirma, no se envía. Sin excepciones por urgencia.",
      },
      {
        title: "Cada dato con su origen",
        text: "Cada empresa y cada email guardan de dónde salieron y con qué base legal se usan.",
      },
      {
        title: "Una respuesta detiene la secuencia",
        text: "Nadie recibe un seguimiento automático después de contestar.",
      },
      {
        title: "Bajas al instante",
        text: "Un «no me escribáis más» pasa a la lista de supresión antes de que lo leas.",
      },
      {
        title: "Tú apruebas por defecto",
        text: "El piloto automático existe, pero lo activas tú, por tipo de respuesta y cuando confíes.",
      },
    ],
  },
  faq: {
    id: "preguntas",
    title: "Preguntas que nos hacen",
    items: [
      {
        q: "¿Es legal escribir en frío a empresas en España?",
        a: "La LSSI (art. 21) exige consentimiento previo o una relación comercial para enviar comunicaciones comerciales por email, también a empresas, y el nombre y el email de un directivo son datos personales (RGPD). Jano guarda el origen y la base legal de cada contacto y aplica la regla que se decida. Estamos validando el diseño de las secuencias con asesoría legal antes de abrir plazas.",
      },
      {
        q: "¿Qué hace la IA y qué no?",
        a: "La IA propone a quién escribir, cuándo y qué decir, y lo explica con lo que leyó. El envío lo ejecuta un motor con reglas fijas que la IA no puede saltarse, y por defecto tú apruebas cada mensaje.",
      },
      {
        q: "¿De dónde salen las empresas y su facturación?",
        a: "De fuentes registrales españolas y de la web de cada empresa. Cada puntuación enlaza con lo que se leyó para calcularla.",
      },
      {
        q: "¿Con qué correo se envía?",
        a: "Con tu buzón de Microsoft 365, desde un dominio secundario que se calienta antes de usarlo. Las credenciales nunca pasan por el modelo de IA.",
      },
      {
        q: "¿Cómo entro en el piloto?",
        a: "Deja tu email. Abrimos plazas por sectores a un grupo pequeño de empresas; cuando toque el tuyo, te escribimos para ver si encaja.",
      },
    ],
  },
  cta: {
    id: "acceso",
    title: "Menos correos, más reuniones.",
    lead: "Jano está en piloto con un grupo pequeño de empresas. Abrimos plazas por sectores: déjanos tu email y te avisamos cuando toque el tuyo.",
  },
  footer: {
    legalLabel: "Legal",
    links: {
      privacy: "Privacidad",
      terms: "Condiciones de uso",
      cookies: "Cookies",
      notice: "Aviso legal",
    },
    rights: "© 2026 Tekhos",
  },
  notFound: {
    title: "Esta puerta no existe",
    text: "La página que buscas no está aquí.",
    back: "Volver al inicio",
  },
  legal: {
    updated: "Última actualización: 29 de octubre de 2026",
    backHome: "Volver a Jano",
  },
};
