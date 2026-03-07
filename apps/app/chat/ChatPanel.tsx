import type {
  AsyncStatus,
  ConversationMessage,
  ConversationSummary,
} from "@/src/types/chat";

import ChatComposer from "./ChatComposer";

type ChatPanelProps = {
  activeConversation: ConversationSummary | null;
  activeMessages: ConversationMessage[];
  activeMessagesStatus: AsyncStatus;
  activeMessagesError: string | null;
  composerText: string;
  sendingError: string | null;
  isSendingMessage: boolean;
  isAssistantTyping: boolean;
  onComposerTextChange: (value: string) => void;
  onSendMessage: () => void;
};

export default function ChatPanel({
  activeConversation,
  activeMessages,
  activeMessagesStatus,
  activeMessagesError,
  composerText,
  sendingError,
  isSendingMessage,
  isAssistantTyping,
  onComposerTextChange,
  onSendMessage,
}: ChatPanelProps) {
  const showMessageList =
    activeConversation &&
    !activeMessagesError &&
    activeMessagesStatus !== "loading" &&
    activeMessages.length > 0;
  const activeConversationTitle = activeConversation?.title ?? "Conversation";

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 items-center justify-between border-b border-slate-800/80 bg-slate-950/70 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">VietCalenAI</h1>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-300">
            Chat Preview
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {!activeConversation ? (
          <section className="mx-auto mt-10 max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100">VietCalenAI</h2>
            <p className="mt-2 text-sm text-slate-400">
              Hello There!
            </p>
            {isAssistantTyping ? (
              <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-300">
                <span>VietCalenAI is working on your request...</span>
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: "120ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                    style={{ animationDelay: "240ms" }}
                  />
                </span>
              </div>
            ) : null}
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

        {showMessageList ? (
          <section className="mx-auto max-w-4xl space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              {activeConversationTitle}
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

            {isAssistantTyping ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                  <p className="mb-1 text-[11px] uppercase tracking-wide opacity-70">system</p>
                  <div className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                      style={{ animationDelay: "120ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                      style={{ animationDelay: "240ms" }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <ChatComposer
        value={composerText}
        onChange={onComposerTextChange}
        onSend={onSendMessage}
        disabled={isSendingMessage}
        placeholder="Type your message..."
        helperText={
          activeConversation
            ? "Messages are sent to server and persisted to Firestore."
            : "Send a message to start a new conversation."
        }
        errorText={sendingError}
      />
    </section>
  );
}
