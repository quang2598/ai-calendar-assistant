import type { Metadata } from "next";

import LegalDocumentLayout, { LegalSection } from "@/app/legal/LegalDocumentLayout";

export const metadata: Metadata = {
  title: "Terms and Policies | VietCalenAI",
  description: "Terms and Policies for VietCalenAI.",
};

const effectiveDate = "March 27, 2026";

export default function TermsAndPoliciesPage() {
  return (
    <LegalDocumentLayout
      title="Terms and Policies"
      summary="These Terms and Policies govern your use of VietCalenAI websites, applications, and related browser extensions that link to this page."
      effectiveDate={effectiveDate}
    >
      <LegalSection title="1. Acceptance and Scope">
        <p>
          By accessing or using VietCalenAI, you agree to these Terms and Policies.
          If you do not agree, do not use the service.
        </p>
        <p>
          These terms apply to VietCalenAI-branded services, including the web
          application and any related browser extension or interface that links to
          this page.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility and Accounts">
        <p>
          You must use a valid account to access protected parts of the service.
          VietCalenAI currently uses Google sign-in through Firebase Authentication.
        </p>
        <p>
          You are responsible for maintaining access to your account, for activity
          that occurs under your account, and for making sure the information you
          use with the service is lawful and accurate.
        </p>
      </LegalSection>

      <LegalSection title="3. Service Functionality">
        <p>
          VietCalenAI provides AI-assisted chat and calendar functionality. Depending
          on the features you use, the service may store conversation history,
          retrieve calendar events, and help create calendar events based on your
          instructions.
        </p>
        <p>
          If you connect Google Calendar, you authorize VietCalenAI to access and
          process the Google Calendar data needed to provide the requested calendar
          features.
        </p>
      </LegalSection>

      <LegalSection title="4. Acceptable Use">
        <p>You agree not to use VietCalenAI to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>violate applicable law or the rights of others;</li>
          <li>attempt unauthorized access to accounts, tokens, systems, or data;</li>
          <li>submit malicious code, spam, or abusive content;</li>
          <li>
            use the service in a way that interferes with its normal operation or
            security;
          </li>
          <li>
            rely on the service for emergency, medical, legal, financial, or other
            high-risk decisions without independent review.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. AI Output and User Responsibility">
        <p>
          VietCalenAI uses automated systems to generate responses and assist with
          calendar tasks. AI-generated output may be incomplete, inaccurate, or
          unsuitable for your specific situation.
        </p>
        <p>
          You are responsible for reviewing responses, calendar suggestions, and
          event details before relying on them or causing real-world actions to be
          taken.
        </p>
      </LegalSection>

      <LegalSection title="6. Third-Party Services">
        <p>
          VietCalenAI depends on third-party services such as Google, Firebase, and
          AI/model infrastructure providers. Their services are subject to their own
          terms, privacy practices, availability, and technical limitations.
        </p>
        <p>
          We are not responsible for third-party outages, account restrictions,
          revoked permissions, or changes in third-party APIs or policies.
        </p>
      </LegalSection>

      <LegalSection title="7. Privacy and Data Handling">
        <p>
          Your use of VietCalenAI is also governed by the Privacy Notice available at
          <span> </span>
          <a
            href="/privacy-notice"
            className="font-medium text-cyan-300 transition hover:text-cyan-200"
          >
            /privacy-notice
          </a>
          .
        </p>
        <p>
          You should not submit sensitive information unless it is necessary for the
          service you are requesting and you are comfortable with the associated
          processing.
        </p>
      </LegalSection>

      <LegalSection title="8. Availability, Changes, and Suspension">
        <p>
          VietCalenAI may change, suspend, or discontinue features at any time,
          including calendar integrations, AI behavior, routing, or access methods.
        </p>
        <p>
          We may suspend or restrict access if we reasonably believe it is necessary
          to protect the service, comply with law, or prevent misuse.
        </p>
      </LegalSection>

      <LegalSection title="9. Disclaimer of Warranties">
        <p>
          VietCalenAI is provided on an &quot;as is&quot; and &quot;as available&quot; basis.
          To the maximum extent permitted by law, we disclaim warranties of
          merchantability, fitness for a particular purpose, non-infringement,
          accuracy, availability, and uninterrupted operation.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, VietCalenAI and its operators will
          not be liable for indirect, incidental, special, consequential, exemplary,
          or punitive damages, or for loss of profits, data, goodwill, calendar
          entries, business opportunity, or service availability arising from or
          related to your use of the service.
        </p>
      </LegalSection>

      <LegalSection title="11. Termination">
        <p>
          You may stop using the service at any time. We may terminate or restrict
          access at any time if these terms are violated, if integration access is
          revoked, or if continued access would create legal or security risk.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          If you have questions about these Terms and Policies, contact VietCalenAI
          at{" "}
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
