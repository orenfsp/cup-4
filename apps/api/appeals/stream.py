"""Bounded, process-local fanout of committed, role-visible state changes."""

import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from uuid import UUID

from asgiref.sync import sync_to_async
from django.db import connections
from django.http import HttpRequest, HttpResponse, StreamingHttpResponse
from infrastructure.http import APIError, error_response
from infrastructure.tokens import session_digest
from otklik_contracts import STREAM_EVENTS
from staff.sessions import require_staff

from appeals.policies import Actor, visible_appeals
from appeals.serializers import appeal_data
from appeals.views import applicant_actor

POLL_SECONDS = 0.5
MAX_STREAMS = 100
MAX_PER_SESSION = 5
CHANGED = "event: " + STREAM_EVENTS["changed"] + "\ndata: {}\n\n"
REVOKED = "event: " + STREAM_EVENTS["revoked"] + "\ndata: {}\n\n"
RETRY = "event: " + STREAM_EVENTS["retry"] + "\ndata: {}\n\n"


def snapshot(request: HttpRequest, appeal_id: UUID) -> str:
    actor = (
        applicant_actor(request)
        if request.path.startswith("/api/applicant/")
        else Actor.staff(require_staff(request))
    )
    if actor.role not in {"applicant", "expert"}:
        raise APIError("forbidden", 403)
    appeal = visible_appeals(actor).filter(pk=appeal_id).first()
    if appeal is None:
        raise APIError("not_found", 404)
    data = appeal_data(appeal, actor)
    # Internal notes/complaints advance the domain version, but are not chat signals.
    data.pop("version", None)
    data.pop("updated_at", None)
    # A private applicant complaint also extends their activity deadline.
    # Do not notify experts about that otherwise invisible action.
    if actor.role == "expert":
        data.pop("expires_at", None)
        # These changes are visible to experts and advance the version needed
        # by their actions. Presence/lease heartbeats deliberately stay out.
        data["participants"] = list(
            appeal.participants.order_by("pk").values_list("staff_id", "role", "revoked_at")
        )
        data["participants"] = [
            (staff_id, role, revoked_at.isoformat() if revoked_at else None)
            for staff_id, role, revoked_at in data["participants"]
        ]
        data["note"] = appeal.internal_notes.order_by("-pk").values_list("pk", flat=True).first()
        data["transfers"] = list(
            appeal.transfer_requests.order_by("pk").values_list("pk", "status")
        )
    data["message"] = appeal.messages.order_by("-pk").values_list("pk", flat=True).first()
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


@dataclass(eq=False)
class Subscription:
    request: HttpRequest
    appeal_id: UUID
    key: str
    previous: str = ""
    queue: asyncio.Queue[str] = field(default_factory=lambda: asyncio.Queue(maxsize=1))


def snapshots(items: list[Subscription]) -> list[str | None]:
    try:
        results: list[str | None] = []
        for item in items:
            try:
                results.append(snapshot(item.request, item.appeal_id))
            except APIError:
                results.append(None)
        return results
    finally:
        # One short-lived connection per shared batch, never one per open stream.
        connections.close_all()


def authorize(request: HttpRequest, appeal_id: UUID) -> None:
    try:
        snapshot(request, appeal_id)
    finally:
        connections.close_all()


class Hub:
    def __init__(self) -> None:
        self.items: set[Subscription] = set()
        self.task: asyncio.Task[None] | None = None

    def add(self, item: Subscription) -> None:
        if (
            len(self.items) >= MAX_STREAMS
            or sum(other.key == item.key for other in self.items) >= MAX_PER_SESSION
        ):
            raise APIError("rate_limited", 429)
        self.items.add(item)
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self.run())

    def remove(self, item: Subscription) -> None:
        self.items.discard(item)
        if not self.items and self.task:
            self.task.cancel()
            self.task = None

    async def run(self) -> None:
        while self.items:
            items = list(self.items)
            try:
                results = await sync_to_async(snapshots, thread_sensitive=False)(items)
            except Exception:
                # No exception text: DB errors can carry private values.
                for item in items:
                    self.offer(item, RETRY)
                await asyncio.sleep(2)
                continue
            for item, current in zip(items, results, strict=True):
                if item not in self.items:
                    continue
                if current is None:
                    self.offer(item, REVOKED)
                    self.items.discard(item)
                elif current != item.previous:
                    item.previous = current
                    self.offer(item, CHANGED)
            await asyncio.sleep(POLL_SECONDS)

    @staticmethod
    def offer(item: Subscription, event: str) -> None:
        if item.queue.full():
            item.queue.get_nowait()
        item.queue.put_nowait(event)


hub = Hub()


class StreamResponse(StreamingHttpResponse):
    """Release the reservation even if the client leaves before iteration starts."""

    def __init__(self, iterator: AsyncIterator[str], owner: Hub, item: Subscription) -> None:
        super().__init__(
            iterator,
            content_type="text/event-stream",
            headers={"Cache-Control": "no-store, private", "X-Accel-Buffering": "no"},
        )
        self.owner = owner
        self.item = item
        self.loop = asyncio.get_running_loop()

    def close(self) -> None:
        if not self.loop.is_closed():
            self.loop.call_soon_threadsafe(self.owner.remove, self.item)
        super().close()


async def stream(request: HttpRequest, appeal_id: UUID) -> HttpResponse | StreamingHttpResponse:
    if request.method != "GET":
        return HttpResponse(status=405, headers={"Allow": "GET"})
    cookie = "otklik_appeal" if request.path.startswith("/api/applicant/") else "otklik_staff"
    item = Subscription(request, appeal_id, session_digest(request.COOKIES.get(cookie, "")))
    try:
        await sync_to_async(authorize, thread_sensitive=False)(request, appeal_id)
        hub.add(item)
    except APIError as error:
        response = error_response(error)
        if response.status_code == 429:
            response["Retry-After"] = "10"
        return response

    async def events() -> AsyncIterator[str]:
        try:
            while True:
                try:
                    event = await asyncio.wait_for(item.queue.get(), timeout=10)
                except TimeoutError:
                    event = ": keepalive\n\n"
                yield event
                if event in {REVOKED, RETRY}:
                    return
        finally:
            hub.remove(item)

    return StreamResponse(events(), hub, item)
