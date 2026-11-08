import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { queryOne, run } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { nowIso } from "@/lib/utils";
import type { Profile, PublicUser, User } from "@/lib/types";

export const SESSION_COOKIE = "cortex_session";
const SESSION_DAYS = 30;

export type AuthContext = {
  user: PublicUser;
  profile: Profile;
};

function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export async function createSession(userId: string) {
  const rawToken = randomToken(32);
  const sessionId = sha256(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  const headerStore = await headers();

  run(
    `INSERT INTO sessions (id, user_id, expires_at, created_at, last_used_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      userId,
      expires.toISOString(),
      now.toISOString(),
      now.toISOString(),
      headerStore.get("user-agent")?.slice(0, 300) ?? null,
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    run("DELETE FROM sessions WHERE id = ?", [sha256(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessionId = sha256(token);
  const user = queryOne<User>(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
    [sessionId, nowIso()],
  );
  if (!user) return null;

  let profile = queryOne<Profile>("SELECT * FROM profiles WHERE user_id = ?", [
    user.id,
  ]);
  if (!profile) {
    const now = nowIso();
    run(
      `INSERT INTO profiles (user_id, college, timezone, created_at, updated_at)
       VALUES (?, 'IIT Jodhpur', 'Asia/Kolkata', ?, ?)`,
      [user.id, now, now],
    );
    profile = queryOne<Profile>("SELECT * FROM profiles WHERE user_id = ?", [
      user.id,
    ]);
  }

  run("UPDATE sessions SET last_used_at = ? WHERE id = ?", [nowIso(), sessionId]);

  return {
    user: publicUser(user),
    profile: profile as Profile,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return context;
}

export async function requireOnboarded(): Promise<AuthContext> {
  const context = await requireAuth();
  if (!context.profile.onboarding_completed) redirect("/onboarding");
  return context;
}

export function isOnboarded(profile: Profile): boolean {
  return Boolean(profile.onboarding_completed);
}
