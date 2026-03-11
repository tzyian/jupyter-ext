import React, { useState, useRef, useEffect } from 'react';
import type { IChatMessage } from '../../types';

interface IChatPanelProps {
  messages: IChatMessage[];
  isStreaming: boolean;
  onSendMessage: (message: string) => void;
  onClear: () => void;
  hasApiKey: boolean;
  snippets?: { id: string; name: string; content: string }[];
}

export function ChatPanel({
  messages,
  isStreaming,
  onSendMessage,
  onClear,
  hasApiKey,
  snippets
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
      <div
        className="jp-selenepy-chatHeader"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px',
          alignItems: 'center'
        }}
      >
        <h3 style={{ margin: 0 }}>LangGraph Chat</h3>
        <button
          onClick={onClear}
          disabled={isStreaming}
          style={{ cursor: isStreaming ? 'not-allowed' : 'pointer' }}
        >
          Clear
        </button>
      </div>

      {!hasApiKey && (
        <div
          style={{
            padding: '8px',
            backgroundColor: 'var(--jp-warn-color3)',
            color: 'var(--jp-ui-font-color0)',
            marginBottom: '8px',
            borderRadius: '4px',
            fontSize: '0.9em'
          }}
        >
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
        {snippets && snippets.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '4px',
              overflowX: 'auto',
              paddingBottom: '4px'
            }}
          >
            {snippets.map(s => (
              <button
                key={s.id}
                onClick={() => setInput(s.content)}
                disabled={isStreaming}
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  whiteSpace: 'nowrap',
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                  backgroundColor: 'var(--jp-layout-color2)',
                  border: '1px solid var(--jp-border-color1)'
                }}
                title={s.content}
              >
                {s.name}
              </button>
            ))}
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
          disabled={isStreaming}
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
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          style={{
            padding: '0 12px',
            cursor: !input.trim() || isStreaming ? 'not-allowed' : 'pointer'
          }}
        >
          Send
        </button>
        </div>
      </div>
    </div>
  );
}
