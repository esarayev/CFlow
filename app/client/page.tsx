"use client";

import Script from "next/script";
import { FormEvent, useEffect, useState } from "react";

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type ClientRegistration = {
  fullName: string;
  whatsappPhone: string;
};

type CargoStage = "china_warehouse" | "in_transit" | "kazakhstan" | "astana";

type ClientBox = {
  id: string;
  track: string;
  weight: string;
  status: string;
  stage: CargoStage;
  amount: string;
};

type ClientProfile = {
  registered: boolean;
  approved: boolean;
  client: {
    name: string;
    phone: string;
    city: string;
    status: string;
    code: string;
    chinaAddress: string;
    tariff: string;
  } | null;
  boxes: ClientBox[];
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initData: string;
        initDataUnsafe?: {
          user?: TelegramUser;
        };
        MainButton?: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
        };
      };
    };
  }
}

const stageLabels: Record<CargoStage, { title: string; text: string }> = {
  china_warehouse: {
    title: "На складе в Китае",
    text: "Товар принят китайским складом по вашему клиентскому коду.",
  },
  in_transit: {
    title: "Едет",
    text: "Груз отправлен из Китая и находится в пути.",
  },
  kazakhstan: {
    title: "В Казахстане",
    text: "Груз прошел основной путь и ожидает прибытия в город выдачи.",
  },
  astana: {
    title: "В Астане на карго",
    text: "Можно оплатить доставку и забрать товар.",
  },
};

function clientName(user?: TelegramUser) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "";
}

export default function ClientMiniApp() {
  const [telegramUser, setTelegramUser] = useState<TelegramUser | undefined>();
  const [initData, setInitData] = useState("");
  const [profile, setProfile] = useState<ClientProfile>({ registered: false, approved: false, client: null, boxes: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<ClientRegistration>({
    fullName: "",
    whatsappPhone: "",
  });

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    setTelegramUser(webApp?.initDataUnsafe?.user);
    setInitData(webApp?.initData || "");
  }, []);

  useEffect(() => {
    if (!telegramUser) return;
    setForm((current) => ({ ...current, fullName: current.fullName || clientName(telegramUser) }));
  }, [telegramUser]);

  useEffect(() => {
    if (!initData) {
      setIsLoading(false);
      return;
    }
    fetch(`/api/client/me?initData=${encodeURIComponent(initData)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) setProfile({ registered: data.registered, approved: data.approved, client: data.client, boxes: data.boxes || [] });
        else setError(data.error || "Не удалось загрузить кабинет");
      })
      .catch(() => setError("Не удалось подключиться к CFlow"))
      .finally(() => setIsLoading(false));
  }, [initData]);

  function update(name: keyof ClientRegistration, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    fetch("/api/client/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        initData,
        name: form.fullName,
        phone: form.whatsappPhone,
        city: "",
        comment: "",
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Не удалось отправить заявку");
          return;
        }
        setProfile({ registered: data.registered, approved: data.approved, client: data.client, boxes: data.boxes || [] });
        setNotice("Заявка отправлена. После подтверждения появится код и адрес склада.");
        setError("");
      })
      .catch(() => setError("Не удалось отправить заявку"))
      .finally(() => setIsLoading(false));
  }

  async function copyAddress() {
    if (!profile.client) return;
    await navigator.clipboard.writeText(`Код клиента: ${profile.client.code}\nАдрес склада: ${profile.client.chinaAddress}`);
    setNotice("Код и адрес скопированы");
  }

  const isRegistered = profile.registered;
  const isApproved = profile.approved;
  const client = profile.client;

  return (
    <main className="client-app">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <section className="client-hero">
        <div>
          <span>ES Logistics</span>
          <h1>{isRegistered ? "Личный кабинет клиента" : "Регистрация клиента"}</h1>
          <p>{isRegistered ? "Код, адрес склада и статусы ваших товаров в одном месте." : "Заполните ФИО и WhatsApp. После подтверждения мы отправим код для покупок в Китае."}</p>
        </div>
        <img src="/cflow-logo-tight.png" alt="CFlow" />
      </section>

      {notice ? <p className="client-notice">{notice}</p> : null}
      {error ? <p className="client-error">{error}</p> : null}
      {isLoading ? <p className="client-notice">Загружаем кабинет...</p> : null}

      {!isRegistered ? (
        <form className="client-card client-form" onSubmit={submitRegistration}>
          <label>ФИО<input value={form.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="Фамилия Имя Отчество" required /></label>
          <label>Номер WhatsApp<input value={form.whatsappPhone} onChange={(event) => update("whatsappPhone", event.target.value)} placeholder="+7..." required /></label>
          <button className="primary" type="submit">Отправить заявку</button>
        </form>
      ) : (
        <section className="client-stack">
          <article className="client-card client-status-card">
            <span className={isApproved ? "client-pill success" : "client-pill"}>{isApproved ? "Подтвержден" : "Ожидает подтверждения"}</span>
            <h2>{client?.name || form.fullName || "Клиент"}</h2>
            <p>{isApproved ? "Код и адрес активны. Указывайте код при каждой покупке." : "Менеджер проверит заявку и отправит код клиента."}</p>
          </article>

          <article className="client-card client-code-card">
            <div>
              <span>Код клиента</span>
              <strong>{client?.code || "Ожидает выдачи"}</strong>
            </div>
            <div>
              <span>Тариф</span>
              <strong>{client?.tariff || "Ожидает подтверждения"}</strong>
            </div>
            <p>{client?.chinaAddress || "Адрес склада появится после подтверждения регистрации"}</p>
            <button className="primary" type="button" disabled={!isApproved} onClick={copyAddress}>Скопировать код и адрес</button>
          </article>

          <article className="client-card">
            <div className="client-section-head">
              <h2>Статусы товаров</h2>
              <span>{profile.boxes.length} отправления</span>
            </div>
            <div className="client-box-list">
              {profile.boxes.map((box) => (
                <div className="client-box" key={box.id}>
                  <div>
                    <strong>{box.track}</strong>
                    <span>{box.id} · {box.weight}</span>
                  </div>
                  <p>{box.status}</p>
                  <small>{box.amount}</small>
                  <StageProgress active={box.stage} />
                </div>
              ))}
              {!profile.boxes.length ? <p className="empty-state">Товары появятся здесь после регистрации на складе.</p> : null}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}

function StageProgress({ active }: { active: CargoStage }) {
  const stages = Object.keys(stageLabels) as CargoStage[];
  const activeIndex = stages.indexOf(active);

  return (
    <ol className="client-progress">
      {stages.map((stage, index) => (
        <li className={index <= activeIndex ? "done" : ""} key={stage}>
          <i />
          <div>
            <strong>{stageLabels[stage].title}</strong>
            <span>{stageLabels[stage].text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
