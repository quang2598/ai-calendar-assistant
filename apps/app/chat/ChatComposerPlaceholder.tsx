type ChatComposerPlaceholderProps = {
  placeholderText: string;
  hasActiveConversation: boolean;
};

export default function ChatComposerPlaceholder({
  placeholderText,
  hasActiveConversation,
}: ChatComposerPlaceholderProps) {
  return (
    <div className="border-t border-slate-800 bg-slate-950/90 p-4 sm:p-5">
      <div className="mx-auto w-full max-w-4xl space-y-2">
        <div className="flex items-center gap-2">
          <textarea
            rows={2}
            disabled
            placeholder={placeholderText}
            className="min-h-[60px] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300 outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            disabled
            className="rounded-2xl bg-slate-700 px-5 py-3 text-sm font-semibold text-slate-300"
          >
            Send
          </button>
        </div>

        <p className="text-xs text-slate-500">
          {hasActiveConversation
            ? "Message sending is disabled for now. Next step will connect this composer to Firestore writes."
            : "Select a conversation to prepare the composer context."}
        </p>
      </div>
    </div>
  );
}
