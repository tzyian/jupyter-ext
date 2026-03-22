# Implement True Streaming for Final Chat Message

Currently, the chat uses a "fake streaming" approach by waiting for the entire LangGraph [chat_turn](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/service.py#169-268) task to finish and then chunking the final `assistant_message` out via Server-Sent Events (SSE).

To stream only the final message to the user while keeping the rest of the research/editing silent, we can utilize LangGraph's `astream_events`:

## 1. Modify [EducatorNotebookService](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/service.py#83-329)

We will add an asynchronous generator method (e.g., `chat_turn_stream`) that invokes the graph with `astream_events(..., version="v2")`.

We will filter for the `on_chat_model_stream` and `on_tool_start`/`on_tool_end` events:

- For final nodes ([reply_agent](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/workflow.py#341-376), [final_responder](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/workflow.py#476-522)), we stream tokens as normal chat text.
- For intermediate nodes ([research_agent](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/workflow.py#377-417), [editor_agent](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/workflow.py#418-475)), we stream thoughts (tokens) and tool calls so the frontend can display them in an accordion UI.

## 2. Update [routes.py](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/routes.py) ([ChatStreamHandler](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/routes.py#394-497))

Instead of `asyncio.create_task(service.chat_turn(...))` and waiting for completion, we will iterate over `service.chat_turn_stream(...)`.
As chunks arrive, we immediately transmit them to the frontend using `await writer.send_chunk(chunk_content)`.

## Proposed Changes

### [src/types.ts](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/src/types.ts)

- Extend [ChatStreamEvent](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/src/types.ts#119-138) to include `intermediate_chunk` (with an [agent](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/workflow.py#341-376) field) and `tool_call` / `tool_result`.
- Update [IChatMessage](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/src/types.ts#102-109) to optionally store `thoughts?: { agent: string, content: string }[]` or similar structure for intermediate tracking.

### [src/request.ts](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/src/request.ts) (or `ChatSidebarContent.tsx` / `useChat` hook)

- Process the new SSE event types. Accumulate intermediate chunks into a "thought process" buffer attached to the pending AI message.

### [src/sidebar/components/ChatPanel.tsx](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/src/sidebar/components/ChatPanel.tsx)

- Build a collapsible accordion component inside the AI message bubble.
- Inside the accordion, display the streaming "Thoughts" and active tool calls.

### [selenepy/chat_langchain/service.py](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/chat_langchain/service.py)

- Implement `chat_turn_stream()` returning an `AsyncGenerator`.
- Yield `{"type": "chunk", ...}` for final answers.
- Yield `{"type": "intermediate_chunk", ...}` for research/editor agent thoughts.
- Yield `{"type": "tool_call", ...}` and `{"type": "tool_result", ...}` for observability.

### [selenepy/routes.py](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/routes.py)

- Modify `ChatStreamHandler.post()` and [ChatStreamWriter](file:///c:/Users/Ian/Documents/GitHub/fyp/jupyter-ext/selenepy/routes.py#94-141) to support sending the new intermediate chunk and tool call events over SSE.

Do you want me to proceed with these changes?
