import { useEffect, useState } from "react";
import type {
  AppealView,
  Collaboration,
  RoutingSuggestion,
  StaffIdentity,
} from "@otklik/contracts";
import { api } from "../../shared/api";
import { Chat } from "../../shared/Chat";
import { Problem } from "../../shared/AppealUI";
import { Participants } from "../../shared/Participants";
import { useResource } from "../../shared/useResource";
export function ExpertActions({
  appeal,
  user,
  changed,
}: {
  appeal: AppealView;
  user: StaffIdentity;
  changed: (appeal?: AppealView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<number>();
  const base = `/api/staff/appeals/${appeal.id}/`;
  const collaboration = useResource<Collaboration>(
    base + "collaboration/",
    15000,
  );
  const routing = useResource<RoutingSuggestion>(base + "routing/", 15000);
  const active = [
    "assigned",
    "in_progress",
    "needs_info",
    "answer_ready",
  ].includes(appeal.status);
  const lease = collaboration.data?.lease;
  const owns =
    lease?.staff_id === user.id && Date.parse(lease.expires_at) > Date.now();
  useEffect(() => {
    if (!active) return;
    const ping = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await api(base + "actions/", {
          action: "presence",
          expected_version: appeal.version,
        });
        if (owns)
          await api(base + "actions/", {
            action: "heartbeat",
            expected_version: appeal.version,
          });
      } catch (cause) {
        setError(cause);
      }
    };
    void ping();
    const timer = window.setInterval(() => void ping(), 30000);
    return () => window.clearInterval(timer);
  }, [base, active, owns, appeal.version]);
  const action = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ appeal: AppealView }>(base + "actions/", {
        expected_version: appeal.version,
        ...payload,
      });
      if (payload.action === "add_note") setNote("");
      if (String(payload.action).startsWith("request_")) setReason("");
      changed(result.appeal);
      collaboration.reload();
    } catch (cause) {
      setError(cause);
      changed();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Participants data={collaboration.data} />
      {Boolean(collaboration.error) && (
        <Problem error={collaboration.error} retry={collaboration.reload} />
      )}
      {active && (
        <section className="notice">
          <p>
            {owns
              ? "Вы можете отправлять ответы."
              : lease
                ? "Ответ готовит другой специалист. Чтение доступно; отправка временно заблокирована."
                : "Отправка свободна. Подключитесь к работе, чтобы ответить."}
          </p>
          {appeal.status === "assigned" && appeal.responsible_id === user.id ? (
            <button
              disabled={busy}
              onClick={() => void action({ action: "start" })}
            >
              Взять в работу
            </button>
          ) : (
            <button
              disabled={busy || Boolean(lease && !owns)}
              onClick={() =>
                void action({ action: owns ? "release_lease" : "claim_lease" })
              }
            >
              {owns ? "Освободить отправку" : "Подключиться к работе"}
            </button>
          )}
        </section>
      )}
      <section className="internal-notes">
        <h3>Внутренние заметки</h3>
        <p>
          Только для участников-специалистов. Заявителю и оператору недоступны.
        </p>
        {collaboration.data?.notes?.length === 0 && <p>Заметок пока нет.</p>}
        {collaboration.data?.notes?.map((n) => (
          <p className="preserve" key={n.id}>
            {n.text}
          </p>
        ))}
        {active && (
          <>
            <label>
              Внутренняя заметка
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={5000}
              />
            </label>
            <button
              disabled={busy || !owns || !note.trim()}
              onClick={() => void action({ action: "add_note", text: note })}
            >
              Сохранить заметку
            </button>
          </>
        )}
      </section>
      {active && (
        <section className="notice">
          <h3>Запрос оператору</h3>
          <label>
            Причина запроса
            <textarea
              placeholder="Почему нужен другой специалист"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
            />
          </label>
          {Boolean(routing.error) && (
            <Problem error={routing.error} retry={routing.reload} />
          )}
          <label>
            Передать запрос специалисту
            <select
              value={target ?? ""}
              onChange={(e) => setTarget(Number(e.target.value))}
            >
              <option value="" disabled>
                Выбрать специалиста
              </option>
              {routing.data?.experts
                .filter((e) => e.id !== user.id)
                .map((e) => (
                  <option key={e.id} value={e.id} disabled={!e.available}>
                    {e.username} · {e.load}/{e.limit}
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={busy || !owns || !reason.trim() || !target}
            onClick={() =>
              void action({
                action: "request_transfer",
                expert_id: target,
                reason,
              })
            }
          >
            Передать запрос оператору
          </button>
          <button
            disabled={busy || !reason.trim()}
            onClick={() =>
              void action({ action: "request_coexecutor", reason })
            }
          >
            Запросить соисполнителя
          </button>
          <button
            disabled={busy || !reason.trim()}
            onClick={() => void action({ action: "request_priority", reason })}
          >
            Запросить пересмотр приоритета
          </button>
        </section>
      )}
      {Boolean(error) && <Problem error={error} />}
      <Chat appeal={appeal} staff changed={changed} writingAllowed={owns} />
    </>
  );
}
