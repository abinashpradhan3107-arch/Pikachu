"use client";

import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client";

type AuthResponse = {
  user: { id: string; name: string; email: string };
  redirect: string;
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await apiFetch<AuthResponse>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });
      router.push(data.redirect || (isRegister ? "/onboarding" : "/dashboard"));
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isRegister ? (
        <div>
          <label className="label" htmlFor="name">
            Full name
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6d747d]" />
            <input
              id="name"
              className="input pl-9"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
              minLength={2}
              required
            />
          </div>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6d747d]" />
          <input
            id="email"
            type="email"
            className="input pl-9"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@iitj.ac.in"
            autoComplete="email"
            required
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6d747d]" />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            className="input px-9"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isRegister ? "At least 8 characters" : "Your password"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : 1}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#6d747d] transition-colors hover:text-[#f2f2ef]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {isRegister ? (
          <p className="mt-1.5 text-[0.68rem] leading-relaxed text-[#6d747d]">
            Passwords are hashed with scrypt. Sessions are HTTP-only and expire after 30 days.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3 py-2.5 text-[0.78rem] text-[#ffb4b4]">
          {error}
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy
          ? isRegister
            ? "Creating account…"
            : "Signing in…"
          : isRegister
            ? "Create account"
            : "Sign in"}
        {!busy ? <ArrowRight className="size-4" /> : null}
      </button>

      <p className="pt-1 text-center text-[0.78rem] text-[#9aa1aa]">
        {isRegister ? "Already have an account?" : "New to Cortex?"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-[#f3c96b] hover:underline"
        >
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
