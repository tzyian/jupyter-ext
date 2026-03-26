import { IDisposable } from '@lumino/disposable';
import type { IChatController } from '../sidebar/chat/chatController';
import type { TelemetryService } from './telemetryService';
import { useChatStore } from '../sidebar/chat/useChatStore';

/**
 * Tracks chat interaction telemetry events.
 */
export class ChatTelemetryTracker implements IDisposable {
  private _disposed = false;
  private _unsubscribe: () => void;

  constructor(
    private readonly _controller: IChatController,
    private readonly _telemetry: TelemetryService
  ) {
    this._controller.messageSent.connect(this._onMessageSent, this);
    this._controller.chatCleared.connect(this._onChatCleared, this);

    // State-based subscriptions
    this._unsubscribe = useChatStore.subscribe((state, prevState) => {
      // Stream stopped
      if (prevState.isStreaming && !state.isStreaming) {
        this._onChatStopped();
      }

      // Metrics received (detected by cumulative token increase or duration update)
      const lastPrevThread = prevState.threads.find(
        t => t.id === prevState.activeThreadId
      );
      const lastCurrThread = state.threads.find(
        t => t.id === state.activeThreadId
      );

      if (lastCurrThread && lastPrevThread) {
        if (
          lastCurrThread.lastResponseDuration !==
          lastPrevThread.lastResponseDuration
        ) {
          this._telemetry.logEvent('ChatMetricsEvent', {
            tokensUsed: 0,
            tokensSent: 0,
            messagesSent: state.messages.length
          });
        }
      }

      // Thread created
      if (state.threads.length > prevState.threads.length) {
        const newThread = state.threads.find(
          t => !prevState.threads.some(pt => pt.id === t.id)
        );
        if (newThread) {
          this._onThreadCreated(newThread.id);
        }
      }

      // Thread deleted
      if (state.threads.length < prevState.threads.length) {
        const deletedThreadId = prevState.threads.find(
          pt => !state.threads.some(t => t.id === pt.id)
        )?.id;
        if (deletedThreadId) {
          this._onThreadDeleted(deletedThreadId);
        }
      }
    });
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    this._controller.messageSent.disconnect(this._onMessageSent, this);
    this._controller.chatCleared.disconnect(this._onChatCleared, this);
    this._unsubscribe();
  }

  private _onMessageSent = (
    _: IChatController,
    args: { isContextMenu: boolean }
  ): void => {
    this._telemetry.logEvent('ChatMessageSentEvent', {
      isContextMenu: args.isContextMenu
    });
  };

  private _onChatCleared = (): void => {
    this._telemetry.logEvent('ChatClearedEvent', {});
  };

  private _onChatStopped = (): void => {
    this._telemetry.logEvent('ChatStoppedEvent', {});
  };

  private _onThreadCreated = (threadId: string): void => {
    this._telemetry.logEvent('ChatThreadCreatedEvent', {
      threadId
    });
  };

  private _onThreadDeleted = (threadId: string): void => {
    this._telemetry.logEvent('ChatThreadDeletedEvent', {
      threadId
    });
  };
}
