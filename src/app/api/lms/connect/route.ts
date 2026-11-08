import { queryOne, run } from "@/lib/db";
import { requireApiUser, handleRoute, json, readJson, ApiError, rateLimit } from "@/lib/api";
import { lmsConnectSchema } from "@/lib/validation";
import { encryptSecret } from "@/lib/crypto";
import { detectLMSPlatform, testMoodleConnection, syncMoodle } from "@/lib/lms/moodle";
import { nowIso } from "@/lib/utils";
import type { LmsConnection } from "@/lib/types";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const { user } = await requireApiUser(request);
    rateLimit(`lms-connect:${user.id}`, 6, 60_000);
    const body = lmsConnectSchema.parse(await readJson(request));
    const platform = await detectLMSPlatform(body.siteUrl);
    const hasToken = Boolean(body.token);

    // ── Platform‑specific flow ────────────────────────────────────────
    if (platform === "moodle") {
      // Existing Moodle token flow — require a token
      if (!hasToken) {
        throw new ApiError(400, "Moodle token is required. Please paste your Web Services token.");
      }
      // Existing Moodle token flow
      let info;
      try {
        info = await testMoodleConnection(body.siteUrl, body.token as string);
      } catch (error) {
        throw new ApiError(
          400,
          error instanceof Error
            ? error.message
            : "Could not connect to that Moodle site. Check the URL and token.",
        );
      }
      const now = nowIso();
      const existing = queryOne<LmsConnection>(
        "SELECT * FROM lms_connections WHERE user_id = ? AND provider = 'moodle'",
        [user.id],
      );
      if (existing) {
        run(
          `UPDATE lms_connections SET site_url = ?, token_enc = ?, status = 'connected',
           last_error = NULL, site_name = ?, lms_username = ?, updated_at = ?
          WHERE id = ?`,
          [
            body.siteUrl.replace(/\/+$/, ""),
            encryptSecret(body.token as string),
            info.sitename ?? null,
            info.username ?? null,
            now,
            existing.id,
          ],
        );
      } else {
        run(
          `INSERT INTO lms_connections
           (id, user_id, provider, site_url, token_enc, status, site_name, lms_username, created_at, updated_at)
           VALUES (?, ?, 'moodle', ?, ?, 'connected', ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            user.id,
            body.siteUrl.replace(/\/+$/, ""),
            encryptSecret(body.token as string),
            info.sitename ?? null,
            info.username ?? null,
            now,
            now,
          ],
        );
      }

      let syncResult = null;
      let syncError: string | null = null;
      try {
        syncResult = await syncMoodle(user.id);
      } catch (error) {
        syncError =
          error instanceof Error ? error.message : "Initial sync failed.";
        run(
          "UPDATE lms_connections SET last_error = ?, updated_at = ? WHERE user_id = ? AND provider = 'moodle'",
          [syncError, nowIso(), user.id],
        );
      }

      if (!info.functions?.some((fn) => fn.name === "core_course_get_contents")) {
        syncError =
          syncError ??
          "This token can connect, but it does not include course-content permissions. Ask your LMS administrator to enable the required web service functions.";
      }

      return json({
        ok: true,
        siteName: info.sitename ?? "Moodle",
        username: info.username ?? null,
        platform,
        sync: syncResult,
        syncError,
      });
    }

    if (platform === "custom") {
      // Custom/Learn‑management system: ask for browser‑based login
      return json({
        ok: true,
        platform,
        authRequired: true,
        message:
          "This LMS requires browser‑based login. Click Connect in the app to open the login page.",
      });
    }

    // Unknown platform – fall back to manual import only
    return json({
      ok: true,
      platform,
      authRequired: false,
      message:
        "Could not auto‑detect the LMS. You can still import course materials manually via text or PDF.",
    });
  });
}