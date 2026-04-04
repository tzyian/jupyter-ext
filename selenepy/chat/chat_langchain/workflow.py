import os
from pathlib import Path
from typing import Any, Mapping, cast

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import ToolException
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from pydantic import SecretStr

from ...utils.logging import get_logger
from ...utils.openai_config import resolve_openai_api_key
from .models import (
    AgentNode,
    AgentState,
    Intent,
    RouterClassification,
    WorkflowEventKind,
)
from .prompts import (
    NOTEBOOK_EDITOR_SYSTEM,
    RESEARCH_SYSTEM,
    RESPONDER_SYSTEM,
    ROUTER_CLASSIFIER_SYSTEM,
)

load_dotenv()

LOGGER = get_logger(__name__)


class EducatorNotebookWorkflow:
    def __init__(self, arxiv_tools, jupyter_tools, checkpointer=None):
        self.arxiv_tools = arxiv_tools
        self.jupyter_tools = jupyter_tools
        self.checkpointer = checkpointer or MemorySaver()
        self.model_name = (
            os.getenv("OPENAI_MODEL", "gpt-5-nano").strip() 
        )

    @staticmethod
    def _configurable(config: RunnableConfig | None = None) -> Mapping[str, Any]:
        if isinstance(config, Mapping):
            configurable = config.get("configurable")
            if isinstance(configurable, Mapping):
                return configurable
        return {}

    def _resolve_openai_api_key(
        self, config: RunnableConfig | None = None
    ) -> str | None:
        configurable = self._configurable(config)
        resolved = resolve_openai_api_key(
            preferred_key=configurable.get("openai_api_key", "")
        )
        return resolved or None

    def _get_system_prompt(self, config: RunnableConfig | None = None) -> str:
        configurable = self._configurable(config)
        return str(configurable.get("chat_system_prompt", "")).strip()

    def _get_notebook_context(self, config: RunnableConfig | None = None) -> str:
        configurable = self._configurable(config)
        ctx = str(configurable.get("notebook_context", "")).strip()
        if ctx:
            LOGGER.debug("Notebook context found in config")
        return ctx

    def _build_llm(
        self, config: RunnableConfig | None, temperature: float, model_name:  str,
    ) -> ChatOpenAI:
        api_key = self._resolve_openai_api_key(config)
        if api_key:
            return ChatOpenAI(
                model=self.model_name,
                api_key=SecretStr(api_key),
                temperature=temperature,
            )
        return ChatOpenAI(model=self.model_name, temperature=temperature)

    def _build_research_agent(self, config: RunnableConfig | None = None):
        llm = self._build_llm(config, temperature=0.1, model_name="gpt-5-nano")
        user_system_prompt = self._get_system_prompt(config)
        system_prompt = RESEARCH_SYSTEM
        if user_system_prompt:
            system_prompt += f"\n\nAdditional User Instructions:\n{user_system_prompt}"

        notebook_context = self._get_notebook_context(config)
        if notebook_context:
            system_prompt += f"\n\nCurrent Notebook Context:\n{notebook_context}"

        return create_agent(
            llm,
            tools=self.arxiv_tools,
            system_prompt=system_prompt,
        )

    def _build_notebook_editor_agent(self, config: RunnableConfig | None = None):
        llm = self._build_llm(config, temperature=0.1, model_name="gpt-5.4-nano")
        user_system_prompt = self._get_system_prompt(config)
        system_prompt = NOTEBOOK_EDITOR_SYSTEM
        if user_system_prompt:
            system_prompt += f"\n\nAdditional User Instructions:\n{user_system_prompt}"

        notebook_context = self._get_notebook_context(config)
        if notebook_context:
            system_prompt += f"\n\nCurrent Notebook Context:\n{notebook_context}"

        return create_agent(
            llm,
            tools=self.jupyter_tools,
            system_prompt=system_prompt,
        )

    @staticmethod
    def _request_needs_research(user_request: str) -> bool:
        lower = (user_request or "").lower()
        contain_not = "not" in lower or "don't" in lower

        research_markers = [
            "research",
            "arxiv",
            "citation",
            "paper",
            "survey",
            "literature",
            "state of the art",
            "benchmark",
            "evidence",
            "security",
            "rlhf",
        ]
        return not contain_not and any(marker in lower for marker in research_markers)

    @staticmethod
    def _request_needs_edit(user_request: str) -> bool:
        lower = (user_request or "").lower()
        contain_not = "not" in lower or "don't" in lower
        edit_markers = [
            "edit",
            "update",
            "modify",
            "rewrite",
            "refactor",
            "notebook",
            "cell",
            "add section",
            "remove section",
            "create notebook",
        ]
        return not contain_not and any(marker in lower for marker in edit_markers)

    @staticmethod
    def _extract_message_content(message_obj) -> str:
        raw_content = getattr(message_obj, "content", "")
        if isinstance(raw_content, str):
            return raw_content
        if isinstance(raw_content, list):
            parts: list[str] = []
            for item in raw_content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            return "\n".join(parts)
        return str(raw_content)

    @staticmethod
    def _heuristic_intent(user_request: str) -> Intent:
        needs_research = EducatorNotebookWorkflow._request_needs_research(user_request)
        needs_edit = EducatorNotebookWorkflow._request_needs_edit(user_request)

        if needs_research and needs_edit:
            return Intent.RESEARCH_THEN_EDIT
        if needs_edit:
            return Intent.EDIT
        if needs_research:
            return Intent.RESEARCH
        return Intent.REPLY

    async def router_classifier(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Router classifier received state")
        nb_ctx = state.get("notebook_context", "")
        if nb_ctx:
            LOGGER.debug("Router received notebook context")

        user_request = state.get("user_request", "")

        intent = self._heuristic_intent(user_request)
        confidence = 0.55

        try:
            llm = self._build_llm(config, temperature=0, model_name="gpt-5-nano")
            router_llm = llm.with_structured_output(RouterClassification)
            response = await router_llm.ainvoke(
                [
                    SystemMessage(content=ROUTER_CLASSIFIER_SYSTEM),
                    HumanMessage(
                        content=(
                            f"User request:\n{user_request}\n\n"
                            f"Notebook Context:\n{state.get('notebook_context', '')}"
                        )
                    ),
                ],
                config=config,
            )
            if isinstance(response, RouterClassification):
                router_output = response
            else:
                router_output = RouterClassification.model_validate(response)

            intent = Intent(router_output.intent)
            confidence = max(0.0, min(1.0, float(router_output.confidence)))
        except Exception as exc:
            LOGGER.warning("Router classification fallback due to error: %s", exc)

        return {
            "intent": intent,
            "intent_confidence": confidence,
            "done": False,
        }

    async def run_responder_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Responder agent received state")

        llm = self._build_llm(config, temperature=0.2, model_name="gpt-5-nano")
        user_system_prompt = self._get_system_prompt(config)
        system_prompt = RESPONDER_SYSTEM
        if user_system_prompt:
            system_prompt += f"\n\nAdditional User Instructions:\n{user_system_prompt}"

        notebook_context = self._get_notebook_context(config)
        if notebook_context:
            system_prompt += f"\n\nCurrent Notebook Context:\n{notebook_context}"

        messages = [SystemMessage(content=system_prompt)] + list(
            state.get("messages", [])
        )

        intent = state.get("intent", Intent.REPLY)
        research_notes = state.get("research_notes", "")
        edit_result = state.get("edit_result", "")

        if research_notes or edit_result:
            summary_context = f"Intent: {intent.value}\n"
            if research_notes:
                summary_context += f"Research notes:\n{research_notes}\n\n"
            if edit_result:
                summary_context += f"Edit result:\n{edit_result}\n"

            messages.append(
                HumanMessage(
                    content=f"Agent Context (Please synthesize the final response based on this):\n{summary_context}"
                )
            )

        try:
            result = await llm.ainvoke(messages, config=config)
            content = self._extract_message_content(result)
        except Exception:
            LOGGER.exception("Responder unexpected error")
            content = "An error occurred generating the response."

        all_thoughts = state.get("all_thoughts", [])
        all_tool_calls = state.get("all_tool_calls", [])

        return {
            "messages": [
                AIMessage(
                    content=content,
                    additional_kwargs={
                        "thoughts": all_thoughts if all_thoughts else None,
                        "tool_calls_trace": all_tool_calls if all_tool_calls else None,
                    },
                )
            ],
            "done": True,
        }

    async def run_research_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Research agent received state")

        invoke_config: dict[str, Any] = dict(config) if config else {}
        invoke_config["tags"] = list(invoke_config.get("tags") or []) + [
            "agent:Research"
        ]

        local_thoughts: list[dict[str, str]] = []
        local_tool_calls: list[dict[str, Any]] = []
        final_result = None

        try:
            research_agent = self._build_research_agent(
                cast(RunnableConfig, invoke_config)
            )
            search_prompt = (
                f"User request: {state.get('user_request', '')}\n\n"
                "Find relevant arXiv material and provide concise notes "
                "useful for building an educational Jupyter notebook."
            )

            async for event in research_agent.astream_events(
                {"messages": [HumanMessage(content=search_prompt)]},
                config=cast(RunnableConfig, invoke_config),
                version="v2",
            ):
                kind = event.get("event")
                if kind == WorkflowEventKind.ON_CHAT_MODEL_STREAM.value:
                    data = event.get("data", {})
                    chunk = data.get("chunk") if isinstance(data, dict) else None
                    content = getattr(chunk, "content", "") if chunk is not None else ""
                    if content:
                        local_thoughts.append(
                            {"agent": "Research Agent", "content": content}
                        )
                elif kind == WorkflowEventKind.ON_TOOL_START.value:
                    local_tool_calls.append(
                        {
                            "name": event["name"],
                            "input": event["data"].get("input"),
                            "status": "active",
                        }
                    )
                elif kind == WorkflowEventKind.ON_TOOL_END.value:
                    for tc in reversed(local_tool_calls):
                        if tc["name"] == event["name"] and tc["status"] == "active":
                            tc["status"] = "done"
                            break

                if (
                    kind == WorkflowEventKind.ON_CHAIN_END.value
                    and event.get("name") == "LangGraph"
                ):
                    final_result = event["data"].get("output")

            if final_result and "messages" in final_result:
                last_msg = final_result["messages"][-1]
                content = self._extract_message_content(last_msg)
            else:
                content = "Research completed but no summary found."

        except ToolException as exc:
            LOGGER.warning("Research agent tool error: %s", exc)
            content = f"Research tool error: {exc}"
        except Exception as exc:
            LOGGER.exception("Research agent unexpected error")
            content = f"Research unexpected error: {exc}"

        return {
            "research_notes": content,
            "all_thoughts": local_thoughts,
            "all_tool_calls": local_tool_calls,
            "done": False,
        }

    async def run_notebook_editor_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Notebook editor agent received state")

        notebook_path = state.get("notebook_path", "generated/selene_notebook.ipynb")
        Path(notebook_path).parent.mkdir(parents=True, exist_ok=True)
        notebook_name = os.path.basename(notebook_path)

        LOGGER.info(
            "[notebook_editor] notebook_path=%r notebook_name=%r",
            notebook_path,
            notebook_name,
        )

        invoke_config: dict[str, Any] = dict(config) if config else {}
        invoke_config["tags"] = list(invoke_config.get("tags") or []) + ["agent:Editor"]

        local_thoughts: list[dict[str, str]] = []
        local_tool_calls: list[dict[str, Any]] = []
        final_result = None

        try:
            notebook_editor_agent = self._build_notebook_editor_agent(
                cast(RunnableConfig, invoke_config)
            )
            edit_prompt = (
                f"User request: {state.get('user_request', '')}\n\n"
                f"Research notes:\n{state.get('research_notes', '')}\n\n"
                f"Notebook path: {notebook_path}\n"
                f"Notebook name: {notebook_name}\n"
                f"Active Cell Index: {state.get('active_cell_index', -1)}\n\n"
                "Create or update the notebook accordingly. "
                "Use the notebook-selection MCP tool before notebook edits."
            )

            async for event in notebook_editor_agent.astream_events(
                {"messages": [HumanMessage(content=edit_prompt)]},
                config=cast(RunnableConfig, invoke_config),
                version="v2",
            ):
                kind = event.get("event")
                if kind == WorkflowEventKind.ON_CHAT_MODEL_STREAM.value:
                    data = event.get("data", {})
                    chunk = data.get("chunk") if isinstance(data, dict) else None
                    content = getattr(chunk, "content", "") if chunk is not None else ""
                    if content:
                        local_thoughts.append(
                            {"agent": "Editor Agent", "content": content}
                        )
                elif kind == WorkflowEventKind.ON_TOOL_START.value:
                    local_tool_calls.append(
                        {
                            "name": event["name"],
                            "input": event["data"].get("input"),
                            "status": "active",
                        }
                    )
                elif kind == WorkflowEventKind.ON_TOOL_END.value:
                    for tc in reversed(local_tool_calls):
                        if tc["name"] == event["name"] and tc["status"] == "active":
                            tc["status"] = "done"
                            break

                if (
                    kind == WorkflowEventKind.ON_CHAIN_END.value
                    and event.get("name") == "LangGraph"
                ):
                    final_result = event["data"].get("output")

            if final_result and "messages" in final_result:
                last_msg = final_result["messages"][-1]
                content = self._extract_message_content(last_msg)
            else:
                content = "Edit completed but no summary found."
        except ToolException as exc:
            LOGGER.warning("Notebook editor tool error: %s", exc)
            content = f"Notebook tool error: {exc}"
        except Exception as exc:
            LOGGER.exception("Notebook editor unexpected error")
            content = f"Notebook unexpected error: {exc}"

        return {
            "edit_result": content,
            "all_thoughts": local_thoughts,
            "all_tool_calls": local_tool_calls,
            "done": False,
        }

    @staticmethod
    def route_from_router(
        state: AgentState,
    ) -> AgentNode:
        match state.get("intent", "").strip().lower():
            case Intent.RESEARCH_THEN_EDIT.value:
                return AgentNode.EDITOR
            case Intent.REPLY.value:
                return AgentNode.RESPONDER
            case Intent.CLARIFY.value:
                return AgentNode.RESPONDER
            case Intent.RESEARCH.value:
                return AgentNode.RESEARCH
            case Intent.EDIT.value:
                return AgentNode.EDITOR
            case _:
                return AgentNode.RESPONDER

    @staticmethod
    def route_from_research(
        state: AgentState,
    ) -> AgentNode:
        intent = state.get("intent", "").strip().lower()
        if intent == Intent.RESEARCH_THEN_EDIT.value:
            return AgentNode.EDITOR
        return AgentNode.RESPONDER

    @staticmethod
    def route_from_edit(
        state: AgentState,
    ) -> AgentNode:
        intent = str(state.get("intent", "")).strip().lower()
        if intent == Intent.RESEARCH_THEN_EDIT.value:
            return AgentNode.EDITOR
        return AgentNode.RESPONDER

    def build_graph(self):
        builder = StateGraph(AgentState)

        builder.add_node(AgentNode.ROUTER, self.router_classifier)
        builder.add_node(AgentNode.RESPONDER, self.run_responder_agent)
        builder.add_node(AgentNode.RESEARCH, self.run_research_agent)
        builder.add_node(AgentNode.EDITOR, self.run_notebook_editor_agent)

        builder.add_edge(START, AgentNode.ROUTER)

        builder.add_conditional_edges(
            AgentNode.ROUTER,
            self.route_from_router,
            {
                AgentNode.RESPONDER: AgentNode.RESPONDER,
                AgentNode.RESEARCH: AgentNode.RESEARCH,
                AgentNode.EDITOR: AgentNode.EDITOR,
            },
        )

        builder.add_conditional_edges(
            AgentNode.RESEARCH,
            self.route_from_research,
            {
                AgentNode.EDITOR: AgentNode.EDITOR,
                AgentNode.RESPONDER: AgentNode.RESPONDER,
            },
        )

        builder.add_edge(AgentNode.EDITOR, AgentNode.RESPONDER)

        builder.add_edge(AgentNode.RESPONDER, END)

        return builder.compile(checkpointer=self.checkpointer)
