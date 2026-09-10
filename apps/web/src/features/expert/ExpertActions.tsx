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
    5000,
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
    <div className="expert-console">
      <div className="expert-main">
        {active && (
          <section className={`expert-access ${owns ? "is-owned" : ""}`}>
            <div>
              <p className="eyebrow">Режим работы</p>
              <strong>
                {owns
                  ? "Можно отвечать заявителю"
                  : lease
                    ? "Ответ готовит другой специалист"
                    : "Подключитесь, чтобы отвечать"}
              </strong>
              <p>
                {owns
                  ? "Отправка закреплена за вами, пока вы работаете в карточке."
                  : lease
                    ? "Чтение доступно. Отправка временно заблокирована."
                    : "Сейчас отправка свободна."}
              </p>
            </div>
            {appeal.status === "assigned" &&
            appeal.responsible_id === user.id ? (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void action({ action: "start" })}
              >
                Взять в работу
              </button>
            ) : (
              <button
                className={owns ? "secondary" : "primary"}
                disabled={busy || Boolean(lease && !owns)}
                onClick={() =>
                  void action({
                    action: owns ? "release_lease" : "claim_lease",
                  })
                }
              >
                {owns ? "Освободить отправку" : "Подключиться к работе"}
              </button>
            )}
          </section>
        )}
        {Boolean(error) && <Problem error={error} />}
        <Chat appeal={appeal} staff changed={changed} writingAllowed={owns} />
      </div>

      <aside
        className="expert-sidebar"
        aria-label="Рабочие инструменты эксперта"
      >
        <div className="expert-participants">
          <Participants data={collaboration.data} />
          {Boolean(collaboration.error) && (
            <Problem error={collaboration.error} retry={collaboration.reload} />
          )}
        </div>

        <section className="internal-notes expert-tool">
          <p className="eyebrow">Только для команды</p>
          <h3>Внутренние заметки</h3>
          <p className="muted">Заявитель и оператор не увидят эти записи.</p>
          <div className="note-list">
            {collaboration.data?.notes?.length === 0 && (
              <p className="empty">Заметок пока нет.</p>
            )}
            {collaboration.data?.notes?.map((n) => (
              <p className="preserve note-item" key={n.id}>
                {n.text}
              </p>
            ))}
          </div>
          {active && (
            <>
              <label>
                Внутренняя заметка
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={5000}
                  rows={3}
                  placeholder="Наблюдение для других специалистов"
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
          <section className="expert-tool operator-request">
            <p className="eyebrow">Нужно решение оператора</p>
            <h3>Запрос по обращению</h3>
            <label>
              Причина запроса
              <textarea
                placeholder="Коротко объясните, что требуется"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                rows={3}
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
            <div className="request-actions">
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
                onClick={() =>
                  void action({ action: "request_priority", reason })
                }
              >
                Запросить пересмотр приоритета
              </button>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
