export type Lang = "es" | "en";

type Copy = {
  tagline: string;
  icp: {
    eyebrow: string;
    title: string;
    prompt: string;
    aiLabel: string;
    chips: ReadonlyArray<{ label: string; value: string }>;
  };
  pipeline: {
    eyebrow: string;
    title: string;
    orquestador: string;
    orquestadorSub: string;
    motor: string;
    nodes: ReadonlyArray<{ name: string; value: number; unit: string }>;
  };
  approval: {
    eyebrow: string;
    title: string;
    sub: string;
    badge: string;
    to: string;
    subjectLabel: string;
    subject: string;
    body: ReadonlyArray<string>;
    why: string;
    edit: string;
    approve: string;
    sending: string;
    undo: string;
    sent: string;
    sentSub: string;
  };
  rules: { eyebrow: string; lines: ReadonlyArray<string> };
  end: { byline: string; url: string };
};

export const copy: Record<Lang, Copy> = {
  es: {
    tagline: "Abre la puerta correcta.",
    icp: {
      eyebrow: "Perfil de cliente ideal",
      title: "Una frase se convierte en tu cliente ideal.",
      prompt:
        "Agencias de viajes de empresa en la Comunidad Valenciana, de 2 a 10 M€, que estén contratando.",
      aiLabel: "Perfil propuesto por Jano",
      chips: [
        { label: "Sector", value: "Viajes corporativos" },
        { label: "Región", value: "Comunidad Valenciana" },
        { label: "Facturación", value: "2–10 M€" },
        { label: "Señales de compra", value: "Contratando · nuevas rutas" },
      ],
    },
    pipeline: {
      eyebrow: "Cinco agentes",
      title: "Cada paso, a la vista.",
      orquestador: "Orquestador",
      orquestadorSub: "Propone el siguiente paso",
      motor: "El motor de reglas decide qué se ejecuta y lo registra",
      nodes: [
        { name: "Account Finder", value: 312, unit: "cuentas" },
        { name: "Contact Finder", value: 187, unit: "contactos" },
        { name: "Outreach", value: 96, unit: "en secuencia" },
        { name: "Response", value: 23, unit: "respuestas" },
        { name: "Agenda", value: 7, unit: "reuniones" },
      ],
    },
    approval: {
      eyebrow: "Aprobación",
      title: "Tú apruebas lo que sale con tu nombre.",
      sub: "Jano redacta. Tú decides.",
      badge: "Borrador de Jano",
      to: "Para",
      subjectLabel: "Asunto",
      subject: "Re: Viajes de empresa en noviembre",
      body: [
        "Hola, Pablo:",
        "Gracias por responder. Te propongo 20 minutos el jueves a las 10:00 y te enseño cómo lo resuelven otras agencias.",
        "¿Te encaja?",
      ],
      why: "Por qué · Pablo respondió ayer y pidió una demo",
      edit: "Editar",
      approve: "Aprobar y enviar",
      sending: "Se envía en",
      undo: "Deshacer",
      sent: "Enviado desde tu buzón",
      sentSub: "Microsoft 365 · registrado en la auditoría",
    },
    rules: {
      eyebrow: "Reglas que la IA no puede saltarse",
      lines: [
        "Un límite de envíos por buzón y día.",
        "Nunca a un email sin verificar.",
        "Si responden, la secuencia se detiene.",
      ],
    },
    end: { byline: "Un producto de Tekhos", url: "jano.tekhos.com" },
  },
  en: {
    tagline: "Open the right door.",
    icp: {
      eyebrow: "Ideal customer profile",
      title: "One sentence becomes your ideal customer.",
      prompt: "Corporate travel agencies in the Valencia region, €2–10M revenue, currently hiring.",
      aiLabel: "Profile proposed by Jano",
      chips: [
        { label: "Sector", value: "Corporate travel" },
        { label: "Region", value: "Valencia region" },
        { label: "Revenue", value: "€2–10M" },
        { label: "Buying signals", value: "Hiring · new routes" },
      ],
    },
    pipeline: {
      eyebrow: "Five agents",
      title: "Every step in plain sight.",
      orquestador: "Orchestrator",
      orquestadorSub: "Proposes the next step",
      motor: "The rules engine decides what runs and logs it",
      nodes: [
        { name: "Account Finder", value: 312, unit: "accounts" },
        { name: "Contact Finder", value: 187, unit: "contacts" },
        { name: "Outreach", value: 96, unit: "in sequence" },
        { name: "Response", value: 23, unit: "replies" },
        { name: "Calendar", value: 7, unit: "meetings" },
      ],
    },
    approval: {
      eyebrow: "Approval",
      title: "You approve what goes out under your name.",
      sub: "Jano drafts. You decide.",
      badge: "Drafted by Jano",
      to: "To",
      subjectLabel: "Subject",
      subject: "Re: Business travel in November",
      body: [
        "Hi Pablo,",
        "Thanks for getting back to me. How about 20 minutes on Thursday at 10:00? I'll show you how other agencies handle it.",
        "Does that work for you?",
      ],
      why: "Why · Pablo replied yesterday asking for a demo",
      edit: "Edit",
      approve: "Approve and send",
      sending: "Sending in",
      undo: "Undo",
      sent: "Sent from your mailbox",
      sentSub: "Microsoft 365 · logged for audit",
    },
    rules: {
      eyebrow: "Rules the AI can't skip",
      lines: [
        "A daily send limit per mailbox.",
        "Never to an unverified email.",
        "When they reply, the sequence stops.",
      ],
    },
    end: { byline: "A Tekhos product", url: "jano.tekhos.com" },
  },
};
