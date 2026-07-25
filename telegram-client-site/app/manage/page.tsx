"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ManageClient = {
  id: string;
  name: string;
  phone: string;
  telegram?: string;
  telegramId?: string;
  comments?: string;
  clientCode?: string;
  chinaAddress?: string;
  registrationSource?: string;
  registrationStatus?: string;
  updatedAt?: string;
};

type Draft = {
  comments: string;
};

type ClientCodeItem = {
  id: string;
  code: string;
  status: string;
  clientId?: string;
};

type SettingsData = {
  chinaAddress?: string;
};

type ViewMode = "pending" | "all";
type ManageSection = "clients" | "broadcast";
type BroadcastAudience = "approved" | "telegram" | "pending";

type BroadcastDraft = {
  audience: BroadcastAudience;
  title: string;
  message: string;
  imageData: string;
  imageName: string;
};

const clientCodeCapacity = 26 * 999;
const generatedCodePattern = /AST\s+[A-Z]\d{3}$/i;
const defaultChinaAddress = "18911759229 浙江省金华市义乌市后宅街道金城一期商城大道F158号拼多多驿站-5697库-奇瑞";

function getWebApp() {
  return (window as any).Telegram?.WebApp;
}

function emptyDraft(client?: ManageClient): Draft {
  return {
    comments: client?.comments || "",
  };
}

function statusLabel(status?: string) {
  if (status === "approved") return "подтвержден";
  if (status === "rejected") return "отклонен";
  return "ожидает";
}

function sourceLabel(source?: string) {
  return source === "telegram" ? "Telegram" : "вручную";
}

function searchableText(client: ManageClient) {
  return [
    client.name,
    client.phone,
    client.telegram,
    client.clientCode,
    client.chinaAddress,
    client.comments,
  ].filter(Boolean).join(" ").toLowerCase();
}

function emptyBroadcastDraft(): BroadcastDraft {
  return {
    audience: "approved",
    title: "",
    message: "",
    imageData: "",
    imageName: "",
  };
}

function audienceLabel(audience: BroadcastAudience) {
  if (audience === "telegram") return "Все Telegram-клиенты";
  if (audience === "pending") return "Заявки на проверке";
  return "Подтвержденные клиенты";
}

export default function ManageMiniApp() {
  const [initData, setInitData] = useState("");
  const [clients, setClients] = useState<ManageClient[]>([]);
  const [clientCodes, setClientCodes] = useState<ClientCodeItem[]>([]);
  const [settings, setSettings] = useState<SettingsData>({});
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [section, setSection] = useState<ManageSection>("clients");
  const [broadcastDraft, setBroadcastDraft] = useState<BroadcastDraft>(emptyBroadcastDraft());
  const [mode, setMode] = useState<ViewMode>("pending");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    let attempts = 0;

    const readTelegramContext = () => {
      const webApp = getWebApp();
      const nextInitData = webApp?.initData || "";
      if (webApp && nextInitData) {
        webApp.ready();
        webApp.expand();
        if (isMounted) setInitData(nextInitData);
        return;
      }
      attempts += 1;
      if (attempts < 30) {
        window.setTimeout(readTelegramContext, 100);
        return;
      }
      if (isMounted) {
        setIsLoading(false);
        setError("Откройте управление через Telegram-бот ZABOTA CARGO.");
      }
    };

    readTelegramContext();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!initData) return;
    loadClients();
  }, [initData]);

  const pendingClients = useMemo(() => clients.filter((client) => client.registrationStatus !== "approved"), [clients]);
  const assignedCodeCount = useMemo(() => {
    const assigned = new Set<string>();
    clients.forEach((client) => {
      if (client.clientCode && generatedCodePattern.test(client.clientCode)) assigned.add(client.clientCode.toLowerCase());
    });
    clientCodes.forEach((item) => {
      if ((item.status === "assigned" || item.clientId) && generatedCodePattern.test(item.code)) assigned.add(item.code.toLowerCase());
    });
    return assigned.size;
  }, [clientCodes, clients]);
  const availableCodeCount = Math.max(clientCodeCapacity - assignedCodeCount, 0);
  const filteredClients = useMemo(() => {
    const base = mode === "pending" ? pendingClients : clients;
    const needle = query.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((client) => searchableText(client).includes(needle));
  }, [clients, mode, pendingClients, query]);
  const selectedClient = clients.find((client) => client.id === selectedId) || filteredClients[0] || pendingClients[0] || clients[0];
  const broadcastRecipientsCount = useMemo(() => {
    return clients.filter((client) => {
      if (!client.telegramId) return false;
      if (broadcastDraft.audience === "telegram") return true;
      if (broadcastDraft.audience === "pending") return client.registrationStatus !== "approved";
      return client.registrationStatus === "approved";
    }).length;
  }, [broadcastDraft.audience, clients]);

  useEffect(() => {
    if (!selectedClient) return;
    setSelectedId(selectedClient.id);
    setDraft(emptyDraft(selectedClient));
  }, [selectedClient?.id]);

  function loadClients() {
    setIsLoading(true);
    fetch(`/api/manage/clients?initData=${encodeURIComponent(initData)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Не удалось загрузить клиентов.");
          return;
        }
        const nextClients = Array.isArray(data.clients) ? data.clients : [];
        setClients(nextClients);
        setClientCodes(Array.isArray(data.clientCodes) ? data.clientCodes : []);
        setSettings(data.settings || {});
        if (!nextClients.some((client: ManageClient) => client.id === selectedId)) {
          setSelectedId(nextClients[0]?.id || "");
        }
        setError("");
      })
      .catch(() => setError("Не удалось подключиться к сервису."))
      .finally(() => setIsLoading(false));
  }

  function update(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateBroadcast(field: keyof BroadcastDraft, value: string) {
    setBroadcastDraft((current) => ({ ...current, [field]: value }));
  }

  function attachBroadcastImage(file?: File) {
    if (!file) {
      updateBroadcast("imageData", "");
      updateBroadcast("imageName", "");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Картинка слишком большая. Выберите файл до 4 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBroadcastDraft((current) => ({ ...current, imageData: String(reader.result || ""), imageName: file.name }));
      setError("");
    };
    reader.onerror = () => setError("Не удалось прочитать изображение.");
    reader.readAsDataURL(file);
  }

  function sendBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = broadcastDraft.title.trim();
    const message = broadcastDraft.message.trim();
    if (!title && !message) {
      setError("Добавьте заголовок или текст сообщения.");
      return;
    }
    if (broadcastRecipientsCount <= 0) {
      setError("В выбранной аудитории нет клиентов с Telegram.");
      return;
    }
    if (!window.confirm(`Отправить сообщение: ${audienceLabel(broadcastDraft.audience)}, получателей ${broadcastRecipientsCount}?`)) return;
    setIsLoading(true);
    fetch("/api/manage/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        initData,
        ...broadcastDraft,
        title,
        message,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Сообщение не отправлено.");
          return;
        }
        setNotice(`Рассылка отправлена: ${data.sent} из ${data.total}.`);
        setBroadcastDraft(emptyBroadcastDraft());
        setError("");
      })
      .catch(() => setError("Не удалось отправить рассылку."))
      .finally(() => setIsLoading(false));
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClient) return;
    setIsLoading(true);
    fetch("/api/manage/clients/approve", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        initData,
        clientId: selectedClient.id,
        telegramId: selectedClient.telegramId,
        ...draft,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Клиент не сохранен.");
          return;
        }
        setClients((current) => current.map((client) => client.id === data.client.id ? data.client : client));
        setNotice("Клиент сохранен. Код и адрес доступны в клиентском кабинете.");
        setError("");
      })
      .catch(() => setError("Не удалось сохранить клиента."))
      .finally(() => setIsLoading(false));
  }

  function issueCode() {
    if (!selectedClient) return;
    setIsLoading(true);
    fetch("/api/manage/clients/issue-code", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        initData,
        clientId: selectedClient.id,
        telegramId: selectedClient.telegramId,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Код не выдан.");
          return;
        }
        setClients((current) => current.map((client) => client.id === data.client.id ? data.client : client));
        if (data.data?.clientCodes) setClientCodes(data.data.clientCodes);
        if (data.data?.settings) setSettings(data.data.settings);
        setNotice(`Код ${data.client.clientCode} выдан клиенту.`);
        setError("");
      })
      .catch(() => setError("Не удалось выдать код клиенту."))
      .finally(() => setIsLoading(false));
  }

  function deleteSelectedClient() {
    if (!selectedClient) return;
    if (!window.confirm(`Удалить клиента "${selectedClient.name}"? Это действие нельзя отменить.`)) return;
    setIsLoading(true);
    fetch("/api/manage/clients/delete", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        initData,
        clientId: selectedClient.id,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Клиент не удален.");
          return;
        }
        const deletedId = data.deletedClientId || selectedClient.id;
        setClients((current) => current.filter((client) => client.id !== deletedId));
        if (data.data?.clientCodes) setClientCodes(data.data.clientCodes);
        setSelectedId("");
        setNotice(`Клиент ${selectedClient.name} удален.`);
        setError("");
      })
      .catch(() => setError("Не удалось удалить клиента."))
      .finally(() => setIsLoading(false));
  }

  return (
    <main className="client-app manage-app">
      <header className="client-shell-head">
        <div className="brand-logo brand-logo-manage"><img src="/zabota-cargo-logo.png" alt="ZABOTA CARGO" /></div>
        <span className="client-pill">{clients.length} всего</span>
      </header>

      <section className="client-scroll">
        <section className="client-hero">
          <span>Клиенты</span>
          <h1>Заявки и база</h1>
          <p>Здесь видны новые регистрации из Telegram и клиенты, добавленные вручную в основной программе.</p>
        </section>

        <nav className="manage-section-tabs" aria-label="Разделы управления">
          <button className={section === "clients" ? "active" : ""} type="button" onClick={() => setSection("clients")}>
            Клиенты
          </button>
          <button className={section === "broadcast" ? "active" : ""} type="button" onClick={() => setSection("broadcast")}>
            Сообщение
          </button>
        </nav>

        {notice ? <p className="client-notice">{notice}</p> : null}
        {error ? <p className="client-error">{error}</p> : null}
        {isLoading ? <p className="client-notice">Загружаем...</p> : null}

        {section === "clients" ? <section className="manage-grid">
          <article className="client-card">
            <div className="client-section-head">
              <h2>Реестр</h2>
              <span>{pendingClients.length} заявок</span>
            </div>

            <div className="manage-tabs" role="tablist" aria-label="Фильтр клиентов">
              <button className={mode === "pending" ? "active" : ""} type="button" onClick={() => setMode("pending")}>
                Заявки
              </button>
              <button className={mode === "all" ? "active" : ""} type="button" onClick={() => setMode("all")}>
                Все клиенты
              </button>
            </div>

            <input
              className="manage-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск: имя, телефон, код, Telegram"
            />

            <div className="manage-list">
              {filteredClients.map((client) => (
                <button className={client.id === selectedId ? "manage-row active" : "manage-row"} type="button" key={client.id} onClick={() => setSelectedId(client.id)}>
                  <strong>{client.name}</strong>
                  <span>{client.phone || "без телефона"} - {client.telegram || "Telegram не указан"}</span>
                  <small>{sourceLabel(client.registrationSource)} - {statusLabel(client.registrationStatus)}{client.clientCode ? ` - ${client.clientCode}` : ""}</small>
                </button>
              ))}
              {!filteredClients.length ? (
                <div className="empty-state">
                  <strong>{mode === "pending" ? "Новых заявок нет" : "Клиентов пока нет"}</strong>
                  <span>{mode === "pending" ? "Переключитесь на раздел Все клиенты, чтобы увидеть уже подтвержденных и ручных клиентов." : "Откройте основную программу, чтобы она отправила локальных клиентов в облако."}</span>
                </div>
              ) : null}
            </div>
          </article>

          {selectedClient ? (
            <form className="client-card client-form manage-form" onSubmit={approve}>
              <div className="client-section-head">
                <h2>{selectedClient.name}</h2>
                <span>{sourceLabel(selectedClient.registrationSource)} - {statusLabel(selectedClient.registrationStatus)}</span>
              </div>
              <div className="manage-code-box">
                <strong>{selectedClient.clientCode || "Код еще не выдан"}</strong>
                <span>{selectedClient.chinaAddress || settings.chinaAddress || defaultChinaAddress}</span>
                <small>Осталось автокодов: {availableCodeCount}</small>
              </div>
              <label>Комментарий<input value={draft.comments} onChange={(event) => update("comments", event.target.value)} placeholder="Примечание менеджера" /></label>
              <button
                className="primary"
                type="button"
                disabled={isLoading || Boolean(selectedClient.clientCode) || availableCodeCount <= 0}
                onClick={issueCode}
              >
                {selectedClient.clientCode ? "Код уже выдан" : "Выдать код"}
              </button>
              <button type="submit" disabled={isLoading}>Сохранить комментарий</button>
              <button className="danger-action" type="button" disabled={isLoading} onClick={deleteSelectedClient}>
                Удалить клиента
              </button>
            </form>
          ) : null}
        </section> : (
          <section className="broadcast-grid">
            <form className="client-card client-form broadcast-form" onSubmit={sendBroadcast}>
              <div className="client-section-head">
                <h2>Новое сообщение</h2>
                <span>{broadcastRecipientsCount} получателей</span>
              </div>

              <label>
                Аудитория
                <select value={broadcastDraft.audience} onChange={(event) => updateBroadcast("audience", event.target.value as BroadcastAudience)}>
                  <option value="approved">Подтвержденные клиенты</option>
                  <option value="telegram">Все Telegram-клиенты</option>
                  <option value="pending">Заявки на проверке</option>
                </select>
              </label>
              <label>
                Заголовок
                <input value={broadcastDraft.title} onChange={(event) => updateBroadcast("title", event.target.value)} placeholder="Например: Поступление товара" />
              </label>
              <label>
                Текст
                <textarea value={broadcastDraft.message} onChange={(event) => updateBroadcast("message", event.target.value)} placeholder="Напишите сообщение клиентам" rows={7} />
              </label>
              <label>
                Изображение
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => attachBroadcastImage(event.target.files?.[0])} />
              </label>
              {broadcastDraft.imageName ? (
                <button type="button" onClick={() => attachBroadcastImage(undefined)}>
                  Убрать изображение
                </button>
              ) : null}
              <button className="primary" type="submit" disabled={isLoading || broadcastRecipientsCount <= 0}>
                Отправить в Telegram
              </button>
            </form>

            <article className="client-card broadcast-preview">
              <div className="client-section-head">
                <h2>Предпросмотр</h2>
                <span>{audienceLabel(broadcastDraft.audience)}</span>
              </div>
              {broadcastDraft.imageData ? <img src={broadcastDraft.imageData} alt="Предпросмотр сообщения" /> : null}
              <div className="broadcast-message-preview">
                {broadcastDraft.title.trim() ? <strong>{broadcastDraft.title.trim()}</strong> : null}
                {broadcastDraft.message.trim() ? <p>{broadcastDraft.message.trim()}</p> : <p>Текст сообщения появится здесь.</p>}
              </div>
              <small>В Telegram сообщение уйдет от клиентского бота ZABOTA CARGO. Клиенты смогут открыть кабинет через кнопку под сообщением.</small>
            </article>
          </section>
        )}
      </section>
    </main>
  );
}
