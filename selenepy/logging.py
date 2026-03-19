import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Optional

_LOG_DIR = os.path.join(os.path.expanduser("~"), ".selenepy", "logs")
_LOG_FILE = os.path.join(_LOG_DIR, "selenepy.log")

# Create log directory if it doesn't exist
os.makedirs(_LOG_DIR, exist_ok=True)

def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Get a configured logger for the selenepy package.
    Tees output to both stdout and a rotating file handler.
    
    Args:
        name: The name of the logger. If None, returns the root 'selenepy' logger.
    """
    # Ensure name starts with 'selenepy' for consistent hierarchy
    prefix = "selenepy"
    if name is None or name == prefix:
        logger_name = prefix
    elif name.startswith(prefix + "."):
        logger_name = name
    else:
        logger_name = f"{prefix}.{name}"
        
    logger = logging.getLogger(logger_name)
    
    # Only configure the root 'selenepy' logger once
    root_logger = logging.getLogger(prefix)
    if not root_logger.handlers:
        root_logger.setLevel(logging.INFO)
        
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        )
        
        # File Handler (Rotating)
        try:
            file_handler = RotatingFileHandler(
                _LOG_FILE,
                maxBytes=1_000_000, # 1MB
                backupCount=3,
                encoding="utf-8",
            )
            file_handler.setFormatter(formatter)
            root_logger.addHandler(file_handler)
        except Exception as e:
            # Fallback if file logging fails
            print(f"Warning: Failed to initialize file logging at {_LOG_FILE}: {e}", file=sys.stderr)
            
        # Console Handler (STDOUT)
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)
        
    return logger
