"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TelegramUser = { id?: number; first_name?: string; last_name?: string; username?: string };
type CargoStage = "china_warehouse" | "in_transit" | "kazakhstan" | "astana";
type ClientBox = { id: string; track: string; weight: string; status: string; stage: CargoStage; amount: string; clientRate?: string };
type ClientProfile = {
  registered: boolean;
  approved: boolean;
  client: { name: string; phone: string; status: string; code: string; chinaAddress: string } | null;
  boxes: ClientBox[];
};
type AppTab = "code" | "statuses";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initData: string;
        initDataUnsafe?: { user?: TelegramUser };
      };
    };
  }
}

const stageLabels: Record<CargoStage, { flag: string; title: string; text: string }> = {
  china_warehouse: { flag: "🇨🇳", title: "Склад в Китае", text: "Товар принят китайским складом по вашему коду." },
  in_transit: { flag: "✈️", title: "В пути", text: "Груз отправлен из Китая и движется к Казахстану." },
  kazakhstan: { flag: "🇰🇿", title: "В Казахстане", text: "Груз прибыл в Казахстан и проходит обработку." },
  astana: { flag: "📍", title: "Астана, карго", text: "Можно оплатить доставку и забрать товар." },
};

const emptyProfile: ClientProfile = { registered: false, approved: false, client: null, boxes: [] };
const profileCacheKey = "cflow-client-profile";

function clientName(user?: TelegramUser) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "";
}

function readCachedProfile(): ClientProfile {
  if (typeof window === "undefined") return emptyProfile;
  try {
    const cached = window.localStorage.getItem(profileCacheKey);
    if (!cached) return emptyProfile;
    const profile = JSON.parse(cached) as ClientProfile;
    return profile?.registered ? profile : emptyProfile;
  } catch {
    return emptyProfile;
  }
}

function cacheProfile(profile: ClientProfile) {
  if (typeof window === "undefined") return;
  if (!profile.registered) return;
  window.localStorage.setItem(profileCacheKey, JSON.stringify(profile));
}

export default function ClientMiniApp() {
  const [telegramUser, setTelegramUser] = useState<TelegramUser | undefined>();
  const [initData, setInitData] = useState("");
  const [profile, setProfile] = useState<ClientProfile>(emptyProfile);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("code");
  const [showIntro, setShowIntro] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ fullName: "", whatsappPhone: "" });

  useEffect(() => {
    const cached = readCachedProfile();
    if (cached.registered) {
      setProfile(cached);
      setHasCheckedProfile(true);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let attempts = 0;

    const readTelegramContext = () => {
      const webApp = window.Telegram?.WebApp;
      const nextInitData = webApp?.initData || "";

      if (webApp && nextInitData) {
        webApp.ready();
        webApp.expand();
        if (!isMounted) return;
        setTelegramUser(webApp.initDataUnsafe?.user);
        setInitData(nextInitData);
        return;
      }

      attempts += 1;
      if (attempts < 30) {
        window.setTimeout(readTelegramContext, 100);
        return;
      }

      if (isMounted) setIsLoading(false);
    };

    readTelegramContext();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!telegramUser) return;
    setForm((current) => ({ ...current, fullName: current.fullName || clientName(telegramUser) }));
  }, [telegramUser]);

  useEffect(() => {
    if (!initData) {
      setHasCheckedProfile(true);
      setIsLoading(false);
      return;
    }
    fetch(`/api/client/me?initData=${encodeURIComponent(initData)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) {
          const nextProfile = { registered: data.registered, approved: data.approved, client: data.client, boxes: data.boxes || [] };
          setProfile(nextProfile);
          cacheProfile(nextProfile);
        }
        else setError(data.error || "Не удалось загрузить кабинет");
      })
      .catch(() => setError("Не удалось подключиться к CFlow"))
      .finally(() => {
        setHasCheckedProfile(true);
        setIsLoading(false);
      });
  }, [initData]);

  const latestStage = useMemo(() => {
    const stage = profile.boxes[0]?.stage || "china_warehouse";
    return stageLabels[stage];
  }, [profile.boxes]);

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    fetch("/api/client/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, name: form.fullName, phone: form.whatsappPhone }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Не удалось отправить заявку");
          return;
        }
        const nextProfile = { registered: data.registered, approved: data.approved, client: data.client, boxes: data.boxes || [] };
        setProfile(nextProfile);
        cacheProfile(nextProfile);
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

  const client = profile.client;

  if (showIntro) {
    return (
      <main className="client-app intro-app">
        <section className="intro-screen">
          <video
            className="intro-video"
            src="/cflow-intro.mp4"
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={() => setShowIntro(false)}
          />
          <div className="intro-overlay">
            <button className="intro-skip" type="button" onClick={() => setShowIntro(false)}>Продолжить</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="client-app">
      <header className="client-shell-head">
        <div className="brand-logo brand-logo-client"><img src="/cflow-client-logo.png" alt="CFlow" /></div>
        {profile.registered ? <span className={profile.approved ? "client-pill success" : "client-pill"}>{profile.approved ? "Активен" : "На проверке"}</span> : null}
      </header>

      <section className="client-scroll">
        <section className="client-hero">
          <div>
            <span>{profile.registered ? `${latestStage.flag} ${latestStage.title}` : "Быстрый старт"}</span>
            <h1>{profile.registered ? client?.name || "Клиент" : "Получите код для покупок"}</h1>
            <p>{profile.registered ? "Код, адрес склада и движение товаров в одном аккуратном кабинете." : "Заполните ФИО и WhatsApp. После проверки мы выдадим код клиента и адрес склада в Китае."}</p>
          </div>
        </section>

        {notice ? <p className="client-notice">{notice}</p> : null}
        {error ? <p className="client-error">{error}</p> : null}
        {isLoading || !hasCheckedProfile ? <p className="client-notice">Загружаем кабинет...</p> : null}

        {hasCheckedProfile && !profile.registered ? (
          <form className="client-card client-form" onSubmit={submitRegistration}>
            <label>ФИО<input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Фамилия Имя Отчество" required /></label>
            <label>Номер WhatsApp<input value={form.whatsappPhone} onChange={(event) => setForm((current) => ({ ...current, whatsappPhone: event.target.value }))} placeholder="+7..." required /></label>
            <button className="primary" type="submit">Отправить заявку</button>
          </form>
        ) : null}

        {profile.registered ? (
          <>
            <nav className="client-tabs" aria-label="Разделы кабинета">
              <button type="button" className={activeTab === "code" ? "active" : ""} onClick={() => setActiveTab("code")}>Код и адрес</button>
              <button type="button" className={activeTab === "statuses" ? "active" : ""} onClick={() => setActiveTab("statuses")}>Статусы</button>
            </nav>

            {activeTab === "code" ? (
              <section className="client-stack">
                <article className="client-card client-status-card">
                  <div className="client-section-head">
                    <h2>{profile.approved ? "Данные для покупок" : "Заявка на проверке"}</h2>
                    <span>{client?.phone || "WhatsApp не указан"}</span>
                  </div>
                  <p>{profile.approved ? "Указывайте код при каждой покупке. Так склад в Китае привяжет товар к вам." : "Менеджер проверит заявку и добавит ваш код и адрес склада."}</p>
                </article>

                <article className="client-card client-code-card">
                  <div className="client-info-row"><span>Код клиента</span><strong>{client?.code || "Ожидает выдачи"}</strong></div>
                  <div className="client-address">
                    <span>Адрес склада в Китае</span>
                    <p>{client?.chinaAddress || "Адрес появится после подтверждения регистрации"}</p>
                  </div>
                  <button className="primary" type="button" disabled={!profile.approved} onClick={copyAddress}>Скопировать код и адрес</button>
                </article>
              </section>
            ) : (
              <section className="client-stack">
                <article className="client-card">
                  <div className="client-section-head">
                    <h2>Движение товаров</h2>
                    <span>{profile.boxes.length} отправлений</span>
                  </div>
                  <div className="client-box-list">
                    {profile.boxes.map((box) => (
                      <div className="client-box" key={box.id}>
                        <div className="client-box-top">
                          <div><strong>{box.track}</strong><span>{box.id} · {box.weight || "вес уточняется"}</span></div>
                          <b>{stageLabels[box.stage]?.flag || "•"}</b>
                        </div>
                        <p>{box.status}</p>
                        {box.amount ? <small>{box.clientRate ? `${box.clientRate} · ${box.amount}` : box.amount}</small> : null}
                        <StageProgress active={box.stage} />
                      </div>
                    ))}
                    {!profile.boxes.length ? <EmptyStatuses /> : null}
                  </div>
                </article>
              </section>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}

function EmptyStatuses() {
  return (
    <div className="empty-state">
      <strong>Пока нет товаров</strong>
      <span>Когда склад зарегистрирует ваши покупки, здесь появятся этапы: Китай, в пути, Казахстан и Астана.</span>
    </div>
  );
}

function StageProgress({ active }: { active: CargoStage }) {
  const stages = Object.keys(stageLabels) as CargoStage[];
  const activeIndex = stages.indexOf(active);
  return (
    <ol className="client-progress">
      {stages.map((stage, index) => (
        <li className={index <= activeIndex ? "done" : ""} key={stage}>
          <i>{stageLabels[stage].flag}</i>
          <div><strong>{stageLabels[stage].title}</strong><span>{stageLabels[stage].text}</span></div>
        </li>
      ))}
    </ol>
  );
}
