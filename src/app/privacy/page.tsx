import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shared/breadcrumb";

export const metadata = { title: "Privacy Policy — Heita" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Breadcrumb
        crumbs={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]}
        className="mb-6"
      />
      <header className="mb-8 space-y-2">
        <p className="eyebrow">Legal</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-ink-muted">Last updated: May 2026</p>
      </header>

      <div className="space-y-6">
        {/* 1. Who we are */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">1. Who we are</h2>
          <p className="text-sm leading-6 text-ink-muted">
            Heita (Pty) Ltd (&quot;Heita&quot;, &quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates the Heita loyalty
            and messaging platform available at heita.co.za and via our mobile progressive
            web application. We are a responsible party under the Protection of Personal
            Information Act 4 of 2013 (&quot;POPIA&quot;).
          </p>
          <p className="text-sm leading-6 text-ink-muted">
            <strong>Contact:</strong>{" "}
            <a href="mailto:privacy@heita.co.za" className="text-primary-action underline">
              privacy@heita.co.za
            </a>
          </p>
        </Card>

        {/* 2. Data we collect */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">2. Personal information we collect</h2>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              <strong>Identity &amp; contact</strong> — mobile phone number (required),
              full name (optional), email address (optional).
            </li>
            <li>
              <strong>Loyalty data</strong> — points balance, tier level, transaction
              history (earn, redeem, adjustments), membership start date, referral codes.
            </li>
            <li>
              <strong>Communications</strong> — WhatsApp messages sent to or received
              from business accounts connected to Heita; SMS OTP codes (hashed, not
              stored in plain text).
            </li>
            <li>
              <strong>AI interactions</strong> — prompts and responses from the AI
              co-worker feature, scoped to the business workspace you interact with.
            </li>
            <li>
              <strong>Device data</strong> — push notification subscription tokens,
              browser user-agent string.
            </li>
            <li>
              <strong>Consent records</strong> — timestamped records of consent granted
              or revoked for marketing, cookie use, terms of service, and privacy policy.
            </li>
            <li>
              <strong>Receipt images</strong> — photographs of purchase receipts uploaded
              for points allocation. Text is read from your receipt on your own device,
              in your browser, before any image leaves it (see &ldquo;How receipt scanning
              works&rdquo; below).
            </li>
            <li>
              <strong>Business website content</strong> — when a business owner adds their
              own website as an AI knowledge source, we fetch the public text of those pages
              and store it so the AI can answer customer questions from the business&rsquo;s
              real material. Only publicly reachable pages on the owner&rsquo;s chosen domain
              are crawled, and only by that business&rsquo;s authorised staff.
            </li>
            <li>
              <strong>Security data</strong> — IP addresses used for rate limiting and
              fraud prevention; these are not linked to your profile and are not retained
              beyond the rate-limit window.
            </li>
          </ul>
        </Card>

        {/* 3. Why we collect */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">3. Why we collect your information</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-ink-muted border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="pb-2 pr-4 font-semibold text-ink">Purpose</th>
                  <th className="pb-2 font-semibold text-ink">Legal basis (POPIA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="py-2 pr-4">Phone OTP authentication and account creation</td>
                  <td className="py-2">Contract</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Loyalty programme management (points, tiers, rewards)</td>
                  <td className="py-2">Contract</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">WhatsApp and in-app business communications</td>
                  <td className="py-2">Consent</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Marketing messages from businesses you have joined</td>
                  <td className="py-2">Consent</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">AI co-worker queries and responses</td>
                  <td className="py-2">Contract / Legitimate interest</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Security, fraud prevention, and rate limiting</td>
                  <td className="py-2">Legitimate interest</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Compliance with applicable law</td>
                  <td className="py-2">Legal obligation</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* 4. Data retention */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">4. How long we keep your data</h2>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              <strong>Active accounts</strong> — personal information is retained for as
              long as your account is active and for a reasonable period afterwards to
              fulfil our legal obligations.
            </li>
            <li>
              <strong>Deleted accounts</strong> — when you request account deletion, your
              name, phone number, email, and profile image are removed immediately. Any
              remaining anonymised records (loyalty history, aggregated analytics) are
              hard-deleted 30 days after the deletion request.
            </li>
            <li>
              <strong>OTP codes</strong> — cryptographic hashes of one-time passwords are
              automatically deleted 24 hours after they expire.
            </li>
            <li>
              <strong>WhatsApp messages</strong> — retained for 30 days then archived in
              accordance with our business communications policy.
            </li>
            <li>
              <strong>Revoked consent records</strong> — retained for 30 days after
              revocation for audit purposes, then permanently deleted.
            </li>
          </ul>
        </Card>

        {/* 5. Third-party processors */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">5. Third-party processors</h2>
          <p className="text-sm leading-6 text-ink-muted">
            We share your personal information only with the following processors, who are
            contractually bound to process it only on our instructions:
          </p>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              <strong>Amazon Web Services (United States)</strong> — database hosting and
              file storage infrastructure.
            </li>
            <li>
              <strong>Cloudflare (United States)</strong> — R2 object storage for receipt
              images and documents, and network security services.
            </li>
            <li>
              <strong>Resend (United States)</strong> — transactional email delivery
              (account deletion confirmation, data export).
            </li>
            <li>
              <strong>Africa&apos;s Talking (Kenya / South Africa)</strong> — SMS OTP
              delivery for phone number verification.
            </li>
            <li>
              <strong>Meta Platforms (United States)</strong> — WhatsApp Business API for
              messaging between businesses and customers.
            </li>
            <li>
              <strong>DeepSeek</strong> — cloud vision model used only as a fallback to read
              a receipt when on-device scanning cannot extract a clear total (see
              &ldquo;How receipt scanning works&rdquo; below).
            </li>
          </ul>
          <p className="text-sm leading-6 text-ink-muted">
            We do not sell your personal information to any third party.
          </p>
        </Card>

        {/* 5b. How receipt scanning works */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">How receipt scanning works</h2>
          <p className="text-sm leading-6 text-ink-muted">
            When you upload a receipt, the initial text extraction runs{" "}
            <strong>on your device, in your browser</strong>, using an on-device OCR engine
            (Tesseract.js). The detected text — not the image — is what we use to work out
            the purchase total and award points. This means that, in the normal case, the
            content of your receipt is read locally and the photo itself is not sent to any
            third-party processor for analysis.
          </p>
          <p className="text-sm leading-6 text-ink-muted">
            Only when on-device scanning cannot read a clear total (for example, a blurry or
            unusual receipt) do we fall back to a cloud vision service (DeepSeek) to read the
            image. The original receipt image is always stored in our object storage so staff
            can review and approve points.
          </p>
        </Card>

        {/* 6. Cross-border transfers */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">6. Cross-border transfers</h2>
          <p className="text-sm leading-6 text-ink-muted">
            Your data is stored and processed in the United States by our cloud providers
            (Amazon Web Services and Cloudflare). These transfers are made under
            applicable data transfer safeguards. By creating a Heita account you
            acknowledge that your personal information may be transferred to and processed
            in the United States and other jurisdictions outside South Africa.
          </p>
        </Card>

        {/* 7. Your rights */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">7. Your rights under POPIA (s23)</h2>
          <p className="text-sm leading-6 text-ink-muted">
            As a data subject, you have the following rights:
          </p>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              <strong>Access</strong> — you may request a copy of the personal information
              we hold about you via{" "}
              <Link href="/profile" className="text-primary-action underline">
                your profile
              </Link>
              {" "}(data export).
            </li>
            <li>
              <strong>Correction</strong> — you may update your name and email in your
              profile settings at any time.
            </li>
            <li>
              <strong>Deletion</strong> — you may delete your account from the Danger Zone
              section of your profile. PII is cleared immediately; remaining data is
              hard-deleted within 30 days.
            </li>
            <li>
              <strong>Objection</strong> — you may object to processing for marketing
              purposes by revoking your consent records on the{" "}
              <Link href="/profile/consents" className="text-primary-action underline">
                Consents page
              </Link>
              .
            </li>
            <li>
              <strong>Lodge a complaint</strong> — if you believe we have violated your
              privacy rights, you may lodge a complaint with the POPIA Information
              Regulator at{" "}
              <a href="mailto:inforeg@justice.gov.za" className="text-primary-action underline">
                inforeg@justice.gov.za
              </a>
              .
            </li>
          </ul>
        </Card>

        {/* 8. How to exercise rights */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">8. How to exercise your rights</h2>
          <p className="text-sm leading-6 text-ink-muted">
            Send a written request to{" "}
            <a href="mailto:privacy@heita.co.za" className="text-primary-action underline">
              privacy@heita.co.za
            </a>
            . We will acknowledge your request within 5 business days and respond in full
            within 30 days. We may ask you to verify your identity before processing the
            request.
          </p>
        </Card>

        {/* 9. Cookies */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">9. Cookie policy</h2>
          <p className="text-sm leading-6 text-ink-muted">
            We use essential cookies for authentication (session management) and optional
            analytics cookies. You can review and update your cookie preferences at any
            time. See our full{" "}
            <Link href="/cookies" className="text-primary-action underline">
              Cookie Policy
            </Link>
            {" "}for details.
          </p>
        </Card>

        {/* 10. Children */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">10. Children</h2>
          <p className="text-sm leading-6 text-ink-muted">
            The Heita platform is intended for persons 18 years of age or older. We do
            not knowingly collect personal information from children under 18. If you
            believe a child has registered an account, please contact us immediately at{" "}
            <a href="mailto:privacy@heita.co.za" className="text-primary-action underline">
              privacy@heita.co.za
            </a>{" "}
            so we can delete the account.
          </p>
        </Card>

        {/* 11. Updates */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">11. Changes to this policy</h2>
          <p className="text-sm leading-6 text-ink-muted">
            We may update this Privacy Policy from time to time. When we do, we will
            update the &quot;Last updated&quot; date at the top of this page and, where the
            changes are material, notify you via the app or email. Continued use of Heita
            after changes are published constitutes your acceptance of the updated policy.
          </p>
        </Card>
      </div>
    </main>
  );
}
