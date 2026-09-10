import { enums, type AppealView, type Catalog } from "@otklik/contracts";
import { errorText } from "./api";

export function Problem({
  error,
  retry,
  young = false,
}: {
  error: unknown;
  retry?: () => void;
  young?: boolean;
}) {
  return (
    <div className="notice" role="alert">
      <p>{errorText(error, young)}</p>
      {retry && <button onClick={retry}>Обновить</button>}
    </div>
  );
}
export function date(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
export function AppealSummary({
  appeal,
  catalog,
  young = false,
  staff = false,
}: {
  appeal: AppealView;
  catalog: Catalog;
  young?: boolean;
  staff?: boolean;
}) {
  const explanations: Record<string, string> = {
    new: young
      ? "Мы получили твоё обращение. Оно ждёт оператора."
      : "Мы получили ваше обращение. Оно ждёт оператора.",
    assigned: "Обращение передано специалисту.",
    in_progress: "Специалист разбирается в ситуации.",
    needs_info: young
      ? "Специалист задал вопрос — посмотри сообщения ниже."
      : "Специалист задал вопрос — посмотрите сообщения ниже.",
    answer_ready: young
      ? "Рекомендации готовы. Ты можешь решить, помогли ли они."
      : "Рекомендации готовы. Вы можете решить, помогли ли они.",
    returned:
      "Обращение вернулось оператору. Он решит, кто продолжит помогать.",
    completed:
      appeal.close_kind === "applicant_confirmed"
        ? "Спасибо за обратную связь. Обращение завершено."
        : "Оператор завершил обращение с объяснением ниже.",
    rejected:
      "Мы рассмотрели ситуацию, но помочь с этим в рамках сервиса не сможем. Объяснение ниже.",
    closed_no_response: young
      ? "Обращение закрыто. Ты можешь написать снова."
      : "Обращение закрыто. Вы можете написать снова.",
  };
  return (
    <>
      <p className="status-pill">{enums.appealStatuses[appeal.status]}</p>
      <p>{explanations[appeal.status]}</p>
      <details>
        <summary>Все возможные статусы</summary>
        <ul>
          {Object.entries(enums.appealStatuses).map(([key, label]) => (
            <li key={key}>
              <strong>{label}.</strong> {explanations[key]}
            </li>
          ))}
        </ul>
      </details>
      <p className="muted">
        {catalog.categories.find((c) => c.slug === appeal.category)?.name ??
          appeal.category}{" "}
        · {date(appeal.created_at)}
      </p>
      {appeal.original_text !== undefined && (
        <section className="original">
          <h3>Исходное обращение</h3>
          <p className="preserve">{appeal.original_text}</p>
          {catalog.questions
            .filter((q) => appeal.original_answers?.[q.id])
            .map((q) => (
              <p key={q.id}>
                <strong>{q.label}</strong>{" "}
                {q.options[appeal.original_answers![q.id]]}
              </p>
            ))}
        </section>
      )}
      {appeal.attachments && appeal.attachments.length > 0 && (
        <section>
          <h3>Вложения</h3>
          <ul>
            {appeal.attachments.map((file, i) => (
              <li key={file.id}>
                <a
                  href={`/api/${staff ? "staff" : "applicant"}/attachments/${file.id}/`}
                  download
                >
                  Скачать изображение {i + 1}
                </a>{" "}
                · {Math.ceil(file.size / 1024)} КБ
              </li>
            ))}
          </ul>
        </section>
      )}
      {appeal.return_reason && (
        <div className="notice">
          <strong>Причина возврата</strong>
          <p className="preserve">{appeal.return_reason}</p>
        </div>
      )}
      {appeal.public_resolution && (
        <div className="notice">
          <strong>Объяснение оператора</strong>
          <p className="preserve">{appeal.public_resolution}</p>
        </div>
      )}
    </>
  );
}
