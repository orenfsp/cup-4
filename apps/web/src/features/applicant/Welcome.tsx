import { ApplicantFlow } from "./ApplicantFlow";
import { useState } from "react";
import { enums, type ApplicantType } from "@otklik/contracts";

type Preview = "start" | "return" | null;

export function Welcome() {
  const [type, setType] = useState<ApplicantType>("student");
  const [preview, setPreview] = useState<Preview>(null);
  const young = type === "student";

  return (
    <>
      <section className="hero" aria-labelledby="welcome-title">
        <p className="eyebrow">Поддержка начинается с разговора</p>
        <h1 id="welcome-title">
          Здесь {young ? "тебя" : "вас"}
          <br />
          <span>услышат.</span>
        </h1>
        <p className="intro">
          Травля, давление или конфликт — с трудной ситуацией не обязательно
          оставаться один на один. Иногда первый шаг — просто рассказать.
        </p>
        <fieldset className="applicant-types">
          <legend>
            {young
              ? "От чьего лица ты обращаешься?"
              : "От чьего лица вы обращаетесь?"}
          </legend>
          <div className="type-options">
            {(
              Object.entries(enums.applicantTypes) as [ApplicantType, string][]
            ).map(([value, label]) => (
              <label key={value} className={type === value ? "selected" : ""}>
                <input
                  type="radio"
                  name="applicant"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="entry-actions">
          <button
            className="primary"
            onClick={() => setPreview("start")}
            aria-expanded={preview === "start"}
            aria-controls="entry-preview"
          >
            Рассказать о ситуации <span aria-hidden="true">↗</span>
          </button>
          <button
            className="secondary"
            onClick={() => setPreview("return")}
            aria-expanded={preview === "return"}
            aria-controls="entry-preview"
          >
            У меня есть код <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className="prototype-note">
          Учебный прототип. Обращения сохраняются. Здесь можно получить
          поддержку; сервис не заменяет экстренные службы.
        </p>
        <div id="entry-preview">
          {preview && (
            <ApplicantFlow
              key={`${preview}-${type}`}
              type={type}
              mode={preview}
            />
          )}
        </div>
      </section>
      <aside className="how-it-works" aria-labelledby="steps-title">
        <div className="conversation-mark" aria-hidden="true">
          <span>
            Я не знаю,
            <br />с чего начать…
          </span>
          <span>Можно своими словами.</span>
        </div>
        <p className="eyebrow">Как это работает</p>
        <h2 id="steps-title">Что будет дальше</h2>
        <ol>
          <li>
            <strong>{young ? "Расскажи" : "Расскажите"} о ситуации</strong>
            <p>
              Без регистрации. Имя, школа и телефон в обычной форме не нужны.
            </p>
          </li>
          <li>
            <strong>Оператор подберёт специалиста</strong>
            <p>Обращение попадёт к тому, кто сможет помочь разобраться.</p>
          </li>
          <li>
            <strong>
              {young ? "Вернись" : "Вернитесь"} по секретному коду
            </strong>
            <p>
              Чат, рекомендации и решение о том, помог ли ответ, — в одном
              месте.
            </p>
          </li>
        </ol>
        <div className="privacy-note">
          <strong>
            Личными данными {young ? "делишься ты" : "делитесь вы"}
          </strong>
          <p>
            В тексте и на скриншотах могут быть имена и другие узнаваемые
            детали. {young ? "Не указывай" : "Не указывайте"} их, если{" "}
            {young ? "хочешь" : "хотите"} сохранить анонимность.
          </p>
        </div>
      </aside>
    </>
  );
}
