from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils.deprecation import MiddlewareMixin


class BoundedBodyMiddleware(MiddlewareMixin):
    def process_request(self, request: HttpRequest) -> HttpResponse | None:
        if request.method in {"POST", "PUT", "PATCH"} and request.path.startswith("/api/"):
            length = request.META.get("CONTENT_LENGTH")
            if length and length.isdigit() and int(length) > 11_000_000:
                return JsonResponse({"error": {"code": "request_too_large"}}, status=413)
        return None
