import {
  type AnyPgColumn,
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  maxVms: integer("max_vms").notNull().default(3),
  maxCpu: integer("max_cpu").notNull().default(8),
  maxRamMb: integer("max_ram_mb").notNull().default(16384),
  maxDiskGb: integer("max_disk_gb").notNull().default(200),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const osTemplates = pgTable("os_templates", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  family: varchar("family", { length: 32 }).notNull(),
  minDiskGb: integer("min_disk_gb").notNull().default(10),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const isos = pgTable("isos", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  filename: varchar("filename", { length: 160 }).notNull().unique(),
  sizeMb: integer("size_mb").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const nodes = pgTable("nodes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  sshHost: varchar("ssh_host", { length: 128 }).notNull(),
  // "online" | "offline"
  status: varchar("status", { length: 12 }).notNull().default("online"),
  cpu: integer("cpu").notNull(),
  ramMb: integer("ram_mb").notNull(),
  diskGb: integer("disk_gb").notNull(),
  bridge: varchar("bridge", { length: 32 }).notNull().default("br0"),
  subnetPrefix: varchar("subnet_prefix", { length: 15 }).notNull().default("10.20.0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vms = pgTable("vms", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 32 }).notNull(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  nodeId: integer("node_id").references(() => nodes.id, { onDelete: "restrict" }),
  templateId: integer("template_id").references(() => osTemplates.id, {
    onDelete: "set null",
  }),
  osName: varchar("os_name", { length: 80 }).notNull(),
  // running | stopped | starting | stopping | installing
  status: varchar("status", { length: 16 }).notNull().default("stopped"),
  transitionTo: varchar("transition_to", { length: 16 }),
  transitionUntil: timestamp("transition_until"),
  suspended: boolean("suspended").notNull().default(false),
  cpuCores: integer("cpu_cores").notNull(),
  ramMb: integer("ram_mb").notNull(),
  diskGb: integer("disk_gb").notNull(),
  ipv4: varchar("ipv4", { length: 45 }).notNull().unique(),
  gateway: varchar("gateway", { length: 45 }).notNull(),
  mac: varchar("mac", { length: 17 }).notNull(),
  bridge: varchar("bridge", { length: 32 }).notNull().default("br0"),
  vlan: integer("vlan"),
  rootUsername: varchar("root_username", { length: 32 })
    .notNull()
    .default("root"),
  rootPassword: varchar("root_password", { length: 128 }).notNull(),
  isoId: integer("iso_id").references(() => isos.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vmLogs = pgTable("vm_logs", {
  id: serial("id").primaryKey(),
  vmId: integer("vm_id").references(() => vms.id, { onDelete: "set null" }),
  vmName: varchar("vm_name", { length: 32 }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  level: varchar("level", { length: 8 }).notNull().default("info"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
});

/** Simulated per-VM filesystem tree (adjacency list). */
export const vmFiles = pgTable("vm_files", {
  id: serial("id").primaryKey(),
  vmId: integer("vm_id")
    .notNull()
    .references(() => vms.id, { onDelete: "cascade" }),
  parentId: integer("parent_id").references((): AnyPgColumn => vmFiles.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  // "file" | "dir"
  type: varchar("type", { length: 4 }).notNull(),
  content: text("content"),
  // "text" | "base64" (binary uploads are stored base64-encoded)
  encoding: varchar("encoding", { length: 8 }).notNull().default("text"),
  mimeType: varchar("mime_type", { length: 120 }),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
