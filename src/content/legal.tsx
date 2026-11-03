import type { LegalSection } from "@/components/legal/legal-page";

/**
 * The privacy policy and terms of service (U5, D-193). PLACEHOLDER TEXT: the owner replaces it
 * (and sets LEGAL_PLACEHOLDER to false) before real members use the app. Fill in the [brackets],
 * then have it reviewed: it is a starting point, not legal advice.
 */
export const LEGAL_PLACEHOLDER = true;
export const LEGAL_UPDATED = "[date]";

export const PRIVACY_INTRO = (
  <p>
    This policy explains what personal information OpenCharterApp, operated by [operator name]
    (&quot;we&quot;), collects when you use it, how it is used, and the choices you have.
    OpenCharterApp is used by associations (&quot;organizations&quot;), such as a national
    association and its chapters, to run their memberships. Each organization decides what it
    collects about its members and is responsible for how it uses that information.
  </p>
);

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "Information we collect",
    body: (
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <strong>Your account:</strong> your name, email address and password (stored only as a
          secure hash), or your sign-in through Google.
        </li>
        <li>
          <strong>Membership records:</strong> what an organization records about you, such as your
          membership level, dates, standing, board seats, and the member fields it asks for (for
          example rank or branch of service).
        </li>
        <li>
          <strong>Payments:</strong> amounts, dates and receipts for payments you make to an
          organization. Card details are entered on Stripe&apos;s pages and never reach our servers.
        </li>
        <li>
          <strong>Activity:</strong> an audit log of changes made in an organization, and technical
          information needed to keep the service working and secure (such as error reports).
        </li>
      </ul>
    ),
  },
  {
    heading: "How we use it",
    body: (
      <p>
        To provide the service: to let organizations manage memberships, collect dues, issue
        receipts and run their boards; to let you join, renew and see your own records; to keep the
        service secure; and to meet legal obligations. We do not sell your information or use it for
        advertising. [Add any other uses.]
      </p>
    ),
  },
  {
    heading: "Who can see your information",
    body: (
      <>
        <p>
          The organizations you belong to, and the people they authorize (for example their
          administrators and officers), can see your membership records. A national association can
          see the records of its chapters&apos; members. Other members see you in a member directory
          only if the organization has one and you haven&apos;t opted out.
        </p>
        <p>
          We share information with service providers that run the service for us: [hosting and
          database provider], Stripe (payments), and [email provider], under agreements that protect
          it. We may disclose information when the law requires it.
        </p>
      </>
    ),
  },
  {
    heading: "How long we keep it",
    body: (
      <p>
        Membership, payment and receipt records are kept for as long as the organization needs them
        and the law requires (for example for tax records), and the audit log is kept to show what
        changed. [State retention periods.] An organization can take a member off its roster; the
        history is kept.
      </p>
    ),
  },
  {
    heading: "Your choices and rights",
    body: (
      <p>
        You can update your name, email and password on your Account page, and choose whether you
        are listed in a member directory. To see, correct, export or delete the records an
        organization keeps about you, contact that organization; you can also contact us at [contact
        email]. Depending on where you live you may have further rights. [Describe them and how to
        exercise them.]
      </p>
    ),
  },
  {
    heading: "Security",
    body: (
      <p>
        Each organization&apos;s data is kept separate, access is limited by role, payment keys are
        stored encrypted, and changes are logged. No service is perfectly secure; tell us at
        [security contact] if you find a problem.
      </p>
    ),
  },
  {
    heading: "Children",
    body: (
      <p>
        OpenCharterApp is not meant for children under [13/16], and we don&apos;t knowingly collect
        their information.
      </p>
    ),
  },
  {
    heading: "Changes and contact",
    body: (
      <p>
        We will post changes to this policy here and update the date above. Questions: [operator
        name], [postal address], [contact email].
      </p>
    ),
  },
];

export const TERMS_INTRO = (
  <p>
    These terms apply to your use of OpenCharterApp, operated by [operator name] (&quot;we&quot;).
    By creating an account or joining an organization through it, you agree to them. If you use it
    on behalf of an organization, you agree to them for that organization too.
  </p>
);

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "Accounts",
    body: (
      <p>
        Keep your sign-in details safe and your information accurate. You are responsible for what
        happens under your account. Tell us at [contact email] if you think someone else has used
        it.
      </p>
    ),
  },
  {
    heading: "Organizations",
    body: (
      <p>
        Organizations use OpenCharterApp to run their memberships. Each organization is responsible
        for the information it records about its members, for having the right to record it, for its
        membership rules and prices, and for the accuracy of its receipts and tax information.
        Receipt wording is provided as a starting point and should be checked by the
        organization&apos;s own accountant.
      </p>
    ),
  },
  {
    heading: "Payments",
    body: (
      <p>
        Dues and other payments are made to the organization, through its own Stripe account, not to
        us. Questions about a payment, a refund or a membership are for the organization.
        Stripe&apos;s own terms apply to card payments. [Describe any fees you charge
        organizations.]
      </p>
    ),
  },
  {
    heading: "Acceptable use",
    body: (
      <p>
        Don&apos;t misuse the service: no unlawful use, no accessing other people&apos;s or
        organizations&apos; information without permission, no interfering with the service or its
        security, and no sending spam through it. We may suspend accounts that do.
      </p>
    ),
  },
  {
    heading: "Your content",
    body: (
      <p>
        Organizations and members keep their rights to the information they put into OpenCharterApp.
        You give us permission to store and process it only to provide the service.
        OpenCharterApp&apos;s software is open source under the GNU Affero General Public License
        version 3.
      </p>
    ),
  },
  {
    heading: "Availability and changes",
    body: (
      <p>
        We work to keep the service available and your information safe, but we can&apos;t promise
        it will always be available or error-free. We may change or discontinue features, and will
        give reasonable notice of significant changes. [Describe data export on closure.]
      </p>
    ),
  },
  {
    heading: "Liability",
    body: (
      <p>
        The service is provided &quot;as is&quot;. To the extent the law allows, we are not liable
        for indirect or consequential losses, and our total liability is limited to [amount]. [Have
        this section reviewed for your jurisdiction.]
      </p>
    ),
  },
  {
    heading: "Ending your use",
    body: (
      <p>
        You can stop using OpenCharterApp at any time; an organization may keep records it needs, as
        described in the privacy policy. We may end access that breaks these terms.
      </p>
    ),
  },
  {
    heading: "Law and contact",
    body: (
      <p>
        These terms are governed by the laws of [state/country]. We will post changes here and
        update the date above. Questions: [operator name], [postal address], [contact email].
      </p>
    ),
  },
];
