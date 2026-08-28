import { randomUUID } from "node:crypto";
import { APP_PROJECT, bigquery } from "@/lib/bigquery";

export type Role = "admin" | "developer" | "user";

export interface DashboardUser {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  assignedFirms: string[];
  isActive: boolean;
  resetTokenHash: string | null;
  resetTokenExpiresAt: string | null;
}

const TABLE = `\`${APP_PROJECT}.pipeline_monitoring.dashboard_users\``;

// All writes use parameterized DML (not the streaming insert API) so a
// freshly created/edited row is immediately UPDATE-able -- BigQuery
// refuses UPDATE/DELETE on rows still sitting in the streaming buffer
// (up to ~90 min after a streaming insert), which would break "create
// user, then let them set a password minutes later" and "edit role".

function rowToUser(row: Record<string, unknown>): DashboardUser {
  return {
    userId: row.user_id as string,
    name: row.name as string,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    role: row.role as Role,
    assignedFirms: (row.assigned_firms as string[] | null) ?? [],
    isActive: row.is_active as boolean,
    resetTokenHash: (row.reset_token_hash as string | null) ?? null,
    resetTokenExpiresAt: row.reset_token_expires_at
      ? new Date(
          (row.reset_token_expires_at as { value: string }).value ??
            (row.reset_token_expires_at as string),
        ).toISOString()
      : null,
  };
}

export async function getUserByEmail(
  email: string,
): Promise<DashboardUser | null> {
  const [rows] = await bigquery.query({
    query: `SELECT * FROM ${TABLE} WHERE LOWER(email) = LOWER(@email) LIMIT 1`,
    params: { email },
  });
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function getUserById(
  userId: string,
): Promise<DashboardUser | null> {
  const [rows] = await bigquery.query({
    query: `SELECT * FROM ${TABLE} WHERE user_id = @userId LIMIT 1`,
    params: { userId },
  });
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function getUserByResetTokenHash(
  tokenHash: string,
): Promise<DashboardUser | null> {
  const [rows] = await bigquery.query({
    query: `
      SELECT * FROM ${TABLE}
      WHERE reset_token_hash = @tokenHash
        AND reset_token_expires_at > CURRENT_TIMESTAMP()
      LIMIT 1
    `,
    params: { tokenHash },
  });
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function listUsers(): Promise<DashboardUser[]> {
  const [rows] = await bigquery.query({
    query: `SELECT * FROM ${TABLE} ORDER BY created_at DESC`,
  });
  return rows.map(rowToUser);
}

// unusablePasswordHash: newly admin-created accounts get a bcrypt hash of
// a random value nobody knows, so the row satisfies password_hash NOT
// NULL but can never be logged into until the user completes the reset
// flow the admin's invite email sends them through.
export async function createUser(input: {
  name: string;
  email: string;
  unusablePasswordHash: string;
  role: Role;
  assignedFirms: string[];
}): Promise<string> {
  const existing = await getUserByEmail(input.email);
  if (existing) {
    throw new Error(`A user with email ${input.email} already exists`);
  }

  const userId = randomUUID();
  await bigquery.query({
    query: `
      INSERT INTO ${TABLE}
        (user_id, name, email, password_hash, role, assigned_firms,
         is_active, reset_token_hash, reset_token_expires_at,
         created_at, updated_at)
      VALUES
        (@userId, @name, @email, @passwordHash, @role, @assignedFirms,
         TRUE, NULL, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `,
    params: {
      userId,
      name: input.name,
      email: input.email,
      passwordHash: input.unusablePasswordHash,
      role: input.role,
      assignedFirms: input.assignedFirms,
    },
  });
  return userId;
}

export async function updateUserAccess(
  userId: string,
  updates: { role?: Role; assignedFirms?: string[]; isActive?: boolean },
): Promise<void> {
  const sets: string[] = ["updated_at = CURRENT_TIMESTAMP()"];
  const params: Record<string, unknown> = { userId };

  if (updates.role !== undefined) {
    sets.push("role = @role");
    params.role = updates.role;
  }
  if (updates.assignedFirms !== undefined) {
    sets.push("assigned_firms = @assignedFirms");
    params.assignedFirms = updates.assignedFirms;
  }
  if (updates.isActive !== undefined) {
    sets.push("is_active = @isActive");
    params.isActive = updates.isActive;
  }

  await bigquery.query({
    query: `UPDATE ${TABLE} SET ${sets.join(", ")} WHERE user_id = @userId`,
    params,
  });
}

export async function setResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await bigquery.query({
    query: `
      UPDATE ${TABLE}
      SET reset_token_hash = @tokenHash,
          reset_token_expires_at = @expiresAt,
          updated_at = CURRENT_TIMESTAMP()
      WHERE user_id = @userId
    `,
    params: { userId, tokenHash, expiresAt },
  });
}

export async function setPasswordAndClearResetToken(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await bigquery.query({
    query: `
      UPDATE ${TABLE}
      SET password_hash = @passwordHash,
          reset_token_hash = NULL,
          reset_token_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP()
      WHERE user_id = @userId
    `,
    params: { userId, passwordHash },
  });
}
