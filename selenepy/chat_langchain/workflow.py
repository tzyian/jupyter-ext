import json
import os
import re
from pathlib import Path
from typing import Literal, Mapping

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import ToolException
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from pydantic import SecretStr

from ..logging import get_logger
from .models import AgentNode, AgentState, EditStatus, Intent
from .prompts import (
    FINAL_RESPONDER_SYSTEM,
    NOTEBOOK_EDITOR_SYSTEM,
    REPLY_SYSTEM,
    RESEARCH_SYSTEM,
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
            os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
        )

    def _resolve_openai_api_key(
        self, config: RunnableConfig | None = None
    ) -> str | None:
        configurable = (
            config.get("configurable") if isinstance(config, Mapping) else None
        )
        preferred_key = ""
        if isinstance(configurable, Mapping):
            preferred_key = str(configurable.get("openai_api_key", "")).strip()
        return preferred_key or None

    def _get_system_prompt(self, config: RunnableConfig | None = None) -> str:
        configurable = (
            config.get("configurable") if isinstance(config, Mapping) else None
        )
        if isinstance(configurable, Mapping):
            return str(configurable.get("chat_system_prompt", "")).strip()
        return ""

    def _get_notebook_context(self, config: RunnableConfig | None = None) -> str:
        configurable = (
            config.get("configurable") if isinstance(config, Mapping) else None
        )
        if isinstance(configurable, Mapping):
            ctx = str(configurable.get("notebook_context", "")).strip()
            if ctx:
                print(f"DEBUG: Notebook context found in config: {ctx[:50]}...")
            return ctx
        return ""

    def _build_llm(
        self, config: RunnableConfig | None, temperature: float
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
        llm = self._build_llm(config, temperature=0.1)
        user_system_prompt = self._get_system_prompt(config)
        system_prompt = RESEARCH_SYSTEM
        if user_system_prompt:
            system_prompt += f"\n\nAdditional User Instructions:\n{user_system_prompt}"

        notebook_context = self._get_notebook_context(config)
        if notebook_context:
            system_prompt += f"\n\nCurrent Notebook Context:\n{notebook_context}"

        return create_agent(llm, tools=self.arxiv_tools, system_prompt=system_prompt)

    def _build_notebook_editor_agent(self, config: RunnableConfig | None = None):
        llm = self._build_llm(config, temperature=0.1)
        user_system_prompt = self._get_system_prompt(config)
        system_prompt = NOTEBOOK_EDITOR_SYSTEM
        if user_system_prompt:
            system_prompt += f"\n\nAdditional User Instructions:\n{user_system_prompt}"

        notebook_context = self._get_notebook_context(config)
        if notebook_context:
            system_prompt += f"\n\nCurrent Notebook Context:\n{notebook_context}"

        return create_agent(llm, tools=self.jupyter_tools, system_prompt=system_prompt)

    def _build_reply_agent(self, config: RunnableConfig | None = None):
        llm = self._build_llm(config, temperature=0.2)
        user_system_prompt = self._get_system_prompt(config)
        system_prompt = REPLY_SYSTEM
        if user_system_prompt:
            system_prompt += f"\n\nAdditional User Instructions:\n{user_system_prompt}"

        notebook_context = self._get_notebook_context(config)
        if notebook_context:
            system_prompt += f"\n\nCurrent Notebook Context:\n{notebook_context}"

        return create_agent(llm, tools=[], system_prompt=system_prompt)

    def _build_final_responder(self, config: RunnableConfig | None = None):
        llm = self._build_llm(config, temperature=0.2)
        user_system_prompt = self._get_system_prompt(config)
        system_prompt = FINAL_RESPONDER_SYSTEM
        if user_system_prompt:
            system_prompt += f"\n\nAdditional User Instructions:\n{user_system_prompt}"

        notebook_context = self._get_notebook_context(config)
        if notebook_context:
            system_prompt += f"\n\nCurrent Notebook Context:\n{notebook_context}"

        return create_agent(llm, tools=[], system_prompt=system_prompt)

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
    def _increment_retry_count(
        retry_count_by_agent: dict[str, int], agent_name: str
    ) -> dict[str, int]:
        updated = dict(retry_count_by_agent or {})
        updated[str(agent_name)] = updated.get(str(agent_name), 0) + 1
        return updated

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
    def _parse_json_object(text: str) -> dict[str, object]:
        text = (text or "").strip()
        if not text:
            return {}

        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        code_block = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if code_block:
            try:
                parsed = json.loads(code_block.group(1))
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            try:
                parsed = json.loads(brace_match.group(0))
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        return {}

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

    @staticmethod
    def _coerce_intent(value: object) -> Intent:
        text = str(value or "").strip().lower()
        mapping = {
            Intent.REPLY.value: Intent.REPLY,
            Intent.RESEARCH.value: Intent.RESEARCH,
            Intent.EDIT.value: Intent.EDIT,
            Intent.CLARIFY.value: Intent.CLARIFY,
            Intent.RESEARCH_THEN_EDIT.value: Intent.RESEARCH_THEN_EDIT,
        }
        return mapping.get(text, Intent.REPLY)

    @staticmethod
    def _classify_editor_content(content: str) -> EditStatus:
        lower = (content or "").lower()

        if any(
            marker in lower
            for marker in [
                "needs_research",
                "need more research",
                "missing citation",
                "insufficient research",
                "need additional sources",
            ]
        ):
            return EditStatus.NEEDS_RESEARCH

        if any(
            marker in lower
            for marker in [
                "fatal_failure",
                "cannot proceed",
                "hard failure",
                "unrecoverable",
            ]
        ):
            return EditStatus.FATAL_FAILURE

        if any(
            marker in lower
            for marker in [
                "retryable_failure",
                "temporary",
                "transient",
                "try again",
                "timeout",
            ]
        ):
            return EditStatus.RETRYABLE_FAILURE

        return EditStatus.SUCCESS

    async def router_classifier(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Router classifier received state")
        nb_ctx = state.get("notebook_context", "")
        if nb_ctx:
            print(f"DEBUG: Router received notebook context: {nb_ctx[:50]}...")

        user_request = state.get("user_request", "")
        retry_count_by_agent = self._increment_retry_count(
            state.get("retry_count_by_agent", {}), AgentNode.ROUTER
        )

        intent = self._heuristic_intent(user_request)
        confidence = 0.55

        try:
            llm = self._build_llm(config, temperature=0)
            response = await llm.ainvoke(
                [
                    SystemMessage(content=ROUTER_CLASSIFIER_SYSTEM),
                    HumanMessage(
                        content=(
                            f"User request:\n{user_request}\n\n"
                            f"Notebook Context:\n{state.get('notebook_context', '')}"
                        )
                    ),
                ]
            )
            parsed = self._parse_json_object(self._extract_message_content(response))
            intent = self._coerce_intent(parsed.get("intent"))
            parsed_confidence = parsed.get("confidence", confidence)
            if isinstance(parsed_confidence, (int, float, str)):
                confidence = max(0.0, min(1.0, float(parsed_confidence)))
        except Exception as exc:
            LOGGER.warning("Router classification fallback due to error: %s", exc)

        return {
            "intent": intent,
            "intent_confidence": confidence,
            "retry_count_by_agent": retry_count_by_agent,
            "done": False,
        }

    async def run_reply_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Reply agent received state")

        retry_count_by_agent = self._increment_retry_count(
            state.get("retry_count_by_agent", {}), AgentNode.REPLY
        )

        try:
            reply_agent = self._build_reply_agent(config)
            result = await reply_agent.ainvoke(
                {
                    "messages": [
                        HumanMessage(
                            content=f"User request: {state.get('user_request', '')}"
                        )
                    ]
                },
                config=config,
            )
            last_msg = result["messages"][-1]
            content = self._extract_message_content(last_msg)
        except Exception:
            LOGGER.exception("Reply agent unexpected error")
            content = (
                "I could not produce a direct answer due to an internal error. "
                "Please retry your request."
            )

        return {
            "messages": [AIMessage(content=content)],
            "retry_count_by_agent": retry_count_by_agent,
            "done": True,
        }

    async def run_research_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Research agent received state")

        retry_count_by_agent = self._increment_retry_count(
            state.get("retry_count_by_agent", {}), AgentNode.RESEARCH
        )

        try:
            research_agent = self._build_research_agent(config)
            result = await research_agent.ainvoke(
                {
                    "messages": [
                        HumanMessage(
                            content=(
                                f"User request: {state.get('user_request', '')}\n\n"
                                "Find relevant arXiv material and provide concise notes "
                                "useful for building an educational Jupyter notebook."
                            )
                        )
                    ]
                },
                config=config,
            )
            last_msg = result["messages"][-1]
            content = self._extract_message_content(last_msg)
        except ToolException as exc:
            LOGGER.warning("Research agent tool error: %s", exc)
            content = f"Research tool error: {exc}"
        except Exception as exc:
            LOGGER.exception("Research agent unexpected error")
            content = f"Research unexpected error: {exc}"

        return {
            "research_notes": content,
            "messages": [AIMessage(content=f"Research findings:\n{content}")],
            "retry_count_by_agent": retry_count_by_agent,
            "done": False,
        }

    async def run_notebook_editor_agent(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Notebook editor agent received state")

        retry_count_by_agent = self._increment_retry_count(
            state.get("retry_count_by_agent", {}), AgentNode.EDITOR
        )

        notebook_path = state.get("notebook_path", "generated/selene_notebook.ipynb")
        Path(notebook_path).parent.mkdir(parents=True, exist_ok=True)
        notebook_name = os.path.basename(notebook_path)

        LOGGER.info(
            "[notebook_editor] notebook_path=%r notebook_name=%r",
            notebook_path,
            notebook_name,
        )

        try:
            notebook_editor_agent = self._build_notebook_editor_agent(config)
            result = await notebook_editor_agent.ainvoke(
                {
                    "messages": [
                        HumanMessage(
                            content=(
                                f"User request: {state.get('user_request', '')}\n\n"
                                f"Research notes:\n{state.get('research_notes', '')}\n\n"
                                f"Notebook path: {notebook_path}\n"
                                f"Notebook name: {notebook_name}\n\n"
                                "Create or update the notebook accordingly. "
                                "Use the notebook-selection MCP tool before notebook edits."
                            )
                        )
                    ]
                },
                config=config,
            )
            last_msg = result["messages"][-1]
            content = self._extract_message_content(last_msg)
            edit_status = self._classify_editor_content(content)
        except ToolException as exc:
            LOGGER.warning("Notebook editor tool error: %s", exc)
            content = f"Notebook tool error: {exc}"
            edit_status = EditStatus.RETRYABLE_FAILURE
        except Exception as exc:
            LOGGER.exception("Notebook editor unexpected error")
            content = f"Notebook unexpected error: {exc}"
            edit_status = EditStatus.FATAL_FAILURE

        return {
            "edit_result": content,
            "edit_status": edit_status,
            "messages": [AIMessage(content=f"Notebook editor result:\n{content}")],
            "retry_count_by_agent": retry_count_by_agent,
            "done": False,
        }

    async def final_responder(
        self, state: AgentState, config: RunnableConfig
    ) -> AgentState:
        LOGGER.info("Final responder received state")

        retry_count_by_agent = self._increment_retry_count(
            state.get("retry_count_by_agent", {}), AgentNode.FINAL_RESPONDER
        )

        intent = self._coerce_intent(state.get("intent"))
        research_notes = state.get("research_notes", "")
        edit_result = state.get("edit_result", "")

        summary_prompt = (
            f"User request: {state.get('user_request', '')}\n\n"
            f"Intent: {intent.value}\n"
            f"Research notes:\n{research_notes}\n\n"
            f"Edit result:\n{edit_result}\n"
        )

        try:
            responder = self._build_final_responder(config)
            result = await responder.ainvoke(
                {"messages": [HumanMessage(content=summary_prompt)]},
                config=config,
            )
            last_msg = result["messages"][-1]
            content = self._extract_message_content(last_msg)
        except Exception:
            LOGGER.exception("Final responder unexpected error")
            if intent == Intent.RESEARCH:
                content = f"Research completed.\n\n{research_notes}".strip()
            elif intent == Intent.EDIT:
                content = f"Notebook edit completed.\n\n{edit_result}".strip()
            else:
                content = (
                    "Research and edit workflow completed with partial output.\n\n"
                    f"Research notes:\n{research_notes}\n\n"
                    f"Edit result:\n{edit_result}"
                ).strip()

        return {
            "messages": [AIMessage(content=content)],
            "retry_count_by_agent": retry_count_by_agent,
            "done": True,
        }

    @staticmethod
    def route_from_router(
        state: AgentState,
    ) -> Literal[AgentNode.REPLY, AgentNode.RESEARCH, AgentNode.EDITOR, "__end__"]:
        intent = str(state.get("intent", "")).strip().lower()
        if intent in {Intent.REPLY.value, Intent.CLARIFY.value}:
            return AgentNode.REPLY
        if intent == Intent.RESEARCH.value:
            return AgentNode.RESEARCH
        if intent == Intent.EDIT.value:
            return AgentNode.EDITOR
        if intent == Intent.RESEARCH_THEN_EDIT.value:
            return AgentNode.RESEARCH
        return AgentNode.REPLY

    @staticmethod
    def route_from_research(
        state: AgentState,
    ) -> Literal[AgentNode.EDITOR, AgentNode.FINAL_RESPONDER, "__end__"]:
        if state.get("done"):
            return "__end__"
        intent = str(state.get("intent", "")).strip().lower()
        if intent == Intent.RESEARCH_THEN_EDIT.value:
            return AgentNode.EDITOR
        return AgentNode.FINAL_RESPONDER

    @staticmethod
    def route_from_editor(
        state: AgentState,
    ) -> Literal[AgentNode.FINAL_RESPONDER, "__end__"]:
        if state.get("done"):
            return "__end__"
        return AgentNode.FINAL_RESPONDER

    def build_graph(self):
        builder = StateGraph(AgentState)

        builder.add_node(AgentNode.ROUTER, self.router_classifier)
        builder.add_node(AgentNode.REPLY, self.run_reply_agent)
        builder.add_node(AgentNode.RESEARCH, self.run_research_agent)
        builder.add_node(AgentNode.EDITOR, self.run_notebook_editor_agent)
        builder.add_node(AgentNode.FINAL_RESPONDER, self.final_responder)

        builder.add_edge(START, AgentNode.ROUTER)

        builder.add_conditional_edges(
            AgentNode.ROUTER,
            self.route_from_router,
            {
                AgentNode.REPLY: AgentNode.REPLY,
                AgentNode.RESEARCH: AgentNode.RESEARCH,
                AgentNode.EDITOR: AgentNode.EDITOR,
                END: END,
            },
        )

        builder.add_edge(AgentNode.REPLY, END)

        builder.add_conditional_edges(
            AgentNode.RESEARCH,
            self.route_from_research,
            {
                AgentNode.EDITOR: AgentNode.EDITOR,
                AgentNode.FINAL_RESPONDER: AgentNode.FINAL_RESPONDER,
                END: END,
            },
        )

        builder.add_conditional_edges(
            AgentNode.EDITOR,
            self.route_from_editor,
            {
                AgentNode.FINAL_RESPONDER: AgentNode.FINAL_RESPONDER,
                END: END,
            },
        )

        builder.add_edge(AgentNode.FINAL_RESPONDER, END)

        return builder.compile(checkpointer=self.checkpointer)
