import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// 1. Categories Table
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  created_by_id: text('created_by_id').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  color: text('color').notNull().default('#6366f1'),
  icon: text('icon').notNull().default('Tag'),
  created_date: text('created_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updated_date: text('updated_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

// 2. Transactions Table
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  created_by_id: text('created_by_id').notNull(),
  date: text('date').notNull(), // ISO YYYY-MM-DD
  amount: real('amount').notNull(), // strictly positive
  description: text('description').notNull().default(''),
  category_id: text('category_id').references(() => categories.id),
  category_name: text('category_name').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  is_recurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  // Phase 6.5 — private R2 receipt attachment (users/{uid}/receipts/... key)
  attachment_key: text('attachment_key'),
  attachment_name: text('attachment_name'),
  created_date: text('created_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updated_date: text('updated_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

// 3. Budgets Table
export const budgets = sqliteTable('budgets', {
  id: text('id').primaryKey(),
  created_by_id: text('created_by_id').notNull(),
  month: text('month').notNull(), // YYYY-MM
  category_id: text('category_id').references(() => categories.id),
  category_name: text('category_name').notNull(),
  planned_amount: real('planned_amount').notNull(),
  notes: text('notes'),
  created_date: text('created_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updated_date: text('updated_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('budget_user_month_category_idx').on(table.created_by_id, table.month, table.category_id),
])

// 4. Accounts Table
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  created_by_id: text('created_by_id').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['cash', 'bank', 'mobile_wallet'] }).notNull(),
  institution: text('institution').notNull().default(''),
  account_number: text('account_number').notNull().default(''), // Masked last 4 digits only
  balance: real('balance').notNull().default(0),
  color: text('color').notNull().default('#3b82f6'),
  notes: text('notes'),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_date: text('created_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updated_date: text('updated_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

// 5. Better Auth Database Tables for D1
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  currency: text('currency').notNull().default('MWK'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }),
})
