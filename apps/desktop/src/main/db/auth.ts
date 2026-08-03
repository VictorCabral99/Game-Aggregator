import type { DatabaseSync } from 'node:sqlite';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  email_verified: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  id: string;
  user_id: string;
  type: string;
  provider: string;
  provider_account_id: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
  created_at: string;
  updated_at: string;
}

interface PlatformAccountRow {
  id: string;
  user_id: string;
  platform: string;
  external_user_id: string;
  display_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  metadata: string | null;
  linked_at: string;
  last_library_sync_at: string | null;
  last_wishlist_sync_at: string | null;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
  sessionState: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformAccount {
  id: string;
  userId: string;
  platform: 'steam' | 'gog' | 'epic' | 'amazon';
  externalUserId: string;
  displayName: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown> | null;
  linkedAt: string;
  lastLibrarySyncAt: string | null;
  lastWishlistSyncAt: string | null;
  updatedAt: string;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    refreshToken: row.refresh_token,
    accessToken: row.access_token,
    expiresAt: row.expires_at,
    tokenType: row.token_type,
    scope: row.scope,
    idToken: row.id_token,
    sessionState: row.session_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlatformAccount(row: PlatformAccountRow): PlatformAccount {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform as 'steam' | 'gog' | 'epic' | 'amazon',
    externalUserId: row.external_user_id,
    displayName: row.display_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    linkedAt: row.linked_at,
    lastLibrarySyncAt: row.last_library_sync_at,
    lastWishlistSyncAt: row.last_wishlist_sync_at,
    updatedAt: row.updated_at,
  };
}

export class AuthRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // ---- Users ----

  getUser(id: string): User | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(id) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  getUserByEmail(email: string): User | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(email) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  getUserByProvider(provider: string, providerAccountId: string): User | null {
    const row = this.db
      .prepare(
        `SELECT u.* FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = ? AND a.provider_account_id = ?`
      )
      .get(provider, providerAccountId) as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  getFirstUserId(): string | null {
    const row = this.db.prepare(`SELECT id FROM users LIMIT 1`).get() as { id: string } | undefined;
    return row?.id ?? null;
  }

  /** Último usuário com conta Google (para restaurar sessão). */
  getLatestGoogleUser(): User | null {
    const row = this.db
      .prepare(
        `SELECT u.* FROM users u
         INNER JOIN accounts a ON a.user_id = u.id AND a.provider = 'google'
         ORDER BY a.updated_at DESC
         LIMIT 1`
      )
      .get() as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  createUser(input: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: string | null;
  }): User {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (id, email, name, image, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(input.id, input.email, input.name ?? null, input.image ?? null, input.emailVerified ?? null, now, now);
    return this.getUser(input.id)!;
  }

  updateUser(id: string, patch: Partial<Pick<User, 'name' | 'image' | 'emailVerified'>>): User | null {
    const sets: string[] = [];
    const params: (string | null)[] = [];

    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(patch.name);
    }
    if (patch.image !== undefined) {
      sets.push('image = ?');
      params.push(patch.image);
    }
    if (patch.emailVerified !== undefined) {
      sets.push('email_verified = ?');
      params.push(patch.emailVerified);
    }
    if (sets.length === 0) return this.getUser(id);

    sets.push('updated_at = datetime(\'now\')');
    params.push(id);

    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.getUser(id);
  }

  // ---- Accounts (Google OAuth) ----

  getAccount(userId: string, provider: string): Account | null {
    const row = this.db
      .prepare(`SELECT * FROM accounts WHERE user_id = ? AND provider = ?`)
      .get(userId, provider) as AccountRow | undefined;
    return row ? mapAccount(row) : null;
  }

  getAccountByProviderId(provider: string, providerAccountId: string): Account | null {
    const row = this.db
      .prepare(`SELECT * FROM accounts WHERE provider = ? AND provider_account_id = ?`)
      .get(provider, providerAccountId) as AccountRow | undefined;
    return row ? mapAccount(row) : null;
  }

  upsertAccount(input: {
    userId: string;
    type: string;
    provider: string;
    providerAccountId: string;
    refreshToken?: string | null;
    accessToken?: string | null;
    expiresAt?: number | null;
    tokenType?: string | null;
    scope?: string | null;
    idToken?: string | null;
    sessionState?: string | null;
  }): Account {
    const existing = this.getAccountByProviderId(input.provider, input.providerAccountId);
    const now = new Date().toISOString();

    if (existing) {
      const sets = [
        'user_id = ?',
        'type = ?',
        'refresh_token = ?',
        'access_token = ?',
        'expires_at = ?',
        'token_type = ?',
        'scope = ?',
        'id_token = ?',
        'session_state = ?',
        'updated_at = datetime(\'now\')',
      ];
      this.db
        .prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`)
        .run(
          input.userId,
          input.type,
          input.refreshToken ?? null,
          input.accessToken ?? null,
          input.expiresAt ?? null,
          input.tokenType ?? null,
          input.scope ?? null,
          input.idToken ?? null,
          input.sessionState ?? null,
          existing.id
        );
      return this.getAccount(input.userId, input.provider)!;
    }

    const id = `acc-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO accounts
           (id, user_id, type, provider, provider_account_id, refresh_token, access_token,
            expires_at, token_type, scope, id_token, session_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.userId,
        input.type,
        input.provider,
        input.providerAccountId,
        input.refreshToken ?? null,
        input.accessToken ?? null,
        input.expiresAt ?? null,
        input.tokenType ?? null,
        input.scope ?? null,
        input.idToken ?? null,
        input.sessionState ?? null,
        now,
        now
      );
    return this.getAccount(input.userId, input.provider)!;
  }

  // ---- Platform Accounts (Epic/GOG/Amazon/Steam) ----

  getPlatformAccount(userId: string, platform: string): PlatformAccount | null {
    const row = this.db
      .prepare(`SELECT * FROM platform_accounts WHERE user_id = ? AND platform = ?`)
      .get(userId, platform) as PlatformAccountRow | undefined;
    return row ? mapPlatformAccount(row) : null;
  }

  listPlatformAccounts(userId: string): PlatformAccount[] {
    const rows = this.db
      .prepare(`SELECT * FROM platform_accounts WHERE user_id = ? ORDER BY platform`)
      .all(userId) as unknown as PlatformAccountRow[];
    return rows.map(mapPlatformAccount);
  }

  upsertPlatformAccount(input: {
    userId: string;
    platform: 'steam' | 'gog' | 'epic' | 'amazon';
    externalUserId: string;
    displayName?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
    metadata?: Record<string, unknown> | null;
  }): PlatformAccount {
    const existing = this.getPlatformAccount(input.userId, input.platform);
    const now = new Date().toISOString();

    if (existing) {
      this.db
        .prepare(
          `UPDATE platform_accounts SET
             external_user_id = ?, display_name = ?, access_token = ?, refresh_token = ?,
             token_expires_at = ?, metadata = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          input.externalUserId,
          input.displayName ?? null,
          input.accessToken ?? null,
          input.refreshToken ?? null,
          input.tokenExpiresAt ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
          existing.id
        );
      return this.getPlatformAccount(input.userId, input.platform)!;
    }

    const id = `pa-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO platform_accounts
           (id, user_id, platform, external_user_id, display_name, access_token, refresh_token,
            token_expires_at, metadata, linked_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.userId,
        input.platform,
        input.externalUserId,
        input.displayName ?? null,
        input.accessToken ?? null,
        input.refreshToken ?? null,
        input.tokenExpiresAt ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
        now
      );
    return this.getPlatformAccount(input.userId, input.platform)!;
  }

  removePlatformAccount(userId: string, platform: string): void {
    this.db
      .prepare(`DELETE FROM platform_accounts WHERE user_id = ? AND platform = ?`)
      .run(userId, platform);
  }
}