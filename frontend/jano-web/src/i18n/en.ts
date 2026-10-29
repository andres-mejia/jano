import type { Dict } from "./types";

export const en: Dict = {
  meta: {
    title: "Jano · An AI sales team for B2B small businesses",
    description:
      "Jano is an AI sales team for Spanish B2B companies. It finds the right accounts, reaches the right person, writes at the right moment and books the meeting. You approve everything that goes out under your name.",
    ogAlt: "Jano. Open the right door. An AI sales team for B2B small businesses.",
  },
  brand: {
    tagline: "AI sales team",
    byline: "Jano, a Tekhos product",
    homeLabel: "Jano, home",
  },
  skip: "Skip to content",
  nav: {
    label: "Main",
    items: [
      { id: "how-it-works", label: "How it works" },
      { id: "product", label: "Product" },
      { id: "rules", label: "Rules" },
      { id: "faq", label: "FAQ" },
    ],
    login: "Sign in",
    cta: "Get early access",
    language: "Language",
    backToTop: "Back to top",
  },
  hero: {
    title: "Open the right door.",
    lead: "Jano is an AI sales team. It finds the right accounts, reaches the right person, writes at the right moment and books the meeting. Nothing goes out under your name until you say so.",
    videoLabel: "Video: a walkthrough of Jano, from finding accounts to a booked meeting",
    videoNote: "App walkthrough with sample data",
    play: "Play the video",
    pause: "Pause the video",
    aiLabel: "AI decision",
    aiText: "Buying signal at Rumbo Norte: switching to the sales-hire sequence.",
  },
  form: {
    label: "Your work email",
    placeholder: "you@company.com",
    submit: "Get early access",
    sending: "Sending…",
    success: "Done. You're on the list.",
    successDetail: "We'll email you when a spot opens up in your industry.",
    errorEmpty: "Enter your email to request access.",
    errorInvalid: "That email looks incomplete. Check it has an @ and a domain.",
    errorNetwork: "We couldn't send that. Please try again in a moment.",
    note: "We'll only email you about your spot. No newsletters.",
  },
  problems: {
    id: "problem",
    title: "Four prospecting jobs, and nobody with the time to do them",
    lead: "A B2B small business rarely has anyone dedicated to finding new customers. Doing it properly takes fifteen hours a week that nobody spends consistently, and the tools built for it are made for the US market: thin data on Spanish companies and English by default.",
    items: [
      {
        title: "Finding accounts",
        text: "Bought lists or manual searches. The real revenue of a Spanish small business isn't in the usual databases.",
      },
      {
        title: "Reaching the right person",
        text: "Generic inboxes and unverified data. Every bounce hurts the domain you send from.",
      },
      {
        title: "Writing and following up",
        text: "The same template for everyone. Follow-ups die after the second email.",
      },
      {
        title: "Replying and booking",
        text: "Replies get answered late, and the opportunity is never recorded anywhere.",
      },
    ],
  },
  flow: {
    id: "how-it-works",
    title: "One orchestrator, four agents. The AI decides; a rules engine executes.",
    lead: "Describe the companies you want to sell to in a single sentence. The team does the rest, and every decision is logged with its reasoning, what it read and which rules it checked.",
    orchestrator: {
      title: "Orchestrator",
      text: "Turns your sentence into a customer profile, plans the campaign and picks the next step for each company.",
    },
    agents: [
      {
        title: "Account Finder",
        text: "Reads company registries, websites and the press. Scores how well each company fits and cites what it read.",
      },
      {
        title: "Contact Finder",
        text: "Picks the right person, cross-checks sources and verifies the email with an external provider.",
      },
      {
        title: "Outreach",
        text: "Writes every message with context and switches sequence depending on how the company responds.",
      },
      {
        title: "Response",
        text: "Sorts each reply, drafts the answer, offers slots from your calendar and records the opportunity.",
      },
    ],
    run: {
      label: "Sample run of three companies through the Jano team, with the event log.",
      orchestrator: "Orchestrator",
      dispatch: "Assigns {stage}: {task}",
      idle: "Planning the next step",
      working: "Working",
      pending: "Waiting",
      feedTitle: "Event log",
      pause: "Pause the animation",
      play: "Resume the animation",
      owners: { agent: "AI", engine: "Engine", you: "You", outcome: "Outcome" },
      stages: [
        { title: "Account Finder", owner: "agent", task: "score the fit" },
        { title: "Contact Finder", owner: "agent", task: "find the right person" },
        { title: "Outreach", owner: "agent", task: "draft the first email" },
        { title: "Rules engine", owner: "engine", task: "check the limits" },
        { title: "Your approval", owner: "you", task: "wait for your go-ahead" },
        { title: "Response", owner: "agent", task: "read the reply" },
        { title: "Meeting", owner: "outcome", task: "book it in your calendar" },
      ],
      scenarios: [
        {
          company: "Viajes Albufera",
          start: "10:47",
          steps: [
            { status: "Fit 92/100 · opening a Valencia office", log: "Fit 92/100, cites 3 sources" },
            { status: "Pablo Ferrer, operations · email verified", log: "Contact verified by an external provider" },
            { status: "Draft about their new office", log: "Draft ready for review" },
            { status: "Limit 31/50 · verified · not suppressed", log: "Three rules checked: clear to send" },
            { status: "Approved from the inbox", log: "Approved; sent from your mailbox" },
            { status: "Interested · suggests Thursday", log: "Positive reply classified" },
            { status: "Thursday 10:00 · in your calendar", log: "Meeting booked" },
          ],
        },
        {
          company: "Talleres Morvedre",
          start: "11:02",
          steps: [
            { status: "Fit 81/100 · growing its fleet", log: "Fit 81/100, cites 2 sources" },
            { status: "Lucía Navarro, management · email verified", log: "Contact verified by an external provider" },
            { status: "Draft about the expansion", log: "Draft ready for review" },
            { status: "Mailbox at its limit (50/50) · sends tomorrow at 9:00", log: "Send held by the daily limit", tone: "hold" },
          ],
        },
        {
          company: "Cerámicas Onda",
          start: "11:15",
          steps: [
            { status: "Fit 77/100 · new export line", log: "Fit 77/100, cites 2 sources" },
            { status: "Jordi Peris, purchasing · email verified", log: "Contact verified by an external provider" },
            { status: "Second email in the sequence", log: "Draft ready for review" },
            { status: "Limit 34/50 · verified · not suppressed", log: "Three rules checked: clear to send" },
            { status: "Approved from the inbox", log: "Approved; sent from your mailbox" },
            { status: "Asks to unsubscribe · sequence stopped", log: "Unsubscribed: added to the suppression list", tone: "stop" },
          ],
        },
      ],
    },
    note: "Everything goes out from your own Microsoft 365 mailbox.",
  },
  screens: {
    id: "product",
    title: "Inside, every decision opens up",
    lead: "Real screens from the app, with sample data. Anything the AI proposes carries its outline and its reasons; anything that goes out, you approve.",
    regionLabel: "Jano screens",
    prev: "Previous screen",
    next: "Next screen",
    pause: "Pause the slideshow",
    play: "Resume the slideshow",
    slideLabel: "{n} of {total}",
    goTo: "Go to",
    roleCarousel: "carousel",
    roleSlide: "screen",
    items: [
      {
        file: "centro-de-mando",
        title: "Command centre",
        caption: "What's waiting for your decision, the campaign funnel and what each agent is doing right now.",
        alt: "Jano's command centre: three pending decisions, seven of twelve meetings booked, the campaign funnel and live agent activity.",
      },
      {
        file: "campana",
        title: "Campaign",
        caption: "Describe who to sell to in one sentence. Jano suggests buying signals and returns scored accounts with the evidence behind them.",
        alt: "Campaign screen: the sentence that defines the ideal customer, suggested buying signals and a table of scored accounts.",
      },
      {
        file: "bandeja",
        title: "Inbox",
        caption: "The AI sorts every reply and drafts the answer. Nothing is sent until you approve it.",
        alt: "Reply inbox: a draft from Jano offering two meeting slots, waiting for approval.",
      },
      {
        file: "prospect",
        title: "A company's journey",
        caption: "Every step of the sequence, why the AI switched track and the rules checked before each send.",
        alt: "A company's journey: sent and skipped steps, the AI's decision to switch sequence and the rules it checked.",
      },
      {
        file: "mapa-de-flujo",
        title: "Flow map",
        caption: "Where each company is, where the funnel gets stuck and what Jano suggests to unblock it.",
        alt: "Flow map: stages for accounts, contacts, sequences, replies and meetings, with their activity log.",
      },
      {
        file: "cumplimiento",
        title: "Compliance",
        caption: "A log of every decision with the rule that was applied, sending limits and the health of your domain.",
        alt: "Compliance screen: audit log, rules the AI cannot bypass and sending domain health.",
      },
    ],
  },
  rules: {
    id: "rules",
    title: "What the AI can't override",
    lead: "We compete on precision, not volume. These rules live in the execution engine, not in the model, and you decide how much autonomy to give it.",
    items: [
      {
        title: "A daily cap per mailbox",
        text: "It protects your domain's reputation. The engine holds back anything over the limit, and the AI can't raise it.",
      },
      {
        title: "Nothing to unverified emails",
        text: "If the verifier doesn't confirm it, it doesn't get sent. No exceptions for urgency.",
      },
      {
        title: "Every data point has a source",
        text: "Each company and each email records where it came from and the legal basis for using it.",
      },
      {
        title: "A reply stops the sequence",
        text: "Nobody gets an automatic follow-up after they've answered.",
      },
      {
        title: "Opt-outs are instant",
        text: "A “please stop emailing me” goes on the suppression list before you've even read it.",
      },
      {
        title: "You approve by default",
        text: "Autopilot exists, but you switch it on yourself, per type of reply, once you trust it.",
      },
    ],
  },
  faq: {
    id: "faq",
    title: "Questions we get asked",
    items: [
      {
        q: "Is it legal to cold-email companies in Spain?",
        a: "Spain's e-commerce law (LSSI, art. 21) requires prior consent or an existing business relationship for commercial email, including to companies, and an executive's name and email are personal data under the GDPR. Jano records the source and legal basis of every contact and applies whichever rule is agreed. We're reviewing our sequence design with legal counsel before opening spots.",
      },
      {
        q: "What does the AI do, and what doesn't it do?",
        a: "The AI proposes who to write to, when and what to say, and explains it with what it read. Sending is handled by an engine with fixed rules the AI can't override, and by default you approve every message.",
      },
      {
        q: "Where do the companies and their revenue figures come from?",
        a: "From Spanish company registries and each company's own website. Every score links to what was read to calculate it.",
      },
      {
        q: "Which email account sends the messages?",
        a: "Your own Microsoft 365 mailbox, from a secondary domain that's warmed up before use. Your credentials never pass through the AI model.",
      },
      {
        q: "How do I join the pilot?",
        a: "Leave your email. We're opening spots industry by industry to a small group of companies; when it's your industry's turn, we'll get in touch to see if it's a fit.",
      },
    ],
  },
  cta: {
    id: "early-access",
    title: "Fewer emails. More meetings.",
    lead: "Jano is in a pilot with a small group of companies. We're opening spots industry by industry: leave your email and we'll let you know when it's your turn.",
  },
  footer: {
    legalLabel: "Legal",
    links: {
      privacy: "Privacy",
      terms: "Terms of use",
      cookies: "Cookies",
      notice: "Legal notice",
    },
    rights: "© 2026 Tekhos",
  },
  notFound: {
    title: "This door doesn't exist",
    text: "The page you're looking for isn't here.",
    back: "Back to home",
  },
  legal: {
    updated: "Last updated: 29 October 2026",
    backHome: "Back to Jano",
  },
};
