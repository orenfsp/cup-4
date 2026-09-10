import { useState } from "react";
import {
  hasCrisisSigns,
  type ApplicantType,
  type AppealView,
  type Catalog,
  type CreateAppealResponse,
  type EntryPath,
} from "@otklik/contracts";
import { api, RequestError } from "../../shared/api";
import { useResource } from "../../shared/useResource";
import { AppealSummary, Problem } from "../../shared/AppealUI";
import { Chat } from "../../shared/Chat";

export function ApplicantFlow({
  type,
  mode,
}: {
  type: ApplicantType;
  mode: "start" | "return";
}) {
  const catalog = useResource<Catalog>("/api/catalog/");
  const help = useResource<{
    approved: boolean;
    contacts: { label: string; phone: string; availability: string }[];
  }>("/api/crisis/contacts/");
  const [entry, setEntry] = useState<EntryPath>();
  const [category, setCategory] = useState("unknown");
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState("");
  const [appeal, setAppeal] = useState<AppealView>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [contact, setContact] = useState("");
  const crisis = hasCrisisSigns(text, answers.safety);
  const young = type === "student";
  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (
        files.length > 5 ||
        files.reduce((sum, f) => sum + f.size, 0) > 10_000_000
      )
        throw new RequestError("attachment_too_large", 413);
      const form = new FormData();
      const payload = {
        applicant_type: type,
        entry_path: entry,
        category: entry === "story" ? "unknown" : category,
        original_text: text,
        answers,
        ...(crisis && contact.trim()
          ? { crisis_contact: { consent: true, value: contact.trim() } }
          : {}),
      };
      if (files.length) {
        form.append("payload", JSON.stringify(payload));
        files.forEach((file) => form.append("attachments", file));
      }
      const result = await api<CreateAppealResponse>(
        "/api/applicant/appeals/",
        files.length ? form : payload,
      );
      setAppeal(result.appeal);
      setIssued(result.access_code);
      setText("");
      setAnswers({});
      setContact("");
      setFiles([]);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  const enter = async (current = false) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ appeal: AppealView }>(
        current ? "/api/applicant/current/" : "/api/applicant/session/",
        current ? undefined : { code },
      );
      setAppeal(result.appeal);
      setCode("");
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  if (appeal && catalog.data)
    return (
      <ApplicantCase
        id={appeal.id}
        catalog={catalog.data}
        issued={issued}
        initialType={appeal.applicant_type}
        close={() => {
          setAppeal(undefined);
          setIssued("");
        }}
      />
    );
  return (
    <section className="preview">
      {Boolean(catalog.error) && (
        <Problem error={catalog.error} retry={catalog.reload} young={young} />
      )}
      {!catalog.data && !catalog.error && (
        <p role="status">Загружаем варианты…</p>
      )}
      {mode === "return" ? (
        <>
          <h2>Вернуться к своему обращению</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enter();
            }}
          >
            <label htmlFor="access-code">Секретный код</label>
            <input
              id="access-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              required
            />
            <button className="primary" disabled={busy || !code.trim()}>
              {busy ? "Открываем…" : "Открыть обращение"}
            </button>
          </form>
          <button disabled={busy} onClick={() => void enter(true)}>
            Продолжить открытую сессию
          </button>
          <p>
            Код не восстанавливается. Если он потерян, можно создать новое
            обращение.
          </p>
        </>
      ) : (
        <>
          <h2>Начать можно по-разному</h2>
          <div className="path-options">
            <button
              aria-pressed={entry === "category"}
              onClick={() => setEntry("category")}
            >
              Выбрать ситуацию
            </button>
            <button
              aria-pressed={entry === "story"}
              onClick={() => {
                setEntry("story");
                setCategory("unknown");
              }}
            >
              Рассказать своими словами
            </button>
          </div>
          {entry && catalog.data && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              {entry === "category" && (
                <div className="category-options">
                  <h3>Какая ситуация ближе?</h3>
                  {catalog.data.categories.map((c) => (
                    <button
                      type="button"
                      key={c.slug}
                      aria-pressed={category === c.slug}
                      onClick={() => {
                        setCategory(c.slug);
                        if (c.slug === "unknown") setEntry("story");
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <label htmlFor="story">
                {young
                  ? "Расскажи, что происходит"
                  : "Расскажите, что происходит"}
              </label>
              <textarea
                id="story"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={10000}
                rows={6}
                required
              />
              <p className="muted">
                Имя, школа и телефон не нужны.{" "}
                {young
                  ? "Можно написать так, как тебе удобно."
                  : "Можно написать так, как вам удобно."}
              </p>
              <details>
                <summary>Уточняющие вопросы — можно пропустить все</summary>
                {catalog.data.questions.map((q) => (
                  <label key={q.id}>
                    {q.label}
                    <select
                      value={answers[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((old) => {
                          const next = { ...old };
                          if (e.target.value) next[q.id] = e.target.value;
                          else delete next[q.id];
                          return next;
                        })
                      }
                    >
                      <option value="">Пропустить</option>
                      {Object.entries(q.options).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </details>
              {crisis && (
                <aside className="help-panel" aria-live="polite">
                  <h3>
                    {young
                      ? "Похоже, тебе может быть нужна срочная помощь"
                      : "Похоже, вам может быть нужна срочная помощь"}
                  </h3>
                  <p>
                    Рассказ можно продолжить и отправить. Если опасность рядом,
                    {young ? "обратись" : "обратитесь"} за помощью прямо сейчас.
                  </p>
                  {help.data?.approved && (
                    <ul>
                      {help.data.contacts.map((item) => (
                        <li key={item.phone}>
                          <strong>{item.label}</strong>: {item.phone} —{" "}
                          {item.availability}
                        </li>
                      ))}
                    </ul>
                  )}
                  {Boolean(help.error) && (
                    <p className="muted">
                      Не удалось загрузить список контактов. Можно продолжить
                      рассказ и отправить обращение.
                    </p>
                  )}
                  {!help.data && !help.error && (
                    <p>Загружаем контакты помощи…</p>
                  )}
                  {Boolean(help.error) && (
                    <button type="button" onClick={help.reload}>
                      Повторить загрузку контактов
                    </button>
                  )}
                  <p>
                    Способ связи увидит только оператор при обработке кризисного
                    обращения. Эксперт и администратор его не получат. Это
                    добровольно: отказ не мешает отправке.
                  </p>
                  <label>
                    Оставить способ связи оператору (необязательно)
                    <input
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      maxLength={250}
                      placeholder="например, безопасный способ связаться"
                    />
                  </label>
                  <button type="button" onClick={() => setContact("")}>
                    Продолжить без контакта
                  </button>
                </aside>
              )}
              <label>
                Файлы (до 5, общий размер до 10 МБ)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              <p aria-live="polite">
                Выбрано файлов: {files.length}.{" "}
                {files.length > 5 ||
                files.reduce((sum, f) => sum + f.size, 0) > 10_000_000
                  ? "Нужно выбрать до пяти файлов общим размером до 10 МБ."
                  : ""}
              </p>
              <p className="muted">
                Сервер удалит метаданные изображения. Это не скрывает имена и
                текст на самом скриншоте.
              </p>
              <button className="primary" disabled={busy || !text.trim()}>
                {busy ? "Отправляем…" : "Отправить обращение"}
              </button>
            </form>
          )}
        </>
      )}
      {Boolean(error) && <Problem error={error} young={young} />}
    </section>
  );
}

function CodeCard({ code, young }: { code: string; young: boolean }) {
  const [notice, setNotice] = useState("");
  return (
    <section className="code-card">
      <h2>{young ? "Сохрани секретный код" : "Сохраните секретный код"}</h2>
      <p>
        Он нужен для возвращения. Восстановить код нельзя. Другой человек с
        кодом сможет открыть обращение.
      </p>
      <output className="secret-code">{code}</output>
      <div className="actions">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setNotice("Код скопирован.");
            } catch {
              setNotice(
                young
                  ? "Не удалось скопировать. Выдели код или сохрани файл."
                  : "Не удалось скопировать. Выделите код или сохраните файл.",
              );
            }
          }}
        >
          Скопировать
        </button>
        <button
          onClick={() => {
            const blob = new Blob(
              [
                `Отклик\n${location.origin}/\nСекретный код: ${code}\nВосстановить код нельзя. Храните файл на своём устройстве.\n`,
              ],
              { type: "text/plain;charset=utf-8" },
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "otklik-code.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setNotice("Файл с кодом подготовлен.");
          }}
        >
          Сохранить
        </button>
      </div>
      <p role="status">{notice}</p>
      <p>
        Для возвращения можно добавить главную страницу в закладки. При закрытом
        сайте уведомлений нет.
      </p>
    </section>
  );
}

function ApplicantCase({
  id,
  catalog,
  issued,
  initialType,
  close,
}: {
  id: string;
  catalog: Catalog;
  issued: string;
  initialType: ApplicantType;
  close: () => void;
}) {
  const resource = useResource<{ appeal: AppealView }>(
    `/api/applicant/appeals/${id}/`,
    5000,
  );
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const changed = (updated?: AppealView) => {
    if (updated) resource.update({ appeal: updated });
    resource.reload();
  };
  const appeal = resource.data?.appeal;
  const young = (appeal?.applicant_type ?? initialType) === "student";
  if (!appeal)
    return (
      <section className="preview">
        {issued && <CodeCard code={issued} young={young} />}
        {resource.error ? (
          <>
            <Problem error={resource.error} retry={resource.reload} />
            <button onClick={close}>Вернуться к входу</button>
          </>
        ) : (
          <p role="status">Открываем обращение…</p>
        )}
      </section>
    );
  return (
    <section className="workspace">
      {issued && <CodeCard code={issued} young={young} />}
      <h2>{young ? "Твоё обращение" : "Ваше обращение"}</h2>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} young={young} />
      )}
      <AppealSummary appeal={appeal} catalog={catalog} young={young} />
      <Chat appeal={appeal} changed={changed} />
      <FeedbackForm key={appeal.status} appeal={appeal} changed={changed} />
      {appeal.feedback?.rating && (
        <p>
          Оценка сохранена: {appeal.feedback.rating} из 5. Спасибо за обратную
          связь.
        </p>
      )}
      {Boolean(error) && <Problem error={error} young={young} />}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/api/applicant/logout/", {});
            close();
          } catch (cause) {
            setError(cause);
          } finally {
            setBusy(false);
          }
        }}
      >
        Выйти из обращения
      </button>
      <p className="muted">
        {young
          ? "Перед выходом сохрани код. Чтобы написать снова, выйди и выбери «Рассказать о ситуации»."
          : "Перед выходом сохраните код. Чтобы написать снова, выйдите и выберите «Рассказать о ситуации»."}
      </p>
    </section>
  );
}

function FeedbackForm({
  appeal,
  changed,
}: {
  appeal: AppealView;
  changed: (appeal?: AppealView) => void;
}) {
  const [returning, setReturning] = useState(false);
  const [complaining, setComplaining] = useState(false);
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const young = appeal.applicant_type === "student";
  const canRate =
    appeal.status === "answer_ready" ||
    (appeal.status === "completed" &&
      appeal.close_kind === "applicant_confirmed" &&
      appeal.feedback?.rating == null);
  const send = async (action: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ appeal: AppealView }>(
        `/api/applicant/appeals/${appeal.id}/actions/`,
        {
          action,
          expected_version: appeal.version,
          ...(action === "not_helped" || action === "complaint"
            ? { reason }
            : {}),
          ...(action !== "complaint" && rating
            ? { rating: Number(rating) }
            : {}),
          ...(action === "complaint" ? {} : { comment }),
        },
      );
      changed(result.appeal);
    } catch (cause) {
      setError(cause);
      changed();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="feedback">
      {canRate && (
        <>
          <h3>
            {appeal.status === "completed"
              ? "Оценить помощь"
              : "Помогли ли рекомендации?"}
          </h3>
          <label>
            Оценка помощи (необязательно)
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">Без оценки</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} из 5
                </option>
              ))}
            </select>
          </label>
          <label>
            Комментарий к оценке (необязательно)
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
            />
          </label>
        </>
      )}
      {appeal.return_count >= appeal.return_limit && (
        <p>
          Доступные возвраты ({appeal.return_limit}) уже использованы. Можно
          отправить жалобу оператору, подтвердить результат или создать новое
          обращение после выхода.
        </p>
      )}
      {appeal.expires_at && (
        <p>
          Если ответа не будет, обращение закроется{" "}
          {new Date(appeal.expires_at).toLocaleDateString("ru-RU")}. Можно
          вернуться по коду или написать снова.
        </p>
      )}
      {returning && (
        <>
          <label>
            {young
              ? "Расскажи, чего не хватило"
              : "Расскажите, чего не хватило"}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              required
            />
          </label>
          <p>
            Эту причину увидят оператор и специалист, которому он назначит
            доработку. Обращение сначала вернётся оператору.
          </p>
        </>
      )}
      {complaining && (
        <label>
          {young
            ? "Опиши, что нужно проверить"
            : "Опишите, что нужно проверить"}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            required
          />
        </label>
      )}
      <div className="actions">
        {canRate &&
          (appeal.status === "completed" ? (
            <button
              disabled={busy || !rating}
              onClick={() => void send("rate")}
            >
              Сохранить оценку
            </button>
          ) : (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void send("helped")}
              >
                Это помогло
              </button>
              <button
                disabled={
                  busy ||
                  appeal.return_count >= appeal.return_limit ||
                  (returning && !reason.trim())
                }
                onClick={() => {
                  if (returning) void send("not_helped");
                  else setReturning(true);
                }}
              >
                {returning ? "Вернуть оператору" : "Это не помогло"}
              </button>
            </>
          ))}
        <button
          type="button"
          disabled={busy || (complaining && !reason.trim())}
          onClick={() => {
            if (complaining) void send("complaint");
            else setComplaining(true);
          }}
        >
          {complaining
            ? "Отправить жалобу оператору"
            : "Пожаловаться на работу специалиста"}
        </button>
      </div>
      {Boolean(error) && <Problem error={error} young={young} />}
    </section>
  );
}
