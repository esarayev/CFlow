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

const stageLabels: Record<CargoStage, { icon: string; title: string; text: string; step: number }> = {
  china_warehouse: { icon: "🏭", title: "На складе в Китае", text: "Товар принят китайским складом по вашему коду.", step: 1 },
  in_transit: { icon: "🚢", title: "В пути", text: "Груз отправлен из Китая и движется к Казахстану.", step: 2 },
  kazakhstan: { icon: "📦", title: "В Казахстане", text: "Груз прибыл в Казахстан и проходит обработку.", step: 3 },
  astana: { icon: "🏪", title: "В Астане на карго", text: "Можно оплатить доставку и забрать товар.", step: 4 },
};

const emptyProfile: ClientProfile = { registered: false, approved: false, client: null, boxes: [] };
const profileCacheKey = "cflow-client-profile-v2";
const brandLogo = "/zabota-cargo-logo.png";

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
  if (typeof window === "undefined" || !profile.registered) return;
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
        } else {
          setError(data.error || "Не удалось загрузить кабинет");
        }
      })
      .catch(() => setError("Не удалось подключиться к сервису"))
      .finally(() => {
        setHasCheckedProfile(true);
        setIsLoading(false);
      });
  }, [initData]);

  const client = profile.client;
  const latestStage = useMemo(() => {
    const stage = profile.boxes[0]?.stage || "china_warehouse";
    return stageLabels[stage];
  }, [profile.boxes]);

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    fetch("/api/client/register", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
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

  async function copyText(value: string, message: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setNotice(message);
  }

  async function copyAddress() {
    if (!profile.client) return;
    await copyText(`Код клиента: ${profile.client.code}\nАдрес склада: ${profile.client.chinaAddress}`, "Код и адрес скопированы");
  }

  if (showIntro) {
    return (
      <main className="client-app intro-app">
        <section className="intro-screen">
          <video className="intro-video" src="/cflow-intro.mp4" autoPlay muted playsInline preload="auto" onEnded={() => setShowIntro(false)} />
          <div className="intro-overlay">
            <button className="intro-skip" type="button" onClick={() => setShowIntro(false)}>Продолжить</button>
          </div>
        </section>
      </main>
    );
  }

  if (hasCheckedProfile && !profile.registered) {
    return (
      <main className="client-app neu-app">
        <RegistrationScreen
          form={form}
          isLoading={isLoading}
          notice={notice}
          error={error}
          onSubmit={submitRegistration}
          onName={(value) => setForm((current) => ({ ...current, fullName: value }))}
          onPhone={(value) => setForm((current) => ({ ...current, whatsappPhone: value }))}
        />
      </main>
    );
  }

  if (profile.registered && !profile.approved) {
    return (
      <main className="client-app neu-app">
        <PendingScreen name={client?.name || "Клиент"} phone={client?.phone || ""} notice={notice} error={error} isLoading={isLoading || !hasCheckedProfile} />
      </main>
    );
  }

  return (
    <main className="client-app neu-app confirmed">
      <Header activeTab={activeTab} name={client?.name || "Клиент"} latestStage={latestStage.title} />
      <section className="neu-scroll">
        {notice ? <p className="neu-toast inline">{notice}</p> : null}
        {error ? <p className="neu-error">{error}</p> : null}
        {isLoading || !hasCheckedProfile ? <p className="neu-toast inline">Загружаем кабинет...</p> : null}
        {activeTab === "code" ? (
          <CodeScreen
            client={client}
            onCopy={copyAddress}
            onCopyCode={() => copyText(client?.code || "", "Код клиента скопирован")}
            onCopyAddress={() => copyText(client?.chinaAddress || "", "Адрес склада скопирован")}
          />
        ) : <StatusesScreen boxes={profile.boxes} />}
      </section>
      <BottomNav activeTab={activeTab} onTab={setActiveTab} />
    </main>
  );
}

function RegistrationScreen({
  form,
  isLoading,
  notice,
  error,
  onSubmit,
  onName,
  onPhone,
}: {
  form: { fullName: string; whatsappPhone: string };
  isLoading: boolean;
  notice: string;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
}) {
  return (
    <section className="neu-registration slide-up">
      <BrandLogoBlock subtitle="Доставка товаров из Китая в Казахстан" />

      <form className="neu-card neu-form" onSubmit={onSubmit}>
        <div className="neu-section-title">
          <h1>Регистрация</h1>
          <p>Получите персональный код и адрес склада в Китае</p>
        </div>
        <label>
          <span>ФИО</span>
          <input value={form.fullName} onChange={(event) => onName(event.target.value)} placeholder="Иванов Иван Иванович" required />
        </label>
        <label>
          <span>Номер WhatsApp</span>
          <input value={form.whatsappPhone} onChange={(event) => onPhone(event.target.value)} placeholder="+7 777 000 00 00" required />
        </label>
        <button className="neu-accent" type="submit" disabled={isLoading}>{isLoading ? "Отправляем..." : "Отправить заявку →"}</button>
      </form>

      {notice ? <p className="neu-toast inline">{notice}</p> : null}
      {error ? <p className="neu-error">{error}</p> : null}
      <div className="neu-hint"><span>ℹ️</span><p>Менеджер проверит данные и выдаст персональный код в течение рабочего дня</p></div>
    </section>
  );
}

function PendingScreen({ name, phone, notice, error, isLoading }: { name: string; phone: string; notice: string; error: string; isLoading: boolean }) {
  return (
    <section className="neu-pending slide-up">
      <div className="neu-mini-head">
        <BrandMark />
        <div><span>ZABOTA CARGO</span><strong>Привет, {name.split(" ")[0] || "клиент"}!</strong></div>
      </div>
      <article className="neu-card pending-card">
        <div className="neu-logo wait float">⏳</div>
        <h1>Заявка на проверке</h1>
        <p>Менеджер проверяет ваши данные. Обычно занимает несколько часов в рабочее время.</p>
        <div className="neu-pill warn"><i />Ожидает подтверждения</div>
      </article>
      <article className="neu-card neu-next">
        <span>Что будет дальше</span>
        {["Менеджер подтвердит вашу заявку", "Вы получите персональный код клиента", "Используйте код при заказе в Китае"].map((item, index) => (
          <div key={item}><b>{index + 1}</b><p>{item}</p></div>
        ))}
      </article>
      {phone ? <div className="neu-hint"><span>📱</span><p>WhatsApp для связи: {phone}</p></div> : null}
      {notice ? <p className="neu-toast inline">{notice}</p> : null}
      {error ? <p className="neu-error">{error}</p> : null}
      {isLoading ? <p className="neu-toast inline">Загружаем кабинет...</p> : null}
    </section>
  );
}

function Header({ activeTab, name, latestStage }: { activeTab: AppTab; name: string; latestStage: string }) {
  return (
    <header className="neu-header">
      <div className="neu-mini-head">
        <BrandMark />
        <div><span>ZABOTA CARGO</span><strong>{name.split(" ")[0] || "Клиент"}</strong></div>
      </div>
      <div className="neu-header-pill">{activeTab === "code" ? "Мой код" : latestStage}</div>
    </header>
  );
}

function BrandLogoBlock({ subtitle }: { subtitle: string }) {
  return (
    <div className="neu-logo-block">
      <img className="zabota-logo-full" src={brandLogo} alt="ZABOTA CARGO" />
      <span>{subtitle}</span>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="zabota-mark" aria-hidden="true">
      <img src={brandLogo} alt="" />
    </div>
  );
}

function CodeScreen({
  client,
  onCopy,
  onCopyCode,
  onCopyAddress,
}: {
  client: ClientProfile["client"];
  onCopy: () => void;
  onCopyCode: () => void;
  onCopyAddress: () => void;
}) {
  return (
    <section className="neu-stack slide-up">
      <article className="neu-card client-badge">
        <div className="neu-mini-icon large">👤</div>
        <div><strong>{client?.name || "Клиент"}</strong><span className="neu-pill success"><i />Подтвержден</span></div>
      </article>
      <article className="neu-card">
        <div className="neu-label">Ваш код клиента</div>
        <div className="neu-code">{client?.code || "Код еще не выдан"}</div>
        <button className="neu-copy-line" type="button" disabled={!client?.code} onClick={onCopyCode}>📋 Скопировать код</button>
        <small>🔒 Персональный — только для вас</small>
      </article>
      <article className="neu-card">
        <div className="neu-label">Адрес склада в Китае</div>
        <div className="neu-address">{client?.chinaAddress || "Адрес появится после подтверждения регистрации"}</div>
        <button className="neu-copy-line" type="button" disabled={!client?.chinaAddress} onClick={onCopyAddress}>📋 Скопировать адрес</button>
      </article>
      <button className="neu-accent copy" type="button" disabled={!client?.code || !client?.chinaAddress} onClick={onCopy}>📋 Скопировать код и адрес</button>
      <div className="neu-hint"><span>💡</span><p>При заказе в Китае вставьте код в поле получателя. По нему склад поймет, что посылка ваша.</p></div>
    </section>
  );
}

function StatusesScreen({ boxes }: { boxes: ClientBox[] }) {
  const [filter, setFilter] = useState<"all" | "active" | "delivered">("all");
  const filteredBoxes = useMemo(() => {
    if (filter === "all") return boxes;
    return boxes.filter((box) => {
      const isDelivered = box.status.trim().toLowerCase() === "выдано" || box.status.trim().toLowerCase() === "delivered";
      return filter === "delivered" ? isDelivered : !isDelivered;
    });
  }, [boxes, filter]);

  return (
    <section className="neu-stack">
      <div className="neu-filter" role="tablist" aria-label="Фильтр посылок">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Все</button>
        <button type="button" className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>В процессе</button>
        <button type="button" className={filter === "delivered" ? "active" : ""} onClick={() => setFilter("delivered")}>Выданные</button>
      </div>
      {filteredBoxes.length ? <div className="neu-count">{filteredBoxes.length} посылок</div> : null}
      {filteredBoxes.map((box, index) => <ShipmentCard box={box} index={index} key={box.id} />)}
      {!filteredBoxes.length ? <EmptyStatuses /> : null}
    </section>
  );
}

function ShipmentCard({ box, index }: { box: ClientBox; index: number }) {
  const meta = stageLabels[box.stage] || stageLabels.china_warehouse;
  const progress = Math.min(Math.max(meta.step / 4, 0), 1) * 100;
  return (
    <article className="neu-card shipment-card slide-up" style={{ animationDelay: `${index * 0.06}s` }}>
      <div className="shipment-top">
        <div>
          <strong>{box.track || box.id}</strong>
          <span>{box.id} - {box.weight || "вес уточняется"}</span>
        </div>
        <div className="shipment-status"><i />{meta.title}</div>
      </div>
      <div className="shipment-meta">
        {box.weight ? <span>⚖️ {box.weight}</span> : null}
        {box.amount ? <span>💰 {box.clientRate ? `${box.clientRate} - ${box.amount}` : box.amount}</span> : null}
      </div>
      <div className="neu-progress"><i style={{ width: `${progress}%` }} /></div>
      <StageProgress active={box.stage} />
    </article>
  );
}

function EmptyStatuses() {
  return (
    <div className="neu-card empty-shipments">
      <div className="neu-logo small float">📭</div>
      <strong>Посылок пока нет</strong>
      <span>Сделайте заказ и укажите адрес склада. Ваши посылки появятся здесь после регистрации на складе.</span>
    </div>
  );
}

function StageProgress({ active }: { active: CargoStage }) {
  const stages = Object.keys(stageLabels) as CargoStage[];
  const activeIndex = stages.indexOf(active);
  return (
    <ol className="neu-route">
      {stages.map((stage, index) => (
        <li className={index <= activeIndex ? "done" : ""} key={stage}>
          <b>{stageLabels[stage].icon}</b>
          <div><strong>{stageLabels[stage].title}</strong><span>{stageLabels[stage].text}</span></div>
        </li>
      ))}
    </ol>
  );
}

function BottomNav({ activeTab, onTab }: { activeTab: AppTab; onTab: (tab: AppTab) => void }) {
  return (
    <nav className="neu-bottom-nav" aria-label="Разделы кабинета">
      <button type="button" className={activeTab === "code" ? "active" : ""} onClick={() => onTab("code")}>📋<span>Мой код</span></button>
      <button type="button" className={activeTab === "statuses" ? "active" : ""} onClick={() => onTab("statuses")}>📦<span>Посылки</span></button>
    </nav>
  );
}
