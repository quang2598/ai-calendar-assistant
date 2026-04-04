import { useEffect, useRef } from "react";

import type {
  AsyncStatus,
  ConversationMessage,
  ConversationSummary,
} from "@/src/types/chat";

import { toggleCalendar } from "@/src/features/calendar/calendarSlice";
import { selectIsCalendarOpen } from "@/src/features/calendar/calendarSelectors";
import { useAppDispatch, useAppSelector } from "@/src/hooks";

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
  isListening?: boolean;
  isVoiceSupported?: boolean;
  onMicToggle?: () => void;
  voiceError?: string | null;
  micVolume?: number;
  micFrequencies?: number[];
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
  getVisibleText?: (messageId: string, fullText: string) => string;
  isRevealingMessage?: (messageId: string) => boolean;
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
  isListening,
  isVoiceSupported,
  onMicToggle,
  voiceError,
  micVolume,
  micFrequencies,
  isSpeaking,
  onStopSpeaking,
  getVisibleText,
  isRevealingMessage,
}: ChatPanelProps) {
  const dispatch = useAppDispatch();
  const isCalendarOpen = useAppSelector(selectIsCalendarOpen);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change, typing indicator, or text reveal updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });


  const showMessageList =
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
        <div className="flex items-center gap-2">
          {isSpeaking && onStopSpeaking && (
            <button
              type="button"
              onClick={onStopSpeaking}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300 transition hover:bg-cyan-400/20"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              Speaking... Click to stop
            </button>
          )}
          <button
            type="button"
            onClick={() => dispatch(toggleCalendar())}
            className={`rounded-md p-2 transition ${
              isCalendarOpen
                ? "bg-cyan-400/10 text-cyan-300"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
            aria-label={isCalendarOpen ? "Hide calendar" : "Show calendar"}
            title={isCalendarOpen ? "Hide calendar" : "Show calendar"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 pb-4 sm:px-6">
        {!activeConversation && activeMessages.length === 0 ? (
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
                    className={`max-w-[85%] rounded-2xl border px-4 py-3 text-base leading-relaxed sm:max-w-2xl ${
                      isUser
                        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                        : "border-slate-800 bg-slate-900 text-slate-200"
                    }`}
                  >
                    <p className="mb-1 text-[11px] uppercase tracking-wide opacity-70">
                      {message.role}
                    </p>
                    <p>
                      {!isUser && getVisibleText
                        ? getVisibleText(message.id, message.text)
                        : message.text}
                      {!isUser && isRevealingMessage?.(message.id) && (
                        <span
                          className="ml-px text-cyan-400"
                          style={{ animation: "blink-cursor 0.7s infinite" }}
                        >
                          ▊
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}

            {isAssistantTyping ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-300">
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

            {/* Spacer so last message isn't hidden behind composer */}
            <div className="h-4" />
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
        errorText={sendingError ?? voiceError ?? null}
        isListening={isListening}
        isVoiceSupported={isVoiceSupported}
        onMicToggle={onMicToggle}
        micVolume={micVolume}
        micFrequencies={micFrequencies}
      />
    </section>
  );
}
