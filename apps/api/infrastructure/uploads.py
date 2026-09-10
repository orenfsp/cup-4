from collections.abc import Callable

from django.http import HttpRequest, HttpResponse, JsonResponse


class BoundedBodyMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if request.method in {"POST", "PUT", "PATCH"} and request.path.startswith("/api/"):
            length = request.META.get("CONTENT_LENGTH")
            if length and length.isdigit() and int(length) > 11_000_000:
                return JsonResponse({"error": {"code": "request_too_large"}}, status=413)
        return self.get_response(request)
