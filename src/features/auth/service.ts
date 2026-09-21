import { sql } from "drizzle-orm";
import type { AppDb, Role } from "../../lib/db/types";
import { verifyPassword } from "./password";
import type { AuthUser } from "./authorize";

type UserForLogin = AuthUser & { passwordHash: string; isActive: number };

// Valid PBKDF2 output for a non-secret dummy value. It prevents a faster path for an unknown email.
const DUMMY_PASSWORD_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$901FVwaCBOwSM6oEPEvRXH3IodmWmeUln7asez94vlE";

export async function authenticatePassword(db: AppDb, email: string, password: string): Promise<AuthUser | undefined> {
  const user = await db.get<UserForLogin>(sql`
    SELECT id, email, display_name AS displayName, role, password_hash AS passwordHash, is_active AS isActive
    FROM users WHERE email = ${email} LIMIT 1
  `);
  const passwordValid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || user.isActive !== 1 || !passwordValid) return undefined;

  const now = new Date().toISOString();
  await db.run(sql`UPDATE users SET last_login_at = ${now}, updated_at = ${now} WHERE id = ${user.id}`);
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

export async function recordAudit(
  db: AppDb,
  actorUserId: string | null,
  action: "login" | "logout" | "password" | "user" | "role",
  entityType: string,
  entityId: string,
  context?: Record<string, string>,
): Promise<void> {
  await db.run(sql`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at)
    VALUES (${crypto.randomUUID()}, ${actorUserId}, ${action}, ${entityType}, ${entityId}, ${context ? JSON.stringify(context) : null}, ${new Date().toISOString()})
  `);
}

export type { Role };
