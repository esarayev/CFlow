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

export default function ManageMiniApp() {
  const [initData, setInitData] = useState("");
  const [clients, setClients] = useState<ManageClient[]>([]);
  const [clientCodes, setClientCodes] = useState<ClientCodeItem[]>([]);
  const [settings, setSettings] = useState<SettingsData>({});
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
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
        setError("Откройте управление через Telegram-бот CFlow.");
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
  const availableCodeCount = useMemo(() => clientCodes.filter((item) => item.status !== "assigned" && !item.clientId).length, [clientCodes]);
  const filteredClients = useMemo(() => {
    const base = mode === "pending" ? pendingClients : clients;
    const needle = query.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((client) => searchableText(client).includes(needle));
  }, [clients, mode, pendingClients, query]);
  const selectedClient = clients.find((client) => client.id === selectedId) || filteredClients[0] || pendingClients[0] || clients[0];

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
      .catch(() => setError("Не удалось подключиться к CFlow."))
      .finally(() => setIsLoading(false));
  }

  function update(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClient) return;
    setIsLoading(true);
    fetch("/api/manage/clients/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
      headers: { "content-type": "application/json" },
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

  return (
    <main className="client-app manage-app">
      <header className="client-shell-head">
        <div className="brand-logo brand-logo-manage"><img src="/cflow-manage-logo.png" alt="CFlow Manage" /></div>
        <span className="client-pill">{clients.length} всего</span>
      </header>

      <section className="client-scroll">
        <section className="client-hero">
          <span>Клиенты</span>
          <h1>Заявки и база</h1>
          <p>Здесь видны новые регистрации из Telegram и клиенты, добавленные вручную в основной программе.</p>
        </section>

        {notice ? <p className="client-notice">{notice}</p> : null}
        {error ? <p className="client-error">{error}</p> : null}
        {isLoading ? <p className="client-notice">Загружаем...</p> : null}

        <section className="manage-grid">
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
                  <span>{client.phone || "без телефона"} · {client.telegram || "Telegram не указан"}</span>
                  <small>{sourceLabel(client.registrationSource)} · {statusLabel(client.registrationStatus)}{client.clientCode ? ` · ${client.clientCode}` : ""}</small>
                </button>
              ))}
              {!filteredClients.length ? (
                <div className="empty-state">
                  <strong>{mode === "pending" ? "Новых заявок нет" : "Клиентов пока нет"}</strong>
                  <span>{mode === "pending" ? "Переключитесь на “Все клиенты”, чтобы увидеть уже подтвержденных и ручных клиентов." : "Откройте основную программу CFlow, чтобы она отправила локальных клиентов в облако."}</span>
                </div>
              ) : null}
            </div>
          </article>

          {selectedClient ? (
            <form className="client-card client-form manage-form" onSubmit={approve}>
              <div className="client-section-head">
                <h2>{selectedClient.name}</h2>
                <span>{sourceLabel(selectedClient.registrationSource)} · {statusLabel(selectedClient.registrationStatus)}</span>
              </div>
              <div className="manage-code-box">
                <strong>{selectedClient.clientCode || "Код еще не выдан"}</strong>
                <span>{selectedClient.chinaAddress || settings.chinaAddress || "Адрес склада пока не задан"}</span>
                <small>Свободно кодов: {availableCodeCount}</small>
              </div>
              <label>Комментарий<input value={draft.comments} onChange={(event) => update("comments", event.target.value)} placeholder="Примечание менеджера" /></label>
              <button
                className="primary"
                type="button"
                disabled={isLoading || Boolean(selectedClient.clientCode) || availableCodeCount <= 0 || !settings.chinaAddress}
                onClick={issueCode}
              >
                {selectedClient.clientCode ? "Код уже выдан" : "Выдать код"}
              </button>
              <button type="submit" disabled={isLoading}>Сохранить комментарий</button>
            </form>
          ) : null}
        </section>
      </section>
    </main>
  );
}
