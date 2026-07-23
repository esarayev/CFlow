"use client";

import { FormEvent, useEffect, useState } from "react";

type Role = "Руководитель" | "Менеджер" | "Кладовщик" | "Финансы" | "Оператор";

type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  permissions: string[];
  status: string;
};

declare global {
  interface Window {
    cflowUsers?: {
      list: () => Promise<User[]>;
      authenticate: (username: string, password: string) => Promise<{ ok: boolean; error?: string; user?: User }>;
      create: (user: { name: string; username: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string; users?: User[] }>;
      update: (user: { id: string; name: string; username: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string; users?: User[] }>;
      delete: (userId: string) => Promise<{ ok: boolean; error?: string; users?: User[] }>;
    };
  }
}

const roles: Array<{ name: Role; text: string }> = [
  { name: "Руководитель", text: "Все функции, включая финансы, отчеты и пользователей" },
  { name: "Менеджер", text: "Прием товара, выдача товара, поиск, клиенты, без сумм на счету" },
  { name: "Кладовщик", text: "Прием, перемещение, выдача, складские операции" },
  { name: "Финансы", text: "Оплаты, долги, отчеты и финансовые операции" },
  { name: "Оператор", text: "Быстрый прием, поиск и базовая выдача" },
];

const fallbackUsers: User[] = [
  {
    id: "USR-001",
    name: "Администратор",
    username: "esaraev85",
    role: "Руководитель",
    permissions: ["all"],
    status: "Активен",
  },
];

export default function UsersApp() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<User[]>(fallbackUsers);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "Менеджер" as Role });
  const [editingId, setEditingId] = useState("");

  useEffect(() => {
    if (!isUnlocked) return;
    window.cflowUsers?.list().then(setUsers).catch(() => undefined);
  }, [isUnlocked]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await window.cflowUsers?.authenticate(login, password);
    if (result?.ok) {
      setIsUnlocked(true);
      setError("");
      return;
    }
    setError(result?.error || "Неверный логин или пароль");
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = editingId
      ? await window.cflowUsers?.update({ ...form, id: editingId })
      : await window.cflowUsers?.create(form);
    if (!result?.ok) {
      setError(result?.error || "Не удалось сохранить пользователя");
      return;
    }
    setUsers(result.users || []);
    setForm({ name: "", username: "", password: "", role: "Менеджер" });
    setEditingId("");
    setError("");
  }

  function startEdit(user: User) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      username: user.username,
      password: "",
      role: user.role as Role,
    });
    setError("");
  }

  function cancelEdit() {
    setEditingId("");
    setForm({ name: "", username: "", password: "", role: "Менеджер" });
    setError("");
  }

  async function deleteUser(user: User) {
    if (user.username === "esaraev85") {
      setError("Нельзя удалить владельца кабинета");
      return;
    }

    const result = await window.cflowUsers?.delete(user.id);
    if (!result?.ok) {
      setError(result?.error || "Не удалось удалить пользователя");
      return;
    }
    setUsers(result.users || []);
    setError("");
  }

  if (!isUnlocked) {
    return (
      <main className="auth-shell">
        <section className="auth-panel users-auth" aria-label="Вход в CFlow Пользователи">
          <div className="brand auth-brand">
            <div className="brand-mark">CF</div>
            <div>
              <strong>CFlow Пользователи</strong>
              <span>отдельное приложение управления доступами</span>
            </div>
          </div>
          <div>
            <p className="eyebrow">Кабинет доступа</p>
            <h1>Авторизация администратора</h1>
            <p className="lead">
              Здесь создаются сотрудники и назначаются роли. Основное приложение
              использует эти роли, чтобы скрывать лишние функции.
            </p>
          </div>
          <form className="auth-form" onSubmit={unlock}>
            <label>
              Пользователь
              <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="esaraev85" />
            </label>
            <label>
              Пароль
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" />
            </label>
            <button className="primary" type="submit">Войти</button>
          </form>
          {error ? <p className="auth-error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="users-admin-shell">
      <section className="users-admin-head">
        <div className="brand">
          <div className="brand-mark">CF</div>
          <div>
            <strong>CFlow Пользователи</strong>
            <span>кабинет сотрудников и ролей</span>
          </div>
        </div>
        <button type="button" onClick={() => setIsUnlocked(false)}>Выйти</button>
      </section>

      <section className="hero-row users-hero">
        <div>
          <p className="eyebrow">Управление доступом</p>
          <h1>Пользователи кабинета</h1>
          <p className="lead">
            Руководитель видит все. Менеджер не видит суммы на счету и финансовые
            отчеты, но может принимать и выдавать товар.
          </p>
        </div>
        <div className="finance-card">
          <span>Аккаунтов</span>
          <strong>{users.length}</strong>
          <p>{users.filter((user) => user.status === "Активен").length} активных</p>
        </div>
      </section>

      <section className="user-grid">
        <article className="panel">
          <div className="panel-head compact">
            <div>
              <span className="eyebrow">Новый сотрудник</span>
              <h2>{editingId ? "Редактировать пользователя" : "Добавить пользователя"}</h2>
            </div>
          </div>
          <form className="user-form" onSubmit={createUser}>
            <label>
              Имя
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Имя сотрудника" />
            </label>
            <label>
              Логин
              <input
                disabled={editingId === "USR-001"}
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="login"
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder={editingId ? "Оставьте пустым, чтобы не менять" : "Минимум 6 символов"}
              />
            </label>
            <label>
              Роль
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
                {roles.map((role) => (
                  <option key={role.name}>{role.name}</option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="primary" type="submit">{editingId ? "Сохранить изменения" : "Добавить нового"}</button>
              {editingId ? <button type="button" onClick={cancelEdit}>Отмена</button> : null}
            </div>
          </form>
          {error ? <p className="auth-error">{error}</p> : null}
        </article>

        <article className="panel">
          <div className="panel-head compact">
            <div>
              <span className="eyebrow">Список</span>
              <h2>Все пользователи</h2>
            </div>
          </div>
          <div className="user-list">
            {users.map((user) => (
              <div className="user-row" key={user.id}>
                <span className="box-id">{user.id}</span>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.username}</small>
                </span>
                <span>{user.role}</span>
                <span className="status">{user.status}</span>
                <button type="button" onClick={() => startEdit(user)}>
                  Редактировать
                </button>
                <button
                  className="danger-button"
                  disabled={user.username === "esaraev85"}
                  type="button"
                  onClick={() => deleteUser(user)}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="role-grid">
        {roles.map((role) => (
          <article className="panel role-card" key={role.name}>
            <h2>{role.name}</h2>
            <p>{role.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
