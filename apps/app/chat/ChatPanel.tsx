import type {
  AsyncStatus,
  ConversationMessage,
  ConversationSummary,
} from "@/src/types/chat";

import ChatComposerPlaceholder from "./ChatComposerPlaceholder";

type ChatPanelProps = {
  activeConversation: ConversationSummary | null;
  activeMessages: ConversationMessage[];
  activeMessagesStatus: AsyncStatus;
  activeMessagesError: string | null;
  composerPlaceholderText: string;
};

export default function ChatPanel({
  activeConversation,
  activeMessages,
  activeMessagesStatus,
  activeMessagesError,
  composerPlaceholderText,
}: ChatPanelProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Assistant</h1>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-300">
            Chat Preview
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {!activeConversation ? (
          <section className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Start a new conversation
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Select a conversation from the left sidebar, or create a new one in the next iteration.
            </p>
          </section>
        ) : null}

        {activeConversation && activeMessagesStatus === "loading" ? (
          <section className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              {activeConversation.title}
            </h2>
            <p className="mt-3 text-sm text-slate-400">Loading messages...</p>
          </section>
        ) : null}

        {activeConversation && activeMessagesError ? (
          <section className="mx-auto max-w-4xl rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-red-200">
              Could not load conversation
            </h2>
            <p className="mt-3 text-sm text-red-100">{activeMessagesError}</p>
          </section>
        ) : null}

        {activeConversation &&
        !activeMessagesError &&
        activeMessagesStatus !== "loading" &&
        activeMessages.length === 0 ? (
          <section className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              {activeConversation.title}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              No messages yet in this conversation.
            </p>
          </section>
        ) : null}

        {activeConversation &&
        !activeMessagesError &&
        activeMessagesStatus !== "loading" &&
        activeMessages.length > 0 ? (
          <section className="mx-auto max-w-4xl space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              {activeConversation.title}
            </h2>

            {activeMessages.map((message) => {
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
                    <p className="mb-1 text-[11px] uppercase tracking-wide opacity-70">
                      {message.role}
                    </p>
                    <p>{message.text}</p>
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}
      </div>

      <ChatComposerPlaceholder
        placeholderText={composerPlaceholderText}
        hasActiveConversation={Boolean(activeConversation)}
      />
    </section>
  );
}
