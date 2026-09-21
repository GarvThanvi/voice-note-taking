import LegalPage, { type LegalSection } from "../components/legal/LegalPage";
import { Link } from "react-router-dom";

const LAST_UPDATED = "September 21, 2026";
const CONTACT_EMAIL = "support@noteflow.app";

const sections: LegalSection[] = [
  {
    title: "Acceptance of these terms",
    body: (
      <p>
        By creating an account or using NoteFlow, you agree to these Terms of
        Service. If you don't agree with any part of them, please don't use the
        service.
      </p>
    ),
  },
  {
    title: "Your account",
    body: (
      <p>
        You're responsible for keeping your password secure and for all
        activity that happens under your account. You must provide accurate
        information when signing up and be at least 13 years old (or the
        minimum age required by your country) to use NoteFlow.
      </p>
    ),
  },
  {
    title: "Your content",
    body: (
      <p>
        You own your notes. We claim no ownership over the content you create,
        store, or dictate using NoteFlow. By using the service, you grant us
        only the limited permission needed to store, back up, and display your
        content back to you. You're solely responsible for the content you
        store, and you must not use NoteFlow to store unlawful or infringing
        material.
      </p>
    ),
  },
  {
    title: "Voice transcription",
    body: (
      <p>
        Voice control converts your speech into notes and commands using
        third-party transcription services. Transcription may occasionally be
        inaccurate — especially with accents, background noise, or unusual
        words — so please review voice-created notes. Don't use voice control
        while driving or in situations where capturing or sharing audio could
        violate another person's privacy or the law.
      </p>
    ),
  },
  {
    title: "Acceptable use",
    body: (
      <p>
        You agree not to misuse NoteFlow — including attempting to access other
        users' data, probing or disrupting the service, reselling it without
        permission, or using it to send spam. We may suspend or terminate
        accounts that violate these rules or applicable law.
      </p>
    ),
  },
  {
    title: "Availability and changes",
    body: (
      <p>
        We work hard to keep NoteFlow available, but the service is provided
        "as is" and "as available" without warranties of any kind. We may add,
        change, or discontinue features, and we may update these terms from
        time to time. If a change is material, we'll notify you through the app
        or by email before it takes effect. See our{" "}
        <Link
          to="/privacy"
          className="text-primary underline-offset-2 hover:underline"
        >
          Privacy Policy
        </Link>{" "}
        for how we handle your data.
      </p>
    ),
  },
  {
    title: "Limitation of liability",
    body: (
      <p>
        To the maximum extent permitted by law, NoteFlow and its operators will
        not be liable for indirect, incidental, or consequential damages, or
        for any loss of data, profits, or goodwill arising from your use of the
        service. We recommend keeping your own backup of anything important.
      </p>
    ),
  },
  {
    title: "Termination",
    body: (
      <p>
        You can stop using NoteFlow and delete your content at any time. We may
        suspend or terminate your access if you breach these terms, or if
        required by law.
      </p>
    ),
  },
  {
    title: "Contact",
    body: (
      <p>
        Questions about these terms? Email us at{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    ),
  },
];

const TermsOfService = () => {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      intro="The short version: be kind, own your content, and don't misuse the service. The details are below."
      sections={sections}
    />
  );
};

export default TermsOfService;
