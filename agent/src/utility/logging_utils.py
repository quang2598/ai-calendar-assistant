from loguru import logger
import sys


def setup_logging():
    """
    Set up the logging configuration for the application.
    """
    logger.remove()  # Remove the default logger
    logger.add(
        sink=sys.stdout,  # Log to standard output
        level="INFO",  # Set the logging level
        backtrace=True,  # Enable backtrace for error logs
        diagnose=True,  # Enable diagnostic information for errors
    )
    logger.info("Logging is set up successfully.")

setup_logging()