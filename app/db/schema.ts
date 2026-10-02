import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const presence = sqliteTable('presence', {
  visitor: text('visitor').notNull(),
  session: text('session').notNull(),
  name: text('name').notNull(),
  hero: text('hero').notNull(),
  mode: text('mode').notNull(),
  score: integer('score').notNull(),
  firstSeen: integer('first_seen').notNull(),
  lastSeen: integer('last_seen').notNull(),
  ipMasked: text('ip_masked').notNull().default(''),
  countryCode: text('country_code').notNull().default(''),
  region: text('region').notNull().default(''),
  city: text('city').notNull().default(''),
  network: text('network').notNull().default(''),
  locationSource: text('location_source').notNull().default(''),
  entrypoint: text('entrypoint').notNull().default(''),
  exitKey: text('exit_key').notNull().default(''),
}, t => [primaryKey({columns:[t.visitor,t.session]}), index('idx_presence_last_seen').on(t.lastSeen)]);
export const adminSessions = sqliteTable('admin_sessions', {
  hash: text('hash').primaryKey(),
  keyHash: text('key_hash').notNull(),
  expires: integer('expires').notNull(),
}, t => [index('idx_admin_sessions_expires').on(t.expires)]);
