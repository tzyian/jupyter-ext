import React, { useState, useRef, useEffect } from 'react';
import type { IChatMessage } from '../../types';
import { Button } from './common/Button';

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
  snippets,
  cellContext
}: IChatPanelProps): JSX.Element {
  const [input, setInput] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

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
          style={{ display: 'flex', gap: '4px' }}
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
