"""Bounded per-process sliding window. No IP, code or account is stored in the DB."""

import hashlib
import hmac
import ipaddress
import math
import secrets
import socket
import threading
import time
from collections import deque

from django.conf import settings
from django.http import HttpRequest

from infrastructure.http import APIError


class WindowLimiter:
    def __init__(self, capacity: int = 4096) -> None:
        self.capacity = capacity
        self.lock = threading.Lock()
        self.key = secrets.token_bytes(32)
        self.windows: dict[tuple[str, str], deque[float]] = {}

    def reset(self) -> None:
        with self.lock:
            self.windows.clear()

    def check(self, scope: str, address: str, limit: int, global_limit: int) -> None:
        now = time.monotonic()
        digest = hmac.new(self.key, address.encode(), hashlib.sha256).hexdigest()
        keys = [(scope, "global"), (scope, digest)]
        with self.lock:
            for key, times in list(self.windows.items()):
                while times and times[0] <= now - 60:
                    times.popleft()
                if not times:
                    del self.windows[key]
            for key, maximum in zip(keys, [global_limit, limit], strict=True):
                times = self.windows.get(key, deque())
                if len(times) >= maximum:
                    raise APIError("try_later", 429, max(1, math.ceil(60 - (now - times[0]))))
            if len(self.windows) + sum(key not in self.windows for key in keys) > self.capacity:
                raise APIError("try_later", 429, 60)
            for key in keys:
                self.windows.setdefault(key, deque()).append(now)


limiter = WindowLimiter()


def trusted_proxy_addresses() -> set[str]:
    addresses = set(settings.TRUSTED_PROXY_IPS)
    for host in settings.TRUSTED_PROXY_HOSTS:
        try:
            addresses.update(str(info[4][0]) for info in socket.getaddrinfo(host, None))
        except socket.gaierror:
            pass  # Fail closed: ignore forwarding headers when resolution is unavailable.
    return addresses


def client_address(request: HttpRequest) -> str:
    peer = request.META.get("REMOTE_ADDR", "unknown")
    candidate = request.META.get("HTTP_X_REAL_IP", "")
    if peer in trusted_proxy_addresses():
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            pass
    return peer


def rate_limit(request: HttpRequest, scope: str, limit: int, global_limit: int) -> None:
    limiter.check(scope, client_address(request), limit, global_limit)
