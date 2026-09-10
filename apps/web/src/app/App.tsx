import { useEffect, useState } from "react";
import { StaffDesk } from "../features/staff/StaffDesk";
import { Welcome } from "../features/applicant/Welcome";
import { checkReadiness } from "../shared/api";

type Connection = "loading" | "ready" | "error";

export function App() {
  const [staff, setStaff] = useState(location.hash === "#staff");
  useEffect(() => {
    const change = () => setStaff(location.hash === "#staff");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [connection, setConnection] = useState<Connection>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let active = true;
    void checkReadiness(controller.signal)
      .then((ok) => {
        if (active) setConnection(ok ? "ready" : "error");
      })
      .catch(() => {
        if (active) setConnection("error");
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <header>
        <a href="/" className="brand" aria-label="Отклик — главная">
          <span className="brand-mark" aria-hidden="true">
            о
          </span>
          отклик
        </a>
        <span className="header-caption">Рядом в сложный момент</span>
        <a href={staff ? "#" : "#staff"}>
          {staff ? "Для заявителя" : "Вход для сотрудников"}
        </a>
      </header>
      <main id="main">{staff ? <StaffDesk /> : <Welcome />}</main>
      <footer>
        <span>Отклик · пространство поддержки</span>
        <div className="connection" role="status">
          {connection === "loading" && "Проверяем соединение…"}
          {connection === "ready" && "Соединение установлено"}
          {connection === "error" && (
            <>
              Сейчас нет соединения.{" "}
              <button
                onClick={() => {
                  setConnection("loading");
                  setAttempt((n) => n + 1);
                }}
              >
                Повторить
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
