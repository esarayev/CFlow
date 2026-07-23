"use client";

import { FormEvent, useMemo, useState } from "react";

type UserRole = "Оператор" | "Кладовщик" | "Менеджер" | "Финансы" | "Администратор";

type AppUser = {
  id: string;
  name: string;
  username: string;
  phone: string;
  role: UserRole;
  status: "Активен" | "Ожидает";
};

const adminUsername = "esaraev85";
const adminPassword = "Q1w2e3r4!";

const metrics = [
  { label: "Грузов в работе", value: "1 284", delta: "+86 за неделю", tone: "neutral" },
  { label: "Пришло сегодня", value: "74", delta: "18 без места", tone: "blue" },
  { label: "Ждет выдачи", value: "312", delta: "42 оплачены", tone: "green" },
  { label: "Проблемные", value: "9", delta: "3 без клиента", tone: "red" },
];

const boxes = [
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

const actions = ["Принять коробку", "Сканировать QR", "Выдать клиенту", "Создать отправку"];

const activity = [
  { time: "10:42", text: "CF-240718 размещена в A-04 / S2 / P3", user: "Марат" },
  { time: "10:35", text: "CF-240719 переведена в ожидание выдачи", user: "Алина" },
  { time: "10:21", text: "Создан клиент Нурбол Канат", user: "Сергей" },
  { time: "10:08", text: "Контейнер KZ-18 получил 16 коробок", user: "Марат" },
];

const warehouse = [
  { zone: "A", fill: 78, note: "Приемка и быстрые выдачи" },
  { zone: "B", fill: 52, note: "Клиентская зона" },
  { zone: "C", fill: 91, note: "Крупный груз" },
  { zone: "QC", fill: 34, note: "Проверка и фото" },
];

const initialUsers: AppUser[] = [
  {
    id: "USR-001",
    name: "Ержан Сараев",
    username: "esaraev85",
    phone: "+7 700 000 00 85",
    role: "Администратор",
    status: "Активен",
  },
  {
    id: "USR-002",
    name: "Марат Оспанов",
    username: "marat",
    phone: "+7 701 222 14 90",
    role: "Оператор",
    status: "Активен",
  },
  {
    id: "USR-003",
    name: "Алина Ким",
    username: "alina",
    phone: "+7 777 101 45 45",
    role: "Финансы",
    status: "Ожидает",
  },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(boxes[0].id);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeView, setActiveView] = useState<"dashboard" | "users">("dashboard");
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    phone: "",
    role: "Оператор" as UserRole,
    password: "",
  });

  const selectedBox = boxes.find((box) => box.id === selectedId) ?? boxes[0];

  const filteredBoxes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return boxes;
    return boxes.filter((box) =>
      Object.values(box).some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query]);

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginName.trim() === adminUsername && loginPassword === adminPassword) {
      setIsUnlocked(true);
      setLoginError("");
      return;
    }
    setLoginError("Неверный пользователь или пароль");
  }

  function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newUser.name.trim() || !newUser.username.trim() || !newUser.password.trim()) {
      return;
    }

    setUsers((current) => [
      {
        id: `USR-${String(current.length + 1).padStart(3, "0")}`,
        name: newUser.name.trim(),
        username: newUser.username.trim(),
        phone: newUser.phone.trim() || "Не указан",
        role: newUser.role,
        status: "Активен",
      },
      ...current,
    ]);
    setNewUser({ name: "", username: "", phone: "", role: "Оператор", password: "" });
  }

  if (!isUnlocked) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-label="Защищенный вход CFlow">
          <div className="brand auth-brand">
            <div className="brand-mark">CF</div>
            <div>
              <strong>CFlow Secure</strong>
              <span>Windows desktop + cloud database</span>
            </div>
          </div>

          <div>
            <p className="eyebrow">Закрытый контур</p>
            <h1>Вход администратора</h1>
            <p className="lead">
              Основное приложение очищено от демо-входа. Доступ к управлению
              пользователями открыт только после ввода пароля администратора.
            </p>
          </div>

          <form className="auth-form" onSubmit={unlock}>
            <label>
              Пользователь
              <input
                autoComplete="username"
                placeholder="Введите пользователя"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
              />
            </label>
            <label>
              Пароль
              <input
                autoComplete="current-password"
                placeholder="Введите пароль"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
            <button className="primary" type="submit">Войти</button>
          </form>
          {loginError ? <p className="auth-error">{loginError}</p> : null}

          <div className="security-grid">
            <span>Cloud DB: только через API</span>
            <span>Пароли: не хранить открытым текстом</span>
            <span>Audit log: без удаления</span>
            <span>Desktop: hardened Electron</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Основная навигация">
        <div className="brand">
          <div className="brand-mark">CF</div>
          <div>
            <strong>CFlow</strong>
            <span>cargo operating system</span>
          </div>
        </div>

        <nav className="nav-list">
          {[
            ["dashboard", "Dashboard"],
            ["boxes", "Коробки"],
            ["clients", "Клиенты"],
            ["warehouse", "Склад"],
            ["shipments", "Отправки"],
            ["finance", "Финансы"],
            ["users", "Пользователи"],
            ["settings", "Настройки"],
          ].map(([view, item]) => (
            <button
              className={activeView === view ? "active" : ""}
              type="button"
              key={item}
              onClick={() => setActiveView(view === "users" ? "users" : "dashboard")}
            >
              <span>{item.slice(0, 1)}</span>
              {item}
            </button>
          ))}
        </nav>

        <div className="operator-card">
          <span>Сессия</span>
          <strong>{adminUsername}</strong>
          <p>Администратор. Доступ к пользователям включен.</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="search">
            <span>Поиск</span>
            <input
              aria-label="Поиск по треку, телефону, ФИО, QR, коробке, контейнеру или комментарию"
              placeholder="Трек, телефон, клиент, QR, контейнер..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="top-actions">
            <button type="button" onClick={() => setActiveView("users")}>Пользователи</button>
            <button type="button" className="primary">Новая коробка</button>
          </div>
        </header>

        {activeView === "users" ? (
          <section className="users-app">
            <div className="hero-row users-hero">
              <div>
                <p className="eyebrow">Администрирование</p>
                <h1>Добавление пользователей</h1>
                <p className="lead">
                  Мини-приложение для создания сотрудников карго-точки. В production
                  пароль должен уходить только в cloud API и храниться как hash.
                </p>
              </div>
              <div className="finance-card">
                <span>Всего пользователей</span>
                <strong>{users.length}</strong>
                <p>{users.filter((user) => user.status === "Активен").length} активных аккаунтов</p>
              </div>
            </div>

            <section className="user-grid">
              <article className="panel">
                <div className="panel-head compact">
                  <div>
                    <span className="eyebrow">Новый доступ</span>
                    <h2>Создать пользователя</h2>
                  </div>
                </div>
                <form className="user-form" onSubmit={addUser}>
                  <label>
                    ФИО
                    <input
                      placeholder="Например, Иван Петров"
                      value={newUser.name}
                      onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
                    />
                  </label>
                  <label>
                    Логин
                    <input
                      placeholder="ivan"
                      value={newUser.username}
                      onChange={(event) => setNewUser({ ...newUser, username: event.target.value })}
                    />
                  </label>
                  <label>
                    Телефон
                    <input
                      placeholder="+7 ..."
                      value={newUser.phone}
                      onChange={(event) => setNewUser({ ...newUser, phone: event.target.value })}
                    />
                  </label>
                  <label>
                    Роль
                    <select
                      value={newUser.role}
                      onChange={(event) => setNewUser({ ...newUser, role: event.target.value as UserRole })}
                    >
                      {["Оператор", "Кладовщик", "Менеджер", "Финансы", "Администратор"].map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Временный пароль
                    <input
                      type="password"
                      placeholder="Минимум 8 символов"
                      value={newUser.password}
                      onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                    />
                  </label>
                  <button className="primary" type="submit">Добавить пользователя</button>
                </form>
              </article>

              <article className="panel">
                <div className="panel-head compact">
                  <div>
                    <span className="eyebrow">Доступы</span>
                    <h2>Сотрудники</h2>
                  </div>
                  <span className="counter">локальный прототип</span>
                </div>
                <div className="user-list">
                  {users.map((user) => (
                    <div className="user-row" key={user.id}>
                      <span className="box-id">{user.id}</span>
                      <span>
                        <strong>{user.name}</strong>
                        <small>{user.username} · {user.phone}</small>
                      </span>
                      <span>{user.role}</span>
                      <span className="status">{user.status}</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </section>
        ) : (
          <>
            <div className="hero-row">
              <div>
                <p className="eyebrow">Сегодня, Алматы</p>
                <h1>Операционный центр карго-точки</h1>
                <p className="lead">
                  Все движение строится вокруг коробки: прием, хранение, отправка,
                  выдача, оплата и история действий в одном быстром интерфейсе.
                </p>
              </div>
              <div className="finance-card">
                <span>Финансы сегодня</span>
                <strong>2 840 500 T</strong>
                <p>+418 000 T ожидается к закрытию смены</p>
              </div>
            </div>

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
                      <span className="eyebrow">Быстрый сценарий</span>
                      <h2>Прием коробки за 20 секунд</h2>
                    </div>
                    <button type="button" className="ghost">Сканировать</button>
                  </div>
                  <div className="steps">
                    {["Скан", "Клиент", "Вес", "Фото", "Место", "Готово"].map((step, index) => (
                      <div className={index < 2 ? "step done" : "step"} key={step}>
                        <span>{index + 1}</span>
                        {step}
                      </div>
                    ))}
                  </div>
                  <div className="quick-actions">
                    {actions.map((action) => (
                      <button type="button" key={action}>{action}</button>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-head compact">
                    <div>
                      <span className="eyebrow">Живая лента</span>
                      <h2>Коробки в работе</h2>
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
                            <strong>{item.zone}</strong>
                            <span>{item.fill}%</span>
                          </div>
                          <div className="bar"><i style={{ width: `${item.fill}%` }} /></div>
                          <p>{item.note}</p>
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
                  <div><dt>Оплата</dt><dd>{selectedBox.payment}</dd></div>
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
          </>
        )}
      </section>
    </main>
  );
}
