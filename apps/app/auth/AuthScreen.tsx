import Link from "next/link";

type AuthScreenProps = {
  badgeText: string;
  heroTitle: string;
  heroDescription: string;
  cardTitle: string;
  cardDescription: string;
  actionLabel: string;
  actionLoadingLabel: string;
  footerPrompt: string;
  footerLinkLabel: string;
  footerHref: string;
  onAction: () => void;
  actionDisabled?: boolean;
  showActionLoading?: boolean;
  errorMessage?: string;
};

export default function AuthScreen({
  badgeText,
  heroTitle,
  heroDescription,
  cardTitle,
  cardDescription,
  actionLabel,
  actionLoadingLabel,
  footerPrompt,
  footerLinkLabel,
  footerHref,
  onAction,
  actionDisabled = false,
  showActionLoading = false,
  errorMessage,
}: AuthScreenProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 p-6 md:grid-cols-2 md:gap-6 md:p-10">
        <section className="hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-10 md:flex md:flex-col md:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-cyan-300">
              {badgeText}
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight">{heroTitle}</h1>
            <p className="mt-4 max-w-md text-slate-400">{heroDescription}</p>
          </div>

          <p className="text-sm text-slate-500">Google authentication powered by Firebase.</p>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-slate-950/60 backdrop-blur">
            <h2 className="text-2xl font-semibold">{cardTitle}</h2>
            <p className="mt-2 text-sm text-slate-400">{cardDescription}</p>

            {errorMessage ? (
              <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {showActionLoading ? actionLoadingLabel : actionLabel}
            </button>

            <p className="mt-6 text-center text-sm text-slate-400">
              {footerPrompt}{" "}
              <Link
                href={footerHref}
                className="font-medium text-cyan-300 transition hover:text-cyan-200"
              >
                {footerLinkLabel}
              </Link>
            </p>

            <div className="mt-5 flex items-center justify-center gap-4 text-xs text-slate-500">
              <Link
                href="/terms-and-policies"
                className="transition hover:text-slate-300"
              >
                Terms and Policies
              </Link>
              <span aria-hidden="true">•</span>
              <Link
                href="/privacy-notice"
                className="transition hover:text-slate-300"
              >
                Privacy Notice
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
