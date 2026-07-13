"use client";

import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { cn } from "../../lib/utils";

interface PublicEventPasswordGateProps {
  title?: string;
  description?: string;
  className?: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  submitLabel?: string;
  standalone?: boolean;
  onVerify: (password: string) => Promise<{ ok: boolean; message?: string }>;
}

export default function PublicEventPasswordGate({
  title = "Esta página es privada",
  description = "Ingresa la contraseña para continuar.",
  className = "",
  passwordLabel = "Contraseña del evento",
  passwordPlaceholder = "Escribe la contraseña",
  submitLabel = "Abrir invitación",
  standalone = true,
  onVerify,
}: PublicEventPasswordGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const inputId = useId();
  const RootElement = standalone ? "main" : "section";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = password.trim();
    if (!value || submittingRef.current) return;

    submittingRef.current = true;
    setError("");
    setLoading(true);
    let shouldRestoreFocus = false;

    try {
      const result = await onVerify(value);
      if (!result.ok) {
        setError(result.message || "No pudimos verificar la contraseña.");
        shouldRestoreFocus = true;
      }
    } catch {
      setError("No pudimos verificar la contraseña. Intenta de nuevo.");
      shouldRestoreFocus = true;
    } finally {
      submittingRef.current = false;
      setLoading(false);
      if (shouldRestoreFocus) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  };

  return (
    <RootElement
      className={cn(
        standalone
          ? "eventi-public-state flex min-h-[100svh] items-center justify-center px-4 py-10"
          : "relative flex min-h-[360px] items-center justify-center overflow-hidden px-4 py-8",
        className,
      )}
    >
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -left-14 -top-12 size-56 -rotate-12 opacity-[0.035]"
      />

      <form
        aria-busy={loading}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={submit}
        className="eventi-state-card relative w-full max-w-sm overflow-hidden px-6 py-8 text-center sm:px-8 sm:py-9"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#dd2284]/[0.55] to-transparent"
        />

        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[#dd2284]/10 bg-[#fff0f7]/80 px-3 py-1.5">
          <img src="/favicon.svg" alt="" className="size-4" />
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#b91468]">
            Acceso EventiApp
          </span>
        </div>

        <div
          aria-hidden="true"
          className="mx-auto mt-6 flex size-14 items-center justify-center rounded-2xl border border-[#dd2284]/[0.12] bg-gradient-to-br from-[#fff7fb] to-[#fff0f7] text-[#c91d76] shadow-[0_14px_35px_-24px_rgba(221,34,132,0.8)]"
        >
          <LockKeyhole className="size-6" strokeWidth={1.7} />
        </div>

        <div className="mt-5 space-y-2">
          <p className="eventi-eyebrow">Invitación protegida</p>
          <h1
            id={titleId}
            className="text-balance text-[1.4rem] font-semibold tracking-[-0.025em] text-[#102f3f]"
          >
            {title}
          </h1>
          <p
            id={descriptionId}
            className="mx-auto max-w-xs text-pretty text-sm leading-6 text-[#607783]"
          >
            {description}
          </p>
        </div>

        <div className="mt-7 space-y-2 text-left">
          <label
            htmlFor={inputId}
            className="ml-1 text-xs font-semibold text-[#3c5968]"
          >
            {passwordLabel}
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id={inputId}
              name="event-password"
              type={passwordVisible ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError("");
              }}
              placeholder={passwordPlaceholder}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={Boolean(error)}
              aria-errormessage={error ? errorId : undefined}
              className="min-h-12 w-full rounded-2xl border border-[#102f3f]/[0.15] bg-white/90 py-3 pl-4 pr-12 text-[#102f3f] outline-none transition placeholder:text-[#8799a2] hover:border-[#102f3f]/25 focus:border-[#dd2284]/[0.45] focus:ring-4 focus:ring-[#dd2284]/10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
              className="absolute inset-y-0 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[#758893] transition hover:bg-[#fff0f7] hover:text-[#b91468] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dd2284]/[0.35] motion-reduce:transition-none"
              aria-label={
                passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              aria-pressed={passwordVisible}
            >
              {passwordVisible ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          <div className="min-h-5 px-1">
            {error && (
              <p
                id={errorId}
                role="alert"
                className="text-sm leading-5 text-red-600"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#102f3f] to-[#17455b] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(16,47,63,0.85)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-18px_rgba(16,47,63,0.8)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dd2284]/20 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none motion-reduce:transform-none motion-reduce:transition-none"
        >
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <ShieldCheck aria-hidden="true" className="size-4" />
          )}
          {loading ? "Verificando…" : submitLabel}
        </button>

        <p className="mt-4 text-[0.7rem] leading-5 text-[#8799a2]">
          El acceso se valida de forma segura para proteger los detalles del evento.
        </p>
      </form>
    </RootElement>
  );
}
