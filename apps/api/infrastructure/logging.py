import logging
import time
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse
from django.utils.cache import patch_cache_control

from infrastructure.http import APIError, error_response

logger = logging.getLogger("otklik.requests")


class SafeAPIMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        start = time.monotonic()
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            patch_cache_control(response, no_store=True, private=True)
            route = request.resolver_match.url_name if request.resolver_match else "unmatched"
            logger.info(
                "route=%s status=%d duration_ms=%d",
                route,
                response.status_code,
                int((time.monotonic() - start) * 1000),
            )
        return response

    def process_exception(self, request: HttpRequest, exception: Exception) -> HttpResponse:
        # Deliberately exclude exception text and traceback: these can contain private input.
        return error_response(APIError("service_unavailable", 503))
