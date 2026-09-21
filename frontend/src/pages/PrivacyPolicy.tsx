import LegalPage, { type LegalSection } from "../components/legal/LegalPage";

const LAST_UPDATED = "September 21, 2026";
const CONTACT_EMAIL = "support@noteflow.app";

const sections: LegalSection[] = [
  {
    title: "Information we collect",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <span className="text-foreground">Account information</span> — your
          username, email address, and password (stored only as a secure hash)
          when you create an account.
        </li>
        <li>
          <span className="text-foreground">Google account data</span> — your
          name, email, and profile picture if you sign in with Google.
        </li>
        <li>
          <span className="text-foreground">Your content</span> — the notes,
          checklists, and todos you create, including their titles and
          contents.
        </li>
        <li>
          <span className="text-foreground">Voice recordings</span> — audio
          captured only while you hold the voice control button, used solely to
          create the note or action you asked for.
        </li>
        <li>
          <span className="text-foreground">Newsletter email</span> — your
          email address, if you choose to subscribe to product updates.
        </li>
      </ul>
    ),
  },
  {
    title: "How we use your information",
    body: (
      <p>
        We use your information to operate NoteFlow: authenticating you,
        storing and displaying your notes, processing voice commands, sending
        password reset codes, and — if you subscribed — sending occasional
        product updates. We do not sell your personal information, and we do
        not use your notes or voice recordings for advertising.
      </p>
    ),
  },
  {
    title: "Voice transcription",
    body: (
      <p>
        When you use voice control, your audio is transmitted securely to
        OpenAI's transcription service to be converted into a note or command.
        Audio is used only to fulfil that request. We do not store your audio
        after the transcription completes, and the resulting note belongs to
        you.
      </p>
    ),
  },
  {
    title: "Third-party services",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <span className="text-foreground">Google</span> — authentication when
          you choose "Sign in with Google".
        </li>
        <li>
          <span className="text-foreground">OpenAI</span> — speech-to-text
          processing for voice commands.
        </li>
        <li>
          <span className="text-foreground">Email delivery provider</span> —
          password reset codes and newsletter emails.
        </li>
        <li>
          <span className="text-foreground">Hosting & database provider</span>{" "}
          — application hosting and encrypted data storage.
        </li>
      </ul>
    ),
  },
  {
    title: "How your data is stored",
    body: (
      <p>
        Your data is stored in a managed cloud PostgreSQL database with
        encryption in transit. Your session token is kept in your browser's
        local storage so you stay signed in; clearing your browser data or
        signing out removes it from your device.
      </p>
    ),
  },
  {
    title: "Data retention and deletion",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Deleted notes stay in your trash until you empty it or remove them
          permanently; emptying the trash deletes them for good.
        </li>
        <li>
          You can unsubscribe from the newsletter at any time using the link in
          any email.
        </li>
        <li>
          To delete your account or request a copy of your data, contact us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </li>
      </ul>
    ),
  },
  {
    title: "Cookies and tracking",
    body: (
      <p>
        NoteFlow does not use advertising cookies or third-party analytics
        trackers. We only store what is needed to keep you signed in.
      </p>
    ),
  },
  {
    title: "Changes to this policy",
    body: (
      <p>
        If we make material changes to this policy, we will notify you through
        the app or by email. Continued use of NoteFlow after changes take
        effect means you accept the updated policy.
      </p>
    ),
  },
  {
    title: "Contact us",
    body: (
      <p>
        Questions about this policy? Email us at{" "}
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

const PrivacyPolicy = () => {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro="Your notes are yours. This policy explains what NoteFlow collects, why, and how we keep it safe — in plain language."
      sections={sections}
    />
  );
};

export default PrivacyPolicy;
