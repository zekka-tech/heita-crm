import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shared/breadcrumb";

export const metadata = { title: "Terms of Service — Heita" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Breadcrumb
        crumbs={[{ label: "Home", href: "/" }, { label: "Terms of Service" }]}
        className="mb-6"
      />
      <header className="mb-8 space-y-2">
        <p className="eyebrow">Legal</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-ink-muted">Last updated: May 2026</p>
      </header>

      <div className="space-y-6">
        {/* 1. Service description */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">1. About Heita</h2>
          <p className="text-sm leading-6 text-ink-muted">
            Heita is a mobile-first loyalty, messaging, and AI co-worker platform operated
            by Heita (Pty) Ltd, a company incorporated in the Republic of South Africa
            (&quot;Heita&quot;, &quot;we&quot;, &quot;our&quot;, &quot;us&quot;). The platform enables South African
            retailers and small businesses (&quot;Businesses&quot;) to run loyalty programmes and
            communicate with their customers (&quot;Members&quot;).
          </p>
          <p className="text-sm leading-6 text-ink-muted">
            By accessing or using Heita you agree to be bound by these Terms of Service
            (&quot;Terms&quot;) and our{" "}
            <Link href="/privacy" className="text-primary-action underline">
              Privacy Policy
            </Link>
            . If you do not agree, do not use the platform.
          </p>
        </Card>

        {/* 2. Eligibility */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">2. User eligibility</h2>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>You must be at least 18 years of age to create a Heita account.</li>
            <li>
              The platform is primarily designed for South African residents. You must
              have a valid South African mobile phone number to register.
            </li>
            <li>
              By registering, you confirm that all information you provide is accurate
              and that you are legally capable of entering into binding agreements.
            </li>
          </ul>
        </Card>

        {/* 3. Account registration */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">3. Account registration and security</h2>
          <p className="text-sm leading-6 text-ink-muted">
            Your account is personal to you. You are responsible for:
          </p>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              Keeping your phone number and any linked email address up to date and under
              your exclusive control.
            </li>
            <li>
              Not sharing one-time passwords (OTPs) with any third party. OTPs are
              single-use and expire within 10 minutes.
            </li>
            <li>
              Immediately notifying us at{" "}
              <a href="mailto:legal@heita.co.za" className="text-primary-action underline">
                legal@heita.co.za
              </a>{" "}
              if you believe your account has been accessed without your authorisation.
            </li>
          </ul>
          <p className="text-sm leading-6 text-ink-muted">
            We reserve the right to suspend or terminate your account if we detect
            suspicious activity or a breach of these Terms.
          </p>
        </Card>

        {/* 4. Loyalty programme */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">4. Loyalty programme terms</h2>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              <strong>No cash value</strong> — loyalty points have no monetary value and
              cannot be exchanged for cash, transferred to another person, or redeemed
              outside the specific Business that issued them.
            </li>
            <li>
              <strong>Expiry</strong> — points may expire if your account is inactive for
              a period set by the Business (typically 12 months). Each Business may set
              its own expiry rules.
            </li>
            <li>
              <strong>Programme modifications</strong> — a Business may modify, suspend,
              or terminate its loyalty programme at any time, subject to reasonable notice
              to affected Members. Heita is not liable for changes made by individual
              Businesses.
            </li>
            <li>
              <strong>Rewards</strong> — rewards advertised by a Business are subject to
              availability and may be withdrawn or amended by that Business at any time.
            </li>
            <li>
              <strong>Referral codes</strong> — referral bonuses are credited at the
              discretion of the Business and are subject to their individual programme
              rules.
            </li>
          </ul>
        </Card>

        {/* 5. Acceptable use */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">5. Acceptable use</h2>
          <p className="text-sm leading-6 text-ink-muted">You must not:</p>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              Use Heita for any fraudulent purpose, including creating multiple accounts
              to abuse referral or loyalty promotions.
            </li>
            <li>
              Use automated scripts, bots, or any non-human means to interact with the
              platform.
            </li>
            <li>
              Attempt to reverse-engineer, decompile, or extract the source code of the
              Heita platform or its AI models.
            </li>
            <li>
              Transmit any content that is unlawful, defamatory, obscene, or that
              infringes the intellectual property rights of any person.
            </li>
            <li>
              Interfere with or disrupt the security or integrity of the platform or its
              underlying infrastructure.
            </li>
            <li>
              Impersonate any person or entity, or misrepresent your affiliation with a
              Business.
            </li>
          </ul>
          <p className="text-sm leading-6 text-ink-muted">
            Violation of these rules may result in immediate account suspension or
            termination and may be referred to law enforcement authorities.
          </p>
        </Card>

        {/* 6. Data processing */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">6. Data processing and consent</h2>
          <p className="text-sm leading-6 text-ink-muted">
            By creating an account and accepting these Terms, you acknowledge that you
            have read our{" "}
            <Link href="/privacy" className="text-primary-action underline">
              Privacy Policy
            </Link>{" "}
            and consent to the collection and processing of your personal information as
            described therein. Your consent to receive marketing communications from
            Businesses is obtained separately at the point of joining each programme and
            may be revoked at any time from your{" "}
            <Link href="/profile/consents" className="text-primary-action underline">
              Consents page
            </Link>
            .
          </p>
        </Card>

        {/* 7. Intellectual property */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">7. Intellectual property</h2>
          <p className="text-sm leading-6 text-ink-muted">
            The Heita platform, including its design, code, trademarks, and content
            created by us, is the exclusive property of Heita (Pty) Ltd and is protected
            by applicable intellectual property laws. Nothing in these Terms grants you
            any right to use our trademarks or other intellectual property without our
            prior written consent.
          </p>
          <p className="text-sm leading-6 text-ink-muted">
            Content submitted by you (such as profile information) remains your property.
            By submitting content you grant us a non-exclusive, royalty-free licence to
            use it for the purposes of providing the service.
          </p>
        </Card>

        {/* 8. Limitation of liability */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">8. Limitation of liability</h2>
          <p className="text-sm leading-6 text-ink-muted">
            To the maximum extent permitted by applicable South African law, Heita (Pty)
            Ltd shall not be liable for:
          </p>
          <ul className="space-y-2 text-sm leading-6 text-ink-muted list-disc list-inside">
            <li>
              Any indirect, incidental, or consequential loss arising out of your use of
              or inability to use the platform.
            </li>
            <li>
              Loss or expiry of loyalty points due to actions of a Business, system
              outages beyond our reasonable control, or your own account inactivity.
            </li>
            <li>
              The accuracy or completeness of AI-generated responses, which are provided
              for informational purposes only and should not be relied upon as
              professional advice.
            </li>
            <li>
              Interruptions to the service caused by scheduled maintenance, force majeure
              events, or third-party infrastructure failures.
            </li>
          </ul>
          <p className="text-sm leading-6 text-ink-muted">
            Our total liability to you in respect of any claim arising out of or in
            connection with these Terms shall not exceed ZAR 500.
          </p>
        </Card>

        {/* 9. Governing law */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">9. Governing law and jurisdiction</h2>
          <p className="text-sm leading-6 text-ink-muted">
            These Terms are governed by and construed in accordance with the laws of the
            Republic of South Africa. Any dispute arising out of or in connection with
            these Terms shall be subject to the exclusive jurisdiction of the Western Cape
            High Court, Cape Town, South Africa, unless resolved through our dispute
            resolution process described below.
          </p>
          <p className="text-sm leading-6 text-ink-muted">
            We encourage you to contact us at{" "}
            <a href="mailto:legal@heita.co.za" className="text-primary-action underline">
              legal@heita.co.za
            </a>{" "}
            to resolve disputes informally in the first instance.
          </p>
        </Card>

        {/* 10. Contact */}
        <Card variant="surface" className="space-y-3">
          <h2 className="section-title">10. Contact us</h2>
          <p className="text-sm leading-6 text-ink-muted">
            For any questions about these Terms, contact our legal team at{" "}
            <a href="mailto:legal@heita.co.za" className="text-primary-action underline">
              legal@heita.co.za
            </a>
            .
          </p>
        </Card>
      </div>
    </main>
  );
}
