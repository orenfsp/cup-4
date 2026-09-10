import logging
import time

from django.http import HttpRequest, HttpResponse
from django.utils.cache import patch_cache_control
from django.utils.deprecation import MiddlewareMixin

from infrastructure.http import APIError, error_response

logger = logging.getLogger("otklik.requests")


class SafeAPIMiddleware(MiddlewareMixin):
    def process_request(self, request: HttpRequest) -> None:
        request.META["otklik_started"] = time.monotonic()

    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        if request.path.startswith("/api/"):
            patch_cache_control(response, no_store=True, private=True)
            route = request.resolver_match.url_name if request.resolver_match else "unmatched"
            logger.info(
                "route=%s status=%d duration_ms=%d",
                route,
                response.status_code,
                int((time.monotonic() - request.META["otklik_started"]) * 1000),
            )
        return response

    def process_exception(self, request: HttpRequest, exception: Exception) -> HttpResponse:
        # Deliberately exclude exception text and traceback: these can contain private input.
        return error_response(APIError("service_unavailable", 503))
