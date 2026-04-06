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
    this._controller.threadCreated.connect(this._onThreadCreated, this);
    this._controller.threadDeleted.connect(this._onThreadDeleted, this);

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
            messagesSent: state.messages.length,
            duration: lastCurrThread.lastResponseDuration
          });
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
    this._controller.threadCreated.disconnect(this._onThreadCreated, this);
    this._controller.threadDeleted.disconnect(this._onThreadDeleted, this);
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

  private _onChatStopped = (): void => {
    this._telemetry.logEvent('ChatStoppedEvent', {});
  };

  private _onThreadCreated = (_: any, args: { threadId: string }): void => {
    this._telemetry.logEvent('ChatThreadCreatedEvent', {
      threadId: args.threadId
    });
  };

  private _onThreadDeleted = (_: any, args: { threadId: string }): void => {
    this._telemetry.logEvent('ChatThreadDeletedEvent', {
      threadId: args.threadId
    });
  };
}
