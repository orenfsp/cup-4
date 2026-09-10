import crisisRules from "../crisis.rules.json";
import enums from "../enums.json";
export { enums };
export type ApplicantType = keyof typeof enums.applicantTypes;
export type EntryPath = keyof typeof enums.entryPaths;
export type AppealStatus = keyof typeof enums.appealStatuses;
export type Priority = keyof typeof enums.priorities;
export type StaffRole = keyof typeof enums.staffRoles;
export type HealthResponse = { status: "ok" | "unavailable" };

export function parseHealth(value: unknown): HealthResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("status" in value) ||
    Object.keys(value).length !== 1 ||
    (value.status !== "ok" && value.status !== "unavailable")
  ) {
    throw new Error("Unexpected health response");
  }
  return { status: value.status };
}

export type CreateAppealRequest = {
  applicant_type: ApplicantType;
  entry_path: EntryPath;
  original_text: string;
  category?: string;
  answers?: Record<string, string>;
};
export type AppealMetadata = {
  id: string;
  applicant_type: ApplicantType;
  entry_path: EntryPath;
  category: string;
  status: AppealStatus;
  priority: Priority;
  version: number;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  closed_at: string | null;
  close_kind: string;
  return_count: number;
  return_limit: number;
  expires_at: string | null;
};
export type ApplicantAppeal = AppealMetadata & {
  original_text: string;
  public_resolution: string;
  specialist_role: string | null;
};
export type StaffAppealMetadata = AppealMetadata & {
  is_crisis: boolean;
  responsible_id: number | null;
};
export type StaffAppealContent = StaffAppealMetadata & {
  original_text: string;
  public_resolution: string;
};
export type CreateAppealResponse = {
  appeal: ApplicantAppeal;
  /** One-time delivery only; never present in later reads or URLs. */
  access_code: string;
  csrf_token: string;
};
export type ExchangeCodeRequest = { code: string };
export type ExchangeCodeResponse = {
  appeal: ApplicantAppeal;
  csrf_token: string;
};
export type StaffLoginRequest = { username: string; password: string };
export type StaffIdentity = { id: number; username: string; role: StaffRole };
export type StaffLoginResponse = { user: StaffIdentity; csrf_token: string };
export type StaffActionRequest = { expected_version: number } & (
  | { action: "assign"; expert_id: number; reason?: string }
  | { action: "admin_assign"; expert_id: number; reason: string }
  | { action: "start"; reason?: string }
  | { action: "requeue" | "resolve" | "reject"; reason: string }
  | { action: "set_priority"; priority: Priority; reason: string }
);
export type AppealEventMetadata = {
  action: string;
  from_status: AppealStatus | "";
  to_status: AppealStatus;
  version: number;
  created_at: string;
};
export type APIErrorCode =
  | "text_required"
  | "rating_required"
  | "authentication_required"
  | "invalid_credentials"
  | "invalid_code"
  | "csrf_failed"
  | "forbidden"
  | "not_found"
  | "try_later"
  | "json_required"
  | "invalid_request"
  | "request_too_large"
  | "invalid_category"
  | "category_required"
  | "invalid_action"
  | "invalid_transition"
  | "action_unavailable"
  | "version_conflict"
  | "reason_required"
  | "expert_required"
  | "priority_required"
  | "no_change"
  | "expert_unavailable"
  | "expert_not_allowed"
  | "expert_at_capacity"
  | "try_again"
  | "service_unavailable"
  | "return_limit"
  | "work_lease_required"
  | "work_lease_busy"
  | "different_profile_required";
export type APIErrorResponse = { error: { code: APIErrorCode } };

export type Question = {
  id: string;
  label: string;
  options: Record<string, string>;
};
export type Catalog = {
  categories: { slug: string; name: string }[];
  questions: Question[];
};
export type AppealView = AppealMetadata & {
  original_text?: string;
  original_answers?: Record<string, string>;
  public_resolution?: string;
  return_reason?: string | null;
  specialist_role?: string | null;
  is_crisis?: boolean;
  overdue?: boolean;
  responsible_id?: number | null;
  feedback?: { helped: boolean; rating: number | null; comment: string } | null;
  attachments?: { id: string; content_type: string; size: number }[];
};
export type ChatMessage = {
  id: number;
  author_role: "applicant" | "expert";
  kind: "ask" | "reply" | "append" | "recommend";
  text: string;
  created_at: string;
};
export type RoutingSuggestion = {
  experts: {
    id: number;
    username: string;
    load: number;
    limit: number;
    available: boolean;
  }[];
  groups: string[];
  suggested_expert_id: number | null;
  suggested_category: string | null;
  state: "available" | "overloaded" | "no_expert";
};
export type ConversationAction = { expected_version: number } & (
  | { action: "ask" | "recommend" | "reply" | "append"; text: string }
  | { action: "helped"; rating?: number; comment?: string }
  | { action: "not_helped"; reason: string; rating?: number; comment?: string }
  | { action: "rate"; rating: number; comment?: string }
  | { action: "set_category"; category: string; reason: string }
);

export type Collaboration = {
  participants: {
    id: number;
    name: string;
    role: string;
    joined_at: string;
    revoked_at: string | null;
    present: boolean;
  }[];
  lease: { staff_id: number; expires_at: string } | null;
  transfers: {
    id: number;
    target_staff_id: number;
    reason: string;
    status: string;
    created_at: string;
  }[];
  notes?: { id: number; text: string; created_at: string }[];
  complaints?: { id: number; text: string; status: string }[];
  requests?: { id: number; action: string; reason: string }[];
};

export type CollaborationAction = { expected_version: number } & (
  | { action: "presence" | "claim_lease" | "heartbeat" | "release_lease" }
  | { action: "add_note"; text: string }
  | {
      action: "request_transfer" | "add_coexecutor";
      expert_id: number;
      reason: string;
    }
  | { action: "approve_transfer"; transfer_id: number; reason: string }
  | {
      action: "request_coexecutor" | "request_priority" | "complaint";
      reason: string;
    }
);

export type Configuration = {
  version: number;
  limits: {
    return_limit: number;
    operator_wait_hours: number;
    expert_wait_hours: number;
    auto_close_days: number;
  };
  categories: { slug: string; name: string; is_active: boolean }[];
  groups: { id: number; name: string; is_active: boolean; members: number[] }[];
  rules: {
    id: number;
    category_id: string;
    group_id: number;
    applicant_type: ApplicantType;
    is_active: boolean;
  }[];
  users: {
    id: number;
    username: string;
    role: StaffRole;
    is_active: boolean;
    max_active_appeals: number;
  }[];
  events: {
    version: number;
    resource: string;
    target: string;
    actor_id: number;
    reason: string;
    created_at: string;
  }[];
};
export type ConfigurationChange = {
  resource: "category" | "group" | "rule" | "staff" | "limits";
  expected_version: number;
  reason: string;
  data: Record<string, unknown>;
};
export type AnalyticsReport = {
  from: string;
  to: string;
  scope: "all" | "own";
  total: number;
  distributions: Record<string, Record<string, number>>;
  times: Record<
    string,
    { mean_seconds: number | null; n: number; missing: number; invalid: number }
  >;
  urgent: { count: number; ratio: number | null };
  returned: { count: number; ratio: number | null };
  workload: {
    staff_id: number;
    username: string;
    role: StaffRole;
    active_count: number;
    limit: number | null;
  }[];
};

export function hasCrisisSigns(text: string, safety = ""): boolean {
  const normalize = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/\s+/gu, " ")
      .trim();
  const normalized = normalize(text);
  return (
    crisisRules.phrases.some((phrase) =>
      normalized.includes(normalize(phrase)),
    ) || crisisRules.answers.safety.includes(safety)
  );
}
