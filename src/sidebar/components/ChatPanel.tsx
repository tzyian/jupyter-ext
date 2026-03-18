import React, { useState, useRef, useEffect } from 'react';
import { MdMic, MdMicOff } from 'react-icons/md';
import type { IChatMessage } from '../../types';
import { Button } from './common/Button';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
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
  openaiApiKey: string;
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
    if (input.trim() && !isStreaming) {
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
    <div
      className="jp-selenepy-chatPanel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '8px'
      }}
    >
      <div className="jp-selenepy-chatHeader">
        <h3 style={{ margin: 0, fontSize: 'var(--js-header-font-size)' }}>
          SeleneJs Chat
        </h3>
        <div style={{ display: 'flex', gap: '6px' }}>
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

      <div
        className="jp-selenepy-chatMessages"
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          marginBottom: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--jp-ui-font-color2)',
              marginTop: '20px'
            }}
          >
            Ask me anything!
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              padding: '8px',
              borderRadius: '4px',
              backgroundColor:
                msg.role === 'user'
                  ? 'var(--jp-layout-color2)'
                  : 'var(--jp-layout-color1)',
              border: '1px solid var(--jp-border-color1)',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap'
            }}
          >
            <strong>{msg.role === 'user' ? 'You' : 'Agent'}:</strong>
            <div style={{ marginTop: '4px' }}>{msg.content}</div>
          </div>
        ))}
        {isStreaming && (
          <div
            style={{
              alignSelf: 'flex-start',
              color: 'var(--jp-ui-font-color2)',
              fontStyle: 'italic'
            }}
          >
            Agent is typing...
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {cellContext && (
          <div
            style={{
              fontSize: '0.72rem',
              padding: '2px 6px',
              backgroundColor: 'var(--jp-layout-color2)',
              border: '1px solid var(--jp-border-color1)',
              borderRadius: '4px',
              color: 'var(--jp-ui-font-color2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
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
        {snippets && snippets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--jp-ui-font-color2)',
                paddingLeft: '2px'
              }}
            >
              Snippets
            </div>
            <div
              style={{
                display: 'flex',
                gap: '4px',
                overflowX: 'auto',
                paddingBottom: '4px'
              }}
            >
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
          </div>
        )}
        <div
          className="jp-selenepy-chatInput"
          style={{ display: 'flex', gap: '4px', alignItems: 'flex-end' }}
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            style={{
              flexGrow: 1,
              resize: 'none',
              height: '60px',
              padding: '4px',
              fontFamily: 'inherit',
              backgroundColor: 'var(--jp-layout-color1)',
              color: 'var(--jp-ui-font-color1)',
              border: '1px solid var(--jp-border-color1)',
              borderRadius: '4px'
            }}
          />
          <button
            onClick={handleMicClick}
            disabled={!hasApiKey || isStreaming || isTranscribing}
            title={
              isRecording
                ? 'Click to stop recording'
                : 'Click to start recording'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              padding: 0,
              backgroundColor: isRecording
                ? 'var(--jp-error-color1)'
                : 'var(--jp-layout-color2)',
              color: 'var(--jp-ui-font-color1)',
              border: '1px solid var(--jp-border-color1)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '18px',
              transition: 'background-color 0.2s'
            }}
          >
            {isRecording ? <MdMicOff /> : <MdMic />}
          </button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            style={{ padding: '0 12px' }}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
