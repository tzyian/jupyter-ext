import React, { useState, useRef, useEffect } from 'react';
import { MdMic, MdMicOff, MdSend, MdStop } from 'react-icons/md';
import type { IChatMessage } from '../../types';
import { Button } from './common/Button';
import { useAudioRecorder } from '../utils/useAudioRecorder';
import { transcribeAudio } from '../api';

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
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();

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
        window.alert(error && error.message ? error.message : String(error));
      } finally {
        setIsTranscribing(false);
      }
    } else {
      try {
        await startRecording();
      } catch (error) {
        console.error('Recording error:', error);
        window.alert(
          error && (error as any).message
            ? (error as any).message
            : String(error)
        );
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
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`jp-selenepy-chatMessage ${
              msg.role === 'user'
                ? 'jp-selenepy-chatMessage-user'
                : 'jp-selenepy-chatMessage-agent'
            }`}
          >
            <strong>{msg.role === 'user' ? 'You' : 'Agent'}:</strong>
            <div className="jp-selenepy-chatMessage-body">{msg.content}</div>
          </div>
        ))}
        {isStreaming && (
          <div className="jp-selenepy-chatStreaming-indicator">
            Agent is typing...
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
