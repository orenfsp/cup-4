import type { Collaboration } from "@otklik/contracts";
export function Participants({ data }: { data?: Collaboration }) {
  if (!data) return <p role="status">Загружаем участников…</p>;
  return (
    <section className="notice">
      <h3>Участники и история передач</h3>
      {data.participants.map((p, i) => (
        <p key={i}>
          {p.name} ·{" "}
          {p.role === "responsible" ? "Ответственный" : "Соисполнитель"} ·{" "}
          {p.revoked_at
            ? "Доступ отозван"
            : p.present
              ? "В карточке"
              : "Не в карточке"}
        </p>
      ))}
      {data.transfers.map((t) => (
        <p key={t.id}>
          Передача ·{" "}
          {t.status === "approved" ? "Подтверждена" : "Ожидает решения"} ·{" "}
          {t.reason}
        </p>
      ))}
    </section>
  );
}
