"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "./lib/auth";

const conversations = [
  { id: 1, title: "Weekly planning", preview: "Set goals for this week", time: "10:24" },
  { id: 2, title: "Project roadmap", preview: "Q2 milestones and blockers", time: "Yesterday" },
  { id: 3, title: "Team sync notes", preview: "Follow-up action items", time: "Fri" },
];

const suggestionChips = [
  "Draft my weekly schedule",
  "Summarize pending tasks",
  "Plan a productive Monday",
  "Create a meeting prep checklist",
];

const sampleMessages = [
  {
    id: 1,
    role: "user",
    content: "Help me build a focused schedule for tomorrow with deep work blocks.",
  },
  {
    id: 2,
    role: "assistant",
    content:
      "Start with your top priority from 9:00-11:00 AM, reserve 1:00-2:00 PM for follow-ups, and leave a 30-minute review block at 5:00 PM.",
  },
] as const;

export default function HomePage() {
  const router = useRouter();
  const { user, loading, signOutUser } = useAuth();
  const [composerValue, setComposerValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, router, user]);

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await signOutUser();
      router.replace("/signin");
    } finally {
      setIsSigningOut(false);
    }
  }

  function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!composerValue.trim()) {
      return;
    }

    setComposerValue("");
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <main className="h-screen bg-slate-950 text-slate-100">
      <div className="flex h-full">
        <aside className="hidden w-80 flex-col border-r border-slate-800/80 bg-slate-900/80 p-4 lg:flex">
          <button className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
            New Chat
          </button>

          <div className="mt-5 space-y-2 overflow-y-auto">
            {conversations.map((chat) => (
              <button
                key={chat.id}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-left transition hover:border-slate-700 hover:bg-slate-800/70"
              >
                <p className="truncate text-sm font-medium text-slate-100">{chat.title}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{chat.preview}</p>
                <p className="mt-2 text-xs text-slate-500">{chat.time}</p>
              </button>
            ))}
          </div>

          <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900 p-3">
            <p className="truncate text-sm font-medium">{user.email ?? "Signed-in user"}</p>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">Assistant</h1>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-300">
                GPT-4.1
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Microphone"
                className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-slate-600"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
                  <path d="M6 11.5a6 6 0 0 0 12 0" />
                  <path d="M12 17.5V21" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Settings"
                className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-slate-600"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
                  <path d="m19.4 15 .78 1.36-1.6 2.77-1.56-.34a7.97 7.97 0 0 1-1.48.85l-.48 1.53H11.9l-.48-1.53a7.97 7.97 0 0 1-1.48-.85l-1.56.34-1.6-2.77L7.56 15a8.49 8.49 0 0 1 0-1.99l-.78-1.37 1.6-2.77 1.56.35c.46-.34.96-.62 1.48-.85l.48-1.53h3.16l.48 1.53c.52.23 1.02.51 1.48.85l1.56-.35 1.6 2.77-.78 1.37c.12.66.12 1.33 0 1.99Z" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Start with a suggestion
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {suggestionChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
                    onClick={() => setComposerValue(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              {sampleMessages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-relaxed sm:max-w-2xl ${
                        isUser
                          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                          : "border-slate-800 bg-slate-900 text-slate-200"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>

          <div className="border-t border-slate-800 bg-slate-950/90 p-4 sm:p-5">
            <form onSubmit={handleComposerSubmit} className="mx-auto flex w-full max-w-4xl gap-2">
              <textarea
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                rows={2}
                placeholder="Type your message..."
                className="min-h-[60px] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
              />

              <button
                type="button"
                onClick={() => setIsListening((value) => !value)}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                  isListening
                    ? "border-cyan-300 bg-cyan-400/20 text-cyan-100"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600"
                }`}
              >
                {isListening ? "Listening..." : "Mic"}
              </button>

              <button
                type="submit"
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Send
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
