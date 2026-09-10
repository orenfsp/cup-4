import { useState } from "react";
import {
  enums,
  type AppealView,
  type Collaboration,
  type Catalog,
  type RoutingSuggestion,
} from "@otklik/contracts";
import { api } from "../../shared/api";
import { useResource } from "../../shared/useResource";
import { Participants } from "../../shared/Participants";
import { Problem } from "../../shared/AppealUI";

export function OperatorActions({
  appeal,
  catalog,
  changed,
}: {
  appeal: AppealView;
  catalog: Catalog;
  changed: (appeal?: AppealView) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(appeal.category);
  const [priority, setPriority] = useState(appeal.priority);
  const queued = ["new", "returned"].includes(appeal.status);
  const active = !["completed", "rejected", "closed_no_response"].includes(
    appeal.status,
  );
  const collaboration = useResource<Collaboration>(
    `/api/staff/appeals/${appeal.id}/collaboration/`,
    5000,
  );
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ appeal: AppealView }>(
        `/api/staff/appeals/${appeal.id}/actions/`,
        {
          action,
          expected_version: appeal.version,
          ...(reason.trim() ? { reason } : {}),
          ...extra,
        },
      );
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
    <section className="operator-actions">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Решение принимает оператор</p>
          <h3>Обработка обращения</h3>
        </div>
        <span className={`operator-state ${queued ? "queued" : "active"}`}>
          {queued ? "Нужно распределить" : "В работе у команды"}
        </span>
      </div>
      {appeal.is_crisis && <CrisisRoute id={appeal.id} />}
      <div className="operator-attention">
        {collaboration.data?.requests?.map((r) => (
          <article key={r.id} className="attention-card">
            <p className="preserve">
              <strong>
                {r.action === "request_coexecutor"
                  ? "Запрос соисполнителя"
                  : "Пересмотр приоритета"}
                :
              </strong>{" "}
              {r.reason}
            </p>
          </article>
        ))}
        {collaboration.data?.complaints?.length ? (
          <article className="attention-card complaint-card">
            <strong>Жалобы заявителя</strong>
            {collaboration.data.complaints.map((item) => (
              <p key={item.id} className="preserve">
                {item.text}
              </p>
            ))}
          </article>
        ) : null}
        {collaboration.data?.transfers
          ?.filter((item) => item.status === "pending")
          .map((item) => (
            <article className="attention-card transfer-card" key={item.id}>
              <strong>Запрос передачи</strong>
              <p className="preserve">{item.reason}</p>
              <button
                disabled={busy}
                onClick={() =>
                  void act("approve_transfer", {
                    transfer_id: item.id,
                    reason: "Подтверждено оператором",
                  })
                }
              >
                Подтвердить передачу
              </button>
            </article>
          ))}
      </div>
      {Boolean(collaboration.error) && (
        <Problem error={collaboration.error} retry={collaboration.reload} />
      )}
      {Boolean(error) && <Problem error={error} />}

      <div className="operator-console">
        <div className="operator-main">
          <section className="operator-context">
            <strong>Граница доступа</strong>
            <p>
              Дальнейшая переписка со специалистом скрыта. Причины возврата и
              служебные запросы доступны отдельно.
            </p>
          </section>
          {active && (
            <section className="decision-panel">
              <p className="eyebrow">Основание решения</p>
              <h3>Параметры обращения</h3>
              <label>
                Причина изменения или публичное объяснение
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Зафиксируйте основание решения"
                />
              </label>
              <p className="muted">
                При отклонении или самостоятельном закрытии этот текст увидит
                заявитель.
              </p>
              <div className="decision-fields">
                {queued && (
                  <div className="decision-field">
                    <label>
                      Категория обращения
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {catalog.categories.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={
                        busy || category === appeal.category || !reason.trim()
                      }
                      onClick={() => void act("set_category", { category })}
                    >
                      Сохранить категорию
                    </button>
                  </div>
                )}
                <div className="decision-field">
                  <label>
                    Приоритет обращения
                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(e.target.value as typeof priority)
                      }
                    >
                      {Object.entries(enums.priorities).map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={
                      busy || priority === appeal.priority || !reason.trim()
                    }
                    onClick={() => void act("set_priority", { priority })}
                  >
                    Сохранить приоритет
                  </button>
                </div>
              </div>
              <div className="terminal-actions">
                {queued ? (
                  <>
                    <button
                      disabled={busy || !reason.trim()}
                      onClick={() => void act("reject")}
                    >
                      Отклонить с объяснением
                    </button>
                    <button
                      disabled={busy || !reason.trim()}
                      onClick={() => void act("resolve")}
                    >
                      Ответить и закрыть
                    </button>
                  </>
                ) : (
                  <button
                    disabled={busy || !reason.trim()}
                    onClick={() => void act("requeue")}
                  >
                    Вернуть в очередь с причиной
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        <aside
          className="operator-sidebar"
          aria-label="Распределение обращения"
        >
          <Routing
            key={`${appeal.id}-${appeal.category}-${appeal.status}`}
            appeal={appeal}
            catalog={catalog}
            busy={busy || (!queued && !reason.trim())}
            assign={(expert_id) => void act("assign", { expert_id })}
            addCoexecutor={(expert_id) =>
              void act("add_coexecutor", { expert_id })
            }
          />
          <div className="operator-participants">
            <Participants data={collaboration.data} />
          </div>
          <EventHistory key={appeal.version} id={appeal.id} />
        </aside>
      </div>
    </section>
  );
}
function Routing({
  appeal,
  catalog,
  busy,
  assign,
  addCoexecutor,
}: {
  appeal: AppealView;
  catalog: Catalog;
  busy: boolean;
  assign: (id: number) => void;
  addCoexecutor: (id: number) => void;
}) {
  const resource = useResource<RoutingSuggestion>(
    `/api/staff/appeals/${appeal.id}/routing/`,
    5000,
  );
  const [selected, setSelected] = useState<number>();
  const data = resource.data;
  const choice = selected ?? data?.suggested_expert_id ?? undefined;
  const available = data?.experts.some((u) => u.id === choice && u.available);
  return (
    <section className="routing-panel">
      <p className="eyebrow">Рекомендация системы</p>
      <h3>Назначение специалиста</h3>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      {!data ? (
        <p>Загружаем подсказку…</p>
      ) : (
        <>
          <p>
            {data.suggested_category
              ? `По тексту возможна категория «${catalog.categories.find((c) => c.slug === data.suggested_category)?.name ?? data.suggested_category}». Изменение подтвердите отдельно.`
              : "Категорию определяет оператор."}
          </p>
          <p>Разрешённые группы: {data.groups.join(", ") || "не заданы"}.</p>
          {data.state !== "available" && (
            <p>
              {data.state === "no_expert"
                ? "Подходящего специалиста пока нет. Обращение остаётся в очереди; настройку группы нужно обсудить с администратором."
                : "Все подходящие специалисты загружены. Обращение остаётся в очереди."}
            </p>
          )}
          <label>
            Ответственный специалист
            <select
              disabled={busy}
              value={choice ?? ""}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              <option value="" disabled>
                Выбрать специалиста
              </option>
              {data.experts.map((u) => (
                <option key={u.id} value={u.id} disabled={!u.available}>
                  {u.username} · {u.load}/{u.limit}
                </option>
              ))}
            </select>
          </label>
          {selected !== undefined && !available && (
            <p>Выбранный специалист сейчас недоступен. Выберите другого.</p>
          )}
          {["new", "returned"].includes(appeal.status) && (
            <button
              className="primary"
              disabled={busy || !choice || !available}
              onClick={() => choice && assign(choice)}
            >
              Назначить специалиста
            </button>
          )}
          {!["new", "returned"].includes(appeal.status) && (
            <div className="actions">
              {data.experts
                .filter((u) => u.id !== appeal.responsible_id && u.available)
                .map((u) => (
                  <button
                    key={u.id}
                    disabled={busy}
                    onClick={() => addCoexecutor(u.id)}
                  >
                    Добавить соисполнителя: {u.username}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      <button onClick={resource.reload}>Обновить подсказку</button>
    </section>
  );
}
function EventHistory({ id }: { id: string }) {
  const resource = useResource<{
    events: {
      action: string;
      from_status: string;
      to_status: string;
      reason?: string;
      created_at: string;
    }[];
  }>(`/api/staff/appeals/${id}/events/`);
  const actions: Record<string, string> = {
    create: "Создание",
    assign: "Назначение",
    start: "Начало работы",
    ask: "Уточнение",
    reply: "Ответ заявителя",
    append: "Сообщение заявителя",
    recommend: "Рекомендации",
    helped: "Помощь подтверждена",
    not_helped: "Возврат заявителя",
    rate: "Оценка",
    set_priority: "Изменение приоритета",
    set_category: "Изменение категории",
    requeue: "Возврат в очередь",
    reject: "Отклонение",
    resolve: "Закрытие оператором",
    admin_assign: "Служебное назначение",
  };
  return (
    <details>
      <summary>Журнал действий (последние 100)</summary>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      <ol>
        {resource.data?.events.map((e, i) => (
          <li key={i}>
            {actions[e.action] ?? "Служебное событие"}
            {e.reason && <p className="preserve">{e.reason}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function CrisisRoute({ id }: { id: string }) {
  const resource = useResource<{ contact: string | null }>(
    `/api/staff/appeals/${id}/crisis-contact/`,
  );
  return (
    <section className="notice" aria-label="Кризисный маршрут">
      <h3>Кризисный маршрут</h3>
      <ol>
        <li>Оцените исходный рассказ и время ожидания вне общей очереди.</li>
        <li>
          При непосредственной опасности организуйте обращение в экстренную
          помощь по согласованному порядку. Используйте добровольный контакт,
          только если это безопасно для заявителя.
        </li>
        <li>
          Выберите приоритет вручную и назначьте доступного профильного
          специалиста. Проверьте, что работа началась; при задержке
          перераспределите обращение.
        </li>
      </ol>
      <h4>Добровольный контакт</h4>
      {resource.error ? (
        <Problem error={resource.error} retry={resource.reload} />
      ) : !resource.data ? (
        <p>Загружаем контакт…</p>
      ) : (
        <p className="preserve">
          {resource.data.contact ??
            "Заявитель не оставил контакт. Продолжайте помощь в сервисе."}
        </p>
      )}
    </section>
  );
}
