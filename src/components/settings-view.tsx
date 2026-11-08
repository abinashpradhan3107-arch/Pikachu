"use client";

import {
  AlertTriangle,
  Brain,
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Callout, PageHeader, SectionHeader } from "@/components/ui/page";
import { LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client";
import type { Profile } from "@/lib/types";
import { cn, formatDate, safeJsonParse } from "@/lib/utils";

type SettingsUser = {
  name: string;
  email: string;
  created_at: string;
};

type AiSettingsState = {
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  configured: boolean;
  source: string;
  hasUserKey: boolean;
  hasYoutubeKey: boolean;
  maskedKey: string;
};

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

const PROVIDER_PRESETS: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
};

const EXPLANATION_LEVELS = [
  { value: "beginner", label: "Beginner — start from intuition" },
  { value: "undergraduate", label: "Undergraduate — standard depth" },
  { value: "advanced", label: "Advanced — concise and rigorous" },
];

export function SettingsView({ user, profile }: { user: SettingsUser; profile: Profile }) {
  const toast = useToast();
  const router = useRouter();

  const [profileForm, setProfileForm] = useState({
    name: user.name,
    college: profile.college,
    program: profile.program ?? "",
    year: profile.year ? String(profile.year) : "",
    timezone: profile.timezone,
    studyHours: profile.study_hours,
    preferredStartHour: profile.preferred_start_hour,
    sessionLength: profile.session_length,
    breakMinutes: profile.break_minutes,
    learningStyle: profile.learning_style ?? "",
    explanationLevel: profile.explanation_level,
    goals: profile.goals ?? "",
  });
  const [weakSubjects, setWeakSubjects] = useState<string[]>(
    safeJsonParse<string[]>(profile.weak_subjects, []),
  );
  const [weakInput, setWeakInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [ai, setAi] = useState<AiSettingsState | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiForm, setAiForm] = useState({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.4,
    apiKey: "",
    youtubeApiKey: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testReply, setTestReply] = useState<string | null>(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadAi = useCallback(async () => {
    try {
      const result = await apiFetch<{ settings: AiSettingsState }>("/api/settings/ai");
      setAi(result.settings);
      setAiForm((current) => ({
        ...current,
        provider: result.settings.provider,
        baseUrl: result.settings.baseUrl,
        model: result.settings.model,
        temperature: result.settings.temperature,
        apiKey: "",
        youtubeApiKey: "",
      }));
    } catch (caught) {
      toast.error("Could not load AI settings", errorMessage(caught));
    } finally {
      setAiLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAi();
  }, [loadAi]);

  function addWeakSubject() {
    const value = weakInput.trim();
    if (!value) return;
    if (weakSubjects.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setWeakInput("");
      return;
    }
    if (weakSubjects.length >= 20) {
      toast.warning("Limit reached", "You can track up to 20 weak subjects.");
      return;
    }
    setWeakSubjects((current) => [...current, value]);
    setWeakInput("");
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: profileForm.name.trim(),
          college: profileForm.college.trim() || undefined,
          program: profileForm.program.trim() || null,
          year: profileForm.year ? Number(profileForm.year) : null,
          timezone: profileForm.timezone,
          study_hours: Number(profileForm.studyHours),
          preferred_start_hour: Number(profileForm.preferredStartHour),
          session_length: Number(profileForm.sessionLength),
          break_minutes: Number(profileForm.breakMinutes),
          learning_style: profileForm.learningStyle.trim() || null,
          explanation_level: profileForm.explanationLevel,
          goals: profileForm.goals.trim() || null,
          weak_subjects: weakSubjects,
        }),
      });
      toast.success("Profile updated", "Your plan and AI context will use the new settings.");
      router.refresh();
    } catch (caught) {
      toast.error("Could not save your profile", errorMessage(caught));
    } finally {
      setSavingProfile(false);
    }
  }

  function changeProvider(provider: string) {
    setAiForm((current) => {
      const preset = PROVIDER_PRESETS[provider];
      const shouldUsePreset =
        !current.baseUrl ||
        Object.values(PROVIDER_PRESETS).some((item) => item.baseUrl === current.baseUrl);
      return {
        ...current,
        provider,
        baseUrl: shouldUsePreset && preset ? preset.baseUrl : current.baseUrl,
        model: shouldUsePreset && preset ? preset.model : current.model,
      };
    });
  }

  async function saveAi(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAi(true);
    setTestReply(null);
    try {
      const payload: Record<string, unknown> = {
        provider: aiForm.provider.trim() || "openai",
        baseUrl: aiForm.baseUrl.trim(),
        model: aiForm.model.trim(),
        temperature: Number(aiForm.temperature),
      };
      if (aiForm.apiKey.trim()) payload.apiKey = aiForm.apiKey.trim();
      if (aiForm.youtubeApiKey.trim()) payload.youtubeApiKey = aiForm.youtubeApiKey.trim();
      const result = await apiFetch<{ settings: AiSettingsState }>("/api/settings/ai", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAi(result.settings);
      setAiForm((current) => ({ ...current, apiKey: "", youtubeApiKey: "" }));
      toast.success("AI settings saved", "Keys are encrypted at rest.");
    } catch (caught) {
      toast.error("Could not save AI settings", errorMessage(caught));
    } finally {
      setSavingAi(false);
    }
  }

  async function testAi() {
    setTestingAi(true);
    setTestReply(null);
    try {
      const result = await apiFetch<{ ok: boolean; reply: string; model: string }>("/api/ai/test", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setTestReply(`${result.model}: ${result.reply}`);
      toast.success("AI connection works");
    } catch (caught) {
      toast.error("AI test failed", errorMessage(caught));
    } finally {
      setTestingAi(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.warning("Passwords do not match", "Re-enter the new password.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiFetch("/api/account/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      toast.success("Password changed");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (caught) {
      toast.error("Could not change your password", errorMessage(caught));
    } finally {
      setChangingPassword(false);
    }
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch("/api/account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      toast.success("Account deleted");
      router.push("/login");
      router.refresh();
    } catch (caught) {
      setDeleteError(errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  const sourceLabel =
    ai?.source === "user"
      ? "Your saved key"
      : ai?.source === "environment"
        ? "Server environment key"
        : "Not configured";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Control your profile, what the AI remembers, the model connection, and your account security."
        actions={
          <Link href="/dashboard" className="btn btn-secondary">
            Back to dashboard
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <section className="surface p-4">
            <SectionHeader
              title="Profile"
              description="These values shape planning, tone, and the academic context sent to the model."
              action={
                <span className="flex items-center gap-1.5 text-[0.66rem] text-[#6d747d]">
                  <User className="size-3.5" /> {user.email}
                </span>
              }
            />
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="settings-name">Name</label>
                  <input
                    id="settings-name"
                    className="input"
                    required
                    minLength={2}
                    value={profileForm.name}
                    onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="settings-college">College</label>
                  <input
                    id="settings-college"
                    className="input"
                    value={profileForm.college}
                    onChange={(event) => setProfileForm({ ...profileForm, college: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="settings-program">Program</label>
                  <input
                    id="settings-program"
                    className="input"
                    placeholder="e.g. B.Tech Computer Science"
                    value={profileForm.program}
                    onChange={(event) => setProfileForm({ ...profileForm, program: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="settings-year">Year</label>
                  <select
                    id="settings-year"
                    className="input"
                    value={profileForm.year}
                    onChange={(event) => setProfileForm({ ...profileForm, year: event.target.value })}
                  >
                    <option value="">Not set</option>
                    {[1, 2, 3, 4, 5, 6].map((year) => (
                      <option key={year} value={year}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="settings-timezone">Timezone</label>
                  <select
                    id="settings-timezone"
                    className="input"
                    value={profileForm.timezone}
                    onChange={(event) => setProfileForm({ ...profileForm, timezone: event.target.value })}
                  >
                    {!TIMEZONES.includes(profileForm.timezone) ? (
                      <option value={profileForm.timezone}>{profileForm.timezone}</option>
                    ) : null}
                    {TIMEZONES.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="settings-study-hours">Daily study target (hours)</label>
                  <input
                    id="settings-study-hours"
                    type="number"
                    min={0.5}
                    max={16}
                    step={0.5}
                    className="input"
                    value={profileForm.studyHours}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, studyHours: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="settings-start-hour">Preferred start hour</label>
                  <select
                    id="settings-start-hour"
                    className="input"
                    value={profileForm.preferredStartHour}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, preferredStartHour: Number(event.target.value) })
                    }
                  >
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="settings-session">Session length (minutes)</label>
                  <input
                    id="settings-session"
                    type="number"
                    min={15}
                    max={120}
                    step={5}
                    className="input"
                    value={profileForm.sessionLength}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, sessionLength: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="settings-break">Break between sessions (minutes)</label>
                  <input
                    id="settings-break"
                    type="number"
                    min={0}
                    max={60}
                    step={5}
                    className="input"
                    value={profileForm.breakMinutes}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, breakMinutes: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="settings-explanation">Explanation level</label>
                  <select
                    id="settings-explanation"
                    className="input"
                    value={profileForm.explanationLevel}
                    onChange={(event) =>
                      setProfileForm({ ...profileForm, explanationLevel: event.target.value })
                    }
                  >
                    {EXPLANATION_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="settings-learning-style">Learning style or preferences</label>
                <input
                  id="settings-learning-style"
                  className="input"
                  placeholder="e.g. worked examples first, then practice problems"
                  value={profileForm.learningStyle}
                  onChange={(event) =>
                    setProfileForm({ ...profileForm, learningStyle: event.target.value })
                  }
                />
              </div>

              <div>
                <label className="label" htmlFor="settings-goals">Goals</label>
                <textarea
                  id="settings-goals"
                  className="input"
                  rows={3}
                  placeholder="What are you working toward this semester?"
                  value={profileForm.goals}
                  onChange={(event) => setProfileForm({ ...profileForm, goals: event.target.value })}
                />
              </div>

              <div>
                <label className="label" htmlFor="settings-weak">Weak subjects</label>
                <div className="flex gap-2">
                  <input
                    id="settings-weak"
                    className="input"
                    placeholder="e.g. Signals and Systems"
                    value={weakInput}
                    onChange={(event) => setWeakInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addWeakSubject();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-secondary shrink-0" onClick={addWeakSubject}>
                    Add
                  </button>
                </div>
                {weakSubjects.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {weakSubjects.map((subject) => (
                      <span key={subject} className="badge badge-red gap-1 px-2 py-1 text-[0.64rem]">
                        {subject}
                        <button
                          type="button"
                          className="text-[#ffb4b4]/70 hover:text-[#ffb4b4]"
                          onClick={() => setWeakSubjects((current) => current.filter((item) => item !== subject))}
                          aria-label={`Remove ${subject}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[0.66rem] text-[#6d747d]">
                    Add subjects you find difficult. Cortex uses them to prioritise revision, never to invent exam content.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                  {savingProfile ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {savingProfile ? "Saving…" : "Save profile"}
                </button>
                <span className="text-[0.66rem] text-[#6d747d]">
                  Joined {formatDate(user.created_at)}
                </span>
              </div>
            </form>
          </section>

          <section className="surface p-4">
            <SectionHeader
              title="What Cortex remembers"
              description="Memory is explicit. There is no hidden long-term model memory."
              action={<Brain className="size-4 text-[#c4a7ff]" />}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Profile", "College, program, year, timezone, explanation level"],
                ["Goals & weak subjects", "Your stated goals and difficult subjects"],
                ["Syllabus", "Courses, chapters, status, difficulty, confidence"],
                ["Deadlines", "Exams and assignments you recorded or imported"],
                ["Plan", "Generated tasks, completions, and reschedules"],
                ["Library", "Notes, quizzes, and imported material"],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <p className="text-[0.74rem] font-medium text-[#f2f2ef]">{title}</p>
                  <p className="mt-0.5 text-[0.66rem] leading-relaxed text-[#6d747d]">{detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[0.68rem] leading-relaxed text-[#6d747d]">
              Context is assembled per request from your own database records. It is not used to train a third-party model.
              Chat history is stored only so you can reopen a thread.
            </p>
          </section>

          <section className="surface p-4">
            <SectionHeader title="Password" description="Use at least 8 characters." />
            <form onSubmit={changePassword} className="space-y-3">
              <div>
                <label className="label" htmlFor="settings-current-password">Current password</label>
                <input
                  id="settings-current-password"
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  required
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="settings-new-password">New password</label>
                  <input
                    id="settings-new-password"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    required
                    minLength={8}
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm({ ...passwordForm, newPassword: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="settings-confirm-password">Confirm new password</label>
                  <input
                    id="settings-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    required
                    minLength={8}
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
                    }
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-secondary" disabled={changingPassword}>
                {changingPassword ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                {changingPassword ? "Changing…" : "Change password"}
              </button>
            </form>
          </section>
        </div>

        <div className="space-y-4">
          <section className="surface p-4">
            <SectionHeader
              title="AI provider"
              description="Any OpenAI-compatible chat completions endpoint works."
              action={
                <span className={cn("badge px-1.5 py-0.5 text-[0.56rem]", ai?.configured ? "badge-green" : "badge-red")}>
                  {ai?.configured ? "connected" : "not configured"}
                </span>
              }
            />
            {aiLoading ? (
              <LoadingBlock lines={5} />
            ) : (
              <form onSubmit={saveAi} className="space-y-3">
                <div>
                  <label className="label" htmlFor="ai-provider">Provider preset</label>
                  <select
                    id="ai-provider"
                    className="input"
                    value={aiForm.provider}
                    onChange={(event) => changeProvider(event.target.value)}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="groq">Groq</option>
                    <option value="ollama">Ollama (local)</option>
                    <option value="custom">Custom / other</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ai-base-url">Base URL</label>
                  <input
                    id="ai-base-url"
                    type="url"
                    className="input"
                    required
                    placeholder="https://api.openai.com/v1"
                    value={aiForm.baseUrl}
                    onChange={(event) => setAiForm({ ...aiForm, baseUrl: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ai-model">Model</label>
                  <input
                    id="ai-model"
                    className="input"
                    required
                    placeholder="gpt-4o-mini"
                    value={aiForm.model}
                    onChange={(event) => setAiForm({ ...aiForm, model: event.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ai-temperature">Temperature ({aiForm.temperature.toFixed(1)})</label>
                  <input
                    id="ai-temperature"
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.1}
                    className="w-full accent-[#e7b44b]"
                    value={aiForm.temperature}
                    onChange={(event) => setAiForm({ ...aiForm, temperature: Number(event.target.value) })}
                  />
                  <div className="flex justify-between text-[0.6rem] text-[#555c66]">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="ai-api-key">
                    API key {ai?.hasUserKey ? `(saved: ${ai.maskedKey})` : "(required)"}
                  </label>
                  <div className="relative">
                    <input
                      id="ai-api-key"
                      type={showApiKey ? "text" : "password"}
                      className="input pr-10"
                      autoComplete="off"
                      placeholder={ai?.hasUserKey ? "Leave blank to keep the saved key" : "sk-…"}
                      value={aiForm.apiKey}
                      onChange={(event) => setAiForm({ ...aiForm, apiKey: event.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon absolute right-1 top-1/2 -translate-y-1/2 p-1.5"
                      onClick={() => setShowApiKey((value) => !value)}
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[0.64rem] text-[#6d747d]">
                    Encrypted with AES-256-GCM. The browser only ever receives a masked value.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="ai-youtube-key">
                    YouTube Data API v3 key {ai?.hasYoutubeKey ? "(saved)" : "(optional)"}
                  </label>
                  <div className="relative">
                    <input
                      id="ai-youtube-key"
                      type={showYoutubeKey ? "text" : "password"}
                      className="input pr-10"
                      autoComplete="off"
                      placeholder={ai?.hasYoutubeKey ? "Leave blank to keep the saved key" : "For verified video recommendations"}
                      value={aiForm.youtubeApiKey}
                      onChange={(event) => setAiForm({ ...aiForm, youtubeApiKey: event.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon absolute right-1 top-1/2 -translate-y-1/2 p-1.5"
                      onClick={() => setShowYoutubeKey((value) => !value)}
                      aria-label={showYoutubeKey ? "Hide YouTube key" : "Show YouTube key"}
                    >
                      {showYoutubeKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[0.68rem] text-[#6d747d]">
                  <p>
                    <span className="font-medium text-[#9aa1aa]">Source:</span> {sourceLabel}
                  </p>
                  <p className="mt-0.5">
                    <span className="font-medium text-[#9aa1aa]">Active model:</span> {ai?.model ?? "—"}
                  </p>
                </div>

                {testReply ? (
                  <p className="rounded-lg border border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.06] px-3 py-2 text-[0.72rem] leading-relaxed text-[#b8f3d8]">
                    <Check className="mr-1 inline size-3.5" />
                    {testReply}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" className="btn btn-primary" disabled={savingAi}>
                    {savingAi ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                    {savingAi ? "Saving…" : "Save AI settings"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void testAi()}
                    disabled={testingAi || !ai?.configured}
                  >
                    {testingAi ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {testingAi ? "Testing…" : "Test connection"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="surface p-4">
            <SectionHeader title="Integrations & data" description="Everything is under your control." />
            <div className="space-y-2">
              <Link href="/lms" className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-white/[0.16]">
                <span>
                  <span className="block text-[0.78rem] font-medium text-[#f2f2ef]">Moodle LMS</span>
                  <span className="mt-0.5 block text-[0.66rem] text-[#6d747d]">Token connection, sync, manual imports</span>
                </span>
                <span className="text-[0.68rem] font-medium text-[#f3c96b]">Manage →</span>
              </Link>
              <a
                href="/api/export"
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-white/[0.16]"
              >
                <span>
                  <span className="block text-[0.78rem] font-medium text-[#f2f2ef]">Export your data</span>
                  <span className="mt-0.5 block text-[0.66rem] text-[#6d747d]">JSON download of courses, tasks, notes, and more</span>
                </span>
                <Download className="size-4 text-[#9aa1aa]" />
              </a>
            </div>
            <Callout tone="info" icon={ShieldCheck} title="Security model" className="mt-3">
              Sessions are HTTP-only cookies, passwords use scrypt, and API/LMS keys are encrypted at rest. Cortex never asks
              for your LMS password and does not bypass institutional login.
            </Callout>
          </section>

          <section className="surface border-[#f08a8a]/20 p-4">
            <SectionHeader
              title="Danger zone"
              description="Deleting your account removes your data permanently."
              action={<AlertTriangle className="size-4 text-[#f08a8a]" />}
            />
            <p className="text-[0.74rem] leading-relaxed text-[#9aa1aa]">
              This deletes your profile, courses, chapters, exams, assignments, plans, chats, notes, quizzes, videos, imports,
              and the saved LMS token. Export your data first if you want a copy.
            </p>
            <button
              type="button"
              className="btn btn-danger mt-3"
              onClick={() => {
                setDeleteOpen(true);
                setDeletePassword("");
                setDeleteError(null);
              }}
            >
              <Trash2 className="size-4" /> Delete account
            </button>
          </section>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        description="This cannot be undone. Enter your password to confirm."
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </button>
            <button type="submit" form="delete-account-form" className="btn btn-danger" disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </>
        }
      >
        <form id="delete-account-form" onSubmit={deleteAccount} className="space-y-3">
          <div>
            <label className="label" htmlFor="delete-password">Password</label>
            <input
              id="delete-password"
              type="password"
              className="input"
              autoComplete="current-password"
              required
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
          </div>
          {deleteError ? (
            <p className="rounded-lg border border-[#f08a8a]/20 bg-[#f08a8a]/[0.06] px-3 py-2 text-[0.72rem] text-[#ffb4b4]">
              {deleteError}
            </p>
          ) : null}
          <p className="text-[0.7rem] leading-relaxed text-[#6d747d]">
            Prefer to keep your data? Use{" "}
            <a href="/api/export" className="font-medium text-[#f3c96b] hover:underline">
              Export
            </a>{" "}
            first.
          </p>
        </form>
      </Modal>

      <div className="flex items-center justify-center gap-1.5 pb-2 text-[0.66rem] text-[#555c66]">
        <RefreshCw className="size-3" />
        Changes to profile settings apply to the next generated plan and AI request.
      </div>
    </div>
  );
}
