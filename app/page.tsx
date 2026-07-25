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

type AuthResult = { ok: boolean; error?: string; user?: SessionUser; sessionToken?: string };

type BoxItem = {
  id: string;
  track: string;
  code?: string;
  clientCode?: string;
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
  batch?: string;
  chinaRate?: number;
  clientRate?: number;
  costAmount?: number;
  chargeAmount?: number;
  profitAmount?: number;
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
  telegramId?: string;
  comments?: string;
  clientCode?: string;
  chinaAddress?: string;
  clientRate?: number;
  chinaRate?: number;
  registrationSource?: string;
  registrationStatus?: string;
};

type ActivityItem = {
  id: string;
  time: string;
  displayTime?: string;
  title: string;
  text: string;
  user: string;
  boxId?: string;
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
  costToday?: number;
  chargedToday?: number;
  profitToday?: number;
};

type ClientCodeItem = {
  id: string;
  code: string;
  status: string;
  clientId?: string;
  clientName?: string;
  assignedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SettingsData = {
  chinaAddress?: string;
};

type CflowData = {
  boxes: BoxItem[];
  clients: ClientItem[];
  warehouse: WarehouseZone[];
  shipments: ShipmentItem[];
  finances: FinanceData;
  activity: ActivityItem[];
  clientCodes: ClientCodeItem[];
  deletedClients?: { id: string; reason?: string; deletedAt?: string }[];
  settings: SettingsData;
};

type ApiResult = {
  ok: boolean;
  error?: string;
  data?: CflowData;
  sync?: { status: string; pulledClients?: number };
};

type ApplyResultOptions = {
  silentSyncError?: boolean;
};

type ActionMode = "receive" | "issue" | "move" | "client" | "shipment" | "payment" | "problem" | "status";
type DashboardPanel = "codes" | "address" | null;
type DetailModalState = { type: "box"; id: string } | { type: "client"; id: string } | null;

type ActionFormState = {
  track: string;
  code: string;
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
  clientCode: string;
  chinaAddress: string;
  clientRate: string;
  chinaRate: string;
  batch: string;
  shipmentTitle: string;
  shipmentType: string;
  shipmentRoute: string;
  shipmentDate: string;
  shipmentBoxes: string;
  shipmentCost: string;
  nextStatus: string;
};

const clientCodeCapacity = 26 * 999;
const generatedCodePattern = /AST\s+[A-Z]\d{3}$/i;
const defaultChinaAddress = "18911759229 浙江省金华市义乌市后宅街道金城一期商城大道F158号拼多多驿站-5697库-奇瑞";

declare global {
  interface Window {
    cflowUsers?: {
      list: () => Promise<SessionUser[]>;
      authenticate: (username: string, password: string) => Promise<AuthResult>;
      create: (user: { name: string; username: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string; users?: SessionUser[] }>;
      update: (user: { id: string; name: string; username: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string; users?: SessionUser[] }>;
      delete: (userId: string) => Promise<{ ok: boolean; error?: string; users?: SessionUser[] }>;
    };
    cflowData?: {
      snapshot: (payload: Record<string, string>) => Promise<ApiResult>;
      receiveBox: (payload: Record<string, string>) => Promise<ApiResult>;
      moveBox: (payload: Record<string, string>) => Promise<ApiResult>;
      issueBox: (payload: Record<string, string>) => Promise<ApiResult>;
      updateStatus: (payload: Record<string, string>) => Promise<ApiResult>;
      problemBox: (payload: Record<string, string>) => Promise<ApiResult>;
      createClient: (payload: Record<string, string>) => Promise<ApiResult>;
      addClientCodes: (payload: Record<string, string>) => Promise<ApiResult>;
      saveWarehouseAddress: (payload: Record<string, string>) => Promise<ApiResult>;
      issueClientCode: (payload: Record<string, string>) => Promise<ApiResult>;
      createShipment: (payload: Record<string, string>) => Promise<ApiResult>;
      recordPayment: (payload: Record<string, string>) => Promise<ApiResult>;
      deleteBox: (payload: Record<string, string>) => Promise<ApiResult>;
      deleteClient: (payload: Record<string, string>) => Promise<ApiResult>;
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
  clientCodes: [],
  settings: { chinaAddress: defaultChinaAddress },
};

const navItems = ["Dashboard", "Коробки", "Клиенты", "Склад", "Отправки", "Финансы", "Отчеты", "База знаний", "Настройки"];

type KnowledgeItem = {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  details: string[];
  copyText?: string;
  badge?: string;
};

const knowledgeCategories = [
  "Все",
  "Склады",
  "Контакты",
  "Обмен денег",
  "Оборудование",
  "Памятки",
];

const knowledgeItems: KnowledgeItem[] = [
  {
    id: "china-main-warehouse",
    category: "Склады",
    title: "Склад в Китае",
    subtitle: "Основной адрес для клиентов Zabota Cargo",
    badge: "Китай",
    details: [
      "Адрес: 18911759229 浙江省金华市义乌市后宅街道金城一期商城大道F158号拼多多驿站-5697库-奇瑞",
      "Постоянная часть кода: 奇瑞QR",
      "Уникальный хвост кода генерируется автоматически: AST A001, AST A002 ... AST B001.",
    ],
    copyText: "18911759229 浙江省金华市义乌市后宅街道金城一期商城大道F158号拼多多驿站-5697库-奇瑞",
  },
  {
    id: "ala-turdieva",
    category: "Склады",
    title: "ALA International",
    subtitle: "Склад прибытия в Алматы",
    badge: "Алматы",
    details: [
      "Адрес: Турдиева, 134/3.",
      "График: 09:00-17:30.",
      "Оплата: USD наличными; тенге через MIG +5 тг; Kaspi QR через MIG +5 тг и 2%.",
      "Бесплатное хранение: 2 дня после прибытия.",
    ],
  },
  {
    id: "pervomayka",
    category: "Склады",
    title: "Первомайка склад",
    subtitle: "Промзона, ворота 008",
    badge: "Склад",
    details: [
      "Адрес: Первомайская промзона 742Н, ворота 008.",
      "График: 09:00-17:00 ежедневно; пятница перерыв 12:00-14:30.",
      "Оплата: только наличные USD; при оплате тенге +5 тг к курсу.",
      "Хранение: 2 дня бесплатно, потом малое место 500 тг/день, паллет 2000 тг/день.",
      "WhatsApp склада: +7 708 111 2826.",
    ],
    copyText: "+77081112826",
  },
  {
    id: "mambetova-wholesale",
    category: "Склады",
    title: "Оптовый склад Мамбетова",
    subtitle: "Ближе к центру Алматы, быстрее, но дороже",
    badge: "Опт",
    details: [
      "Адрес: улица Мамбетова, 1/48, Алматы.",
      "График: 09:00-17:30, обед 13:00-14:00.",
      "Клиентский сервис: +7 747 375 0808.",
      "Кладовщики: +7 747 376 0808, +7 702 136 0909.",
      "Стоимость на опт зависит от плотности, просчитывать отдельно.",
    ],
  },
  {
    id: "money-orda",
    category: "Обмен денег",
    title: "Orda",
    subtitle: "Обмен от 100 юаней",
    badge: "100 CNY",
    details: [
      "Контакт: Orda.",
      "Telegram: @ahenmmrzabek.",
      "Телефон: +7 708 123 8069.",
      "Использовать как справочный контакт, условия перепроверять перед переводом.",
    ],
    copyText: "+77081238069",
  },
  {
    id: "money-aidana",
    category: "Обмен денег",
    title: "Юани Айдана",
    subtitle: "Обмен от 1000 юаней",
    badge: "1000 CNY",
    details: [
      "Контакт: Юани Айдана.",
      "Телефон: +7 775 145 3947.",
      "Использовать как справочный контакт, условия перепроверять перед переводом.",
    ],
    copyText: "+77751453947",
  },
  {
    id: "remote-payment",
    category: "Контакты",
    title: "Гульданай Ala International",
    subtitle: "Удаленная оплата по складу Алматы",
    badge: "Оплата",
    details: [
      "Телефон: +7 778 182 2564.",
      "Писать менеджеру, если нужна удаленная оплата на складе Алматы.",
      "При оплате через Kaspi QR проверять комментарий и сумму перед отправкой.",
    ],
    copyText: "+77781822564",
  },
  {
    id: "astana-carrier",
    category: "Контакты",
    title: "Груз Алматы-Астана",
    subtitle: "SP Logistics Astana",
    badge: "Перевозка",
    details: [
      "Телефон: +7 776 707 0738.",
      "По пятницам указан рабочий интервал 08:00-13:00.",
      "Использовать для перевозки Алматы-Астана и уточнения условий по текущей партии.",
    ],
    copyText: "+77767070738",
  },
  {
    id: "lawyer-irina",
    category: "Контакты",
    title: "Юрист Ирина Щербина",
    subtitle: "Юридический контакт",
    badge: "Юрист",
    details: ["Телефон: +7 705 746 4076.", "Держать как справочный контакт для юридических вопросов."],
    copyText: "+77057464076",
  },
  {
    id: "accounting-ludmila",
    category: "Контакты",
    title: "Людмила Профи Бух",
    subtitle: "Бухгалтерия",
    badge: "Бухгалтер",
    details: ["Телефон: +7 708 767 7494.", "Контакт для бухгалтерских вопросов и консультаций."],
    copyText: "+77087677494",
  },
  {
    id: "site-dulat",
    category: "Контакты",
    title: "Дулат Сайт",
    subtitle: "Сайт и технические вопросы",
    badge: "Сайт",
    details: ["Телефон: +7 707 443 2113.", "Контакт по разработке или поддержке сайта."],
    copyText: "+77074432113",
  },
  {
    id: "scales",
    category: "Оборудование",
    title: "Весы до 200 кг",
    subtitle: "Платформенные весы с отдельной платформой",
    badge: "Приемка",
    details: [
      "Искать: весы 200 кг.",
      "Лучше брать платформенные весы, чтобы коробки и паллеты не перекрывали экран.",
      "Проверить питание, точность и удобство калибровки перед покупкой.",
    ],
  },
  {
    id: "scanner",
    category: "Оборудование",
    title: "Сканер штрихкодов",
    subtitle: "Беспроводной сканер для приемки",
    badge: "QR/трек",
    details: [
      "Искать: Winson 684p сканер или аналогичный беспроводной сканер.",
      "Важно: стабильная работа с QR и треками, USB-приемник, быстрый ввод без драйверов.",
      "Проверить дальность и заряд, если оператор ходит по складу.",
    ],
  },
  {
    id: "arrival-template",
    category: "Памятки",
    title: "Шаблон прибытия груза",
    subtitle: "Что проверять при уведомлении от склада",
    badge: "Операции",
    details: [
      "Сверить код партии, количество мест, вес, объем и сумму.",
      "Проверить адрес выдачи, график, способ оплаты и срок бесплатного хранения.",
      "После оплаты зафиксировать расходы в финансах и статус партии.",
    ],
    copyText: "Проверить: код партии, мест, вес, объем, сумма, адрес, график, способ оплаты, бесплатное хранение.",
  },
  {
    id: "cost-structure",
    category: "Памятки",
    title: "Себестоимость доставки",
    subtitle: "Что учитывать в цене за килограмм",
    badge: "Финансы",
    details: [
      "Упаковка и вес упаковки.",
      "Перегруз, доставка Алматы-Астана, доставка по Астане и грузчики.",
      "Перевозка Китай-Алматы.",
      "Дополнительные расходы: аренда, техника, расходники и пакеты.",
    ],
  },
  {
    id: "secure-access",
    category: "Памятки",
    title: "Доступы и пароли",
    subtitle: "Не хранить открытым текстом в базе знаний",
    badge: "Безопасность",
    details: [
      "Логины и пароли от внешних сервисов не показываем в общем справочнике.",
      "Позже лучше сделать отдельное защищенное хранилище доступов только для руководителя.",
      "В журнале действий фиксировать, кто смотрел или менял важные реквизиты.",
    ],
  },
];

function canSeeFinance(user: SessionUser) {
  return user.permissions.includes("all") || user.permissions.includes("finance");
}

function money(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} T`;
}

const boxStatuses = ["Принято", "На складе", "В отправке", "В пути", "На таможне", "Прибыло", "Ждет выдачи", "Выдано", "Без клиента", "Проблема", "Задержано", "Повреждено", "Возврат", "Потеряно"];

function numericWeight(value?: string) {
  const parsed = Number(String(value || "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function volumeWeight(dimensions?: string) {
  const parts = String(dimensions || "")
    .split(/[xх*×]/i)
    .map((part) => Number(part.trim().replace(",", ".")))
    .filter((part) => Number.isFinite(part) && part > 0);
  if (parts.length !== 3) return 0;
  return Math.round((parts[0] * parts[1] * parts[2] / 5000) * 10) / 10;
}

function chargeableWeight(box: BoxItem) {
  return Math.max(numericWeight(box.weight), volumeWeight(box.dimensions));
}

function clientInstruction(client: ClientItem) {
  return [
    `Здравствуйте, ${client.name}.`,
    `Ваш клиентский код: ${client.clientCode || "будет выдан после подтверждения"}.`,
    `Адрес склада в Китае: ${client.chinaAddress || "будет отправлен отдельно"}.`,
    "Указывайте этот код при покупке, чтобы склад понял, чей это товар.",
  ].join("\n");
}

function arrivalMessage(box: BoxItem) {
  const weight = chargeableWeight(box) || numericWeight(box.weight);
  const amount = box.chargeAmount || box.amount || 0;
  return [
    `Здравствуйте, ${box.client}. Ваш товар прибыл.`,
    `Код клиента: ${box.clientCode || "не указан"}.`,
    `Трек: ${box.track}.`,
    `Вес: ${weight || box.weight} кг.`,
    amount ? `К оплате: ${money(amount)}.` : "Сумма к оплате уточняется.",
    "После оплаты можно забрать товар в карго.",
  ].join("\n");
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
  const syncInFlightRef = useRef(false);
  const [data, setData] = useState<CflowData>(fallbackData);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [actionMode, setActionMode] = useState<ActionMode>("receive");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState<{ status: string; pulledClients?: number } | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [detailModal, setDetailModal] = useState<DetailModalState>(null);
  const [dashboardPanel, setDashboardPanel] = useState<DashboardPanel>(null);
  const [addressInput, setAddressInput] = useState(defaultChinaAddress);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [form, setForm] = useState({
    track: "",
    code: "",
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
    clientCode: "",
    chinaAddress: "",
    clientRate: "",
    chinaRate: "",
    batch: "",
    shipmentTitle: "",
    shipmentType: "Контейнер",
    shipmentRoute: "Китай -> Казахстан",
    shipmentDate: new Date().toISOString().slice(0, 10),
    shipmentBoxes: "",
    shipmentCost: "",
    nextStatus: "Ждет выдачи",
  });

  const showFinance = sessionUser ? canSeeFinance(sessionUser) : false;

  useEffect(() => {
    if (!sessionUser || !sessionToken || !window.cflowData) return;
    window.cflowData.snapshot(securePayload()).then(applyResult).catch(() => setError("Не удалось загрузить базу CFlow"));
  }, [sessionUser, sessionToken]);

  useEffect(() => {
    if (!sessionUser || !sessionToken || !window.cflowData) return;

    const syncSilently = () => {
      void syncNow({ silent: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") syncSilently();
    };

    const intervalId = window.setInterval(syncSilently, 30000);
    window.addEventListener("focus", syncSilently);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncSilently);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [sessionUser, sessionToken]);

  useEffect(() => {
    setAddressInput(data.settings?.chinaAddress || defaultChinaAddress);
  }, [data.settings?.chinaAddress]);

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

  const modalBox = detailModal?.type === "box" ? data.boxes.find((box) => box.id === detailModal.id) : undefined;
  const modalClient = detailModal?.type === "client" ? data.clients.find((client) => client.id === detailModal.id) : undefined;
  const modalClientBoxes = useMemo(() => {
    if (!modalClient) return [];
    return data.boxes.filter((box) =>
      box.clientId === modalClient.id || box.clientCode === modalClient.clientCode || box.phone === modalClient.phone || box.client === modalClient.name,
    );
  }, [data.boxes, modalClient]);
  const modalBoxActivity = useMemo(() => {
    if (!modalBox) return [];
    return data.activity.filter((item) =>
      item.boxId === modalBox.id || item.text.includes(modalBox.id) || item.text.includes(modalBox.track) || Boolean(modalBox.code && item.text.includes(modalBox.code)),
    );
  }, [data.activity, modalBox]);
  const assignedCodeCount = useMemo(() => {
    const assigned = new Set<string>();
    data.clients.forEach((client) => {
      if (client.clientCode && generatedCodePattern.test(client.clientCode)) assigned.add(client.clientCode.toLowerCase());
    });
    data.clientCodes.forEach((item) => {
      if ((item.status === "assigned" || item.clientId) && generatedCodePattern.test(item.code)) assigned.add(item.code.toLowerCase());
    });
    return assigned.size;
  }, [data.clientCodes, data.clients]);
  const availableCodeCount = Math.max(clientCodeCapacity - assignedCodeCount, 0);
  const warehouseAddress = data.settings?.chinaAddress || defaultChinaAddress;

  const matchedClient = useMemo(() => {
    const code = form.clientCode.trim().toLowerCase();
    const phone = form.phone.trim();
    const name = form.client.trim().toLowerCase();
    return data.clients.find((client) =>
      (code && client.clientCode?.toLowerCase() === code) ||
      (phone && client.phone === phone) ||
      (name && client.name.toLowerCase() === name),
    );
  }, [data.clients, form.client, form.clientCode, form.phone]);

  useEffect(() => {
    if (!matchedClient || actionMode !== "receive") return;
    setForm((current) => ({
      ...current,
      client: current.client || matchedClient.name,
      phone: current.phone || matchedClient.phone,
      clientCode: current.clientCode || matchedClient.clientCode || "",
      chinaAddress: current.chinaAddress || matchedClient.chinaAddress || "",
    }));
  }, [actionMode, matchedClient]);

  const metrics = [
    { label: "В работе", value: String(data.boxes.filter((box) => box.status !== "Выдано").length), delta: `${data.boxes.length} всего`, tone: "neutral" },
    { label: "Пришло сегодня", value: String(data.boxes.filter((box) => box.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length), delta: "новые приемки", tone: "blue" },
    { label: "Ждет выдачи", value: String(data.boxes.filter(isWaitingIssue).length), delta: "готово клиентам", tone: "green" },
    { label: "Проблемные", value: String(data.boxes.filter(isProblem).length), delta: "требуют проверки", tone: "red" },
  ];

  function applyResult(result: ApiResult, options: ApplyResultOptions = {}) {
    if (!result.ok || !result.data) {
      setError(result.error || "Операция не выполнена");
      return;
    }

    if (result.sync) {
      setSyncStatus(result.sync);
      if (options.silentSyncError) {
        // Фоновая синхронизация не должна сбивать оператора сообщениями,
        // ручная кнопка синхронизации покажет причину ошибки явно.
      } else if (result.sync.status === "cloud_token_missing") {
        setError("Облако не подключено: в Windows не задан CFLOW_ADMIN_TOKEN. Telegram-заявки не подтянутся в десктоп.");
      } else if (result.sync.status !== "connected") {
        setError(`Облако не подключилось: ${result.sync.status}`);
      }
    }
    setData({
      ...fallbackData,
      ...result.data,
      boxes: Array.isArray(result.data.boxes) ? result.data.boxes : [],
      clients: Array.isArray(result.data.clients) ? result.data.clients : [],
      warehouse: Array.isArray(result.data.warehouse) ? result.data.warehouse : [],
      shipments: Array.isArray(result.data.shipments) ? result.data.shipments : [],
      activity: Array.isArray(result.data.activity) ? result.data.activity : [],
      clientCodes: Array.isArray(result.data.clientCodes) ? result.data.clientCodes : [],
      settings: { ...fallbackData.settings, ...(result.data.settings || {}) },
    });
    if (!result.sync || result.sync.status === "connected") setError("");
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!window.cflowUsers) {
      setLoginError("Служба авторизации не загрузилась. Перезапустите CFlow с ярлыка.");
      return;
    }

    const result = await window.cflowUsers.authenticate(loginName, loginPassword);
    if (result.ok && result.user && result.sessionToken) {
      setSessionUser(result.user);
      setSessionToken(result.sessionToken);
      setLoginError("");
      return;
    }

    setLoginError(result.error || "Неверный логин или пароль");
  }

  function setAction(mode: ActionMode) {
    setActionMode(mode);
    setNotice("");
    setError("");
    if (mode === "issue" || mode === "move" || mode === "payment" || mode === "problem" || mode === "status") {
      if (selectedBox) {
        setForm((current) => ({
          ...current,
          track: selectedBox.track,
          code: selectedBox.code || "",
          shipmentBoxes: selectedBox.id,
          nextStatus: selectedBox.status === "Выдано" ? "Выдано" : current.nextStatus,
        }));
      }
    }
  }

  async function runApi(call: Promise<ApiResult>, success: string) {
    const result = await call;
    applyResult(result);
    if (result.ok) setNotice(success);
    return result;
  }

  async function syncNow(options: { silent?: boolean } = {}) {
    if (!window.cflowData) {
      if (!options.silent) setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const result = await window.cflowData.snapshot(securePayload());
      applyResult(result, { silentSyncError: options.silent });
      if (!options.silent && result.ok && result.sync?.status === "connected") {
        setNotice(`Синхронизация выполнена. Клиентов в облаке: ${result.sync.pulledClients || 0}`);
      }
    } catch {
      if (!options.silent) setError("Не удалось синхронизировать данные с облаком");
    } finally {
      syncInFlightRef.current = false;
    }
  }

  async function saveWarehouseAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.cflowData) {
      setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }
    const result = await window.cflowData.saveWarehouseAddress(securePayload({ chinaAddress: addressInput }));
    applyResult(result);
    if (result.ok) setNotice("Адрес склада сохранен");
  }

  async function issueClientCode(client: ClientItem) {
    if (!window.cflowData) {
      setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }
    const result = await window.cflowData.issueClientCode(securePayload({ clientId: client.id }));
    applyResult(result);
    if (result.ok) setNotice(`Код закреплен за клиентом ${client.name}`);
  }

  async function issueClientAccess(client: ClientItem, clientCode: string, chinaAddress: string) {
    if (!window.cflowData) {
      setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }
    const cleanCode = clientCode.trim();
    const cleanAddress = chinaAddress.trim();
    if (!cleanCode || !cleanAddress) {
      setError("Укажите код клиента и адрес склада в Китае.");
      return;
    }
    const result = await window.cflowData.createClient(securePayload({
      id: client.id,
      name: client.name,
      phone: client.phone,
      telegram: client.telegram || "",
      telegramId: client.telegramId || "",
      comments: client.comments || "",
      clientCode: cleanCode,
      chinaAddress: cleanAddress,
      registrationSource: client.registrationSource || "manual",
      registrationStatus: "approved",
    }));
    applyResult(result);
    if (result.ok) setNotice(`Код и адрес выданы клиенту ${client.name}`);
  }

  function currentUserName() {
    return sessionUser?.name || "Оператор";
  }

  function securePayload(payload: Record<string, string> = {}) {
    return { ...payload, user: currentUserName(), sessionToken };
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.cflowData) {
      setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }

    const boxId = selectedBox?.id || "";
    if (actionMode === "receive") {
      const result = await runApi(window.cflowData.receiveBox(securePayload(form)), "Коробка принята и сохранена");
      if (result.ok) {
        setForm((current) => ({ ...current, track: "", code: "", weight: "", dimensions: "", comment: "", amount: "" }));
        setTimeout(() => trackRef.current?.focus(), 0);
      }
      return;
    }

    if (actionMode === "issue") {
      await runApi(window.cflowData.issueBox(securePayload({ boxId })), "Коробка выдана клиенту");
      return;
    }

    if (actionMode === "status") {
      await runApi(window.cflowData.updateStatus(securePayload({ boxId, status: form.nextStatus })), "Статус коробки обновлен");
      return;
    }

    if (actionMode === "move") {
      await runApi(window.cflowData.moveBox(securePayload({ boxId, place: form.place })), "Место хранения обновлено");
      return;
    }

    if (actionMode === "problem") {
      await runApi(window.cflowData.problemBox(securePayload({ boxId, comment: form.comment })), "Коробка отмечена как проблемная");
      return;
    }

    if (actionMode === "client") {
      await runApi(window.cflowData.createClient(securePayload({
        name: form.client,
        phone: form.phone,
        telegram: form.telegram,
        comments: form.comment,
      })), "Клиент сохранен");
      return;
    }

    if (actionMode === "shipment") {
      await runApi(
        window.cflowData.createShipment(securePayload({
          title: form.shipmentTitle,
          type: form.shipmentType,
          route: form.shipmentRoute,
          date: form.shipmentDate,
          boxIds: form.shipmentBoxes,
          cost: form.shipmentCost,
        })),
        "Отправка создана",
      );
      return;
    }

    if (actionMode === "payment") {
      await runApi(window.cflowData.recordPayment(securePayload({ boxId, amount: form.amount })), "Оплата проведена");
    }
  }

  function openScanner() {
    setActiveNav("Коробки");
    setAction("receive");
    setTimeout(() => trackRef.current?.focus(), 0);
    setNotice("Сканер готов: отсканируйте трек сразу в поле приемки");
  }

  async function deleteBox(boxId: string) {
    if (!window.cflowData) {
      setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }

    const reason = window.prompt(`Причина удаления коробки ${boxId}. Например: ошибочная приемка, дубль, неверный трек.`);
    const cleanReason = reason?.trim();
    if (!cleanReason) {
      setError("Удаление отменено: нужна причина удаления");
      return;
    }

    const confirmed = window.confirm(`Удалить коробку ${boxId} полностью из базы? Причина: ${cleanReason}. Это действие нельзя отменить.`);
    if (!confirmed) return;

    const result = await runApi(
      window.cflowData.deleteBox(securePayload({ boxId, reason: cleanReason })),
      "Коробка удалена из базы",
    );
    if (result.ok) {
      setDetailModal(null);
      setSelectedId("");
    }
  }

  async function deleteClient(client: ClientItem) {
    if (!window.cflowData) {
      setError("База CFlow не подключена. Запустите приложение с рабочего стола.");
      return;
    }

    const linkedBoxes = data.boxes.filter((box) =>
      box.clientId === client.id ||
      (client.clientCode && box.clientCode === client.clientCode) ||
      (client.phone && box.phone === client.phone) ||
      box.client === client.name,
    );
    if (linkedBoxes.length) {
      setError(`Нельзя удалить клиента: у него есть коробки (${linkedBoxes.length}). Сначала разберите связанные грузы.`);
      return;
    }

    const reason = window.prompt(`Причина удаления клиента ${client.name}. Например: тестовая запись или дубль.`);
    const cleanReason = reason?.trim();
    if (!cleanReason) {
      setError("Удаление отменено: нужна причина удаления");
      return;
    }

    const confirmed = window.confirm(`Удалить клиента ${client.name} полностью из базы? Причина: ${cleanReason}. Это действие нельзя отменить.`);
    if (!confirmed) return;

    const result = await runApi(
      window.cflowData.deleteClient(securePayload({ clientId: client.id, reason: cleanReason })),
      "Клиент удален из базы",
    );
    if (result.ok) setDetailModal(null);
  }

  function openBoxDetail(id: string) {
    setSelectedId(id);
    setDetailModal({ type: "box", id });
  }

  async function copyText(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(success);
      setError("");
    } catch {
      setError("Не удалось скопировать текст");
    }
  }

  const dashboardAdminPanel = activeNav === "Dashboard" && dashboardPanel ? (
    <article className="panel dashboard-admin-panel">
      <div className="panel-head compact">
        <div>
          <span className="eyebrow">Коды клиентов</span>
          <h2>{dashboardPanel === "codes" ? "Автогенерация кодов" : "Адрес склада в Китае"}</h2>
        </div>
        <button type="button" onClick={() => setDashboardPanel(null)}>Закрыть</button>
      </div>
      {dashboardPanel === "codes" ? (
        <div className="dashboard-admin-form">
          <p>Постоянная часть кода: 奇瑞QR</p>
          <p>Телефон/часть адреса склада: 18911759229</p>
          <p>Уникальная часть выдается автоматически: AST A001, AST A002 ... AST A999, затем AST B001.</p>
          <p>Следующий код закрепляется за клиентом навсегда и больше не используется повторно.</p>
          <button className="primary" type="button" disabled>Автогенерация включена</button>
        </div>
      ) : (
        <form className="dashboard-admin-form" onSubmit={saveWarehouseAddress}>
          <label>
            Адрес склада
            <textarea
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
              placeholder="Адрес склада в Китае, который будет выдаваться клиентам"
            />
          </label>
          <p>Этот адрес автоматически попадет клиенту вместе с закрепленным кодом.</p>
          <button className="primary" type="submit">Сохранить адрес</button>
        </form>
      )}
    </article>
  ) : null;

  const operationPanel = (
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
        <button className={actionMode === "status" ? "primary" : ""} type="button" onClick={() => setAction("status")}>Статус</button>
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
  );

  const detailsPanel = selectedBox ? (
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
        <div><dt>Код коробки</dt><dd>{selectedBox.code || "Не указан"}</dd></div>
        <div><dt>Код клиента</dt><dd>{selectedBox.clientCode || "Не указан"}</dd></div>
        <div><dt>Партия</dt><dd>{selectedBox.batch || "Не указана"}</dd></div>
        <div><dt>Телефон</dt><dd>{selectedBox.phone}</dd></div>
        <div><dt>Вес</dt><dd>{selectedBox.weight}</dd></div>
        <div><dt>Размеры</dt><dd>{selectedBox.dimensions || "Не указаны"}</dd></div>
        <div><dt>Место</dt><dd>{selectedBox.place}</dd></div>
        <div><dt>Маршрут</dt><dd>{selectedBox.route}</dd></div>
        <div><dt>К оплате</dt><dd>{showFinance ? money(selectedBox.chargeAmount || selectedBox.amount || 0) : selectedBox.payment}</dd></div>
        {showFinance ? <div><dt>Себестоимость</dt><dd>{money(selectedBox.costAmount || 0)}</dd></div> : null}
        {showFinance ? <div><dt>Прибыль</dt><dd>{money(selectedBox.profitAmount || 0)}</dd></div> : null}
        <div><dt>Ответственный</dt><dd>{selectedBox.owner}</dd></div>
        <div><dt>Комментарий</dt><dd>{selectedBox.comment || "Нет"}</dd></div>
      </dl>
      <div className="detail-actions">
        <button type="button" className="primary" onClick={() => setAction("issue")}>Выдать</button>
        <button type="button" onClick={() => setAction("move")}>Переместить</button>
        <button type="button" onClick={() => setAction("problem")}>Проблема</button>
      </div>
    </aside>
  ) : null;

  const pageCopy: Record<string, { title: string; lead: string }> = {
    Dashboard: { title: "Пульс карго-точки", lead: "Главные показатели, последние действия и быстрый вход в приемку." },
    Коробки: { title: "Коробки", lead: "Приемка, выдача, перемещение, статус и карточки всех грузов." },
    Клиенты: { title: "Клиенты", lead: "Контакты, история клиента и связанные коробки." },
    Склад: { title: "Склад", lead: "Зоны хранения, заполненность и размещение коробок." },
    Отправки: { title: "Отправки", lead: "Контейнеры, машины, авиа и состав партий." },
    Финансы: { title: "Финансы", lead: "Оплаты, долги, ожидаемые суммы и доход." },
    Отчеты: { title: "Отчеты", lead: "Срезы по работе точки, сотрудникам, грузам и деньгам." },
    "База знаний": { title: "База знаний", lead: "Склады, контрагенты, обмен денег, оборудование и рабочие памятки для карго." },
    Настройки: { title: "Настройки", lead: "Сервисные параметры приложения и информация о хранении данных." },
  };

  const currentPage = pageCopy[activeNav] || pageCopy.Dashboard;

  if (!sessionUser) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-label="Вход в CFlow">
          <div className="brand auth-brand">
            <img className="brand-logo brand-logo-auth" src="./zabota-cargo-logo.png" alt="ZABOTA CARGO" />
            <div>
              <strong>ZABOTA CARGO</strong>
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
          <img className="brand-logo" src="./zabota-cargo-logo.png" alt="ZABOTA CARGO" />
          <div>
            <strong>ZABOTA CARGO</strong>
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
            <button type="button" onClick={() => void syncNow()}>Синхронизировать</button>
            <button type="button" onClick={() => { setActiveNav("Коробки"); setAction("receive"); }}>Принять</button>
            <button type="button" className="primary" onClick={() => { setActiveNav("Коробки"); setAction("issue"); }}>Выдать</button>
          </div>
        </header>

        {syncStatus?.status === "connected" ? <p className="app-notice">Облако подключено. Клиентов в облаке: {syncStatus.pulledClients || 0}</p> : null}
        {notice ? <p className="app-notice">{notice}</p> : null}
        {error ? <p className="app-error">{error}</p> : null}

        <section className="page-header">
          <div>
            <p className="eyebrow">{activeNav}</p>
            <h1>{currentPage.title}</h1>
            <p className="lead">{currentPage.lead}</p>
          </div>
          {activeNav === "Dashboard" ? (
            <div className="scan-card">
              <span>Быстрое действие</span>
              <strong>Сканировать трек или QR</strong>
              <p>Оператор начинает приемку без переходов по меню.</p>
              <button className="primary" type="button" onClick={openScanner}>Открыть сканер</button>
              <div className="code-pool-mini">
                <span>Автокоды: {availableCodeCount} осталось · {assignedCodeCount} выдано</span>
                <span>{warehouseAddress ? "Адрес склада задан" : "Адрес склада не задан"}</span>
              </div>
              <div className="scan-card-actions">
                <button type="button" onClick={() => setDashboardPanel("codes")}>Схема кодов</button>
                <button type="button" onClick={() => setDashboardPanel("address")}>Адрес склада</button>
              </div>
            </div>
          ) : null}
        </section>

        {dashboardAdminPanel}

        {activeNav === "Dashboard" ? (
          <section className="dashboard-page">
            <section className="metrics-grid" aria-label="Ключевые показатели">
              {metrics.map((metric) => (
                <article className={`metric ${metric.tone}`} key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.delta}</p>
                </article>
              ))}
            </section>
            <div className="split-panels">
              <BoxesPanel boxes={filteredBoxes.slice(0, 6)} selectedId={selectedId} onOpenBox={openBoxDetail} />
              <ActivityPanel activity={data.activity} />
            </div>
            <div className="split-panels">
              <WarehousePanel zones={data.warehouse} compact />
              {showFinance ? <FinancePanel finances={data.finances} /> : <ClientsPanel clients={filteredClients.slice(0, 5)} onOpenClient={(id) => setDetailModal({ type: "client", id })} />}
            </div>
          </section>
        ) : activeNav === "Коробки" ? (
          <section className="tab-grid">
            <div className="left-flow">
              {operationPanel}
              <BoxesPanel boxes={filteredBoxes} selectedId={selectedId} onOpenBox={openBoxDetail} />
            </div>
            {detailsPanel}
          </section>
        ) : activeNav === "Клиенты" ? (
          <section className="single-page">
            <ClientsPanel clients={filteredClients} onOpenClient={(id) => setDetailModal({ type: "client", id })} />
          </section>
        ) : activeNav === "Склад" ? (
          <section className="single-page">
            <WarehousePanel zones={data.warehouse} />
            <BoxesPanel boxes={filteredBoxes} selectedId={selectedId} onOpenBox={openBoxDetail} />
          </section>
        ) : activeNav === "Отправки" ? (
          <section className="tab-grid">
            <div className="left-flow">
              {operationPanel}
              <ShipmentsPanel shipments={data.shipments} />
            </div>
            {detailsPanel}
          </section>
        ) : activeNav === "Финансы" && showFinance ? (
          <section className="single-page">
            <FinancePanel finances={data.finances} />
            <ActivityPanel activity={data.activity} />
          </section>
        ) : activeNav === "Отчеты" && showFinance ? (
          <section className="single-page">
            <ReportsPanel data={data} finances={data.finances} />
          </section>
        ) : activeNav === "База знаний" ? (
          <section className="single-page">
            <KnowledgeBasePanel onCopyText={copyText} />
          </section>
        ) : activeNav === "Настройки" ? (
          <section className="single-page">
            <SettingsPanel />
          </section>
        ) : null}
        {detailModal ? (
          <DetailModal
            box={modalBox}
            client={modalClient}
            clientBoxes={modalClientBoxes}
            boxActivity={modalBoxActivity}
            showFinance={showFinance}
            onClose={() => setDetailModal(null)}
            onOpenBox={openBoxDetail}
            onDeleteBox={deleteBox}
            onDeleteClient={deleteClient}
            onCopyText={copyText}
            onIssueClientAccess={issueClientCode}
            availableCodeCount={availableCodeCount}
            warehouseAddress={warehouseAddress}
          />
        ) : null}
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
    status: "Обновление статуса",
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

  if (mode === "status") {
    return (
      <form className="action-form action-form-inline" onSubmit={onSubmit}>
        <label>
          Новый статус
          <select value={form.nextStatus} onChange={(event) => update("nextStatus", event.target.value)}>
            {boxStatuses.map((status) => <option value={status} key={status}>{status}</option>)}
          </select>
        </label>
        <button className="primary" type="submit" disabled={!selectedBox}>Обновить статус</button>
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
      <label>Код/маркировка коробки<input value={form.code} onChange={(event) => update("code", event.target.value)} placeholder="Код на коробке / строка накладной" /></label>
      <label>Код клиента<input value={form.clientCode} onChange={(event) => update("clientCode", event.target.value)} placeholder="Код клиента со склада Китая" /></label>
      <label>Клиент<input value={form.client} onChange={(event) => update("client", event.target.value)} placeholder="Можно оставить пустым, если клиент неизвестен" /></label>
      <label>Телефон<input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+7..." /></label>
      <label>Вес<input value={form.weight} onChange={(event) => update("weight", event.target.value)} placeholder="8.4" /></label>
      <label>Размеры<input value={form.dimensions} onChange={(event) => update("dimensions", event.target.value)} placeholder="42x35x28" /></label>
      <label>Партия/накладная<input value={form.batch} onChange={(event) => update("batch", event.target.value)} placeholder="INV-001 / контейнер / рейс" /></label>
      <label>Место<input value={form.place} onChange={(event) => update("place", event.target.value)} placeholder="A-04 / S2 / P3" /></label>
      <label>Маршрут<input value={form.route} onChange={(event) => update("route", event.target.value)} /></label>
      {showFinance ? <label>Оплата<input value={form.payment} onChange={(event) => update("payment", event.target.value)} placeholder="Не оплачено" /></label> : null}
      <label>Цена клиенту за кг<input value={form.clientRate} onChange={(event) => update("clientRate", event.target.value)} placeholder="2500" /></label>
      {showFinance ? <label>Цена Китая за кг<input value={form.chinaRate} onChange={(event) => update("chinaRate", event.target.value)} placeholder="1800" /></label> : null}
      <label>Комментарий<input value={form.comment} onChange={(event) => update("comment", event.target.value)} placeholder="Заметка" /></label>
      <button className="primary" type="submit">Принять коробку</button>
    </form>
  );
}

function BoxesPanel({ boxes, selectedId, onOpenBox }: { boxes: BoxItem[]; selectedId: string; onOpenBox: (id: string) => void }) {
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
          <button className={selectedId === box.id ? "box-row selected" : "box-row"} type="button" key={box.id} onClick={() => onOpenBox(box.id)}>
            <span className="box-id">{box.id}</span>
            <span><strong>{box.client}</strong><small>{box.track} · {box.code || "без кода"} · {box.phone}</small></span>
            <span className="hide-mobile">{box.place}</span>
            <span className={`status ${isProblem(box) ? "danger" : ""}`}>{box.status}</span>
          </button>
        ))}
        {!boxes.length ? <p className="empty-state">Ничего не найдено</p> : null}
      </div>
    </article>
  );
}

function ClientsPanel({ clients, onOpenClient }: { clients: ClientItem[]; onOpenClient: (id: string) => void }) {
  return (
    <article className="panel">
      <div className="panel-head compact"><div><span className="eyebrow">Клиенты</span><h2>Клиентская база</h2></div></div>
      <div className="entity-list">
        {clients.map((client) => (
          <button className="entity-row entity-button" type="button" key={client.id} onClick={() => onOpenClient(client.id)}>
            <span className="box-id">{client.id}</span>
            <strong>{client.name}</strong>
            <span>{client.phone || "Без телефона"}</span>
            <span>{client.clientCode || "Код не выдан"}</span>
          </button>
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
        <div><span>Получено от клиентов</span><strong>{money(finances.incomeToday)}</strong></div>
        <div><span>Начислено клиентам</span><strong>{money(finances.chargedToday || finances.expectedToday)}</strong></div>
        <div><span>Оплачено Китаю</span><strong>{money(finances.costToday || finances.expensesToday)}</strong></div>
        <div><span>Долг клиентов</span><strong>{money(finances.debt)}</strong></div>
        <div><span>Ожидаемая прибыль</span><strong>{money(finances.profitToday || 0)}</strong></div>
      </div>
    </article>
  );
}

function ReportsPanel({ data, finances }: { data: CflowData; finances: FinanceData }) {
  const activeBoxes = data.boxes.filter((box) => box.status !== "Выдано").length;
  const issuedBoxes = data.boxes.filter((box) => box.status === "Выдано").length;
  const unknownBoxes = data.boxes.filter((box) => box.status === "Без клиента").length;
  const totalWeight = data.boxes.reduce((sum, box) => sum + chargeableWeight(box), 0);

  return (
    <article className="panel">
      <div className="panel-head compact"><div><span className="eyebrow">Отчеты</span><h2>Сводка точки</h2></div></div>
      <div className="finance-grid">
        <div><span>Активные коробки</span><strong>{activeBoxes}</strong></div>
        <div><span>Выдано</span><strong>{issuedBoxes}</strong></div>
        <div><span>Без клиента</span><strong>{unknownBoxes}</strong></div>
        <div><span>Расчетный вес</span><strong>{Math.round(totalWeight * 10) / 10} кг</strong></div>
      </div>
      <div className="report-list">
        <div><strong>Долг клиентов</strong><span>{money(finances.debt)}</span></div>
        <div><strong>Начислено клиентам</strong><span>{money(finances.chargedToday || finances.expectedToday)}</span></div>
        <div><strong>Оплачено Китаю</strong><span>{money(finances.costToday || finances.expensesToday)}</span></div>
        <div><strong>Ожидаемая прибыль</strong><span>{money(finances.profitToday || 0)}</span></div>
        <div><strong>Отправок создано</strong><span>{data.shipments.length}</span></div>
        <div><strong>Проблемных коробок</strong><span>{data.boxes.filter(isProblem).length}</span></div>
      </div>
    </article>
  );
}

function KnowledgeBasePanel({ onCopyText }: { onCopyText: (text: string, success: string) => void }) {
  const [activeCategory, setActiveCategory] = useState("Все");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");

  const filteredItems = useMemo(() => {
    const normalizedQuery = knowledgeQuery.trim().toLowerCase();

    return knowledgeItems.filter((item) => {
      const categoryMatches = activeCategory === "Все" || item.category === activeCategory;
      const haystack = [
        item.category,
        item.title,
        item.subtitle,
        item.badge || "",
        ...item.details,
      ].join(" ").toLowerCase();

      return categoryMatches && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [activeCategory, knowledgeQuery]);

  const categoryCounts = knowledgeCategories.reduce<Record<string, number>>((acc, category) => {
    acc[category] = category === "Все"
      ? knowledgeItems.length
      : knowledgeItems.filter((item) => item.category === category).length;
    return acc;
  }, {});

  return (
    <article className="panel knowledge-panel">
      <div className="panel-head compact knowledge-head">
        <div>
          <span className="eyebrow">Справочник</span>
          <h2>Операционная база знаний</h2>
          <p className="lead">Быстрый доступ к складам, контактам, обмену денег, оборудованию и рабочим правилам.</p>
        </div>
        <label className="knowledge-search">
          <span>Поиск</span>
          <input
            value={knowledgeQuery}
            onChange={(event) => setKnowledgeQuery(event.target.value)}
            placeholder="Склад, телефон, обмен, весы..."
          />
        </label>
      </div>

      <div className="knowledge-tabs" role="tablist" aria-label="Разделы базы знаний">
        {knowledgeCategories.map((category) => (
          <button
            key={category}
            type="button"
            className={activeCategory === category ? "active" : ""}
            onClick={() => setActiveCategory(category)}
          >
            <span>{category}</span>
            <strong>{categoryCounts[category]}</strong>
          </button>
        ))}
      </div>

      <div className="knowledge-layout">
        <aside className="knowledge-summary">
          <h3>Что уже внесено</h3>
          <div>
            <span>Склады</span>
            <strong>{categoryCounts["Склады"]}</strong>
          </div>
          <div>
            <span>Контакты</span>
            <strong>{categoryCounts["Контакты"]}</strong>
          </div>
          <div>
            <span>Обмен денег</span>
            <strong>{categoryCounts["Обмен денег"]}</strong>
          </div>
          <div>
            <span>Оборудование</span>
            <strong>{categoryCounts["Оборудование"]}</strong>
          </div>
          <p>Это пока ручная база. Следующим шагом можно сделать редактирование прямо из интерфейса и хранить записи в общей базе.</p>
        </aside>

        <div className="knowledge-list">
          {filteredItems.map((item) => (
            <section className="knowledge-card" key={item.id}>
              <div className="knowledge-card-head">
                <div>
                  <span className="eyebrow">{item.category}</span>
                  <h3>{item.title}</h3>
                  <p>{item.subtitle}</p>
                </div>
                {item.badge ? <span className="knowledge-badge">{item.badge}</span> : null}
              </div>
              <ul>
                {item.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              {item.copyText ? (
                <button type="button" onClick={() => onCopyText(item.copyText || "", "Данные скопированы")}>
                  Скопировать
                </button>
              ) : null}
            </section>
          ))}
          {!filteredItems.length ? <p className="empty-state">По этому запросу ничего не найдено.</p> : null}
        </div>
      </div>
    </article>
  );
}

function SettingsPanel() {
  return (
    <article className="panel">
      <div className="panel-head compact"><div><span className="eyebrow">Настройки</span><h2>Сервис</h2></div></div>
      <p className="lead">Данные приложения хранятся локально в папке пользователя Windows. Новая установка стартует с пустой базы, без демо-коробок и тестовых клиентов.</p>
    </article>
  );
}

function DetailModal({
  box,
  client,
  clientBoxes,
  boxActivity,
  showFinance,
  onClose,
  onOpenBox,
  onDeleteBox,
  onDeleteClient,
  onCopyText,
  onIssueClientAccess,
  availableCodeCount,
  warehouseAddress,
}: {
  box?: BoxItem;
  client?: ClientItem;
  clientBoxes: BoxItem[];
  boxActivity: ActivityItem[];
  showFinance: boolean;
  onClose: () => void;
  onOpenBox: (id: string) => void;
  onDeleteBox: (id: string) => void;
  onDeleteClient: (client: ClientItem) => void;
  onCopyText: (text: string, success: string) => void;
  onIssueClientAccess: (client: ClientItem) => void;
  availableCodeCount: number;
  warehouseAddress: string;
}) {
  const isClientModal = Boolean(client);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={isClientModal ? "Карточка клиента" : "Карточка коробки"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isClientModal ? "Карточка клиента" : "Карточка коробки"}</span>
            <h2>{client?.name || box?.client || "Объект не найден"}</h2>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose}>Закрыть</button>
        </div>

        {box ? (
          <>
            <div className="modal-summary">
              <span className={`status ${isProblem(box) ? "danger" : ""}`}>{box.status}</span>
              <strong>{box.id}</strong>
              <span>{box.code ? `${box.track} · ${box.code}` : box.track}</span>
            </div>
            <dl className="details-list modal-list">
              <div><dt>Клиент</dt><dd>{box.client}</dd></div>
              <div><dt>Код коробки</dt><dd>{box.code || "Не указан"}</dd></div>
              <div><dt>Код клиента</dt><dd>{box.clientCode || "Не указан"}</dd></div>
              <div><dt>Партия</dt><dd>{box.batch || "Не указана"}</dd></div>
              <div><dt>Телефон</dt><dd>{box.phone || "Не указан"}</dd></div>
              <div><dt>Место</dt><dd>{box.place}</dd></div>
              <div><dt>Вес</dt><dd>{box.weight}</dd></div>
              <div><dt>Размеры</dt><dd>{box.dimensions || "Не указаны"}</dd></div>
              <div><dt>Расчетный вес</dt><dd>{chargeableWeight(box) ? `${chargeableWeight(box)} кг` : "Не рассчитан"}</dd></div>
              <div><dt>Маршрут</dt><dd>{box.route}</dd></div>
              <div><dt>К оплате клиенту</dt><dd>{showFinance ? money(box.chargeAmount || box.amount || 0) : box.payment}</dd></div>
              {showFinance ? <div><dt>Цена клиенту/кг</dt><dd>{money(box.clientRate || 0)}</dd></div> : null}
              {showFinance ? <div><dt>Цена Китая/кг</dt><dd>{money(box.chinaRate || 0)}</dd></div> : null}
              {showFinance ? <div><dt>Себестоимость</dt><dd>{money(box.costAmount || 0)}</dd></div> : null}
              {showFinance ? <div><dt>Прибыль</dt><dd>{money(box.profitAmount || 0)}</dd></div> : null}
              <div><dt>Ответственный</dt><dd>{box.owner}</dd></div>
              <div><dt>Комментарий</dt><dd>{box.comment || "Нет"}</dd></div>
            </dl>
            <div className="detail-actions">
              <button className="primary" type="button" onClick={() => onCopyText(arrivalMessage(box), "Сообщение клиенту скопировано")}>Скопировать сообщение клиенту</button>
            </div>
            <div className="modal-danger">
              <div>
                <strong>Ошибочный товар</strong>
                <p>Удаление полностью уберет коробку из базы и отправок.</p>
              </div>
              <button className="danger-button" type="button" onClick={() => onDeleteBox(box.id)}>Удалить коробку</button>
            </div>
            <div className="modal-section">
              <div className="panel-head compact">
                <h2>История коробки</h2>
                <span className="counter">{boxActivity.length} событий</span>
              </div>
              <div className="activity modal-activity">
                {boxActivity.slice(0, 8).map((item) => (
                  <div key={item.id}>
                    <time>{item.displayTime || item.time.slice(11, 16)}</time>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                    <span>{item.user}</span>
                  </div>
                ))}
                {!boxActivity.length ? <p className="empty-state">История по этой коробке пока пустая</p> : null}
              </div>
            </div>
          </>
        ) : null}

        {client ? (
          <>
            <dl className="details-list modal-list">
              <div><dt>ID</dt><dd>{client.id}</dd></div>
              <div><dt>Код клиента</dt><dd>{client.clientCode || "Не выдан"}</dd></div>
              <div><dt>Статус заявки</dt><dd>{client.registrationStatus === "approved" ? "Подтвержден" : "Ожидает кода"}</dd></div>
              <div><dt>Телефон</dt><dd>{client.phone || "Не указан"}</dd></div>
              <div><dt>Telegram</dt><dd>{client.telegram || "Не указан"}</dd></div>
              <div><dt>Адрес склада Китай</dt><dd>{client.chinaAddress || "Не указан"}</dd></div>
              <div><dt>Комментарий</dt><dd>{client.comments || "Нет"}</dd></div>
              <div><dt>Коробок</dt><dd>{clientBoxes.length}</dd></div>
            </dl>
            <div className="modal-access-form">
              <div>
                <strong>{client.clientCode ? "Код уже выдан" : "Автовыдача кода"}</strong>
                <p>{client.clientCode ? `Код ${client.clientCode} закреплен за этим клиентом навсегда.` : "Система сгенерирует следующий код AST по порядку и добавит общий адрес склада."}</p>
              </div>
              <div>
                <span>Осталось автокодов: {availableCodeCount}</span>
                <span>{warehouseAddress ? "Адрес склада готов" : "Сначала задайте адрес склада"}</span>
              </div>
              <button
                className="primary"
                type="button"
                disabled={Boolean(client.clientCode) || availableCodeCount <= 0 || !warehouseAddress}
                onClick={() => onIssueClientAccess(client)}
              >
                {client.clientCode ? "Код уже выдан" : "Выдать код"}
              </button>
            </div>
            <div className="detail-actions">
              <button className="primary" type="button" onClick={() => onCopyText(clientInstruction(client), "Инструкция клиенту скопирована")}>Скопировать инструкцию клиенту</button>
            </div>
            <div className="modal-danger">
              <div>
                <strong>Удалить клиента</strong>
                <p>{clientBoxes.length ? "У клиента есть связанные коробки, поэтому удаление заблокировано." : "Подходит для тестовых записей и дублей без грузов."}</p>
              </div>
              <button className="danger-button" type="button" disabled={clientBoxes.length > 0} onClick={() => onDeleteClient(client)}>Удалить клиента</button>
            </div>
            <div className="modal-section">
              <div className="panel-head compact">
                <h2>Коробки клиента</h2>
                <span className="counter">{clientBoxes.length} найдено</span>
              </div>
              <div className="box-list">
                {clientBoxes.map((item) => (
                  <button className="box-row modal-box-row" type="button" key={item.id} onClick={() => onOpenBox(item.id)}>
                    <span className="box-id">{item.id}</span>
                    <span><strong>{item.track}</strong><small>{item.code ? `${item.code} · ${item.place}` : item.place}</small></span>
                    <span className={`status ${isProblem(item) ? "danger" : ""}`}>{item.status}</span>
                  </button>
                ))}
                {!clientBoxes.length ? <p className="empty-state">У клиента пока нет коробок</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
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
