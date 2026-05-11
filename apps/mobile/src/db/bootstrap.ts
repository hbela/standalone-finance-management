// Initial schema applied on first DB open. Replace with drizzle-kit migrations once
// the schema starts evolving in production. Until then, CREATE TABLE IF NOT EXISTS is
// idempotent and additive — safe to run on every boot.

export const BOOTSTRAP_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  country TEXT NOT NULL,
  locale TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  bank_id TEXT,
  bank_key TEXT,
  provider_account_id TEXT,
  credentials_id TEXT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  type TEXT NOT NULL,
  current_balance REAL NOT NULL,
  available_balance REAL,
  institution_name TEXT,
  holder_name TEXT,
  iban TEXT,
  bban TEXT,
  last_synced_at INTEGER,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS accounts_by_user_id ON accounts(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider_transaction_id TEXT,
  posted_at INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  base_currency_amount REAL,
  description TEXT NOT NULL,
  merchant TEXT,
  category_id TEXT,
  tink_category_code TEXT,
  import_batch_id TEXT,
  type TEXT NOT NULL,
  is_recurring INTEGER NOT NULL,
  recurring_group_id TEXT,
  is_excluded_from_reports INTEGER NOT NULL,
  transfer_match_id TEXT,
  dedupe_hash TEXT NOT NULL,
  status TEXT,
  notes TEXT,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS transactions_by_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_by_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS transactions_by_dedupe_hash ON transactions(dedupe_hash);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tink_category_code TEXT,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS categories_by_user_id ON categories(user_id);

CREATE TABLE IF NOT EXISTS liabilities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  linked_account_id TEXT,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  original_principal REAL NOT NULL,
  outstanding_balance REAL NOT NULL,
  interest_rate REAL NOT NULL,
  payment_amount REAL NOT NULL,
  payment_frequency TEXT NOT NULL,
  next_due_date TEXT NOT NULL,
  rate_type TEXT NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS liabilities_by_user_id ON liabilities(user_id);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  source_name TEXT,
  row_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  column_mapping TEXT NOT NULL,
  date_format TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS import_batches_by_user_id ON import_batches(user_id);
CREATE INDEX IF NOT EXISTS import_batches_by_account_id ON import_batches(account_id);

CREATE TABLE IF NOT EXISTS balance_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  booked_balance REAL NOT NULL,
  available_balance REAL,
  currency TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS balance_snapshots_by_user_id ON balance_snapshots(user_id);
CREATE INDEX IF NOT EXISTS balance_snapshots_by_account_date ON balance_snapshots(account_id, snapshot_date);

CREATE TABLE IF NOT EXISTS recurring_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  group_key TEXT NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  average_amount REAL NOT NULL,
  monthly_amount REAL NOT NULL,
  frequency TEXT NOT NULL,
  confidence TEXT NOT NULL,
  transaction_count INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  next_expected_at INTEGER,
  confirmed_at INTEGER,
  dismissed_at INTEGER,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS recurring_subscriptions_by_user_id ON recurring_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS recurring_subscriptions_by_user_group_key ON recurring_subscriptions(user_id, group_key);

CREATE TABLE IF NOT EXISTS income_streams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  group_key TEXT NOT NULL,
  employer_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  average_amount REAL NOT NULL,
  monthly_average REAL NOT NULL,
  frequency TEXT NOT NULL,
  confidence TEXT NOT NULL,
  transaction_count INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  next_expected_at INTEGER,
  confirmed_at INTEGER,
  dismissed_at INTEGER,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS income_streams_by_user_id ON income_streams(user_id);
CREATE INDEX IF NOT EXISTS income_streams_by_user_group_key ON income_streams(user_id, group_key);

CREATE TABLE IF NOT EXISTS expense_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_key TEXT NOT NULL,
  category TEXT NOT NULL,
  currency TEXT NOT NULL,
  monthly_average REAL NOT NULL,
  total_amount REAL NOT NULL,
  months_observed INTEGER NOT NULL,
  transaction_count INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  confirmed_at INTEGER,
  dismissed_at INTEGER,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mirrored_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS expense_profiles_by_user_id ON expense_profiles(user_id);
CREATE INDEX IF NOT EXISTS expense_profiles_by_user_group_key ON expense_profiles(user_id, group_key);

CREATE TABLE IF NOT EXISTS fx_rates (
  base_currency TEXT PRIMARY KEY,
  rates_json TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
