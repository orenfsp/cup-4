"""Single transition registry. HTTP never accepts an arbitrary target status."""

from dataclasses import dataclass

from infrastructure.http import APIError

ACTIVE = frozenset({"assigned", "in_progress", "needs_info", "answer_ready"})
QUEUED = frozenset({"new", "returned"})
NONTERMINAL = ACTIVE | QUEUED
TERMINAL = frozenset({"completed", "rejected", "closed_no_response"})


@dataclass(frozen=True)
class Transition:
    sources: frozenset[str]
    roles: frozenset[str]
    target: str | None
    reason: bool = False
    enabled: bool = True


TRANSITIONS = {
    "assign": Transition(QUEUED, frozenset({"operator"}), "assigned"),
    "start": Transition(frozenset({"assigned"}), frozenset({"expert"}), "in_progress"),
    "reject": Transition(QUEUED, frozenset({"operator"}), "rejected", reason=True),
    "resolve": Transition(QUEUED, frozenset({"operator"}), "completed", reason=True),
    "requeue": Transition(ACTIVE, frozenset({"operator", "admin"}), "returned", reason=True),
    "admin_assign": Transition(NONTERMINAL, frozenset({"admin"}), "assigned", reason=True),
    "set_priority": Transition(NONTERMINAL, frozenset({"operator", "admin"}), None, reason=True),
    "set_category": Transition(QUEUED, frozenset({"operator"}), None, reason=True),
    "append": Transition(NONTERMINAL, frozenset({"applicant"}), None),
    "rate": Transition(frozenset({"completed"}), frozenset({"applicant"}), None),
    "ask": Transition(frozenset({"in_progress"}), frozenset({"expert"}), "needs_info"),
    "reply": Transition(frozenset({"needs_info"}), frozenset({"applicant"}), "in_progress"),
    "recommend": Transition(
        frozenset({"in_progress", "needs_info"}),
        frozenset({"expert"}),
        "answer_ready",
    ),
    "helped": Transition(frozenset({"answer_ready"}), frozenset({"applicant"}), "completed"),
    "not_helped": Transition(
        frozenset({"answer_ready"}),
        frozenset({"applicant"}),
        "returned",
        reason=True,
    ),
    "transfer": Transition(ACTIVE, frozenset({"operator"}), "assigned", reason=True, enabled=False),
    "expire": Transition(
        frozenset({"needs_info", "answer_ready"}),
        frozenset({"system"}),
        "closed_no_response",
        enabled=True,
    ),
    "add_note": Transition(NONTERMINAL, frozenset({"expert"}), None),
    "request_transfer": Transition(ACTIVE, frozenset({"expert"}), None, reason=True),
    "add_coexecutor": Transition(ACTIVE, frozenset({"operator"}), None, reason=True),
    "approve_transfer": Transition(ACTIVE, frozenset({"operator"}), "assigned", reason=True),
    "complaint": Transition(NONTERMINAL | TERMINAL, frozenset({"applicant"}), None, reason=True),
    "presence": Transition(ACTIVE, frozenset({"expert"}), None),
    "request_coexecutor": Transition(ACTIVE, frozenset({"expert"}), None, reason=True),
    "request_priority": Transition(ACTIVE, frozenset({"expert"}), None, reason=True),
    "heartbeat": Transition(ACTIVE, frozenset({"expert"}), None),
    "claim_lease": Transition(ACTIVE, frozenset({"expert"}), None),
    "release_lease": Transition(ACTIVE, frozenset({"expert"}), None),
}


def transition_for(action: str, status: str, role: str) -> Transition:
    rule = TRANSITIONS.get(action)
    if rule is None:
        raise APIError("invalid_action")
    if role not in rule.roles:
        raise APIError("forbidden", 403)
    if status not in rule.sources:
        raise APIError("invalid_transition", 409)
    if not rule.enabled:
        raise APIError("action_unavailable", 409)
    return rule
