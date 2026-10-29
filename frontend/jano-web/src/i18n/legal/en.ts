import { routes } from "../routes";
import { titular } from "../titular";
import type { LegalSet } from "./types";

const owner = titular.razonSocial;
const mail = `<a href="mailto:${titular.email}">${titular.email}</a>`;
const privacy = `<a href="${routes.privacy.en}">privacy policy</a>`;
const notice = `<a href="${routes.notice.en}">legal notice</a>`;
const cookies = `<a href="${routes.cookies.en}">cookie policy</a>`;

export const legalEn: LegalSet = {
  holderLabels: {
    razonSocial: "Company name",
    nif: "Tax ID (NIF)",
    domicilio: "Registered address",
    registro: "Registry details",
    email: "Contact",
    web: "Company website",
  },
  docs: {
    privacy: {
      title: "Privacy policy",
      description: `What personal data ${owner} processes in Jano, why, where it is stored and how to exercise your rights.`,
      sections: [
        {
          heading: "Who processes your data",
          body: [
            `The data controller is ${owner}, which owns Jano (jano.tekhos.com and jano-app.tekhos.com). Its identifying details are in the ${notice}. For any privacy question, email ${mail}.`,
          ],
        },
        {
          heading: "What data we process and why",
          body: [
            `<strong>Early access list.</strong> The email you enter in the form on this website, the page language and the date. We use it only to let you know when a spot opens in the pilot. The legal basis is your consent, which you can withdraw at any time by emailing us; we keep it until we give you access, you ask us to delete it, or the pilot ends.`,
            `<strong>App account.</strong> Your email, your name, the company you belong to and your role there. They are entered by your company's administrator or by the Jano team when your account is created. We use them to identify you, give you access to your company's data and record who does what. The legal basis is the contract with your company and our legitimate interest in keeping a reliable activity log.`,
            `<strong>Sign in with Google.</strong> If you choose “Continue with Google”, Google shares only your email address, whether it is verified, your name, the URL of your profile photo and your Google account ID (the <code>openid</code>, <code>email</code> and <code>profile</code> scopes). We use them only to check that the email belongs to an account your company has already set up in Jano, so you can sign in without a password, and to show your photo next to your name in the app. If no such account exists, we store nothing.`,
            `<strong>Activity log.</strong> The actions you take in the app (approving, editing or discarding a message, changing a rule) are logged with your user and the time, so your company can audit what was sent and why.`,
            `<strong>Our customers' business contacts.</strong> When a customer company uses Jano to find accounts and email its contacts, that company is the controller of that data and ${owner} processes it on its behalf, following its instructions and the rules described in the terms of use. Every data point records its source.`,
          ],
        },
        {
          heading: "How we use Google data",
          body: [
            `We do not access your Gmail, contacts, calendar, files or any other data in your Google account. Data we receive from Google is not sold, not shared with third parties, not used for advertising and not used to train artificial intelligence models. Jano's use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.`,
          ],
        },
        {
          heading: "Where it is stored and who else is involved",
          body: [
            `On Amazon Web Services, in the Ireland region (eu-west-1). The AI model runs on Amazon Bedrock in the same region and does not use your data for training. Email is sent from your company's own Microsoft 365 mailbox. These providers act as data processors under contract and with GDPR safeguards. Passwords and third-party credentials never pass through the AI model and are never stored in plain text.`,
            `We do not sell personal data or use it for advertising.`,
          ],
        },
        {
          heading: "How long we keep it",
          body: [
            `For as long as your account or your company's account is active. When they are closed, or if you ask us, we delete your sign-in data; the activity log is kept for as long as the law requires. Your early access email is deleted when you ask or when the pilot ends.`,
          ],
        },
        {
          heading: "Your rights",
          body: [
            `You can request access, rectification, erasure, objection, restriction and portability, and withdraw your consent, by emailing ${mail}. You can also remove Jano's access to your Google account at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> and lodge a complaint with the Spanish Data Protection Agency (<a href="https://www.aepd.es">aepd.es</a>).`,
          ],
        },
        {
          heading: "Cookies",
          body: [`This website sets no cookies and loads no third-party trackers. The details are in the ${cookies}.`],
        },
        {
          heading: "Changes",
          body: [
            `If we change this policy, we'll publish the new version here with its date. If a change affects how we use data we already hold, we'll tell you first.`,
          ],
        },
      ],
    },
    terms: {
      title: "Terms of use",
      description: "The terms under which a company uses Jano during the pilot.",
      sections: [
        {
          heading: "The service",
          body: [
            `Jano is a ${owner} service for businesses: it helps their sales team find accounts, prepare messages and book meetings. The AI proposes; every message is approved by someone at your company unless your company switches on autopilot. During the pilot, the service may change or be interrupted.`,
          ],
        },
        {
          heading: "Accounts",
          body: [
            `There is no open sign-up. The Jano team sets up each company and its administrator, who invites and deactivates the people on their team. You are responsible for what is done with your account; if you think someone is using it without permission, let us know at ${mail}.`,
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            `Your company agrees to use Jano in line with the laws on commercial communications and data protection, not to message anyone who has opted out, and not to try to access other companies' data. Jano enforces rules that cannot be bypassed (sending limits, a suppression list, stopping the sequence when someone replies) and may suspend an account that breaks them.`,
          ],
        },
        {
          heading: "Data",
          body: [
            `Your company's data belongs to your company; in the app, only people from your company can see it. How we handle personal data is explained in the ${privacy}.`,
          ],
        },
        {
          heading: "Intellectual property",
          body: [
            `The software, the Jano brand and the content of the website and the app belong to ${owner}. The messages your company approves and sends belong to your company.`,
          ],
        },
        {
          heading: "Liability",
          body: [
            `Jano is provided as is during the pilot, with no guarantee of commercial results. Your company decides which messages are sent and is responsible for their content. Nothing here limits the rights your company has under the law.`,
          ],
        },
        {
          heading: "Changes and cancellation",
          body: [
            `We may update these terms and will give you notice of any significant change. Your company can stop using Jano at any time by emailing ${mail}.`,
          ],
        },
        {
          heading: "Governing law",
          body: [`These terms are governed by Spanish law.`],
        },
      ],
    },
    cookies: {
      title: "Cookie policy",
      description: "This website sets no cookies and loads no third-party trackers, so it doesn't ask for your consent.",
      sections: [
        {
          heading: "This website uses no cookies",
          body: [
            `jano.tekhos.com sets no cookies, stores nothing in your browser's storage and uses no analytics or advertising tools. It doesn't load third-party resources either: fonts, images and videos are all served from our own domain.`,
            `That's why you won't see a cookie consent banner: there is nothing to accept or reject.`,
          ],
        },
        {
          heading: "The early access form",
          body: [
            `If you leave your email, it is sent straight to our infrastructure on AWS, without going through any third-party service. How we handle it is explained in the ${privacy}.`,
          ],
        },
        {
          heading: "The app",
          body: [
            `The app (jano-app.tekhos.com) only uses the technical storage strictly needed to keep you signed in. That storage is exempt from consent because the service you asked for can't work without it.`,
          ],
        },
        {
          heading: "If this changes",
          body: [
            `If we ever add a cookie that isn't strictly necessary, we'll update this policy and ask for your consent before setting it. For any questions, email ${mail}.`,
          ],
        },
      ],
    },
    notice: {
      title: "Legal notice",
      description: "Details of the owner of Jano and the terms for using this website.",
      sections: [
        {
          heading: "Owner",
          holder: true,
          body: [
            `This website and the Jano app are owned by ${owner}, in accordance with article 10 of Spanish Law 34/2002 on information society services and e-commerce (LSSI).`,
          ],
        },
        {
          heading: "Purpose",
          body: [
            `This website presents Jano, an AI sales team for B2B small businesses, and lets you join the early access list. Use of the app is governed by its terms of use.`,
          ],
        },
        {
          heading: "Intellectual and industrial property",
          body: [
            `The text, images, design, code and the Jano brand belong to ${owner} or are used under licence. They may not be reproduced for commercial purposes without permission. Screenshots of the app show fictitious companies and people.`,
          ],
        },
        {
          heading: "Liability",
          body: [
            `We try to keep the information on this website accurate and up to date, but it may change without notice while the product is in pilot. We are not responsible for the content of third-party websites we link to.`,
          ],
        },
        {
          heading: "Privacy and cookies",
          body: [`Personal data is handled according to the ${privacy}. This website uses no cookies (${cookies}).`],
        },
        {
          heading: "Governing law",
          body: [`This notice is governed by Spanish law.`],
        },
      ],
    },
  },
};
