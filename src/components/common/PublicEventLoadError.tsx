"use client";

import { ImageOff, Link2Off, RefreshCw } from "lucide-react";
import { useId } from "react";

interface PublicEventLoadErrorProps {
  kind?: "invitation" | "moments";
  message: string;
  standalone?: boolean;
  supportText?: string;
  title: string;
  onRetry?: () => void;
}

export function PublicEventLoadError({
  kind = "invitation",
  message,
  standalone = true,
  supportText = "Si el problema continúa, pide al organizador un enlace nuevo.",
  title,
  onRetry,
}: PublicEventLoadErrorProps) {
  const Icon = kind === "moments" ? ImageOff : Link2Off;
  const eyebrow =
    kind === "moments" ? "Muro de momentos" : "Invitación no disponible";
  const titleId = useId();
  const descriptionId = useId();
  const Root = standalone ? "main" : "div";

  return (
    <Root
      className={
        standalone
          ? "eventi-public-state flex min-h-[100svh] items-center justify-center px-4 py-10"
          : "relative flex min-h-80 items-center justify-center overflow-hidden px-2 py-6"
      }
    >
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-10 size-52 rotate-12 opacity-[0.035]"
      />

      <section
        role="alert"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="eventi-state-card relative w-full max-w-sm overflow-hidden px-6 py-8 text-center sm:px-8 sm:py-9"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#dd2284]/[0.55] to-transparent"
        />

        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[#dd2284]/10 bg-[#fff0f7]/80 px-3 py-1.5">
          <img src="/favicon.svg" alt="" className="size-4" />
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#b91468]">
            EventiApp
          </span>
        </div>

        <div
          aria-hidden="true"
          className="mx-auto mt-6 flex size-14 items-center justify-center rounded-2xl border border-[#dd2284]/[0.12] bg-gradient-to-br from-[#fff7fb] to-[#fff0f7] text-[#c91d76] shadow-[0_14px_35px_-24px_rgba(221,34,132,0.8)]"
        >
          <Icon className="size-6" strokeWidth={1.7} />
        </div>

        <p className="eventi-eyebrow mt-5">{eyebrow}</p>
        <h1
          id={titleId}
          className="mt-2 text-balance text-[1.4rem] font-semibold tracking-[-0.025em] text-[#102f3f]"
        >
          {title}
        </h1>
        <p
          id={descriptionId}
          className="mx-auto mt-3 max-w-xs text-pretty text-sm leading-6 text-[#607783]"
        >
          {message}
        </p>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#102f3f] to-[#17455b] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(16,47,63,0.85)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-18px_rgba(16,47,63,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dd2284]/25 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Reintentar
          </button>
        )}

        {supportText && (
          <p className="mx-auto mt-5 max-w-[17rem] text-xs leading-5 text-[#758893]">
            {supportText}
          </p>
        )}
      </section>
    </Root>
  );
}
