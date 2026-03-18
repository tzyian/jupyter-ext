import React, { useState, useRef, useEffect } from 'react';
import { MdMic, MdMicOff, MdSend, MdStop } from 'react-icons/md';
import { showDialog } from '@jupyterlab/apputils';
import type { IChatMessage } from '../../types';
import { Button } from './common/Button';
import { useAudioRecorder } from '../utils/useAudioRecorder';
import { transcribeAudio } from '../api';

function formatMessageTime(timestamp?: number): string {
  if (timestamp === undefined || Number.isNaN(timestamp)) {
    return '--';
  }

  const asMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(asMs).toLocaleTimeString();
}

interface ICellContext {
  cellNumber: number;
  excerpt?: string;
}

interface IChatPanelProps {
  messages: IChatMessage[];
  isStreaming: boolean;
  onSendMessage: (message: string) => void;
  onClear: () => void;
  onStop: () => void;
  hasApiKey: boolean;
  openaiApiKey?: string;
  snippets?: { id: string; name: string; content: string }[];
  cellContext?: ICellContext | null;
}

export function ChatPanel({
  messages,
  isStreaming,
  onSendMessage,
  onClear,
  onStop,
  hasApiKey,
  openaiApiKey,
  snippets,
  cellContext
}: IChatPanelProps): JSX.Element {
  const [input, setInput] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [responseElapsedTime, setResponseElapsedTime] = useState<number>(0);
  const [lastResponseDuration, setLastResponseDuration] = useState<
    number | null
  >(null);
  const [recordingElapsedTime, setRecordingElapsedTime] = useState<number>(0);
  const [lastRecordingDuration, setLastRecordingDuration] = useState<
    number | null
  >(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();

  useEffect(() => {
    let interval: number | null = null;
    if (isStreaming) {
      const startTime = Date.now();
      setResponseElapsedTime(0);
      setLastResponseDuration(null);
      interval = window.setInterval(() => {
        setResponseElapsedTime(Date.now() - startTime);
      }, 100);
    } else {
      if (responseElapsedTime > 0) {
        setLastResponseDuration(responseElapsedTime);
        setResponseElapsedTime(0);
      }
    }
    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, [isStreaming]);

  useEffect(() => {
    let interval: number | null = null;
    if (isRecording) {
      const startTime = Date.now();
      setRecordingElapsedTime(0);
      setLastRecordingDuration(null);
      interval = window.setInterval(() => {
        setRecordingElapsedTime(Date.now() - startTime);
      }, 100);
    } else {
      if (recordingElapsedTime > 0) {
        setLastRecordingDuration(recordingElapsedTime);
        setRecordingElapsedTime(0);
      }
    }

    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, [isRecording]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = () => {
    if (isStreaming) {
      onStop();
      return;
    }

    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      setIsTranscribing(true);
      try {
        const audioBlob = await stopRecording();
        if (audioBlob) {
          const transcribedText = await transcribeAudio(
            audioBlob,
            openaiApiKey
          );
          setInput(prev =>
            prev ? `${prev} ${transcribedText}` : transcribedText
          );
        }
      } catch (error: any) {
        console.error('Transcription error:', error);
        void showDialog({
          title: 'Transcription Error',
          body: error && error.message ? error.message : String(error)
        });
      } finally {
        setIsTranscribing(false);
      }
    } else {
      try {
        await startRecording();
      } catch (error) {
        console.error('Recording error:', error);
        void showDialog({
          title: 'Recording Error',
          body:
            error && (error as any).message
              ? (error as any).message
              : String(error)
        });
      }
    }
  };

  return (
    <div className="jp-selenepy-chatPanel">
      <div className="jp-selenepy-chatHeader">
        <h3>SeleneJs Chat</h3>
        <div className="jp-selenepy-buttonGroup">
          {isStreaming && (
            <button
              className="jp-selenepy-action-button js-primary-chat"
              onClick={onStop}
            >
              Stop
            </button>
          )}
          <button
            className="jp-selenepy-action-button"
            onClick={onClear}
            disabled={isStreaming}
          >
            Clear
          </button>
        </div>
      </div>

      {!hasApiKey && (
        <div className="jp-selenepy-warning-box">
          <strong>Missing API Key:</strong> Please set your OpenAI API Key in
          the JupyterLab Advanced Settings under 'selenejs' to chat.
        </div>
      )}

      <div className="jp-selenepy-chatMessages">
        {messages.length === 0 && (
          <div className="jp-selenepy-chatEmpty">Ask me anything!</div>
        )}
        <div className="jp-selenepy-chatTimers-row">
          <span className="jp-selenepy-chatTimer-pill">
            Streaming:{' '}
            {isStreaming ? `${(responseElapsedTime / 1000).toFixed(1)}s` : 'Idle'}
          </span>
          <span className="jp-selenepy-chatTimer-pill">
            Response:{' '}
            {lastResponseDuration !== null
              ? `${(lastResponseDuration / 1000).toFixed(1)}s`
              : '--'}
          </span>
          <span className="jp-selenepy-chatTimer-pill">
            Audio:{' '}
            {isRecording
              ? `${(recordingElapsedTime / 1000).toFixed(1)}s`
              : lastRecordingDuration !== null
                ? `${(lastRecordingDuration / 1000).toFixed(1)}s`
                : '--'}
          </span>
        </div>
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`jp-selenepy-chatMessage ${
              msg.role === 'user'
                ? 'jp-selenepy-chatMessage-user'
                : 'jp-selenepy-chatMessage-agent'
            }`}
          >
            <div className="jp-selenepy-chatMessage-meta">
              <strong>{msg.role === 'user' ? 'You' : 'Agent'}:</strong>
              <span className="jp-selenepy-chatMessage-time">
                Sent {formatMessageTime(msg.timestamp)}
              </span>
            </div>
            <div className="jp-selenepy-chatMessage-body">{msg.content}</div>
          </div>
        ))}
        {isStreaming && (
          <div className="jp-selenepy-chatStreaming-indicator">
            Agent is typing...{' '}
            <span className="jp-selenepy-chatTimer">
              ({(responseElapsedTime / 1000).toFixed(1)}s)
            </span>
          </div>
        )}
        {!isStreaming && lastResponseDuration !== null && (
          <div className="jp-selenepy-chatDuration-info">
            Response took {(lastResponseDuration / 1000).toFixed(1)}s
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="jp-selenepy-chatFooter">
        {cellContext && (
          <div
            className="jp-selenepy-chatContext-box"
            title={
              cellContext.excerpt
                ? `Cell ${cellContext.cellNumber}: ${cellContext.excerpt}`
                : `Cell ${cellContext.cellNumber}`
            }
          >
            📍{' '}
            {cellContext.excerpt
              ? `Cell ${cellContext.cellNumber}: "${cellContext.excerpt}"`
              : `Cell ${cellContext.cellNumber}`}
          </div>
        )}
        <div className="jp-selenepy-chatInput-container">
          {snippets && snippets.length > 0 && (
            <div className="jp-selenepy-chatSnippets-row">
              {snippets.map(s => (
                <Button
                  key={s.id}
                  variant="ghost"
                  onClick={() =>
                    setInput(prev =>
                      prev ? `${prev}\n${s.content}` : s.content
                    )
                  }
                  className="jp-selenepy-chat-snippet-btn"
                  title={`Snippet: ${s.name}\n\n${s.content}`}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          )}
          <div className="jp-selenepy-chatInput-row">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="jp-selenepy-chatTextarea"
            />
            <div className="jp-selenepy-chatInput-buttons">
              {isRecording && (
                <div className="jp-selenepy-chatRecording-info">
                  Recording {(recordingElapsedTime / 1000).toFixed(1)}s
                </div>
              )}
              {!isRecording && lastRecordingDuration !== null && (
                <div className="jp-selenepy-chatRecording-info">
                  Recorded {(lastRecordingDuration / 1000).toFixed(1)}s
                </div>
              )}
              <button
                onClick={handleMicClick}
                disabled={!hasApiKey || isStreaming || isTranscribing}
                title={isRecording ? 'Stop recording' : 'Start recording'}
                className={`jp-selenepy-chatMic-btn ${
                  isRecording ? 'is-recording' : ''
                }`}
              >
                {isRecording ? <MdMicOff /> : <MdMic />}
              </button>
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={!input.trim() && !isStreaming}
                className="jp-selenepy-chatSend-btn"
                title={isStreaming ? 'Stop' : 'Send'}
              >
                {isStreaming ? <MdStop /> : <MdSend />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
