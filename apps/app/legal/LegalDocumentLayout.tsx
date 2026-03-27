import type { ReactNode } from "react";
import Link from "next/link";

type LegalDocumentLayoutProps = {
  title: string;
  summary: string;
  effectiveDate: string;
  children: ReactNode;
};

type LegalSectionProps = {
  title: string;
  children: ReactNode;
};

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40">
      <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  );
}

export default function LegalDocumentLayout({
  title,
  summary,
  effectiveDate,
  children,
}: LegalDocumentLayoutProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-8 lg:px-10">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-cyan-300">
                VietCalenAI
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{summary}</p>
            </div>

            <nav className="flex flex-wrap gap-3 text-sm text-slate-300">
              <Link
                href="/auth/login"
                className="rounded-full border border-slate-700 px-4 py-2 transition hover:border-slate-600 hover:text-slate-100"
              >
                Sign in
              </Link>
              <Link
                href="/terms-and-policies"
                className="rounded-full border border-slate-700 px-4 py-2 transition hover:border-slate-600 hover:text-slate-100"
              >
                Terms
              </Link>
              <Link
                href="/privacy-notice"
                className="rounded-full border border-slate-700 px-4 py-2 transition hover:border-slate-600 hover:text-slate-100"
              >
                Privacy
              </Link>
            </nav>
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.2em] text-slate-500">
            Effective Date: {effectiveDate}
          </p>
        </header>

        <div className="mt-6 space-y-6">{children}</div>

        <footer className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-sm leading-7 text-slate-300">
          <p>
            Questions about these documents can be sent to{" "}
            <a
              href="mailto:tysonhoanglearning@gmail.com"
              className="font-medium text-cyan-300 transition hover:text-cyan-200"
            >
              tysonhoanglearning@gmail.com
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
