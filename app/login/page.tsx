"use client";

import { useState, useRef, type KeyboardEvent, type ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const PIN_LENGTH = 6;

export default function LoginPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function updateDigit(index: number, value: string) {
    const clean = value.replace(/[^0-9]/g, "").slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    setError(null);

    if (clean && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (clean && index === PIN_LENGTH - 1 && next.every((d) => d !== "")) {
      submit(next.join(""));
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (!pasted) return;
    e.preventDefault();
    const next = Array(PIN_LENGTH).fill("");
    for (let i = 0; i < Math.min(pasted.length, PIN_LENGTH); i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    if (pasted.length >= PIN_LENGTH) {
      submit(next.join(""));
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  }

  async function submit(pin: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Incorrect PIN");
        setDigits(Array(PIN_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-6 text-text">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 ring-1 ring-accent/40">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent"
          >
            <path d="M12 21s-7-5.686-7-11a7 7 0 1 1 14 0c0 5.314-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          Location Timeline
        </h1>
        <p className="text-sm text-faint">Enter your PIN to continue</p>
      </div>

      <div className="flex gap-2 sm:gap-3">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={isSubmitting}
            onChange={(e) => updateDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={`h-14 w-11 rounded-xl border bg-surface-recessed text-center font-mono text-2xl font-semibold text-text outline-none transition sm:h-16 sm:w-14 ${
              error
                ? "border-danger focus:border-danger"
                : "border-border focus:border-accent"
            } disabled:opacity-50`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <p className="max-w-xs text-center text-xs text-faint">
        This gates access to personal location history. Enter the 6-digit PIN
        set for this app.
      </p>
    </main>
  );
}
