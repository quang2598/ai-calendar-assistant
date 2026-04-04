import type {
  AsyncStatus,
  ConversationMessage,
  ConversationSummary,
} from "@/src/types/chat";

import CalendarPanel from "./CalendarPanel";
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
  userDisplayName: string | null;
  userEmail: string | null;
  userPhotoURL: string | null;
  isConnectingCalendar: boolean;
  onConnectGoogleCalendar: () => void;
  calendarConnectionError: string | null;
  calendarConnectionSuccess: string | null;
  isSigningOut: boolean;
  onStartNewConversation: () => void;
  onComposerTextChange: (value: string) => void;
  onSendMessage: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSignOut: () => void;
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
  userDisplayName,
  userEmail,
  userPhotoURL,
  isConnectingCalendar,
  onConnectGoogleCalendar,
  calendarConnectionError,
  calendarConnectionSuccess,
  isSigningOut,
  onStartNewConversation,
  onComposerTextChange,
  onSendMessage,
  onSelectConversation,
  onSignOut,
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
}: ChatShellProps) {
  return (
    <main className="h-screen bg-slate-950 text-slate-100">
      <div className="flex h-full">
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          conversationsStatus={conversationsStatus}
          conversationsError={conversationsError}
          userDisplayName={userDisplayName}
          userEmail={userEmail}
          userPhotoURL={userPhotoURL}
          isConnectingCalendar={isConnectingCalendar}
          onConnectGoogleCalendar={onConnectGoogleCalendar}
          calendarConnectionError={calendarConnectionError}
          calendarConnectionSuccess={calendarConnectionSuccess}
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
          isListening={isListening}
          isVoiceSupported={isVoiceSupported}
          onMicToggle={onMicToggle}
          voiceError={voiceError}
          micVolume={micVolume}
          micFrequencies={micFrequencies}
          isSpeaking={isSpeaking}
          onStopSpeaking={onStopSpeaking}
          getVisibleText={getVisibleText}
          isRevealingMessage={isRevealingMessage}
        />
        <CalendarPanel />
      </div>
    </main>
  );
}
