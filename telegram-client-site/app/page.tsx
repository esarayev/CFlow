"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type TelegramUser = { id?: number; first_name?: string; last_name?: string; username?: string };
type CargoStage = "china_warehouse" | "in_transit" | "kazakhstan" | "astana";
type ClientBox = { id: string; track: string; weight: string; status: string; stage: CargoStage; amount: string; clientRate?: string };
type ClientProfile = {
  registered: boolean;
  approved: boolean;
  client: { name: string; phone: string; status: string; code: string; chinaAddress: string } | null;
  boxes: ClientBox[];
};
type ClientClaim = {
  token: string;
  boxesCount: number;
  title: string;
  boxIds: string[];
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
const profilePollMs = 15000;
const deploymentPollMs = 60000;

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

function currentAssetSignature() {
  if (typeof document === "undefined") return "";
  const assets = [
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="/assets/"]')).map((item) => item.href),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/"]')).map((item) => item.src),
  ];
  return assets.sort().join("|");
}

async function fetchLatestAssetSignature() {
  const response = await fetch(`/?version-check=${Date.now()}`, { cache: "no-store" });
  const html = await response.text();
  const matches = [...html.matchAll(/(?:href|src)="([^"]*\/assets\/[^"]+)"/g)].map((match) => new URL(match[1], window.location.origin).href);
  return matches.sort().join("|");
}

export default function ClientMiniApp() {
  const [telegramUser, setTelegramUser] = useState<TelegramUser | undefined>();
  const [initData, setInitData] = useState("");
  const [profile, setProfile] = useState<ClientProfile>(emptyProfile);
  const [claim, setClaim] = useState<ClientClaim | null>(null);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("code");
  const [showIntro, setShowIntro] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ fullName: "", whatsappPhone: "" });

  const refreshProfile = useCallback((showLoading = false) => {
    if (!initData) return;
    if (showLoading) setIsLoading(true);
    fetch(`/api/client/me?initData=${encodeURIComponent(initData)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) {
          const nextProfile = { registered: data.registered, approved: data.approved, client: data.client, boxes: data.boxes || [] };
          setProfile(nextProfile);
          cacheProfile(nextProfile);
          setError("");
        } else {
          setError(data.error || "Не удалось загрузить кабинет");
        }
      })
      .catch(() => setError("Не удалось подключиться к сервису"))
      .finally(() => {
        setHasCheckedProfile(true);
        if (showLoading) setIsLoading(false);
      });
  }, [initData]);

  const refreshClaim = useCallback(() => {
    if (!initData) return;
    fetch(`/api/client/claim?initData=${encodeURIComponent(initData)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) {
          setClaim(data.claim || null);
          return;
        }
        setClaim(null);
      })
      .catch(() => setClaim(null));
  }, [initData]);

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
    refreshProfile(true);
  }, [initData, refreshProfile]);

  useEffect(() => {
    if (!initData) return;
    const timer = window.setInterval(() => refreshProfile(false), profilePollMs);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshProfile(false);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [initData, refreshProfile]);

  useEffect(() => {
    if (!initData || !profile.approved) {
      setClaim(null);
      return;
    }
    refreshClaim();
    const timer = window.setInterval(refreshClaim, profilePollMs);
    return () => window.clearInterval(timer);
  }, [initData, profile.approved, profile.boxes.length, refreshClaim]);

  useEffect(() => {
    const initialSignature = currentAssetSignature();
    if (!initialSignature) return;
    let stopped = false;
    const checkDeployment = () => {
      fetchLatestAssetSignature()
        .then((latestSignature) => {
          if (!stopped && latestSignature && latestSignature !== initialSignature) window.location.reload();
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(checkDeployment, deploymentPollMs);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkDeployment();
    };
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

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
            onCopyName={() => copyText(client?.name || "", "Имя получателя скопировано")}
            onCopyCode={() => copyText(client?.code || "", "Код клиента скопирован")}
            onCopyAddress={() => copyText(client?.chinaAddress || "", "Адрес склада скопирован")}
          />
        ) : <StatusesScreen boxes={profile.boxes} claim={claim} onRefreshClaim={refreshClaim} />}
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
  onCopyName,
  onCopyCode,
  onCopyAddress,
}: {
  client: ClientProfile["client"];
  onCopy: () => void;
  onCopyName: () => void;
  onCopyCode: () => void;
  onCopyAddress: () => void;
}) {
  return (
    <section className="address-screen slide-up">
      <div className="address-title-block">
        <span>Ваш адрес в Китае</span>
        <h1>Данные для заказа</h1>
      </div>
      <div className="address-route-pill">
        <span>✈</span>
        <strong>Китай → Казахстан</strong>
      </div>
      <article className="address-client-row">
        <div>
          <span>Получатель</span>
          <strong>{client?.name || "Клиент"}</strong>
        </div>
        <button type="button" disabled={!client?.name} onClick={onCopyName} aria-label="Скопировать имя клиента">
          <CopyIcon />
        </button>
      </article>
      <article className="address-fields-card">
        <CopyInfoRow
          label="Код клиента"
          value={client?.code || "Код еще не выдан"}
          helper="Обязательно укажите вместе с адресом склада."
          disabled={!client?.code}
          onCopy={onCopyCode}
        />
        <CopyInfoRow
          label="Адрес склада в Китае"
          value={client?.chinaAddress || "Адрес появится после подтверждения регистрации"}
          helper="Укажите как адрес доставки на китайском маркетплейсе."
          disabled={!client?.chinaAddress}
          onCopy={onCopyAddress}
        />
      </article>
      <button className="address-copy-all" type="button" disabled={!client?.code || !client?.chinaAddress} onClick={onCopy}>
        <CopyIcon />
        <span>Скопировать всё</span>
      </button>
      <div className="address-tip">
        <strong>Важно</strong>
        <p>Склад определяет владельца посылки по коду клиента. Если указать только адрес, товар может попасть в нераспознанные.</p>
      </div>
    </section>
  );
}

function CopyInfoRow({
  label,
  value,
  helper,
  disabled,
  onCopy,
}: {
  label: string;
  value: string;
  helper: string;
  disabled: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="copy-info-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
      <button type="button" disabled={disabled} onClick={onCopy} aria-label={`Скопировать: ${label}`}>
        <CopyIcon />
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function StatusesScreen({ boxes, claim, onRefreshClaim }: { boxes: ClientBox[]; claim: ClientClaim | null; onRefreshClaim: () => void }) {
  const [filter, setFilter] = useState<"all" | "active" | "delivered">("all");
  const [showQr, setShowQr] = useState(false);
  const filteredBoxes = useMemo(() => {
    if (filter === "all") return boxes;
    return boxes.filter((box) => {
      const isDelivered = box.status.trim().toLowerCase() === "выдано" || box.status.trim().toLowerCase() === "delivered";
      return filter === "delivered" ? isDelivered : !isDelivered;
    });
  }, [boxes, filter]);

  return (
    <section className="neu-stack">
      {claim ? (
        <article className="neu-card claim-card">
          <div className="claim-card-head">
            <div>
              <span>Выдача товара</span>
              <strong>{claim.title}</strong>
            </div>
            <button type="button" onClick={() => setShowQr((current) => !current)}>
              {showQr ? "Скрыть QR" : "Предъявить QR"}
            </button>
          </div>
          {showQr ? (
            <div className="claim-qr-box">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(claim.token)}`}
                alt="QR для получения товара"
              />
              <p>Покажите этот QR менеджеру при получении товара на складе.</p>
            </div>
          ) : null}
          <small>QR активен для посылок, которые уже готовы к выдаче. Если товар еще в пути, менеджер увидит это при проверке.</small>
        </article>
      ) : boxes.length ? (
        <article className="neu-card claim-card muted">
          <div className="claim-card-head">
            <div>
              <span>Выдача товара</span>
              <strong>QR появится после поступления на склад</strong>
            </div>
            <button type="button" onClick={onRefreshClaim}>Обновить</button>
          </div>
          <small>Когда накладную отметят как поступившую в Астану, здесь появится QR для получения.</small>
        </article>
      ) : null}
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
