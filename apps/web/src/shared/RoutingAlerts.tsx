import { useResource } from "./useResource";
import { Problem } from "./AppealUI";
export function RoutingAlerts() {
  const resource = useResource<{
    alerts: { id: string; category: string; state: string }[];
  }>("/api/staff/routing-alerts/", 10000);
  return (
    <section className="notice">
      <h2>Требуется распределение</h2>
      {Boolean(resource.error) && (
        <Problem error={resource.error} retry={resource.reload} />
      )}
      {!resource.data && !resource.error && <p>Проверяем очередь…</p>}
      {resource.data?.alerts.length === 0 && (
        <p>Обращений без доступного специалиста нет.</p>
      )}
      {resource.data?.alerts.map((a) => (
        <p key={a.id}>
          {a.id.slice(0, 8)} · {a.category} ·{" "}
          {a.state === "no_expert"
            ? "Нет подходящего специалиста — проверьте группы и правила"
            : "Специалисты перегружены — обращение остаётся в очереди"}
        </p>
      ))}
    </section>
  );
}
