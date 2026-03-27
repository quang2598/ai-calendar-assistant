import type { Metadata } from "next";

import LegalDocumentLayout, { LegalSection } from "@/app/legal/LegalDocumentLayout";

export const metadata: Metadata = {
  title: "Privacy Notice | VietCalenAI",
  description: "Privacy Notice for VietCalenAI.",
};

const effectiveDate = "March 27, 2026";

export default function PrivacyNoticePage() {
  return (
    <LegalDocumentLayout
      title="Privacy Notice"
      summary="This Privacy Notice explains what information VietCalenAI collects, how it is used, when it is shared, and the choices available to you."
      effectiveDate={effectiveDate}
    >
      <LegalSection title="1. Scope">
        <p>
          This Privacy Notice applies to VietCalenAI-branded services that link to
          it, including the web application and any related browser extension or
          interface that uses the same branding and references this notice.
        </p>
      </LegalSection>

      <LegalSection title="2. Information We Collect">
        <p>
          Depending on how you use the service, VietCalenAI may collect and process
          the following categories of information.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Account information from Google sign-in, such as your display name,
            email address, profile image, and account identifier needed to operate
            your account.
          </li>
          <li>
            Account metadata stored in our database, such as profile creation time
            and last login time.
          </li>
          <li>
            Chat and conversation data, including conversation titles, message text,
            message roles, and message timestamps.
          </li>
          <li>
            Google Calendar connection data, including granted scopes, Google account
            identifier metadata, refresh tokens, refreshed access tokens, and token
            timestamps required to maintain the calendar integration.
          </li>
          <li>
            Calendar content accessed or processed when you use calendar features,
            such as event title, date and time, all-day status, location,
            description, color, event status, and attendee email addresses when you
            ask us to create events with invitees.
          </li>
          <li>
            Browser permission data for optional voice features. If you enable
            microphone-based speech input, your browser or operating system may
            process audio using its speech-recognition services.
          </li>
          <li>
            Operational and security information such as request metadata, runtime
            errors, service logs, and integration/debug records needed to secure,
            maintain, and troubleshoot the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How We Use Information">
        <p>We use information we collect to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>authenticate users and manage access to the service;</li>
          <li>store and display conversation history;</li>
          <li>connect to Google Calendar and provide calendar-related features;</li>
          <li>generate AI-assisted responses and carry out user-requested actions;</li>
          <li>protect accounts, prevent abuse, and enforce our terms;</li>
          <li>monitor reliability, debug errors, and improve service operations;</li>
          <li>comply with legal obligations and legitimate enforcement requests.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Google Calendar and Google API Data">
        <p>
          If you connect Google Calendar, VietCalenAI uses Google API data only to
          provide calendar features requested by you, such as reading events,
          showing schedule information, and creating calendar events on your behalf.
        </p>
        <p>
          VietCalenAI&apos;s use and transfer of information received from Google APIs
          will adhere to the Google API Services User Data Policy, including the
          Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection title="5. How We Share Information">
        <p>We may share information in the following circumstances:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            With service providers and infrastructure partners that help us operate
            authentication, databases, hosting, AI processing, or calendar features.
          </li>
          <li>
            With Google and Firebase when required to authenticate you, manage your
            Google Calendar connection, or fulfill Google API requests you trigger.
          </li>
          <li>
            With legal authorities or other parties when required by law, valid
            legal process, or to protect the rights, safety, and security of
            VietCalenAI, our users, or others.
          </li>
          <li>
            In connection with a business transfer, reorganization, financing, or
            similar transaction, subject to appropriate confidentiality protections.
          </li>
        </ul>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="6. Security">
        <p>
          VietCalenAI uses technical and organizational measures designed to protect
          personal information, including authenticated access controls, server-side
          token handling for Google Calendar credentials, Firebase ID-token
          verification on protected routes, signed OAuth state validation, and data
          storage rules intended to restrict browser access to sensitive token
          records.
        </p>
        <p>
          No security measure is perfect, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection title="7. Data Retention">
        <p>
          We retain information for as long as reasonably necessary to operate the
          service, maintain integrations, resolve disputes, enforce agreements, and
          comply with legal obligations.
        </p>
        <p>
          For example, conversation history and calendar integration records may
          remain stored until they are deleted by us, removed as part of account
          cleanup, or no longer needed for the purposes described in this notice.
        </p>
      </LegalSection>

      <LegalSection title="8. Your Choices">
        <p>You may choose to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>stop using the service at any time;</li>
          <li>decline to connect Google Calendar;</li>
          <li>revoke Google Calendar access through your Google account settings;</li>
          <li>decline browser microphone permissions for voice input features;</li>
          <li>
            contact us to request deletion or other privacy-related assistance,
            subject to applicable law and technical limitations.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Children">
        <p>
          VietCalenAI is not directed to children under 13, and we do not knowingly
          collect personal information from children under 13 through the service.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to This Notice">
        <p>
          We may update this Privacy Notice from time to time. When we do, we may
          revise the effective date and post the updated notice at this page.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          For privacy questions or requests, contact VietCalenAI at{" "}
          <a
            href="mailto:tysonhoanglearning@gmail.com"
            className="font-medium text-cyan-300 transition hover:text-cyan-200"
          >
            tysonhoanglearning@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
