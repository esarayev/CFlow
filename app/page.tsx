"use client";

import { Dispatch, FormEvent, RefObject, SetStateAction, useEffect, useMemo, useRef, useState } from "react";

type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: string;
  permissions: string[];
  status: string;
  statusLabel?: string;
};

type BoxItem = {
  id: string;
  track: string;
  clientId?: string;
  client: string;
  phone: string;
  status: string;
  place: string;
  weight: string;
  dimensions?: string;
  route: string;
  payment: string;
  amount?: number;
  photo?: string;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
  owner: string;
};

type ClientItem = {
  id: string;
  name: string;
  phone: string;
  telegram?: string;
  comments?: string;
};

type ActivityItem = {
  id: string;
  time: string;
  displayTime?: string;
  title: string;
  text: string;
  user: string;
};

type WarehouseZone = {
  zone: string;
  fill: number;
  boxes: number;
  note: string;
};

type ShipmentItem = {
  id: string;
  type: string;
  title: string;
  date: string;
  route: string;
  boxes: string[];
  cost: number;
};

type FinanceData = {
  incomeToday: number;
  expectedToday: number;
  expensesToday: number;
  debt: number;
};

type CflowData = {
  boxes: BoxItem[];
  clients: ClientItem[];
  warehouse: WarehouseZone[];
  shipments: ShipmentItem[];
  finances: FinanceData;
  activity: ActivityItem[];
};

type ApiResult = {
  ok: boolean;
  error?: string;
  data?: CflowData;
};

type ActionMode = "receive" | "issue" | "move" | "client" | "shipment" | "payment" | "problem";

type ActionFormState = {
  track: string;
  client: string;
  phone: string;
  weight: string;
  dimensions: string;
  place: string;
  route: string;
  payment: string;
  amount: string;
  comment: string;
  telegram: string;
  shipmentTitle: string;
  shipmentType: string;
  shipmentRoute: string;
  shipmentDate: string;
  shipmentBoxes: string;
  shipmentCost: string;
};

declare global {
  interface Window {
    cflowUsers?: {
      list: () => Promise<SessionUser[]>;
      authenticate: (username: string, password: string) => Promise<{ ok: boolean; error?: string; user?: SessionUser }>;
      create: (user: { name: string; username: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string; users?: SessionUser[] }>;
      update: (user: { id: string; name: string; username: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string; users?: SessionUser[] }>;
      delete: (userId: string) => Promise<{ ok: boolean; error?: string; users?: SessionUser[] }>;
    };
    cflowData?: {
      snapshot: () => Promise<ApiResult>;
      receiveBox: (payload: Record<string, string>) => Promise<ApiResult>;
      moveBox: (payload: Record<string, string>) => Promise<ApiResult>;
      issueBox: (payload: Record<string, string>) => Promise<ApiResult>;
      problemBox: (payload: Record<string, string>) => Promise<ApiResult>;
      createClient: (payload: Record<string, string>) => Promise<ApiResult>;
      createShipment: (payload: Record<string, string>) => Promise<ApiResult>;
      recordPayment: (payload: Record<string, string>) => Promise<ApiResult>;
      resetDemo: () => Promise<ApiResult>;
    };
  }
}

const fallbackData: CflowData = {
  boxes: [],
  clients: [],
  warehouse: [],
  shipments: [],
  finances: { incomeToday: 0, expectedToday: 0, expensesToday: 0, debt: 0 },
  activity: [],
};

const navItems = ["Dashboard", "Коробки", "Клиенты", "Склад", "Отправки", "Финансы", "Отчеты", "Настройки"];

function canSeeFinance(user: SessionUser) {
  return user.permissions.includes("all") || user.permissions.includes("finance");
}

function money(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} T`;
}

function isProblem(box: BoxItem) {
  return box.status === "Проблема";
}

function isWaitingIssue(box: BoxItem) {
  return box.status === "Ждет выдачи";
}

export default function Home() {
  const searchRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<CflowData>(fallbackData);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [actionMode, setActionMode] = useState<ActionMode>("receive");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [form, setForm] = useState({
    track: "",
    client: "",
    phone: "",
    weight: "",
    dimensions: "",
    place: "Зона приемки",
    route: "Китай -> Казахстан",
    payment: "Не оплачено",
    amount: "",
    comment: "",
    telegram: "",
    shipmentTitle: "",
    shipmentType: "Контейнер",
    shipmentRoute: "Китай -> Казахстан",
    shipmentDate: new Date().toISOString().slice(0, 10),
    shipmentBoxes: "",
    shipmentCost: "",
  });

  const showFinance = sessionUser ? canSeeFinance(sessionUser) : false;

  useEffect(() => {
    if (!sessionUser || !window.cflowData) return;
    window.cflowData.snapshot().then(applyResult).catch(() => setError("Не удалось загрузить базу CFlow"));
  }, [sessionUser]);

  useEffect(() => {
    if (!selectedId && data.boxes[0]) setSelectedId(data.boxes[0].id);
  }, [data.boxes, selectedId]);

  const filteredBoxes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.boxes;
    return data.boxes.filter((box) =>
      Object.values(box).some((value) => String(value || "").toLowerCase().includes(normalized)),
    );
  }, [data.boxes, query]);

  const selectedBox = data.boxes.find((box) => box.id === selectedId) ?? filteredBoxes[0] ?? data.boxes[0];

  useEffect(() => {
    if (!query.trim() || !filteredBoxes[0]) return;
    if (!filteredBoxes.some((box) => box.id === selectedId)) {
      setSelectedId(filteredBoxes[0].id);
    }
  }, [filteredBoxes, query, selectedId]);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.clients;
    return data.clients.filter((client) =>
      Object.values(client).some((value) => String(value || "").toLowerCase().includes(normalized)),
    );
  }, [data.clients, query]);

  const metrics = [
    { label: "В работе", value: String(data.boxes.filter((box) => box.status !== "Выдано").length), delta: `${data.boxes.length} всего`, tone: "neutral" },
    { label: "Пришло сегодня", value: String(data.boxes.filter((box) => box.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length), delta: "новые приемки", tone: "blue" },
    { label: "Ждет выдачи", value: String(data.boxes.filter(isWaitingIssue).length), delta: "готово клиентам", tone: "green" },
    { label: "Проблемные", value: String(data.boxes.filter(isProblem).length), delta: "требуют проверки", tone: "red" },
  ];

  function applyResult(result: ApiResult) {
    if (!result.ok || !result.data) {
      setError(result.error || "Операция не выполнена");
      return;
    }

    setData(result.data);
    setError("");
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!window.cflowUsers) {
      setLoginError("Служба авторизации не загрузилась. Перезапустите CFlow с ярлыка.");
      return;
    }

    const result = await window.cflowUsers.authenticate(loginName, loginPassword);
    if (result.ok && result.user) {
      setSessionUser(result.user);
      setLoginError("");
      return;
    }

    setLoginError(result.error || "Неверный логин или пароль");
  }

  function setAction(mode: ActionMode) {
    setActionMode(mode);
    setNotice("");
    setError("");
    if (mode === "issue" || mode === "move" || mode === "payment" || mode === "problem") {
      if (selectedBox) setForm((current) => ({ ...current, track: selectedBox.track, shipmentBoxes: selectedBox.id }));
    }
  }

  async function runApi(call: Promise<ApiResult>, success: string) {
    const result = await call;
    applyResult(result);
    if (result.ok) setNotice(success);
    return result;
  }

  function currentUserName() {
    return sessionUser?.name || "Оператор";
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.cflowData) {
      setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }

    const boxId = selectedBox?.id || "";
    const user = currentUserName();

    if (actionMode === "receive") {
      const result = await runApi(window.cflowData.receiveBox({ ...form, user }), "Коробка принята и сохранена");
      if (result.ok) {
        setForm((current) => ({ ...current, track: "", client: "", phone: "", weight: "", dimensions: "", comment: "", amount: "" }));
        setTimeout(() => trackRef.current?.focus(), 0);
      }
      return;
    }

    if (actionMode === "issue") {
      await runApi(window.cflowData.issueBox({ boxId, user }), "Коробка выдана клиенту");
      return;
    }

    if (actionMode === "move") {
      await runApi(window.cflowData.moveBox({ boxId, place: form.place, user }), "Место хранения обновлено");
      return;
    }

    if (actionMode === "problem") {
      await runApi(window.cflowData.problemBox({ boxId, comment: form.comment, user }), "Коробка отмечена как проблемная");
      return;
    }

    if (actionMode === "client") {
      await runApi(window.cflowData.createClient({ name: form.client, phone: form.phone, telegram: form.telegram, comments: form.comment, user }), "Клиент сохранен");
      return;
    }

    if (actionMode === "shipment") {
      await runApi(
        window.cflowData.createShipment({
          title: form.shipmentTitle,
          type: form.shipmentType,
          route: form.shipmentRoute,
          date: form.shipmentDate,
          boxIds: form.shipmentBoxes,
          cost: form.shipmentCost,
          user,
        }),
        "Отправка создана",
      );
      return;
    }

    if (actionMode === "payment") {
      await runApi(window.cflowData.recordPayment({ boxId, amount: form.amount, user }), "Оплата проведена");
    }
  }

  async function resetDemoData() {
    if (!window.cflowData) return;
    await runApi(window.cflowData.resetDemo(), "База очищена. Можно начинать работу с нуля");
  }

  function openScanner() {
    setActiveNav("Коробки");
    setAction("receive");
    setTimeout(() => trackRef.current?.focus(), 0);
    setNotice("Сканер готов: отсканируйте трек сразу в поле приемки");
  }

  if (!sessionUser) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-label="Вход в CFlow">
          <div className="brand auth-brand">
            <img className="brand-logo brand-logo-auth" src="./cflow-logo-tight.png" alt="CFlow" />
            <div>
              <strong>CFlow</strong>
              <span>рабочий кабинет карго-точки</span>
            </div>
          </div>
          <div>
            <p className="eyebrow">Безопасный вход</p>
            <h1>Вход сотрудника</h1>
            <p className="lead">
              Доступные разделы зависят от роли. Пользователи создаются в отдельном приложении CFlow Пользователи.
            </p>
          </div>
          <form className="auth-form" onSubmit={unlock}>
            <label>
              Логин
              <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="login" />
            </label>
            <label>
              Пароль
              <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Пароль" />
            </label>
            <button className="primary" type="submit">Войти</button>
          </form>
          {loginError ? <p className="auth-error">{loginError}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Основная навигация">
        <div className="brand sidebar-brand">
          <img className="brand-logo" src="./cflow-logo-tight.png" alt="CFlow" />
          <div>
            <strong>CFlow</strong>
            <span>{sessionUser.role}</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.filter((item) => showFinance || !["Финансы", "Отчеты"].includes(item)).map((item) => (
            <button className={activeNav === item ? "active" : ""} type="button" key={item} onClick={() => setActiveNav(item)}>
              <span aria-hidden="true">{item.slice(0, 1)}</span>
              {item}
            </button>
          ))}
        </nav>

        <div className="operator-card">
          <span>Сессия</span>
          <strong>{sessionUser.name}</strong>
          <p>{showFinance ? "Полный доступ к операциям и финансам." : "Финансы скрыты по роли сотрудника."}</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="search">
            <span>Поиск</span>
            <input
              ref={searchRef}
              aria-label="Поиск по треку, телефону, ФИО, QR, коробке, контейнеру или комментарию"
              placeholder="Трек, телефон, клиент, QR, коробка, контейнер..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="top-actions">
            <button type="button" onClick={() => setAction("receive")}>Принять</button>
            <button type="button" className="primary" onClick={() => setAction("issue")}>Выдать</button>
          </div>
        </header>

        {notice ? <p className="app-notice">{notice}</p> : null}
        {error ? <p className="app-error">{error}</p> : null}

        <section className="operation-board">
          <div>
            <p className="eyebrow">{activeNav}</p>
            <h1>Операционный центр карго-точки</h1>
            <p className="lead">
              Все действия сохраняются в базе CFlow: приемка, выдача, перемещение, клиенты, отправки, оплаты и история.
            </p>
          </div>
          <div className="scan-card">
            <span>Быстрое действие</span>
            <strong>Сканировать трек или QR</strong>
            <p>Оператор начинает приемку или выдачу без переходов по меню.</p>
            <button className="primary" type="button" onClick={openScanner}>Открыть сканер</button>
          </div>
        </section>

        <section className="metrics-grid" aria-label="Ключевые показатели">
          {metrics.map((metric) => (
            <article className={`metric ${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.delta}</p>
            </article>
          ))}
        </section>

        <section className="main-grid">
          <div className="left-flow">
            <article className="panel intake-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Живая операция</span>
                  <h2>{actionTitle(actionMode)}</h2>
                </div>
              </div>
              <div className="quick-actions">
                <button className={actionMode === "receive" ? "primary" : ""} type="button" onClick={() => setAction("receive")}>Принять товар</button>
                <button className={actionMode === "client" ? "primary" : ""} type="button" onClick={() => setAction("client")}>Добавить клиента</button>
                <button className={actionMode === "issue" ? "primary" : ""} type="button" onClick={() => setAction("issue")}>Выдать товар</button>
                <button className={actionMode === "move" ? "primary" : ""} type="button" onClick={() => setAction("move")}>Переместить</button>
                <button className={actionMode === "shipment" ? "primary" : ""} type="button" onClick={() => setAction("shipment")}>Создать отправку</button>
                {showFinance ? <button className={actionMode === "payment" ? "primary" : ""} type="button" onClick={() => setAction("payment")}>Принять оплату</button> : null}
              </div>
              <ActionForm
                mode={actionMode}
                form={form}
                setForm={setForm}
                selectedBox={selectedBox}
                showFinance={showFinance}
                trackRef={trackRef}
                onSubmit={submitAction}
              />
            </article>

            {activeNav === "Клиенты" ? (
              <ClientsPanel clients={filteredClients} />
            ) : activeNav === "Склад" ? (
              <WarehousePanel zones={data.warehouse} />
            ) : activeNav === "Отправки" ? (
              <ShipmentsPanel shipments={data.shipments} />
            ) : activeNav === "Финансы" && showFinance ? (
              <FinancePanel finances={data.finances} />
            ) : activeNav === "Настройки" ? (
              <SettingsPanel onReset={resetDemoData} />
            ) : (
              <BoxesPanel boxes={filteredBoxes} selectedId={selectedId} setSelectedId={setSelectedId} />
            )}

            <div className="split-panels">
              <WarehousePanel zones={data.warehouse} compact />
              <ActivityPanel activity={data.activity} />
            </div>
          </div>

          {selectedBox ? (
            <aside className="details" aria-label="Детали коробки">
              <div className="details-photo">
                <span>{selectedBox.photo ? "Фото прикреплено" : "Фото коробки"}</span>
              </div>
              <div className="details-head">
                <div>
                  <span className="eyebrow">Карточка коробки</span>
                  <h2>{selectedBox.client}</h2>
                </div>
                <span className={`status ${isProblem(selectedBox) ? "danger" : ""}`}>{selectedBox.status}</span>
              </div>
              <dl className="details-list">
                <div><dt>ID</dt><dd>{selectedBox.id}</dd></div>
                <div><dt>Трек</dt><dd>{selectedBox.track}</dd></div>
                <div><dt>Телефон</dt><dd>{selectedBox.phone}</dd></div>
                <div><dt>Вес</dt><dd>{selectedBox.weight}</dd></div>
                <div><dt>Размеры</dt><dd>{selectedBox.dimensions || "Не указаны"}</dd></div>
                <div><dt>Место</dt><dd>{selectedBox.place}</dd></div>
                <div><dt>Маршрут</dt><dd>{selectedBox.route}</dd></div>
                <div><dt>Оплата</dt><dd>{showFinance ? selectedBox.payment : "Скрыто"}</dd></div>
                <div><dt>Ответственный</dt><dd>{selectedBox.owner}</dd></div>
                <div><dt>Комментарий</dt><dd>{selectedBox.comment || "Нет"}</dd></div>
              </dl>
              <div className="detail-actions">
                <button type="button" className="primary" onClick={() => setAction("issue")}>Выдать</button>
                <button type="button" onClick={() => setAction("move")}>Переместить</button>
                <button type="button" onClick={() => setAction("problem")}>Проблема</button>
              </div>
            </aside>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function actionTitle(mode: ActionMode) {
  const titles: Record<ActionMode, string> = {
    receive: "Прием новой коробки",
    issue: "Выдача выбранной коробки",
    move: "Перемещение по складу",
    client: "Создание клиента",
    shipment: "Создание отправки",
    payment: "Прием оплаты",
    problem: "Проблемная коробка",
  };
  return titles[mode];
}

function ActionForm({
  mode,
  form,
  setForm,
  selectedBox,
  showFinance,
  trackRef,
  onSubmit,
}: {
  mode: ActionMode;
  form: ActionFormState;
  setForm: Dispatch<SetStateAction<ActionFormState>>;
  selectedBox?: BoxItem;
  showFinance: boolean;
  trackRef: RefObject<HTMLInputElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  if (mode === "issue") {
    return (
      <form className="action-form" onSubmit={onSubmit}>
        <p>Будет выдана коробка: <strong>{selectedBox ? `${selectedBox.id} · ${selectedBox.client}` : "не выбрана"}</strong></p>
        <button className="primary" type="submit" disabled={!selectedBox || selectedBox.status === "Выдано"}>Подтвердить выдачу</button>
      </form>
    );
  }

  if (mode === "move") {
    return (
      <form className="action-form action-form-inline" onSubmit={onSubmit}>
        <label>Новое место<input value={form.place} onChange={(event) => update("place", event.target.value)} placeholder="A-04 / S2 / P3" /></label>
        <button className="primary" type="submit" disabled={!selectedBox}>Сохранить место</button>
      </form>
    );
  }

  if (mode === "problem") {
    return (
      <form className="action-form action-form-inline" onSubmit={onSubmit}>
        <label>Причина<input value={form.comment} onChange={(event) => update("comment", event.target.value)} placeholder="Что проверить" /></label>
        <button className="primary" type="submit" disabled={!selectedBox}>Отметить проблему</button>
      </form>
    );
  }

  if (mode === "client") {
    return (
      <form className="action-form action-form-grid" onSubmit={onSubmit}>
        <label>Имя<input value={form.client} onChange={(event) => update("client", event.target.value)} placeholder="Имя клиента" /></label>
        <label>Телефон<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+7..." /></label>
        <label>Telegram<input value={form.telegram} onChange={(event) => update("telegram", event.target.value)} placeholder="@username" /></label>
        <label>Комментарий<input value={form.comment} onChange={(event) => update("comment", event.target.value)} placeholder="Заметка" /></label>
        <button className="primary" type="submit">Сохранить клиента</button>
      </form>
    );
  }

  if (mode === "shipment") {
    return (
      <form className="action-form action-form-grid" onSubmit={onSubmit}>
        <label>Тип<input value={form.shipmentType} onChange={(event) => update("shipmentType", event.target.value)} placeholder="Контейнер / Машина / Авиа" /></label>
        <label>Номер<input value={form.shipmentTitle} onChange={(event) => update("shipmentTitle", event.target.value)} placeholder="KZ-19" /></label>
        <label>Маршрут<input value={form.shipmentRoute} onChange={(event) => update("shipmentRoute", event.target.value)} /></label>
        <label>Дата<input type="date" value={form.shipmentDate} onChange={(event) => update("shipmentDate", event.target.value)} /></label>
        <label>ID коробок через запятую<input value={form.shipmentBoxes} onChange={(event) => update("shipmentBoxes", event.target.value)} placeholder="CF-000001, CF-000002" /></label>
        {showFinance ? <label>Стоимость<input value={form.shipmentCost} onChange={(event) => update("shipmentCost", event.target.value)} placeholder="0" /></label> : null}
        <button className="primary" type="submit">Создать отправку</button>
      </form>
    );
  }

  if (mode === "payment" && showFinance) {
    return (
      <form className="action-form action-form-inline" onSubmit={onSubmit}>
        <label>Сумма<input value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="18600" /></label>
        <button className="primary" type="submit" disabled={!selectedBox}>Провести оплату</button>
      </form>
    );
  }

  return (
    <form className="action-form action-form-grid" onSubmit={onSubmit}>
      <label>Трек / QR<input ref={trackRef} value={form.track} onChange={(event) => update("track", event.target.value)} placeholder="YT938475120CN" /></label>
      <label>Клиент<input value={form.client} onChange={(event) => update("client", event.target.value)} placeholder="Имя клиента" /></label>
      <label>Телефон<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+7..." /></label>
      <label>Вес<input value={form.weight} onChange={(event) => update("weight", event.target.value)} placeholder="8.4" /></label>
      <label>Размеры<input value={form.dimensions} onChange={(event) => update("dimensions", event.target.value)} placeholder="42x35x28" /></label>
      <label>Место<input value={form.place} onChange={(event) => update("place", event.target.value)} placeholder="A-04 / S2 / P3" /></label>
      <label>Маршрут<input value={form.route} onChange={(event) => update("route", event.target.value)} /></label>
      {showFinance ? <label>Оплата<input value={form.payment} onChange={(event) => update("payment", event.target.value)} placeholder="Не оплачено" /></label> : null}
      {showFinance ? <label>Сумма<input value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="18600" /></label> : null}
      <label>Комментарий<input value={form.comment} onChange={(event) => update("comment", event.target.value)} placeholder="Заметка" /></label>
      <button className="primary" type="submit">Принять коробку</button>
    </form>
  );
}

function BoxesPanel({ boxes, selectedId, setSelectedId }: { boxes: BoxItem[]; selectedId: string; setSelectedId: (id: string) => void }) {
  return (
    <article className="panel">
      <div className="panel-head compact">
        <div>
          <span className="eyebrow">Коробки</span>
          <h2>В работе сейчас</h2>
        </div>
        <span className="counter">{boxes.length} найдено</span>
      </div>
      <div className="box-list">
        {boxes.map((box) => (
          <button className={selectedId === box.id ? "box-row selected" : "box-row"} type="button" key={box.id} onClick={() => setSelectedId(box.id)}>
            <span className="box-id">{box.id}</span>
            <span><strong>{box.client}</strong><small>{box.track} · {box.phone}</small></span>
            <span className="hide-mobile">{box.place}</span>
            <span className={`status ${isProblem(box) ? "danger" : ""}`}>{box.status}</span>
          </button>
        ))}
        {!boxes.length ? <p className="empty-state">Ничего не найдено</p> : null}
      </div>
    </article>
  );
}

function ClientsPanel({ clients }: { clients: ClientItem[] }) {
  return (
    <article className="panel">
      <div className="panel-head compact"><div><span className="eyebrow">Клиенты</span><h2>Клиентская база</h2></div></div>
      <div className="entity-list">
        {clients.map((client) => (
          <div className="entity-row" key={client.id}>
            <span className="box-id">{client.id}</span>
            <strong>{client.name}</strong>
            <span>{client.phone || "Без телефона"}</span>
            <span>{client.telegram || "Telegram не указан"}</span>
          </div>
        ))}
        {!clients.length ? <p className="empty-state">Клиенты не найдены</p> : null}
      </div>
    </article>
  );
}

function WarehousePanel({ zones, compact = false }: { zones: WarehouseZone[]; compact?: boolean }) {
  return (
    <article className="panel">
      <div className="panel-head compact">
        <h2>Склад</h2>
        {!compact ? <span className="counter">{zones.length} зон</span> : null}
      </div>
      <div className="warehouse-grid">
        {zones.map((item) => (
          <div className="zone" key={item.zone}>
            <div><strong>Зона {item.zone}</strong><span>{item.boxes} коробок</span></div>
            <div className="bar"><i style={{ width: `${item.fill}%` }} /></div>
            <p>{item.note} · заполнено {item.fill}%</p>
          </div>
        ))}
        {!zones.length ? <p className="empty-state">Склад пока не настроен. Укажите место хранения при приемке первой коробки.</p> : null}
      </div>
    </article>
  );
}

function ShipmentsPanel({ shipments }: { shipments: ShipmentItem[] }) {
  return (
    <article className="panel">
      <div className="panel-head compact"><div><span className="eyebrow">Отправки</span><h2>Список отправок</h2></div></div>
      <div className="entity-list">
        {shipments.map((shipment) => (
          <div className="entity-row" key={shipment.id}>
            <span className="box-id">{shipment.id}</span>
            <strong>{shipment.type} {shipment.title}</strong>
            <span>{shipment.route}</span>
            <span>{shipment.boxes.length} коробок</span>
          </div>
        ))}
        {!shipments.length ? <p className="empty-state">Отправок пока нет. Создайте первую отправку через рабочую форму выше.</p> : null}
      </div>
    </article>
  );
}

function FinancePanel({ finances }: { finances: FinanceData }) {
  return (
    <article className="panel">
      <div className="panel-head compact"><div><span className="eyebrow">Финансы</span><h2>Операции сегодня</h2></div></div>
      <div className="finance-grid">
        <div><span>Доход</span><strong>{money(finances.incomeToday)}</strong></div>
        <div><span>Ожидается</span><strong>{money(finances.expectedToday)}</strong></div>
        <div><span>Расход</span><strong>{money(finances.expensesToday)}</strong></div>
        <div><span>Долг</span><strong>{money(finances.debt)}</strong></div>
      </div>
    </article>
  );
}

function SettingsPanel({ onReset }: { onReset: () => void }) {
  return (
    <article className="panel">
      <div className="panel-head compact"><div><span className="eyebrow">Настройки</span><h2>Сервис</h2></div></div>
      <p className="lead">Данные приложения хранятся локально в папке пользователя Windows. Новая установка стартует с пустой базы, без демо-коробок и тестовых клиентов.</p>
      <div className="detail-actions">
        <button type="button" onClick={onReset}>Очистить базу</button>
      </div>
    </article>
  );
}

function ActivityPanel({ activity }: { activity: ActivityItem[] }) {
  return (
    <article className="panel">
      <div className="panel-head compact"><h2>Последние действия</h2><span className="counter">audit on</span></div>
      <div className="activity">
        {activity.slice(0, 8).map((item) => (
          <div key={item.id}>
            <time>{item.displayTime || item.time.slice(11, 16)}</time>
            <strong>{item.title}</strong>
            <p>{item.text}</p>
            <span>{item.user}</span>
          </div>
        ))}
        {!activity.length ? <p className="empty-state">История появится после первой операции.</p> : null}
      </div>
    </article>
  );
}
