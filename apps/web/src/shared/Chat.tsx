import { useState } from "react";
import type { AppealView, ChatMessage } from "@otklik/contracts";
import { api } from "./api";
import { useResource } from "./useResource";
import { date, Problem } from "./AppealUI";

type Messages = { messages: ChatMessage[]; has_more: boolean };
export function Chat({
  appeal,
  staff = false,
  changed,
  writingAllowed = true,
}: {
  appeal: AppealView;
  staff?: boolean;
  writingAllowed?: boolean;
  changed: (appeal?: AppealView) => void;
}) {
  const base = `/api/${staff ? "staff" : "applicant"}/appeals/${appeal.id}/`;
  const resource = useResource<Messages>(base + "messages/", 5000);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState<boolean>();
  const [text, setText] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const young = !staff && appeal.applicant_type === "student";
  const send = async (action: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ appeal: AppealView }>(base + "actions/", {
        action,
        expected_version: appeal.version,
        text,
      });
      setText("");
      resource.reload();
      changed(result.appeal);
    } catch (cause) {
      setError(cause);
      changed();
    } finally {
      setBusy(false);
    }
  };
  const all = [...older, ...(resource.data?.messages ?? [])]
    .filter(
      (item, index, list) => list.findIndex((x) => x.id === item.id) === index,
    )
    .sort((a, b) => a.id - b.id);
  const active = !["completed", "rejected", "closed_no_response"].includes(
    appeal.status,
  );
  const canSend = staff
    ? ["in_progress", "needs_info"].includes(appeal.status)
    : active;
  return (
    <section className="chat">
      <h3>Переписка со специалистом</h3>
      <p className="muted">
        {staff
          ? "Эти сообщения видит заявитель. Оператор их не читает."
          : "Эти сообщения видят только специалисты, которые участвуют в обращении. Оператор их не читает."}
      </p>
      {!resource.data && !resource.error && (
        <p role="status">Загружаем сообщения…</p>
      )}
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} young={young} />
      )}
      {(more ?? resource.data?.has_more) && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api<Messages>(
                base + `messages/?before=${all[0].id}`,
              );
              setOlder([...result.messages, ...all]);
              setMore(result.has_more);
            } catch (cause) {
              setError(cause);
            } finally {
              setBusy(false);
            }
          }}
        >
          Ранние сообщения
        </button>
      )}
      {resource.data && all.length === 0 && (
        <p className="empty">
          Сообщений пока нет. Здесь появится ответ специалиста.
        </p>
      )}
      <ol className="messages">
        {all.map((m) => (
          <li key={m.id} className={m.author_role}>
            <strong>
              {m.author_role === "expert"
                ? "Специалист"
                : young
                  ? "Ты"
                  : "Заявитель"}
              {m.kind === "recommend"
                ? " · Рекомендации"
                : m.kind === "ask"
                  ? " · Вопрос"
                  : ""}
            </strong>
            <p className="preserve">{m.text}</p>
            <time dateTime={m.created_at}>{date(m.created_at)}</time>
          </li>
        ))}
      </ol>
      {canSend && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(
              staff
                ? "ask"
                : appeal.status === "needs_info"
                  ? "reply"
                  : "append",
            );
          }}
        >
          <label htmlFor="message">
            {staff
              ? "Вопрос или рекомендации заявителю"
              : young
                ? "Твоё сообщение"
                : "Ваше сообщение"}
          </label>
          <textarea
            id="message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={10000}
            required
            rows={4}
          />
          <div className="actions">
            <button
              className="primary"
              disabled={
                busy ||
                !writingAllowed ||
                !text.trim() ||
                (staff && appeal.status !== "in_progress")
              }
            >
              {busy
                ? "Отправляем…"
                : staff
                  ? "Задать вопрос"
                  : "Отправить сообщение"}
            </button>
            {staff && (
              <button
                type="button"
                disabled={busy || !text.trim() || !writingAllowed}
                onClick={() => void send("recommend")}
              >
                Отправить рекомендации
              </button>
            )}
          </div>
        </form>
      )}
      {Boolean(error) && <Problem error={error} young={young} />}
    </section>
  );
}
