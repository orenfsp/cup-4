import { useState } from "react";
import {
  enums,
  type AppealView,
  type Configuration,
  type ConfigurationChange,
} from "@otklik/contracts";
import { api } from "../../shared/api";
import { useResource } from "../../shared/useResource";
import { Problem } from "../../shared/AppealUI";
import { RoutingAlerts } from "../../shared/RoutingAlerts";

type ConfigResource = ConfigurationChange["resource"];

const NAV = [
  { id: "admin-settings", label: "Настройки" },
  { id: "admin-intervention", label: "Служебное вмешательство" },
  { id: "admin-journal", label: "Журнал настроек" },
] as const;

const LIST_PAGE_SIZE = 8;
const INTERVENTION_PAGE_SIZE = 10;

function usePagedItems<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = items.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );
  return {
    page: safePage,
    totalPages,
    slice,
    setPage,
    reset: () => setPage(0),
  };
}

function ListPager({
  page,
  totalPages,
  onChange,
  label,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="admin-pager" aria-label={label}>
      <button
        type="button"
        className="secondary"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Назад
      </button>
      <span>
        Страница {page + 1} из {totalPages}
      </span>
      <button
        type="button"
        className="secondary"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        Вперёд
      </button>
    </div>
  );
}

function HintTip({ text }: { text: string }) {
  return (
    <span className="hint-tip">
      <button
        type="button"
        className="hint-tip-mark"
        aria-label={text}
        title={text}
      >
        ?
      </button>
      <span className="hint-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

export function Administration() {
  const resource = useResource<Configuration>("/api/staff/configuration/");
  const [activeNav, setActiveNav] =
    useState<(typeof NAV)[number]["id"]>("admin-settings");
  if (resource.error)
    return <Problem error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p role="status">Загружаем настройки…</p>;
  const go = (id: (typeof NAV)[number]["id"]) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  return (
    <div className="admin-console">
      <RoutingAlerts />
      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Разделы администрирования">
          <p className="eyebrow">Кабинет администратора</p>
          <h2>Разделы</h2>
          <ul className="admin-nav-list">
            {NAV.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    activeNav === item.id
                      ? "admin-nav-item active"
                      : "admin-nav-item"
                  }
                  aria-current={activeNav === item.id ? "true" : undefined}
                  onClick={() => go(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="admin-nav-hint">
            Сотрудники, категории, группы, правила и лимиты — во вкладке
            настроек. Аналитика открывается отдельной кнопкой выше.
          </p>
        </nav>
        <div className="admin-work">
          <Editor config={resource.data} saved={resource.update} />
          <AdminAppeals config={resource.data} />
          <ConfigJournal events={resource.data.events} />
        </div>
      </div>
    </div>
  );
}

function ConfigJournal({ events }: { events: Configuration["events"] }) {
  return (
    <section
      className="admin-panel"
      id="admin-journal"
      aria-labelledby="admin-journal-title"
    >
      <div className="admin-panel-head">
        <div>
          <p className="eyebrow">Аудит</p>
          <h2 id="admin-journal-title">Журнал настроек</h2>
        </div>
        <p className="admin-panel-note">Показаны последние доступные записи</p>
      </div>
      {events.length === 0 ? (
        <p className="empty">Изменений пока нет.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption>События изменения конфигурации</caption>
            <thead>
              <tr>
                <th>Ресурс</th>
                <th>Цель</th>
                <th>Версия</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.version}>
                  <td>{e.resource}</td>
                  <td>{e.target}</td>
                  <td>{e.version}</td>
                  <td>{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Editor({
  config,
  saved,
}: {
  config: Configuration;
  saved: (data: Configuration) => void;
}) {
  const [resource, setResource] = useState<ConfigResource>("category");
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<Record<string, unknown>>(() =>
    defaults("category", config),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const options =
    resource === "category"
      ? config.categories.map((c) => ({
          id: c.slug,
          label: c.name,
          data: { ...c },
          meta: c.is_active ? "Активна" : "Неактивна",
        }))
      : resource === "group"
        ? config.groups.map((g) => ({
            id: String(g.id),
            label: g.name,
            data: { ...g },
            meta: `${g.members.length} спец. · ${g.is_active ? "активна" : "неактивна"}`,
          }))
        : resource === "rule"
          ? config.rules.map((r) => ({
              id: String(r.id),
              label: `${r.category_id} → ${config.groups.find((g) => g.id === r.group_id)?.name} · ${enums.applicantTypes[r.applicant_type]}`,
              data: { ...r },
              meta: r.is_active ? "Активно" : "Выключено",
            }))
          : resource === "staff"
            ? config.users.map((u) => ({
                id: String(u.id),
                label: u.username,
                data: { ...u },
                meta: `${enums.staffRoles[u.role]} · лимит ${u.max_active_appeals}${u.is_active ? "" : " · отключён"}`,
              }))
            : [];
  const titles: Record<ConfigResource, string> = {
    category: "Категории",
    group: "Группы специалистов",
    rule: "Правила маршрутизации",
    staff: "Сотрудники и роли",
    limits: "Лимиты и сроки",
  };
  const tabs: { id: ConfigResource; label: string }[] = [
    { id: "staff", label: "Сотрудники" },
    { id: "category", label: "Категории" },
    { id: "group", label: "Группы" },
    { id: "rule", label: "Правила" },
    { id: "limits", label: "Лимиты" },
  ];
  const switchResource = (next: ConfigResource) => {
    setResource(next);
    setSelected("");
    setData(defaults(next, config));
    setMessage("");
    setError(undefined);
  };
  const field = (key: string, label: string, type = "text") => (
    <label key={key}>
      {label}
      <input
        type={type}
        value={String(data[key] ?? "")}
        onChange={(e) =>
          setData({
            ...data,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
        required={type !== "password" || !selected}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
    </label>
  );
  const select = (
    key: string,
    label: string,
    values: { id: string | number; label: string }[],
    numeric = false,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={String(data[key] ?? "")}
        onChange={(e) =>
          setData({
            ...data,
            [key]: numeric ? Number(e.target.value) : e.target.value,
          })
        }
      >
        {values.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
  const pickRecord = (id: string) => {
    setSelected(id);
    setData(
      options.find((v) => v.id === id)?.data ?? defaults(resource, config),
    );
    setMessage("");
  };
  const listPager = usePagedItems(
    options as {
      id: string;
      label: string;
      data: Record<string, unknown>;
      meta: string;
    }[],
    LIST_PAGE_SIZE,
  );
  const switchAndReset = (next: ConfigResource) => {
    switchResource(next);
    listPager.reset();
  };
  return (
    <section
      className="admin-panel"
      id="admin-settings"
      aria-labelledby="admin-settings-title"
    >
      <div className="admin-panel-head">
        <div>
          <p className="eyebrow">Справочники и политики</p>
          <h2 id="admin-settings-title">Управление настройками</h2>
        </div>
        <p className="admin-panel-note">
          Версия конфигурации: <strong>{config.version}</strong>
        </p>
      </div>
      <div className="admin-tabs" role="tablist" aria-label="Тип настройки">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={resource === tab.id}
            className={resource === tab.id ? "admin-tab active" : "admin-tab"}
            onClick={() => switchAndReset(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <label className="admin-section-select">
        Раздел
        <select
          aria-label="Раздел"
          value={resource}
          onChange={(e) => switchAndReset(e.target.value as ConfigResource)}
        >
          <option value="category">Категории</option>
          <option value="group">Группы</option>
          <option value="rule">Правила маршрутизации</option>
          <option value="staff">Сотрудники</option>
          <option value="limits">Лимиты и ожидание</option>
        </select>
      </label>
      <div className="admin-settings-layout">
        {resource !== "limits" && (
          <div className="admin-list-card">
            <div className="admin-list-head">
              <h3>{titles[resource]}</h3>
              <button
                type="button"
                className="secondary"
                onClick={() => pickRecord("")}
              >
                Создать новую
              </button>
            </div>
            <label>
              Запись
              <select
                aria-label="Запись"
                value={selected}
                onChange={(e) => pickRecord(e.target.value)}
              >
                <option value="">Создать новую</option>
                {options.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            {options.length === 0 ? (
              <p className="empty">В этом разделе пока нет записей.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <caption>Список {titles[resource].toLowerCase()}</caption>
                    <thead>
                      <tr>
                        <th>Название</th>
                        <th>Состояние</th>
                        <th>Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listPager.slice.map((v) => (
                        <tr
                          key={v.id}
                          className={
                            selected === v.id ? "is-selected" : undefined
                          }
                        >
                          <td>{v.label}</td>
                          <td>{v.meta}</td>
                          <td>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => pickRecord(v.id)}
                            >
                              Изменить
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPager
                  page={listPager.page}
                  totalPages={listPager.totalPages}
                  onChange={listPager.setPage}
                  label={`Страницы списка: ${titles[resource]}`}
                />
              </>
            )}
          </div>
        )}
        <div className="admin-form-card">
          <div className="admin-form-head">
            <h3>
              {resource === "limits"
                ? "Изменение лимитов"
                : selected
                  ? "Редактирование записи"
                  : "Создание записи"}
            </h3>
            <p>
              {resource === "limits"
                ? "Новые пороги применяются также к существующим обращениям."
                : selected
                  ? "Изменения сохраняются с обязательной причиной."
                  : "Заполните поля и укажите причину создания."}
            </p>
          </div>
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              setMessage("");
              try {
                const values = { ...data };
                if (selected && values.password === "") delete values.password;
                const updated = await api<Configuration>(
                  "/api/staff/configuration/actions/",
                  {
                    resource,
                    expected_version: config.version,
                    reason,
                    data: values,
                  },
                );
                saved(updated);
                setMessage("Изменения сохранены");
                setReason("");
                const target = updated.events[0]?.target;
                if (resource !== "limits" && target) setSelected(target);
                setData({
                  ...values,
                  ...(["staff", "group", "rule"].includes(resource) && target
                    ? { id: Number(target) }
                    : {}),
                  ...(resource === "staff" ? { password: "" } : {}),
                });
              } catch (cause) {
                setError(cause);
              } finally {
                setBusy(false);
              }
            }}
          >
            {resource === "category" && (
              <>
                {selected ? (
                  <p className="admin-readonly">
                    Код категории: {String(data.slug)}
                  </p>
                ) : (
                  field("slug", "Код категории")
                )}
                {field("name", "Название категории")}
              </>
            )}
            {resource === "group" && (
              <>
                {field("name", "Название группы")}
                <fieldset className="admin-fieldset">
                  <legend>Специалисты группы</legend>
                  <div className="admin-check-grid">
                    {config.users
                      .filter((u) => u.role === "expert" && u.is_active)
                      .map((u) => (
                        <label key={u.id}>
                          <input
                            type="checkbox"
                            checked={(
                              (data.members as number[]) ?? []
                            ).includes(u.id)}
                            onChange={(e) =>
                              setData({
                                ...data,
                                members: e.target.checked
                                  ? [
                                      ...((data.members as number[]) ?? []),
                                      u.id,
                                    ]
                                  : ((data.members as number[]) ?? []).filter(
                                      (id) => id !== u.id,
                                    ),
                              })
                            }
                          />
                          {u.username}
                        </label>
                      ))}
                  </div>
                  {config.users.filter(
                    (u) => u.role === "expert" && u.is_active,
                  ).length === 0 && (
                    <p className="empty">
                      Нет активных специалистов для выбора.
                    </p>
                  )}
                </fieldset>
              </>
            )}
            {resource === "rule" && (
              <>
                {select(
                  "category_id",
                  "Категория правила",
                  config.categories.map((c) => ({
                    id: c.slug,
                    label: c.name,
                  })),
                )}
                {select(
                  "group_id",
                  "Группа правила",
                  config.groups.map((g) => ({ id: g.id, label: g.name })),
                  true,
                )}
                {select(
                  "applicant_type",
                  "Тип заявителя",
                  Object.entries(enums.applicantTypes).map(([id, label]) => ({
                    id,
                    label,
                  })),
                )}
              </>
            )}
            {resource === "staff" && (
              <>
                {field("username", "Логин сотрудника")}
                {select(
                  "role",
                  "Роль сотрудника",
                  Object.entries(enums.staffRoles).map(([id, label]) => ({
                    id,
                    label,
                  })),
                )}
                {field(
                  "password",
                  "Новый пароль (не менее 12 символов)",
                  "password",
                )}
                {field(
                  "max_active_appeals",
                  "Лимит активных обращений",
                  "number",
                )}
                <p className="admin-hint">
                  При редактировании пароль можно оставить пустым. Изменение
                  сотрудника отзывает его сессии. Перед блокировкой эксперта
                  перераспределите активные обращения.
                </p>
              </>
            )}
            {resource === "limits" && (
              <>
                {field("return_limit", "Лимит возвратов", "number")}
                {field(
                  "operator_wait_hours",
                  "Ожидание оператора, часов",
                  "number",
                )}
                {field(
                  "expert_wait_hours",
                  "Ожидание специалиста, часов",
                  "number",
                )}
                {field("auto_close_days", "Автозакрытие, суток", "number")}
                <p className="admin-hint">
                  Новые пороги применяются также к существующим обращениям.
                </p>
              </>
            )}
            {resource !== "limits" && (
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={data.is_active === true}
                  onChange={(e) =>
                    setData({ ...data, is_active: e.target.checked })
                  }
                />
                Активно
              </label>
            )}
            <label className="admin-reason">
              <span className="admin-reason-label">
                Причина изменения настроек
                <span className="admin-required" aria-hidden="true">
                  *
                </span>
              </span>
              <span className="admin-reason-note">
                Обязательное поле. Без причины сохранить нельзя.
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={2000}
                aria-required="true"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить настройки"}
            </button>
          </form>
          {Boolean(error) && (
            <Problem
              error={error}
              retry={async () =>
                saved(await api<Configuration>("/api/staff/configuration/"))
              }
            />
          )}
          <p role="status">{message}</p>
        </div>
      </div>
    </section>
  );
}

function defaults(
  r: ConfigResource,
  config: Configuration,
): Record<string, unknown> {
  return r === "category"
    ? { slug: "", name: "", is_active: true }
    : r === "group"
      ? { name: "", members: [], is_active: true }
      : r === "rule"
        ? {
            category_id: config.categories[0]?.slug ?? "unknown",
            group_id: config.groups[0]?.id ?? 0,
            applicant_type: "student",
            is_active: true,
          }
        : r === "staff"
          ? {
              username: "",
              role: "expert",
              password: "",
              is_active: true,
              max_active_appeals: 10,
            }
          : { ...config.limits };
}

function AdminAppeals({ config }: { config: Configuration }) {
  const [offset, setOffset] = useState(0);
  const resource = useResource<{ appeals: AppealView[]; has_more: boolean }>(
    `/api/staff/appeals/?offset=${offset}`,
    5000,
  );
  const [selected, setSelected] = useState("");
  const [action, setAction] = useState("requeue");
  const [reason, setReason] = useState("");
  const [expert, setExpert] = useState("");
  const [priority, setPriority] = useState("standard");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [localPage, setLocalPage] = useState(0);
  const appeals = resource.data?.appeals ?? [];
  const localPages = Math.max(
    1,
    Math.ceil(appeals.length / INTERVENTION_PAGE_SIZE),
  );
  const safeLocalPage = Math.min(localPage, localPages - 1);
  const pageAppeals = appeals.slice(
    safeLocalPage * INTERVENTION_PAGE_SIZE,
    safeLocalPage * INTERVENTION_PAGE_SIZE + INTERVENTION_PAGE_SIZE,
  );
  const appeal = appeals.find((a) => a.id === selected);
  const serverPage = Math.floor(offset / 50) + 1;
  return (
    <section
      className="admin-panel"
      id="admin-intervention"
      aria-labelledby="admin-intervene-title"
    >
      <div className="admin-panel-head">
        <div>
          <p className="eyebrow">Осторожное действие</p>
          <h2 id="admin-intervene-title">Служебное вмешательство</h2>
        </div>
      </div>
      <p className="admin-intervene-lead">
        Доступны только метаданные обращения. Текст, чат, контакты и вложения
        администратору не показываются. Закрытие обращений недоступно.
      </p>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      {!resource.data && !resource.error && (
        <p role="status">Загружаем обращения…</p>
      )}
      {resource.data?.appeals.length === 0 && (
        <p className="empty">Активных обращений нет.</p>
      )}
      <div
        className={
          appeal
            ? "admin-settings-layout"
            : "admin-settings-layout admin-settings-layout-single"
        }
      >
        <div className="admin-list-card admin-queue-card">
          <div className="admin-list-head">
            <h3>Очередь для вмешательства</h3>
            {!appeal && (
              <HintTip text="Выберите обращение в таблице, чтобы выполнить служебное действие." />
            )}
          </div>
          <label>
            Обращение для вмешательства
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setMessage("");
              }}
            >
              <option value="">Выберите обращение</option>
              {appeals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id.slice(0, 8)} · {a.category} ·{" "}
                  {enums.appealStatuses[a.status]}
                </option>
              ))}
            </select>
          </label>
          {appeals.length > 0 && (
            <>
              <div className="table-scroll">
                <table>
                  <caption>Метаданные обращений</caption>
                  <thead>
                    <tr>
                      <th>Номер</th>
                      <th>Категория</th>
                      <th>Статус</th>
                      <th>Приоритет</th>
                      <th>Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageAppeals.map((a) => (
                      <tr
                        key={a.id}
                        className={
                          selected === a.id ? "is-selected" : undefined
                        }
                      >
                        <td>{a.id.slice(0, 8)}</td>
                        <td>{a.category}</td>
                        <td>{enums.appealStatuses[a.status]}</td>
                        <td>{enums.priorities[a.priority]}</td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setSelected(a.id);
                              setMessage("");
                            }}
                          >
                            Выбрать
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                page={safeLocalPage}
                totalPages={localPages}
                onChange={setLocalPage}
                label="Страницы очереди вмешательства"
              />
              <div
                className="admin-pager admin-pager-batch"
                aria-label="Порции очереди"
              >
                <button
                  type="button"
                  className="secondary"
                  disabled={offset === 0}
                  onClick={() => {
                    setSelected("");
                    setLocalPage(0);
                    setOffset(Math.max(0, offset - 50));
                  }}
                >
                  Предыдущие
                </button>
                <span>
                  Порция {serverPage}
                  {resource.data?.has_more ? "+" : ""}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={!resource.data?.has_more}
                  onClick={() => {
                    setSelected("");
                    setLocalPage(0);
                    setOffset(offset + 50);
                  }}
                >
                  Следующие
                </button>
              </div>
            </>
          )}
        </div>
        {appeal && (
          <div className="admin-form-card admin-danger-calm">
            <div className="admin-form-head">
              <h3>Действие по обращению {appeal.id.slice(0, 8)}</h3>
              <p>
                Статус: {enums.appealStatuses[appeal.status]} · приоритет:{" "}
                {enums.priorities[appeal.priority]}
              </p>
            </div>
            <form
              className="admin-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(undefined);
                setMessage("");
                try {
                  await api(`/api/staff/appeals/${appeal.id}/actions/`, {
                    action,
                    expected_version: appeal.version,
                    reason,
                    ...(action === "admin_assign"
                      ? { expert_id: Number(expert) }
                      : action === "set_priority"
                        ? { priority }
                        : {}),
                  });
                  resource.reload();
                  setReason("");
                  setMessage("Служебное действие применено");
                } catch (cause) {
                  setError(cause);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Служебное действие
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  <option value="requeue">Вернуть в очередь</option>
                  <option value="admin_assign">Сменить исполнителя</option>
                  <option value="set_priority">Изменить приоритет</option>
                </select>
              </label>
              {action === "admin_assign" && (
                <label>
                  Новый исполнитель
                  <select
                    value={expert}
                    onChange={(e) => setExpert(e.target.value)}
                    required
                  >
                    <option value="">Выберите специалиста</option>
                    {config.users
                      .filter((u) => u.role === "expert" && u.is_active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {action === "set_priority" && (
                <label>
                  Новый приоритет
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {Object.entries(enums.priorities).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="admin-reason">
                <span className="admin-reason-label">
                  Причина служебного действия
                  <span className="admin-required" aria-hidden="true">
                    *
                  </span>
                </span>
                <span className="admin-reason-note">
                  Причина обязательна и будет записана в журнал.
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  maxLength={2000}
                  aria-required="true"
                />
              </label>
              <button disabled={busy}>
                {busy ? "Применяем…" : "Применить служебное действие"}
              </button>
            </form>
            {Boolean(error) && <Problem error={error} />}
            <p role="status">{message}</p>
            <AdminHistory
              key={`${appeal.id}-${appeal.version}`}
              id={appeal.id}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function AdminHistory({ id }: { id: string }) {
  const history = useResource<{
    events: { version: number; action: string; reason?: string }[];
  }>(`/api/staff/appeals/${id}/events/`);
  return (
    <div className="admin-history">
      <h3>Журнал обращения</h3>
      {Boolean(history.error) && (
        <Problem error={history.error} retry={history.reload} />
      )}
      {!history.data && !history.error && (
        <p role="status">Загружаем журнал…</p>
      )}
      {history.data?.events.length === 0 && (
        <p className="empty">Событий пока нет.</p>
      )}
      {history.data && history.data.events.length > 0 && (
        <ol className="admin-history-list">
          {history.data.events.map((e) => (
            <li key={e.version}>
              {e.action} ·{" "}
              {e.reason ?? "Служебное событие без доступной причины"}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
