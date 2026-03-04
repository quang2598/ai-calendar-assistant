type ChatPlaceholderProps = {
  userLabel: string;
  onSignOut: () => void;
  isSigningOut: boolean;
};

export default function ChatPlaceholder({
  userLabel,
  onSignOut,
  isSigningOut,
}: ChatPlaceholderProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-slate-950/50">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Protected Chat</p>
        <h1 className="mt-4 text-3xl font-semibold">Hello World</h1>
        <p className="mt-3 text-sm text-slate-400">Signed in as {userLabel}</p>

        <button
          type="button"
          onClick={onSignOut}
          disabled={isSigningOut}
          className="mt-6 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigningOut ? "Signing out..." : "Sign out"}
        </button>
      </section>
    </main>
  );
}
