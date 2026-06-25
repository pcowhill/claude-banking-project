import { Link } from 'react-router-dom';
import { BRAND } from '@simbank/shared';
import { Button } from '../components/ui/Button';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { ImagePlaceholder } from '../components/ImagePlaceholder';
import { BackendStatusPill } from '../components/BackendStatusPill';

const products = [
  { title: 'Checking', description: 'Everyday spending with no surprise fees.', milestone: 'v0.4.0' },
  { title: 'Savings', description: 'Set goals and earn simulated interest.', milestone: 'v0.4.0' },
  { title: 'Credit cards', description: 'Build credit with transparent terms.', milestone: 'v0.8.0' },
  { title: 'Loans', description: 'Personal, auto, and mortgage-style loans.', milestone: 'v0.9.0' },
  { title: 'Certificates of Deposit', description: 'Lock in a rate for a fixed term.', milestone: 'v0.9.0' },
  { title: 'External accounts', description: 'Link outside accounts for transfers.', milestone: 'v0.7.0' },
];

export function MarketingHome() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-mist to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center rounded-full bg-brand-teal/10 px-3 py-1 text-xs font-semibold text-brand-teal-dark">
              {BRAND.tagline}
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-brand-navy sm:text-5xl">
              Modern banking that keeps you on course.
            </h1>
            <p className="mt-4 max-w-md text-lg text-slate-600">
              Checking, savings, cards, and loans in one calm, secure place. Meridian is a
              realistic <strong>simulated</strong> bank built to explore great banking UX — without
              any real money.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login">
                <Button size="lg">Open a (simulated) account</Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="ghost">
                  Log in
                </Button>
              </Link>
            </div>
            <div className="mt-6">
              <BackendStatusPill />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl shadow-lg">
            <ImagePlaceholder
              src="/images/hero-family.jpg"
              alt="A family enjoying everyday banking"
              label="Hero image"
              className="aspect-[16/10] w-full"
            />
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-bold text-brand-navy">Everything you expect from a bank</h2>
        <p className="mt-2 text-slate-600">
          The full product set is delivered across milestones. Each card notes when it arrives.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.title}>
              <div className="flex items-center justify-between">
                <CardTitle>{product.title}</CardTitle>
                <span className="rounded bg-brand-mist px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {product.milestone}
                </span>
              </div>
              <CardDescription>{product.description}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-brand-mist">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 md:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <ImagePlaceholder
              src="/images/feature-professional.jpg"
              alt="A professional banking on a laptop"
              label="Professional banking"
              className="aspect-[3/2] w-full"
            />
            <div className="p-6">
              <CardTitle>Bank from anywhere</CardTitle>
              <CardDescription>
                A responsive portal for desktop and mobile, with a clean dashboard and real-time
                updates.
              </CardDescription>
            </div>
          </Card>
          <Card className="overflow-hidden p-0">
            <ImagePlaceholder
              src="/images/feature-small-business.jpg"
              alt="A small business owner banking"
              label="Small business"
              className="aspect-[3/2] w-full"
            />
            <div className="p-6">
              <CardTitle>Built for real life</CardTitle>
              <CardDescription>
                Transfers, bill pay, deposits, disputes, and fraud protection — simulated end to
                end.
              </CardDescription>
            </div>
          </Card>
        </div>
      </section>

      {/* Security */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl shadow-lg">
          <ImagePlaceholder
            src="/images/security-protection.jpg"
            alt="Security and fraud protection"
            label="Security & fraud protection"
            className="aspect-[16/10] w-full"
          />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Security you can see</h2>
          <p className="mt-3 text-slate-600">
            Later milestones add real password hashing, multi-factor login, trusted devices, login
            history, and an explainable fraud-rules engine. A companion Operations console
            simulates the bank-side decisions behind the scenes.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>• Explainable fraud rules (no black-box AI)</li>
            <li>• Audit logs for every sensitive action</li>
            <li>• You only ever see your own accounts</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
