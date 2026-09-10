import { useState } from "react";
import {
  enums,
  type AppealView,
  type Catalog,
  type StaffIdentity,
} from "@otklik/contracts";
import { api, RequestError } from "../../shared/api";
import { useResource } from "../../shared/useResource";
import { AppealSummary, date, Problem } from "../../shared/AppealUI";
import { OperatorActions } from "../operator/OperatorActions";
import { Administration } from "../admin/Administration";
import { Analytics } from "../../shared/Analytics";
import { RoutingAlerts } from "../../shared/RoutingAlerts";
import { ExpertActions } from "../expert/ExpertActions";

export function StaffDesk() {
  const session = useResource<{ user: StaffIdentity }>("/api/staff/me/");
  const [user, setUser] = useState<StaffIdentity>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const current = user ?? session.data?.user;
  if (current)
    return (
      <Desk
        user={current}
        logout={async () => {
          await api("/api/staff/logout/", {});
          window.location.hash = "";
        }}
      />
    );
  if (!session.error) return <p role="status">Проверяем вход…</p>;
  if (!(session.error instanceof RequestError) || session.error.status !== 401)
    return <Problem error={session.error} retry={session.reload} />;
  return (
    <section className="workspace narrow">
      <h1>Вход для сотрудников</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const result = await api<{ user: StaffIdentity }>(
              "/api/staff/login/",
              { username, password },
            );
            setUser(result.user);
            setPassword("");
          } catch (cause) {
            setError(cause);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Логин
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={150}
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            maxLength={256}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Входим…" : "Войти"}
        </button>
      </form>
      {Boolean(error) && <Problem error={error} />}
    </section>
  );
}
function Desk({
  user,
  logout,
}: {
  user: StaffIdentity;
  logout: () => Promise<void>;
}) {
  const catalog = useResource<Catalog>("/api/catalog/");
  const [selected, setSelected] = useState<string>();
  const [analytics, setAnalytics] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <section className="workspace">
      <div className="workspace-title">
        <div>
          <p className="eyebrow">{enums.staffRoles[user.role]}</p>
          <h1>
            {user.role === "operator"
              ? "Очередь обращений"
              : user.role === "expert"
                ? "Мои обращения"
                : "Администрирование"}
          </h1>
        </div>
        <button onClick={() => void logout().catch(setError)}>Выйти</button>
      </div>
      {Boolean(error) && <Problem error={error} />}
      {Boolean(catalog.error) && (
        <Problem error={catalog.error} retry={catalog.reload} />
      )}
      <button onClick={() => setAnalytics(!analytics)}>
        {analytics ? "К рабочему месту" : "Открыть аналитику"}
      </button>
      {analytics ? (
        <Analytics />
      ) : user.role === "admin" ? (
        <Administration />
      ) : !catalog.data ? (
        <p role="status">Загружаем справочники…</p>
      ) : selected ? (
        <>
          <button onClick={() => setSelected(undefined)}>← К списку</button>
          <StaffCase
            key={selected}
            id={selected}
            user={user}
            catalog={catalog.data}
          />
        </>
      ) : (
        <>
          {user.role === "operator" && <RoutingAlerts />}
          <Queue user={user} catalog={catalog.data} select={setSelected} />
        </>
      )}
    </section>
  );
}
function Queue({
  user,
  catalog,
  select,
}: {
  user: StaffIdentity;
  catalog: Catalog;
  select: (id: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState("active");
  const [offset, setOffset] = useState(0);
  const query = new URLSearchParams({
    status,
    priority,
    category,
    scope,
    offset: String(offset),
  }).toString();
  return (
    <>
      <div className="filters">
        <label>
          Статус
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все статусы</option>
            {Object.entries(enums.appealStatuses).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Приоритет
          <select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все приоритеты</option>
            {Object.entries(enums.priorities).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Категория
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все категории</option>
            {catalog.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {user.role === "operator" && (
          <label>
            Показывать
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setOffset(0);
              }}
            >
              <option value="active">Активные</option>
              <option value="all">Все, включая закрытые</option>
            </select>
          </label>
        )}
      </div>
      <QueueRows
        key={query}
        query={query}
        catalog={catalog}
        select={select}
        offset={offset}
        setOffset={setOffset}
      />
    </>
  );
}
function QueueRows({
  query,
  catalog,
  select,
  offset,
  setOffset,
}: {
  query: string;
  catalog: Catalog;
  select: (id: string) => void;
  offset: number;
  setOffset: (n: number) => void;
}) {
  const resource = useResource<{
    appeals: AppealView[];
    has_more: boolean;
    overdue_count: number;
  }>("/api/staff/appeals/?" + query, 5000);
  return (
    <>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      <button onClick={resource.reload}>Обновить список</button>
      {!resource.data ? (
        <p role="status">Загружаем обращения…</p>
      ) : (
        <>
          {!resource.data.appeals.length && (
            <p className="empty">В этом списке пока нет обращений.</p>
          )}
          <p>
            Ожидают дольше порога в выбранном списке:{" "}
            {resource.data.overdue_count}
          </p>
          {[true, false].map((crisis) => (
            <section
              key={String(crisis)}
              aria-label={
                crisis ? "Кризисные обращения" : "Остальные обращения"
              }
            >
              <h2>
                {crisis
                  ? "Кризисные обращения — в первую очередь"
                  : "Остальные обращения"}
              </h2>
              {!resource.data!.appeals.some(
                (a) => Boolean(a.is_crisis) === crisis,
              ) && <p>На этой странице таких обращений нет.</p>}
              <ul className="queue">
                {resource
                  .data!.appeals.filter((a) => Boolean(a.is_crisis) === crisis)
                  .map((a) => (
                    <li key={a.id}>
                      <button
                        className={
                          a.is_crisis
                            ? "queue-item crisis"
                            : a.priority === "urgent"
                              ? "queue-item urgent"
                              : "queue-item"
                        }
                        onClick={() => select(a.id)}
                      >
                        <strong>
                          {catalog.categories.find((c) => c.slug === a.category)
                            ?.name ?? a.category}
                        </strong>
                        <span>
                          {enums.applicantTypes[a.applicant_type]} ·{" "}
                          {enums.appealStatuses[a.status]}
                        </span>
                        <span>
                          {enums.priorities[a.priority]} · {date(a.created_at)}{" "}
                          · ожидание{" "}
                          {Math.max(
                            0,
                            Math.floor(
                              (Date.now() - Date.parse(a.created_at)) / 60000,
                            ),
                          )}{" "}
                          мин.
                        </span>
                        {a.overdue && (
                          <strong>Требует проверки: долго нет ответа</strong>
                        )}
                        {a.is_crisis && (
                          <strong className="crisis-badge">
                            Требует внимания · кризис
                          </strong>
                        )}
                        <span className="muted">{a.id.slice(0, 8)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <div className="actions">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Предыдущие
            </button>
            <button
              disabled={!resource.data.has_more}
              onClick={() => setOffset(offset + 50)}
            >
              Следующие
            </button>
          </div>
        </>
      )}
    </>
  );
}
function StaffCase({
  id,
  user,
  catalog,
}: {
  id: string;
  user: StaffIdentity;
  catalog: Catalog;
}) {
  const resource = useResource<{ appeal: AppealView }>(
    `/api/staff/appeals/${id}/`,
    5000,
  );
  const changed = (updated?: AppealView) => {
    if (updated) resource.update({ appeal: updated });
    resource.reload();
  };
  const appeal = resource.data?.appeal;
  if (resource.error)
    return <Problem error={resource.error} retry={resource.reload} />;
  if (!appeal) return <p role="status">Открываем обращение…</p>;
  return (
    <>
      <h2>Обращение {id.slice(0, 8)}</h2>
      <AppealSummary appeal={appeal} catalog={catalog} staff />
      {user.role === "operator" ? (
        <OperatorActions appeal={appeal} catalog={catalog} changed={changed} />
      ) : (
        <ExpertActions appeal={appeal} user={user} changed={changed} />
      )}
    </>
  );
}
