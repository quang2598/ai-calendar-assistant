import type { AsyncStatus, ConversationSummary } from "@/src/types/chat";

type ChatSidebarProps = {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  conversationsStatus: AsyncStatus;
  conversationsError: string | null;
  userLabel: string;
  isSigningOut: boolean;
  onStartNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSignOut: () => void;
};

export default function ChatSidebar({
  conversations,
  activeConversationId,
  conversationsStatus,
  conversationsError,
  userLabel,
  isSigningOut,
  onStartNewConversation,
  onSelectConversation,
  onSignOut,
}: ChatSidebarProps) {
  return (
    <aside className="hidden w-80 flex-col border-r border-slate-800/90 bg-slate-900/80 p-4 lg:flex">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Conversations</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-100">Your chats</h2>
        <button
          type="button"
          onClick={onStartNewConversation}
          className="mt-4 w-full rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/20"
        >
          + New Chat
        </button>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
        {conversationsStatus === "loading" ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">
            Loading conversations...
          </p>
        ) : null}

        {conversationsError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {conversationsError}
          </p>
        ) : null}

        {conversationsStatus !== "loading" &&
        !conversationsError &&
        conversations.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">
            No conversations yet.
          </p>
        ) : null}

        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelectConversation(conversation.id)}
            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
              activeConversationId === conversation.id
                ? "border-cyan-400/50 bg-slate-800"
                : "border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/70"
            }`}
          >
            <p className="truncate text-sm font-medium text-slate-100">{conversation.title}</p>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
        <p className="truncate text-sm font-medium text-slate-100">{userLabel}</p>
        <button
          type="button"
          onClick={onSignOut}
          disabled={isSigningOut}
          className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigningOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
