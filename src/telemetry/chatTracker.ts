import { IDisposable } from '@lumino/disposable';
import type { IChatController } from '../sidebar/chat/chatController';
import type { TelemetryService } from './telemetryService';

/**
 * Tracks chat interaction telemetry events.
 */
export class ChatTelemetryTracker implements IDisposable {
  private _disposed = false;

  constructor(
    private readonly _controller: IChatController,
    private readonly _telemetry: TelemetryService
  ) {
    this._controller.messageSent.connect(this._onMessageSent, this);
    this._controller.metricsReceived.connect(this._onMetricsReceived, this);
    this._controller.chatCleared.connect(this._onChatCleared, this);
    this._controller.chatStopped.connect(this._onChatStopped, this);
    this._controller.threadCreated.connect(this._onThreadCreated, this);
    this._controller.threadDeleted.connect(this._onThreadDeleted, this);
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
    this._controller.metricsReceived.disconnect(this._onMetricsReceived, this);
    this._controller.chatCleared.disconnect(this._onChatCleared, this);
    this._controller.chatStopped.disconnect(this._onChatStopped, this);
    this._controller.threadCreated.disconnect(this._onThreadCreated, this);
    this._controller.threadDeleted.disconnect(this._onThreadDeleted, this);
  }

  private _onMessageSent = (
    _: IChatController,
    args: { isContextMenu: boolean }
  ): void => {
    this._telemetry.logEvent('ChatMessageSentEvent', {
      isContextMenu: args.isContextMenu
    });
  };

  private _onMetricsReceived = (
    _: IChatController,
    args: { tokensUsed: number; tokensSent: number; messagesSent: number }
  ): void => {
    this._telemetry.logEvent('ChatMetricsEvent', args);
  };

  private _onChatCleared = (): void => {
    this._telemetry.logEvent('ChatClearedEvent', {});
  };

  private _onChatStopped = (): void => {
    this._telemetry.logEvent('ChatStoppedEvent', {});
  };

  private _onThreadCreated = (
    _: IChatController,
    args: { threadId: string }
  ): void => {
    this._telemetry.logEvent('ChatThreadCreatedEvent', {
      threadId: args.threadId
    });
  };

  private _onThreadDeleted = (
    _: IChatController,
    args: { threadId: string }
  ): void => {
    this._telemetry.logEvent('ChatThreadDeletedEvent', {
      threadId: args.threadId
    });
  };
}
