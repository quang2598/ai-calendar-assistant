import type {
  AsyncStatus,
  ConversationMessage,
  ConversationSummary,
} from "@/src/types/chat";

import ChatPanel from "./ChatPanel";
import ChatSidebar from "./ChatSidebar";

type ChatShellProps = {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeConversation: ConversationSummary | null;
  activeMessages: ConversationMessage[];
  activeMessagesStatus: AsyncStatus;
  activeMessagesError: string | null;
  composerPlaceholderText: string;
  conversationsStatus: AsyncStatus;
  conversationsError: string | null;
  userLabel: string;
  isSigningOut: boolean;
  onSelectConversation: (conversationId: string) => void;
  onSignOut: () => void;
};

export default function ChatShell({
  conversations,
  activeConversationId,
  activeConversation,
  activeMessages,
  activeMessagesStatus,
  activeMessagesError,
  composerPlaceholderText,
  conversationsStatus,
  conversationsError,
  userLabel,
  isSigningOut,
  onSelectConversation,
  onSignOut,
}: ChatShellProps) {
  return (
    <main className="h-screen bg-slate-950 text-slate-100">
      <div className="flex h-full">
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          conversationsStatus={conversationsStatus}
          conversationsError={conversationsError}
          userLabel={userLabel}
          isSigningOut={isSigningOut}
          onSelectConversation={onSelectConversation}
          onSignOut={onSignOut}
        />
        <ChatPanel
          activeConversation={activeConversation}
          activeMessages={activeMessages}
          activeMessagesStatus={activeMessagesStatus}
          activeMessagesError={activeMessagesError}
          composerPlaceholderText={composerPlaceholderText}
        />
      </div>
    </main>
  );
}
