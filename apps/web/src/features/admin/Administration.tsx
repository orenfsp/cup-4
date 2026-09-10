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

export function Administration() {
  const resource = useResource<Configuration>("/api/staff/configuration/");
  if (resource.error)
    return <Problem error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p role="status">Загружаем настройки…</p>;
  return (
    <>
      <RoutingAlerts />
      <Editor config={resource.data} saved={resource.update} />
      <AdminAppeals config={resource.data} />
      <h2>Журнал настроек</h2>
      {resource.data.events.length === 0 && <p>Изменений пока нет.</p>}
      <ol>
        {resource.data.events.map((e) => (
          <li key={e.version}>
            {e.resource} · {e.target} · версия {e.version} · {e.reason}
          </li>
        ))}
      </ol>
    </>
  );
}
function Editor({
  config,
  saved,
}: {
  config: Configuration;
  saved: (data: Configuration) => void;
}) {
  const [resource, setResource] =
    useState<ConfigurationChange["resource"]>("category");
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({
    slug: "",
    name: "",
    is_active: true,
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const defaults = (r: typeof resource): Record<string, unknown> =>
    r === "category"
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
  const options =
    resource === "category"
      ? config.categories.map((c) => ({
          id: c.slug,
          label: c.name,
          data: { ...c },
        }))
      : resource === "group"
        ? config.groups.map((g) => ({
            id: String(g.id),
            label: g.name,
            data: { ...g },
          }))
        : resource === "rule"
          ? config.rules.map((r) => ({
              id: String(r.id),
              label: `${r.category_id} → ${config.groups.find((g) => g.id === r.group_id)?.name} · ${enums.applicantTypes[r.applicant_type]}`,
              data: { ...r },
            }))
          : resource === "staff"
            ? config.users.map((u) => ({
                id: String(u.id),
                label: u.username,
                data: { ...u },
              }))
            : [];
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
  return (
    <section>
      <h2>Управление настройками</h2>
      <label>
        Раздел
        <select
          aria-label="Раздел"
          value={resource}
          onChange={(e) => {
            const r = e.target.value as typeof resource;
            setResource(r);
            setSelected("");
            setData(defaults(r));
            setMessage("");
            setError(undefined);
          }}
        >
          <option value="category">Категории</option>
          <option value="group">Группы</option>
          <option value="rule">Правила маршрутизации</option>
          <option value="staff">Сотрудники</option>
          <option value="limits">Лимиты и ожидание</option>
        </select>
      </label>
      {resource !== "limits" && (
        <label>
          Запись
          <select
            aria-label="Запись"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setData(
                options.find((v) => v.id === e.target.value)?.data ??
                  defaults(resource),
              );
              setMessage("");
            }}
          >
            <option value="">Создать новую</option>
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <form
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
              <p>Код категории: {String(data.slug)}</p>
            ) : (
              field("slug", "Код категории")
            )}
            {field("name", "Название категории")}
          </>
        )}
        {resource === "group" && (
          <>
            {field("name", "Название группы")}
            <fieldset>
              <legend>Специалисты группы</legend>
              {config.users
                .filter((u) => u.role === "expert" && u.is_active)
                .map((u) => (
                  <label key={u.id}>
                    <input
                      type="checkbox"
                      checked={((data.members as number[]) ?? []).includes(
                        u.id,
                      )}
                      onChange={(e) =>
                        setData({
                          ...data,
                          members: e.target.checked
                            ? [...((data.members as number[]) ?? []), u.id]
                            : ((data.members as number[]) ?? []).filter(
                                (id) => id !== u.id,
                              ),
                        })
                      }
                    />
                    {u.username}
                  </label>
                ))}
            </fieldset>
          </>
        )}
        {resource === "rule" && (
          <>
            {select(
              "category_id",
              "Категория правила",
              config.categories.map((c) => ({ id: c.slug, label: c.name })),
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
            {field("max_active_appeals", "Лимит активных обращений", "number")}
            <p>
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
            <p>Новые пороги применяются также к существующим обращениям.</p>
          </>
        )}
        {resource !== "limits" && (
          <label>
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
        <label>
          Причина изменения настроек
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={2000}
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
    </section>
  );
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
  const appeal = resource.data?.appeals.find((a) => a.id === selected);
  return (
    <section>
      <h2>Служебное вмешательство</h2>
      <p>Только метаданные. Закрытие обращений недоступно.</p>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      {!resource.data && !resource.error && <p>Загружаем обращения…</p>}
      {resource.data?.appeals.length === 0 && <p>Активных обращений нет.</p>}
      <label>
        Обращение для вмешательства
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Выберите обращение</option>
          {resource.data?.appeals.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id.slice(0, 8)} · {a.category} ·{" "}
              {enums.appealStatuses[a.status]}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button
          disabled={offset === 0}
          onClick={() => {
            setSelected("");
            setOffset(Math.max(0, offset - 50));
          }}
        >
          Предыдущие
        </button>
        <button
          disabled={!resource.data?.has_more}
          onClick={() => {
            setSelected("");
            setOffset(offset + 50);
          }}
        >
          Следующие
        </button>
      </div>
      {appeal && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
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
            } catch (cause) {
              setError(cause);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Служебное действие
            <select value={action} onChange={(e) => setAction(e.target.value)}>
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
          <label>
            Причина служебного действия
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={2000}
            />
          </label>
          <button disabled={busy}>Применить служебное действие</button>
        </form>
      )}
      {Boolean(error) && <Problem error={error} />}
      {appeal && (
        <AdminHistory key={`${appeal.id}-${appeal.version}`} id={appeal.id} />
      )}
    </section>
  );
}
function AdminHistory({ id }: { id: string }) {
  const history = useResource<{
    events: { version: number; action: string; reason?: string }[];
  }>(`/api/staff/appeals/${id}/events/`);
  return (
    <>
      <h3>Журнал обращения</h3>
      {Boolean(history.error) && (
        <Problem error={history.error} retry={history.reload} />
      )}
      {!history.data && !history.error && <p>Загружаем журнал…</p>}
      {history.data?.events.length === 0 && <p>Событий пока нет.</p>}
      <ol>
        {history.data?.events.map((e) => (
          <li key={e.version}>
            {e.action} · {e.reason ?? "Служебное событие без доступной причины"}
          </li>
        ))}
      </ol>
    </>
  );
}
