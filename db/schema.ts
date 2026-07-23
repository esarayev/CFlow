import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "operator",
  "warehouse",
  "manager",
  "finance",
  "admin",
]);

export const boxStatus = pgEnum("box_status", [
  "received",
  "stored",
  "sorting",
  "in_shipment",
  "ready_for_pickup",
  "issued",
  "problem",
]);

export const ledgerType = pgEnum("ledger_type", [
  "payment",
  "debt",
  "income",
  "expense",
  "reversal",
]);

export const branches = pgTable("branches", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    telegram: text("telegram"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("clients_phone_idx").on(table.phone),
    index("clients_name_idx").on(table.fullName),
  ],
);

export const warehouseLocations = pgTable(
  "warehouse_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    warehouse: text("warehouse").notNull(),
    rack: text("rack").notNull(),
    shelf: text("shelf").notNull(),
    cell: text("cell").notNull(),
    capacity: integer("capacity").notNull().default(1),
    occupied: integer("occupied").notNull().default(0),
  },
  (table) => [index("warehouse_location_lookup_idx").on(table.branchId, table.warehouse, table.rack, table.shelf, table.cell)],
);

export const boxes = pgTable(
  "boxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    clientId: uuid("client_id").references(() => clients.id).notNull(),
    locationId: uuid("location_id").references(() => warehouseLocations.id),
    responsibleUserId: uuid("responsible_user_id").references(() => users.id),
    publicCode: text("public_code").notNull().unique(),
    trackNumber: text("track_number").notNull(),
    qrCode: text("qr_code"),
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }).notNull(),
    lengthCm: numeric("length_cm", { precision: 10, scale: 2 }),
    widthCm: numeric("width_cm", { precision: 10, scale: 2 }),
    heightCm: numeric("height_cm", { precision: 10, scale: 2 }),
    status: boxStatus("status").notNull().default("received"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("boxes_track_idx").on(table.trackNumber),
    index("boxes_public_code_idx").on(table.publicCode),
    index("boxes_status_idx").on(table.status),
  ],
);

export const shipments = pgTable("shipments", {
  id: uuid("id").defaultRandom().primaryKey(),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
  code: text("code").notNull().unique(),
  transportType: text("transport_type").notNull(),
  destinationCity: text("destination_city").notNull(),
  plannedDate: timestamp("planned_date", { withTimezone: true }),
  totalWeightKg: numeric("total_weight_kg", { precision: 12, scale: 2 }).notNull().default("0"),
  cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shipmentBoxes = pgTable(
  "shipment_boxes",
  {
    shipmentId: uuid("shipment_id").references(() => shipments.id).notNull(),
    boxId: uuid("box_id").references(() => boxes.id).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shipment_boxes_lookup_idx").on(table.shipmentId, table.boxId)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    boxId: uuid("box_id").references(() => boxes.id),
    clientId: uuid("client_id").references(() => clients.id),
    type: ledgerType("type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("KZT"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ledger_branch_created_idx").on(table.branchId, table.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    deviceId: text("device_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_entity_idx").on(table.entityType, table.entityId)],
);
