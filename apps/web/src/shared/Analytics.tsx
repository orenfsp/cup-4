import { useState } from "react";
import type { AnalyticsReport } from "@otklik/contracts";
import { enums } from "@otklik/contracts";
import { useResource } from "./useResource";
import { Problem } from "./AppealUI";

const CHART_COLORS = [
  "#365e4f",
  "#6d8f7a",
  "#9b6418",
  "#54755b",
  "#8a6b3d",
  "#4a715f",
  "#7a5a1e",
  "#5d7a6a",
];

function RatioRing({
  label,
  ratio,
  count,
}: {
  label: string;
  ratio: number | null;
  count: number;
}) {
  const value = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value);
  const text = ratio === null ? "Нет данных" : `${(ratio * 100).toFixed(1)}%`;
  return (
    <div className="chart-ring">
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle className="chart-ring-track" cx="48" cy="48" r={r} />
        <circle
          className="chart-ring-value"
          cx="48"
          cy="48"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="chart-ring-label">
        <strong>{text}</strong>
        <span>{label}</span>
        <span className="muted">{count}</span>
      </div>
    </div>
  );
}

function BarChart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; hint?: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return (
      <article className="admin-list-card chart-card">
        <h3>{title}</h3>
        <p className="empty">Нет значений в этой группе.</p>
      </article>
    );
  }
  return (
    <article className="admin-list-card chart-card">
      <h3>{title}</h3>
      <ul className="chart-bars" aria-label={title}>
        {items.map((item, index) => (
          <li key={item.label}>
            <div className="chart-bar-meta">
              <span>{item.label}</span>
              <strong>{item.hint ?? item.value}</strong>
            </div>
            <div className="chart-bar-track">
              <div
                className="chart-bar-fill"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  background: CHART_COLORS[index % CHART_COLORS.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Analytics() {
  const [from, setFrom] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const query = new URLSearchParams({ from, to }).toString();
  const resource = useResource<AnalyticsReport>(
    "/api/staff/analytics/?" + query,
  );
  const data =
    resource.data?.from === from && resource.data.to === to
      ? resource.data
      : undefined;
  const names: Record<string, string> = {
    operator: "До принятия оператором",
    first_response: "До первого ответа",
    closure: "До закрытия",
    categories: "Категории",
    applicant_types: "Типы заявителей",
    statuses: "Статусы",
    close_kinds: "Основания закрытия",
  };
  const labels: Record<string, string> = {
    ...enums.applicantTypes,
    ...enums.appealStatuses,
    applicant_confirmed: "Подтверждено заявителем",
    operator_resolved: "Ответ оператора",
    operator_rejected: "Отклонено оператором",
    system_timeout: "Без ответа",
  };
  const percent = (value: number | null) =>
    value === null ? "Нет данных" : `${(value * 100).toFixed(1)}%`;
  return (
    <section className="analytics-console" aria-labelledby="analytics-title">
      <div className="admin-panel-head">
        <div>
          <p className="eyebrow">Отчёты</p>
          <h2 id="analytics-title">Аналитика</h2>
        </div>
      </div>
      <p className="analytics-lead">
        Обращения, созданные за выбранный период. Даты в UTC, верхняя граница не
        включается. Период до 366 дней.
      </p>
      <div className="analytics-period">
        <div className="analytics-period-fields">
          <label>
            С даты
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <span className="analytics-period-sep" aria-hidden="true">
            →
          </span>
          <label>
            До даты (не включая)
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <p className="analytics-period-note">Фильтр периода в UTC</p>
      </div>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      {!data && !resource.error && <p role="status">Считаем показатели…</p>}
      {data && (
        <div className="analytics-grid">
          <article className="admin-list-card analytics-summary">
            <h3>Сводка периода</h3>
            <p>
              {data.scope === "all"
                ? "Все обращения сервиса"
                : "Только обращения, в работе с которыми вы участвовали"}
              .
            </p>
            <p className="analytics-total">
              Всего обращений: <strong>{data.total}</strong>
            </p>
            {data.total === 0 && (
              <p className="empty">За этот период данных пока нет.</p>
            )}
            <div className="chart-rings">
              <RatioRing
                label="Доля срочных"
                ratio={data.urgent.ratio}
                count={data.urgent.count}
              />
              <RatioRing
                label="Доля с возвратом заявителя"
                ratio={data.returned.ratio}
                count={data.returned.count}
              />
            </div>
            <p className="analytics-metrics-line">
              Доля срочных: {percent(data.urgent.ratio)} ({data.urgent.count}).
              Доля с возвратом заявителя: {percent(data.returned.ratio)} (
              {data.returned.count}).
            </p>
          </article>
          <BarChart
            title="Среднее время, минут"
            items={Object.entries(data.times).map(([key, v]) => ({
              label: names[key] ?? key,
              value: v.mean_seconds === null ? 0 : v.mean_seconds / 60,
              hint:
                v.mean_seconds === null
                  ? "Нет данных"
                  : `${(v.mean_seconds / 60).toFixed(1)} · n=${v.n}`,
            }))}
          />
          <div className="table-scroll admin-list-card">
            <table>
              <caption>Среднее время</caption>
              <thead>
                <tr>
                  <th>Показатель</th>
                  <th>Минут</th>
                  <th>Есть событие</th>
                  <th>Без события</th>
                  <th>Ошибочные даты</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.times).map(([key, v]) => (
                  <tr key={key}>
                    <th>{names[key]}</th>
                    <td>
                      {v.mean_seconds === null
                        ? "Нет данных"
                        : (v.mean_seconds / 60).toFixed(1)}
                    </td>
                    <td>{v.n}</td>
                    <td>{v.missing}</td>
                    <td>{v.invalid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="admin-hint">
              Отсутствующие события исключены из среднего. Незавершённое
              обращение не считается закрытым за ноль минут.
            </p>
          </div>
          {Object.entries(data.distributions).map(([key, values]) => (
            <BarChart
              key={key}
              title={names[key] ?? key}
              items={Object.entries(values).map(([label, count]) => ({
                label: labels[label] ?? (label || "Ещё не закрыто"),
                value: count,
              }))}
            />
          ))}
          <BarChart
            title="Текущая нагрузка сотрудников"
            items={data.workload.map((w) => ({
              label: `${w.username} · ${enums.staffRoles[w.role]}`,
              value: w.active_count,
              hint: `${w.active_count} / ${w.limit ?? "—"}`,
            }))}
          />
          <article className="admin-list-card">
            <div className="table-scroll">
              <table>
                <caption>
                  Текущая нагрузка сотрудников (вне фильтра дат)
                </caption>
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Роль</th>
                    <th>Активные</th>
                    <th>Лимит</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workload.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Нет данных о нагрузке.</td>
                    </tr>
                  ) : (
                    data.workload.map((w) => (
                      <tr key={w.staff_id}>
                        <td>{w.username}</td>
                        <td>{enums.staffRoles[w.role]}</td>
                        <td>{w.active_count}</td>
                        <td>{w.limit ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="admin-hint">
              У оператора учтены активные обращения, которые он обрабатывал;
              одно обращение может учитываться у нескольких операторов.
            </p>
          </article>
          <article className="admin-form-card analytics-export">
            <div className="admin-form-head">
              <h3>Экспорт CSV</h3>
              <p>
                В CSV нет текстов, контактов, заметок, жалоб и секретных кодов.
                Только разрешённые метаданные выбранного периода.
              </p>
            </div>
            <a
              className="primary analytics-export-link"
              href={"/api/staff/analytics/export/?" + query}
              download
            >
              Скачать CSV с метаданными
            </a>
          </article>
        </div>
      )}
    </section>
  );
}
