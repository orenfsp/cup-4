import { parseHealth } from "@otklik/contracts";

export async function checkReadiness(signal: AbortSignal): Promise<boolean> {
  const response = await fetch("/api/ready/", { signal, cache: "no-store" });
  const payload: unknown = await response.json();
  return response.ok && parseHealth(payload).status === "ok";
}

export class RequestError extends Error {
  constructor(
    public code: string,
    public status: number,
    public retryAfter = 0,
  ) {
    super(code);
  }
}

export async function api<T>(
  path: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let headers: Record<string, string> = {};
  if (data !== undefined) {
    const csrf = await api<{ csrf_token: string }>(
      "/api/csrf/",
      undefined,
      signal,
    );
    headers = { "X-CSRFToken": csrf.csrf_token };
    if (!(data instanceof FormData))
      headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    headers,
    body:
      data === undefined
        ? undefined
        : data instanceof FormData
          ? data
          : JSON.stringify(data),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new RequestError("service_unavailable", response.status);
  const value = (await response.json()) as T & { error?: { code?: string } };
  if (!response.ok)
    throw new RequestError(
      value.error?.code ?? "service_unavailable",
      response.status,
      Number(response.headers.get("Retry-After") ?? 0),
    );
  return value;
}

export function errorText(error: unknown, young = false): string {
  const retry = young ? "Попробуй" : "Попробуйте";
  if (error instanceof RequestError) {
    if (error.status === 429)
      return `Сейчас нужна небольшая пауза. ${retry} через ${error.retryAfter || 60} с.`;
    if (error.code === "attachment_too_large")
      return young
        ? "Выбери до пяти изображений общим размером до 10 МБ."
        : "Выберите до пяти изображений общим размером до 10 МБ.";
    if (error.code === "attachment_invalid")
      return "Не удалось прочитать изображение. Подойдут JPEG, PNG или WebP до 20 миллионов пикселей.";
    if (error.code === "active_assignments")
      return "Сначала перераспределите активные обращения этого специалиста.";
    if (error.code === "configuration_conflict")
      return "Такая запись уже существует. Обновите настройки.";
    if (error.code === "unknown_required")
      return "Категорию «Не знаю, как это назвать» нельзя отключить или переименовать.";
    if (error.code === "report_too_large")
      return "Слишком много обращений. Выберите более короткий период.";
    if (error.code === "password_required")
      return "Укажите пароль нового сотрудника.";
    if (error.code === "weak_password")
      return "Укажите пароль длиной не менее 12 символов.";
    if (error.code === "keep_admin")
      return "Нельзя заблокировать или понизить собственную административную учётную запись.";
    if (error.code === "invalid_code")
      return young
        ? "Код не подошёл. Проверь символы и попробуй ещё раз."
        : "Код не подошёл. Проверьте символы и попробуйте ещё раз.";
    if (error.code === "invalid_credentials")
      return "Не удалось войти. Проверьте логин и пароль.";
    if (error.code === "different_profile_required")
      return "Выберите соисполнителя другого профиля.";
    if (error.code === "work_lease_busy")
      return "Ответ готовит другой специалист. Дождитесь освобождения отправки.";
    if (error.code === "work_lease_required")
      return "Подключитесь к работе, чтобы отправить ответ. Написанный текст сохранён.";
    if (error.code === "return_limit")
      return "Достигнут лимит возвратов. Можно отправить жалобу оператору или создать новое обращение.";
    if (error.code === "version_conflict")
      return `Обращение обновилось. ${retry} ещё раз после обновления карточки. Написанный текст сохранён в поле.`;
    if (error.status === 401)
      return young
        ? "Сессия закончилась. Вернись по своему коду."
        : "Сессия закончилась. Войдите снова.";
    if (error.status === 403 || error.status === 404)
      return "Доступ к этому действию или обращению закрыт.";
    if (error.code === "expert_at_capacity")
      return "У специалиста больше нет свободного места. Обновите подсказку и выберите другого.";
    if (
      error.code === "expert_not_allowed" ||
      error.code === "expert_unavailable"
    )
      return "Этот специалист сейчас не подходит. Обновите подсказку.";
    if (error.status === 400)
      return young
        ? "Проверь заполненные поля — кажется, чего-то не хватает."
        : "Проверьте заполненные поля — кажется, чего-то не хватает.";
    if (error.status === 409)
      return `Действие уже выполнено или недоступно в текущем статусе. ${young ? "Обнови" : "Обновите"} карточку.`;
  }
  return `Сейчас не удалось связаться с сервисом. ${retry} ещё раз. После отправки можно попробовать продолжить открытую сессию.`;
}
