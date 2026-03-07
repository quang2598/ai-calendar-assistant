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
  composerText: string;
  sendingError: string | null;
  isSendingMessage: boolean;
  isAssistantTyping: boolean;
  conversationsStatus: AsyncStatus;
  conversationsError: string | null;
  userLabel: string;
  isSigningOut: boolean;
  onStartNewConversation: () => void;
  onComposerTextChange: (value: string) => void;
  onSendMessage: () => void;
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
  composerText,
  sendingError,
  isSendingMessage,
  isAssistantTyping,
  conversationsStatus,
  conversationsError,
  userLabel,
  isSigningOut,
  onStartNewConversation,
  onComposerTextChange,
  onSendMessage,
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
          onStartNewConversation={onStartNewConversation}
          onSelectConversation={onSelectConversation}
          onSignOut={onSignOut}
        />
        <ChatPanel
          activeConversation={activeConversation}
          activeMessages={activeMessages}
          activeMessagesStatus={activeMessagesStatus}
          activeMessagesError={activeMessagesError}
          composerText={composerText}
          sendingError={sendingError}
          isSendingMessage={isSendingMessage}
          isAssistantTyping={isAssistantTyping}
          onComposerTextChange={onComposerTextChange}
          onSendMessage={onSendMessage}
        />
      </div>
    </main>
  );
}
