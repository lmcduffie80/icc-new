import type { Metadata } from 'next';
import Link from 'next/link';
import { getStoreInfo, formatAddress } from '@/lib/store-info';

export const metadata: Metadata = {
  title: 'Cookie Policy | Innovative Crop Care, LLC',
  description: 'Learn about the cookies we use on our website and how you can manage your preferences.',
};

export default async function CookiesPage() {
  const storeInfo = await getStoreInfo();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight">Cookie Policy</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Last Updated: August 13, 2026
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          {/* Introduction */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">What Are Cookies?</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cookies are small text files that are stored on your device when you visit a website. They help the website remember your preferences and understand how you interact with the site. Cookies are widely used to make websites work more efficiently and provide a better user experience.
            </p>
          </section>

          {/* How We Use Cookies */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">How We Use Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies for several purposes to enhance your experience on our website:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>To keep you signed in to your account</li>
              <li>To remember items in your shopping cart</li>
              <li>To remember your preferences (like theme settings)</li>
              <li>To understand how you use our website so we can improve it</li>
              <li>To deliver relevant marketing content</li>
            </ul>
          </section>

          {/* Types of Cookies */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b pb-2">Types of Cookies We Use</h2>

            {/* Essential Cookies */}
            <div className="rounded-lg border border-border p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Always Active
                </span>
                <h3 className="text-lg font-semibold">Essential Cookies</h3>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                These cookies are necessary for the website to function properly. They enable core functionality such as security, account authentication, and shopping cart management. You cannot opt out of these cookies.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium">Cookie Name</th>
                      <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                      <th className="text-left py-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">better-auth.session_token</td>
                      <td className="py-2 pr-4">Keeps you signed in to your account</td>
                      <td className="py-2">3 days</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">cart-storage</td>
                      <td className="py-2 pr-4">Remembers items in your shopping cart</td>
                      <td className="py-2">Persistent</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">theme</td>
                      <td className="py-2 pr-4">Stores your display preference (light/dark)</td>
                      <td className="py-2">Persistent</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">cookie-consent</td>
                      <td className="py-2 pr-4">Remembers your cookie preferences</td>
                      <td className="py-2">Persistent</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Analytics Cookies */}
            <div className="rounded-lg border border-border p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  Optional
                </span>
                <h3 className="text-lg font-semibold">Analytics Cookies</h3>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                These cookies help us understand how visitors interact with our website. We use this information to improve our site, content, and services. All data is aggregated and anonymous.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium">Cookie Name</th>
                      <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                      <th className="text-left py-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">_ga</td>
                      <td className="py-2 pr-4">Google Analytics - distinguishes unique users</td>
                      <td className="py-2">2 years</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">_ga_*</td>
                      <td className="py-2 pr-4">Google Analytics - maintains session state</td>
                      <td className="py-2">2 years</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">_gid</td>
                      <td className="py-2 pr-4">Google Analytics - distinguishes users</td>
                      <td className="py-2">24 hours</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Marketing Cookies */}
            <div className="rounded-lg border border-border p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  Optional
                </span>
                <h3 className="text-lg font-semibold">Marketing Cookies</h3>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                These cookies help us identify companies and prospects who visit our website so our team can follow up with relevant information. They load only after you accept cookies.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium">Cookie Name</th>
                      <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                      <th className="text-left py-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">Apollo visitor tracker</td>
                      <td className="py-2 pr-4">Identifies visiting companies and contacts for sales outreach</td>
                      <td className="py-2">Up to 12 months</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Managing Cookies */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">Managing Your Cookie Preferences</h2>
            <p className="text-muted-foreground leading-relaxed">
              Most web browsers allow you to control cookies through their settings. You can typically find these settings in the &ldquo;Options&rdquo; or &ldquo;Preferences&rdquo; menu of your browser. The following links provide information on how to manage cookies in popular browsers:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>
                <a
                  href="https://support.google.com/chrome/answer/95647"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Chrome
                </a>
              </li>
              <li>
                <a
                  href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Mozilla Firefox
                </a>
              </li>
              <li>
                <a
                  href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Safari
                </a>
              </li>
              <li>
                <a
                  href="https://support.microsoft.com/en-us/windows/delete-and-manage-cookies-168dab11-0753-043d-7c16-ede5947fc64d"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Microsoft Edge
                </a>
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Please note that disabling certain cookies may impact the functionality of our website. Essential cookies cannot be disabled as they are required for the site to work properly.
            </p>
          </section>

          {/* Updates */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">Updates to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Cookie Policy from time to time to reflect changes in our practices or for legal and regulatory reasons. We will post any changes on this page and update the &ldquo;Last Updated&rdquo; date at the top. We encourage you to review this policy periodically.
            </p>
          </section>

          {/* Related Links */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">Related Policies</h2>
            <p className="text-muted-foreground leading-relaxed">
              For more information about how we handle your data, please see our other policies:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                {' '}- How we collect, use, and protect your personal information
              </li>
              <li>
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>
                {' '}- Terms and conditions for using our website
              </li>
            </ul>
          </section>

          {/* Contact */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b pb-2">Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about our use of cookies or this Cookie Policy, please contact us:
            </p>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-6 mt-4">
              <p className="font-semibold">{storeInfo.store_name}</p>
              <p className="text-muted-foreground mt-2">Email: {storeInfo.support_email}</p>
              <p className="text-muted-foreground">Phone: {storeInfo.phone}</p>
              <p className="text-muted-foreground">Mail: {formatAddress(storeInfo)}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
