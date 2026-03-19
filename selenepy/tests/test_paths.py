from selenepy.paths import (
    get_selenepy_dir,
    get_logs_dir,
    get_chat_db_path,
    get_telemetry_db_path,
    get_prompts_db_path,
    get_langgraph_checkpoint_path
)
from pathlib import Path

def test_paths():
    home = Path.home()
    expected_base = home / ".selenepy"
    
    print(f"Home: {home}")
    print(f"Expected Base: {expected_base}")
    
    assert get_selenepy_dir() == expected_base
    assert get_logs_dir() == expected_base / "logs"
    assert get_chat_db_path() == expected_base / "chat.db"
    assert get_telemetry_db_path() == expected_base / "telemetry.db"
    assert get_prompts_db_path() == expected_base / "prompts.db"
    assert get_langgraph_checkpoint_path() == expected_base / "langgraph_checkpoints.sqlite"
    
    print("All paths correctly resolve to ~/.selenepy")
    
    # Check if directories were created
    assert expected_base.exists()
    assert (expected_base / "logs").exists()
    print("Directories created successfully")

if __name__ == "__main__":
    test_paths()
