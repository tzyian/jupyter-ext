import { IDisposable } from '@lumino/disposable';
import type { ChatSidebar } from '../sidebar/chat/components/ChatSidebar';
import type { TelemetryService } from './telemetryService';

/**
 * Tracks chat interaction telemetry events.
 */
export class ChatTelemetryTracker implements IDisposable {
  private _disposed = false;

  constructor(
    private readonly _sidebar: ChatSidebar,
    private readonly _telemetry: TelemetryService
  ) {
    this._sidebar.messageSent.connect(this._onMessageSent, this);
    this._sidebar.metricsReceived.connect(this._onMetricsReceived, this);
    this._sidebar.chatCleared.connect(this._onChatCleared, this);
    this._sidebar.chatStopped.connect(this._onChatStopped, this);
    this._sidebar.threadCreated.connect(this._onThreadCreated, this);
    this._sidebar.threadDeleted.connect(this._onThreadDeleted, this);
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    this._sidebar.messageSent.disconnect(this._onMessageSent, this);
    this._sidebar.metricsReceived.disconnect(this._onMetricsReceived, this);
    this._sidebar.chatCleared.disconnect(this._onChatCleared, this);
    this._sidebar.chatStopped.disconnect(this._onChatStopped, this);
    this._sidebar.threadCreated.disconnect(this._onThreadCreated, this);
    this._sidebar.threadDeleted.disconnect(this._onThreadDeleted, this);
  }

  private _onMessageSent = (
    _: ChatSidebar,
    args: { isContextMenu: boolean }
  ): void => {
    this._telemetry.logEvent('ChatMessageSentEvent', {
      isContextMenu: args.isContextMenu
    });
  };

  private _onMetricsReceived = (
    _: ChatSidebar,
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
    _: ChatSidebar,
    args: { threadId: string }
  ): void => {
    this._telemetry.logEvent('ChatThreadCreatedEvent', {
      threadId: args.threadId
    });
  };

  private _onThreadDeleted = (
    _: ChatSidebar,
    args: { threadId: string }
  ): void => {
    this._telemetry.logEvent('ChatThreadDeletedEvent', {
      threadId: args.threadId
    });
  };
}
