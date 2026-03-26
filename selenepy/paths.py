from pathlib import Path


def get_selenepy_dir() -> Path:
    selenepy_dir = Path.home() / ".selenepy"
    selenepy_dir.mkdir(parents=True, exist_ok=True)
    return selenepy_dir


def get_logs_dir() -> Path:
    logs_dir = get_selenepy_dir() / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir


def get_chat_db_path() -> Path:
    return get_selenepy_dir() / "chat.db"


def get_telemetry_db_path() -> Path:
    return get_selenepy_dir() / "telemetry.db"


def get_prompts_db_path() -> Path:
    return get_selenepy_dir() / "prompts.db"


def get_custom_prompts_json_path() -> Path:
    return get_selenepy_dir() / "custom_prompts.json"


def get_langgraph_checkpoint_path() -> Path:
    return get_selenepy_dir() / "langgraph_checkpoints.sqlite"
