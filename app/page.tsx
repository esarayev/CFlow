"use client";

import { FormEvent, useMemo, useState } from "react";

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
  client: string;
  phone: string;
  status: string;
  place: string;
  weight: string;
  route: string;
  payment: string;
  updated: string;
  owner: string;
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
  }
}

const boxes: BoxItem[] = [
  {
    id: "CF-240718",
    track: "YT938475120CN",
    client: "Айгерим Сагындык",
    phone: "+7 701 445 19 20",
    status: "На складе",
    place: "A-04 / S2 / P3",
    weight: "8.4 кг",
    route: "Гуанчжоу -> Алматы",
    payment: "Оплачено",
    updated: "2 мин назад",
    owner: "Марат",
  },
  {
    id: "CF-240719",
    track: "LP004492018FR",
    client: "Dias Market",
    phone: "+7 777 808 33 11",
    status: "Ждет выдачи",
    place: "B-01 / S1 / P1",
    weight: "13.7 кг",
    route: "Париж -> Астана",
    payment: "Долг 18 600 T",
    updated: "8 мин назад",
    owner: "Алина",
  },
  {
    id: "CF-240720",
    track: "QR-88-1045",
    client: "Нурбол Канат",
    phone: "+7 705 221 77 41",
    status: "Проблема",
    place: "Зона проверки",
    weight: "2.1 кг",
    route: "Иу -> Алматы",
    payment: "Не оплачено",
    updated: "14 мин назад",
    owner: "Сергей",
  },
  {
    id: "CF-240721",
    track: "CNKZ55612008",
    client: "Madina Store",
    phone: "+7 747 129 90 00",
    status: "В отправке",
    place: "Контейнер KZ-18",
    weight: "21.0 кг",
    route: "Шэньчжэнь -> Алматы",
    payment: "Оплачено",
    updated: "25 мин назад",
    owner: "Марат",
  },
];

const activity = [
  { time: "10:42", title: "Размещение", text: "CF-240718 поставлена в A-04 / S2 / P3", user: "Марат" },
  { time: "10:35", title: "Выдача", text: "CF-240719 переведена в ожидание клиента", user: "Алина" },
  { time: "10:21", title: "Клиент", text: "Создан клиент Нурбол Канат", user: "Сергей" },
  { time: "10:08", title: "Отправка", text: "Контейнер KZ-18 получил 16 коробок", user: "Марат" },
];

const warehouse = [
  { zone: "A", fill: 78, boxes: 412, note: "Приемка и быстрые выдачи" },
  { zone: "B", fill: 52, boxes: 238, note: "Клиентская зона" },
  { zone: "C", fill: 91, boxes: 501, note: "Крупный груз" },
  { zone: "QC", fill: 34, boxes: 36, note: "Проверка и фото" },
];

const navItems = ["Dashboard", "Коробки", "Клиенты", "Склад", "Отправки", "Финансы", "Отчеты", "Настройки"];

function canSeeFinance(user: SessionUser) {
  return user.permissions.includes("all") || user.permissions.includes("finance");
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(boxes[0].id);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const selectedBox = boxes.find((box) => box.id === selectedId) ?? boxes[0];
  const showFinance = sessionUser ? canSeeFinance(sessionUser) : false;

  const metrics = [
    { label: "В работе", value: "1 284", delta: "+86 за неделю", tone: "neutral" },
    { label: "Пришло сегодня", value: "74", delta: "18 без места", tone: "blue" },
    { label: "Ждет выдачи", value: "312", delta: "42 оплачены", tone: "green" },
    { label: "Проблемные", value: "9", delta: "3 без клиента", tone: "red" },
  ];

  const filteredBoxes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return boxes;
    return boxes.filter((box) =>
      Object.values(box).some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query]);

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
          {navItems.filter((item) => showFinance || !["Финансы", "Отчеты"].includes(item)).map((item, index) => (
            <button className={index === 0 ? "active" : ""} type="button" key={item}>
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
              aria-label="Поиск по треку, телефону, ФИО, QR, коробке, контейнеру или комментарию"
              placeholder="Трек, телефон, клиент, QR, коробка, контейнер..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="top-actions">
            <button type="button">Принять</button>
            <button type="button" className="primary">Выдать</button>
          </div>
        </header>

        <section className="operation-board">
          <div>
            <p className="eyebrow">Сегодня, Алматы</p>
            <h1>Операционный центр карго-точки</h1>
            <p className="lead">
              Все построено вокруг коробки: приемка, размещение, поиск, перемещение, отправка и выдача.
            </p>
          </div>
          <div className="scan-card">
            <span>Быстрое действие</span>
            <strong>Сканировать трек или QR</strong>
            <p>Оператор должен начать приемку или выдачу без переходов по меню.</p>
            <button className="primary" type="button">Открыть сканер</button>
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
                  <span className="eyebrow">2-3 клика</span>
                  <h2>Прием и выдача товара</h2>
                </div>
              </div>
              <div className="quick-actions">
                {["Принять товар", "Найти клиента", "Выдать товар", "Переместить", "Добавить фото"].map((action, index) => (
                  <button className={index === 0 ? "primary" : ""} type="button" key={action}>{action}</button>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-head compact">
                <div>
                  <span className="eyebrow">Коробки</span>
                  <h2>В работе сейчас</h2>
                </div>
                <span className="counter">{filteredBoxes.length} найдено</span>
              </div>
              <div className="box-list">
                {filteredBoxes.map((box) => (
                  <button
                    className={selectedId === box.id ? "box-row selected" : "box-row"}
                    type="button"
                    key={box.id}
                    onClick={() => setSelectedId(box.id)}
                  >
                    <span className="box-id">{box.id}</span>
                    <span>
                      <strong>{box.client}</strong>
                      <small>{box.track} · {box.phone}</small>
                    </span>
                    <span className="hide-mobile">{box.place}</span>
                    <span className={`status ${box.status === "Проблема" ? "danger" : ""}`}>{box.status}</span>
                  </button>
                ))}
              </div>
            </article>

            <div className="split-panels">
              <article className="panel">
                <div className="panel-head compact">
                  <h2>Склад</h2>
                  <button type="button" className="ghost">Карта</button>
                </div>
                <div className="warehouse-grid">
                  {warehouse.map((item) => (
                    <div className="zone" key={item.zone}>
                      <div>
                        <strong>Зона {item.zone}</strong>
                        <span>{item.boxes} коробок</span>
                      </div>
                      <div className="bar"><i style={{ width: `${item.fill}%` }} /></div>
                      <p>{item.note} · заполнено {item.fill}%</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panel-head compact">
                  <h2>Последние действия</h2>
                  <span className="counter">audit on</span>
                </div>
                <div className="activity">
                  {activity.map((item) => (
                    <div key={`${item.time}-${item.text}`}>
                      <time>{item.time}</time>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                      <span>{item.user}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>

          <aside className="details" aria-label="Детали коробки">
            <div className="details-photo">
              <span>{selectedBox.id}</span>
            </div>
            <div className="details-head">
              <div>
                <span className="eyebrow">Карточка коробки</span>
                <h2>{selectedBox.client}</h2>
              </div>
              <span className={`status ${selectedBox.status === "Проблема" ? "danger" : ""}`}>{selectedBox.status}</span>
            </div>
            <dl className="details-list">
              <div><dt>Трек</dt><dd>{selectedBox.track}</dd></div>
              <div><dt>Телефон</dt><dd>{selectedBox.phone}</dd></div>
              <div><dt>Вес</dt><dd>{selectedBox.weight}</dd></div>
              <div><dt>Место</dt><dd>{selectedBox.place}</dd></div>
              <div><dt>Маршрут</dt><dd>{selectedBox.route}</dd></div>
              <div><dt>Оплата</dt><dd>{showFinance ? selectedBox.payment : "Скрыто"}</dd></div>
              <div><dt>Ответственный</dt><dd>{selectedBox.owner}</dd></div>
              <div><dt>Обновлено</dt><dd>{selectedBox.updated}</dd></div>
            </dl>
            <div className="detail-actions">
              <button type="button" className="primary">Выдать</button>
              <button type="button">Переместить</button>
              <button type="button">История</button>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
