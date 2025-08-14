import { Message } from '@/utils/api/chat-client';
import { TimelineBuilder } from '@/utils/services/TimelineBuilder';
import ChatMessage, { ChatMessageProps } from './ChatMessage';
import UserAvatar from './UserAvatar';
import CleraAvatar from './CleraAvatar';
import { PerMessageToolDetails } from './PerMessageToolDetails';

interface ChatMessageListProps {
  messages: Message[];
  toolActivities: any[];
  currentUserId: string;
  isProcessing: boolean;
  isMobile: boolean;
  isFullscreen: boolean;
  isSidebarMode?: boolean;
  timelineBuilder: TimelineBuilder;
  onMessageRetry?: (messageIndex: number) => void;
}

/**
 * Component responsible for rendering the list of chat messages and their associated tool timelines.
 * Extracted from Chat.tsx to follow Single Responsibility Principle.
 * Preserves the exact original logic for proper timeline placement.
 */
export function ChatMessageList({
  messages,
  toolActivities,
  currentUserId,
  isProcessing,
  isMobile,
  isFullscreen,
  isSidebarMode,
  timelineBuilder,
  onMessageRetry,
}: ChatMessageListProps) {
  // Restore original logic exactly as it was - ensure tool activity list appears below the blue status bubble and above the final assistant response
  const msgs = messages;
  const lastIndex = msgs.length - 1;
  const lastMsg = msgs[lastIndex];
  const isFinalAssistant = lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStatus;
  const preFinal = isFinalAssistant ? msgs.slice(0, lastIndex) : msgs;
  const finalOnly = isFinalAssistant ? [lastMsg] : [];

  const renderedRunIds = new Set<string>();
  
  return (
    <>
      {preFinal.map((msg: Message, index: number) => {
        // Get runId from the message itself (status messages and assistant responses now both have runIds)
        // Fall back to finding the previous user message if needed
        const prevUserRunId = (msg as any).runId || 
          [...preFinal.slice(0, index)].reverse().find(m => m.role === 'user' && (m as any).runId)?.['runId' as keyof Message] as any;
        const detailsBlock = (placeAfter: boolean) => (
          prevUserRunId && !renderedRunIds.has(prevUserRunId as string) && (toolActivities as any[]).some(a => a.runId === prevUserRunId)
            ? (
              <PerMessageToolDetails
                runId={prevUserRunId as any}
                activities={toolActivities as any}
                isMobile={isMobile}
                isFullscreen={isFullscreen}
                isSidebarMode={isSidebarMode}
                timelineBuilder={timelineBuilder}
              />
            )
            : null
        );

        // For assistant final messages (non-status) that already exist in preFinal, render details just above them
        if (msg.role === 'assistant' && !(msg as any).isStatus) {
          const details = detailsBlock(false);
          if (details && prevUserRunId) {
            renderedRunIds.add(prevUserRunId as string);
          }
          return (
            <div key={msg.id || `msg-${index}`}>
              {details}
              <ChatMessage
                message={msg}
                isLast={index === preFinal.length - 1}
                isMobileMode={isMobile && isFullscreen}
                isSidebarMode={isSidebarMode}
              />
            </div>
          );
        }

        // For status messages, render details below the blue bubble while the run is in progress
        if ((msg as any).isStatus) {
          const details = detailsBlock(true);
          if (details && prevUserRunId) {
            renderedRunIds.add(prevUserRunId as string);
          }
          return (
            <div key={msg.id || `msg-${index}`}>
              <ChatMessage
                message={msg}
                isLast={index === preFinal.length - 1}
                isMobileMode={isMobile && isFullscreen}
                isSidebarMode={isSidebarMode}
              />
              {details}
            </div>
          );
        }

        // Default: render plain message
        return (
          <ChatMessage
            key={msg.id || `msg-${index}`}
            message={msg}
            isLast={index === preFinal.length - 1}
            isMobileMode={isMobile && isFullscreen}
            isSidebarMode={isSidebarMode}
          />
        );
      })}

      {finalOnly.map((msg: Message, index: number) => (
        (() => {
          const runId = (msg as any).runId || [...preFinal].reverse().find(m => m.role === 'user' && (m as any).runId)?.['runId' as keyof Message];
          const shouldRenderDetails = runId && !renderedRunIds.has(runId as string) && (toolActivities as any[]).some(a => a.runId === runId);
          if (shouldRenderDetails) renderedRunIds.add(runId as string);
          return (
            <div key={msg.id || `final-${index}`}> 
              {shouldRenderDetails && (
                <PerMessageToolDetails
                  runId={runId as any}
                  activities={toolActivities as any}
                  isMobile={isMobile}
                  isFullscreen={isFullscreen}
                  isSidebarMode={isSidebarMode}
                  timelineBuilder={timelineBuilder}
                />
              )}
              <ChatMessage
                message={msg}
                isLast={true}
                isMobileMode={isMobile && isFullscreen}
                isSidebarMode={isSidebarMode}
              />
            </div>
          );
        })()
      ))}
    </>
  );
}
