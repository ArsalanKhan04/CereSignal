"""
Logging configuration for CereSignal API
Provides daily rotating log files with detailed request/response logging
"""

import logging
import os
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

# Create logs directory
LOGS_DIR = Path(__file__).parent.parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)


def setup_logging(app_name: str = "ceresignal") -> logging.Logger:
    """
    Setup application logging with daily rotation.

    Args:
        app_name: Name of the application for the logger

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(app_name)
    logger.setLevel(logging.DEBUG)

    # Prevent duplicate handlers
    if logger.handlers:
        return logger

    # Log format with timestamp, level, module, and message
    log_format = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler (INFO level)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(log_format)
    logger.addHandler(console_handler)

    # File handler with daily rotation (DEBUG level)
    log_file = LOGS_DIR / f"{app_name}.log"
    file_handler = TimedRotatingFileHandler(
        filename=log_file,
        when="midnight",
        interval=1,
        backupCount=30,  # Keep 30 days of logs
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(log_format)
    file_handler.suffix = "%Y-%m-%d"
    logger.addHandler(file_handler)

    # Error file handler (ERROR level only)
    error_log_file = LOGS_DIR / f"{app_name}_errors.log"
    error_handler = TimedRotatingFileHandler(
        filename=error_log_file,
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8",
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(log_format)
    error_handler.suffix = "%Y-%m-%d"
    logger.addHandler(error_handler)

    return logger


# Create default logger instance
logger = setup_logging()


def log_request(
    method: str, path: str, user_id: int | None = None, extra: dict | None = None
):
    """Log incoming API request"""
    msg = f"REQUEST: {method} {path}"
    if user_id:
        msg += f" | user_id={user_id}"
    if extra:
        msg += f" | {extra}"
    logger.info(msg)


def log_response(
    method: str, path: str, status_code: int, duration_ms: float | None = None
):
    """Log API response"""
    msg = f"RESPONSE: {method} {path} | status={status_code}"
    if duration_ms is not None:
        msg += f" | duration={duration_ms:.2f}ms"
    logger.info(msg)


def log_error(error: Exception, context: str = ""):
    """Log error with full context"""
    msg = f"ERROR: {context} | {type(error).__name__}: {str(error)}"
    logger.error(msg, exc_info=True)


def log_db_operation(
    operation: str, table: str, record_id: int | None = None, extra: dict | None = None
):
    """Log database operations"""
    msg = f"DB: {operation} {table}"
    if record_id:
        msg += f" | id={record_id}"
    if extra:
        msg += f" | {extra}"
    logger.debug(msg)


def log_file_operation(operation: str, filepath: str, user_id: int | None = None):
    """Log file operations (upload, download, delete)"""
    msg = f"FILE: {operation} | path={filepath}"
    if user_id:
        msg += f" | user_id={user_id}"
    logger.info(msg)


def log_inference(
    file_id: int,
    status: str,
    duration_ms: float | None = None,
    extra: dict | None = None,
):
    """Log ML inference operations"""
    msg = f"INFERENCE: file_id={file_id} | status={status}"
    if duration_ms is not None:
        msg += f" | duration={duration_ms:.2f}ms"
    if extra:
        msg += f" | {extra}"
    logger.info(msg)


def log_auth(
    event: str,
    user_id: int | None = None,
    username: str | None = None,
    success: bool = True,
):
    """Log authentication events"""
    status = "SUCCESS" if success else "FAILED"
    msg = f"AUTH: {event} | status={status}"
    if user_id:
        msg += f" | user_id={user_id}"
    if username:
        msg += f" | username={username}"
    if success:
        logger.info(msg)
    else:
        logger.warning(msg)
