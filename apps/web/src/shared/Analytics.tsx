import { useState } from "react";
import type { AnalyticsReport } from "@otklik/contracts";
import { enums } from "@otklik/contracts";
import { useResource } from "./useResource";
import { Problem } from "./AppealUI";
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
    <section>
      <h2>Аналитика</h2>
      <p>
        Обращения, созданные за выбранный период. Даты в UTC, верхняя граница не
        включается. Период до 366 дней.
      </p>
      <div className="filters">
        <label>
          С даты
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          До даты (не включая)
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      {!data && !resource.error && <p role="status">Считаем показатели…</p>}
      {data && (
        <>
          <p>
            {data.scope === "all"
              ? "Все обращения сервиса"
              : "Только обращения, в работе с которыми вы участвовали"}
            .
          </p>
          <p>
            Всего обращений: <strong>{data.total}</strong>
          </p>
          {data.total === 0 && (
            <p className="empty">За этот период данных пока нет.</p>
          )}
          <p>
            Доля срочных: {percent(data.urgent.ratio)} ({data.urgent.count}).
            Доля с возвратом заявителя: {percent(data.returned.ratio)} (
            {data.returned.count}).
          </p>
          <div className="table-scroll">
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
          </div>
          <p>
            Отсутствующие события исключены из среднего. Незавершённое обращение
            не считается закрытым за ноль минут.
          </p>
          {Object.entries(data.distributions).map(([key, values]) => (
            <section key={key}>
              <h3>{names[key]}</h3>
              {Object.entries(values).map(([label, count]) => (
                <p key={label}>
                  {labels[label] ?? (label || "Ещё не закрыто")}: {count}
                </p>
              ))}
            </section>
          ))}
          <div className="table-scroll">
            <table>
              <caption>Текущая нагрузка сотрудников (вне фильтра дат)</caption>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Активные</th>
                  <th>Лимит</th>
                </tr>
              </thead>
              <tbody>
                {data.workload.map((w) => (
                  <tr key={w.staff_id}>
                    <td>{w.username}</td>
                    <td>{enums.staffRoles[w.role]}</td>
                    <td>{w.active_count}</td>
                    <td>{w.limit ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            У оператора учтены активные обращения, которые он обрабатывал; одно
            обращение может учитываться у нескольких операторов.
          </p>
          <a href={"/api/staff/analytics/export/?" + query} download>
            Скачать CSV с метаданными
          </a>
          <p>В CSV нет текстов, контактов, заметок, жалоб и секретных кодов.</p>
        </>
      )}
    </section>
  );
}
