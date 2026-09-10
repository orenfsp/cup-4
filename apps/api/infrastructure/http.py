import json
from collections.abc import Callable
from functools import wraps
from typing import Any

from django.core.exceptions import RequestDataTooBig, TooManyFilesSent
from django.http import HttpRequest, HttpResponse, JsonResponse
from jsonschema import Draft202012Validator, ValidationError
from otklik_contracts import API_SCHEMAS


class APIError(Exception):
    def __init__(self, code: str, status: int = 400, retry_after: int | None = None) -> None:
        self.code = code
        self.status = status
        self.retry_after = retry_after
        super().__init__(code)


def error_response(error: APIError) -> JsonResponse:
    response = JsonResponse({"error": {"code": error.code}}, status=error.status)
    if error.retry_after is not None:
        response["Retry-After"] = str(error.retry_after)
    return response


def endpoint[**P](view: Callable[P, HttpResponse]) -> Callable[P, HttpResponse]:
    @wraps(view)
    def wrapped(*args: P.args, **kwargs: P.kwargs) -> HttpResponse:
        try:
            return view(*args, **kwargs)
        except APIError as error:
            return error_response(error)

    return wrapped


def payload(request: HttpRequest, schema: str) -> dict[str, Any]:
    if (request.content_type or "").startswith("multipart/form-data"):
        raw = request.POST.get("payload", "")
        try:
            data = json.loads(raw)
            Draft202012Validator(API_SCHEMAS[schema]).validate(data)
        except (ValueError, UnicodeError, RecursionError, ValidationError):
            raise APIError("invalid_request") from None
        return data
    if request.content_type != "application/json":
        raise APIError("json_required", 415)
    try:
        data = json.loads(request.body)
        Draft202012Validator(API_SCHEMAS[schema]).validate(data)
    except RequestDataTooBig:
        raise APIError("request_too_large", 413) from None
    except (ValueError, UnicodeError, RecursionError):
        raise APIError("invalid_request") from None
    except ValidationError:
        raise APIError("invalid_request") from None
    return data


def csrf_failure(request: HttpRequest, reason: str = "") -> JsonResponse:
    return error_response(APIError("csrf_failed", 403))


def bad_request(request: HttpRequest, exception: Exception) -> JsonResponse:
    # Multipart can be parsed by CSRF before the view executes.
    if isinstance(exception, TooManyFilesSent):
        return error_response(APIError("attachment_too_large", 413))
    if isinstance(exception, RequestDataTooBig):
        return error_response(APIError("request_too_large", 413))
    return error_response(APIError("invalid_request"))
