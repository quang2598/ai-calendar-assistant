from functools import wraps
from loguru import logger
from time import perf_counter
import inspect



def trace_span(span_name: str):
    def decorator(func):
        if inspect.iscoroutinefunction(func):

            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                start = perf_counter()
                logger.info(f"Entering span: {span_name}", extra={"span": span_name})

                try:
                    return await func(*args, **kwargs)
                except Exception as exc:
                    logger.error(f"Error in span {span_name}: {exc}", extra={"span": span_name, "error": str(exc)})
                    raise
                finally:
                    duration = perf_counter() - start
                    logger.info(
                        f"Exiting span {span_name}, took {duration * 1000} ms",
                        extra={"span": span_name, "duration_ms": duration * 1000},
                    )

            return async_wrapper

        @wraps(func)
        def wrapper(*args, **kwargs):
            start = perf_counter()
            logger.info(f"Entering span: {span_name}", extra={"span": span_name})

            try:
                return func(*args, **kwargs)
            except Exception as exc:
                logger.error(f"Error in span {span_name}: {exc}", extra={"span": span_name, "error": str(exc)})
                raise
            finally:
                duration = perf_counter() - start
                logger.info(
                    f"Exiting span {span_name}, took {duration * 1000} ms",
                    extra={"span": span_name, "duration_ms": duration * 1000},
                )

        return wrapper
    return decorator