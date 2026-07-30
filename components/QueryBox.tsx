"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";

interface QueryBoxProps {
  onSubmit: (question: string) => void;
  isLoading: boolean;
}

const EXAMPLES = [
  "Where was I last Tuesday?",
  "What route did I take 7 months ago on the 12th?",
  "Show me where I was yesterday afternoon",
];

export default function QueryBox({ onSubmit, isLoading }: QueryBoxProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() && !isLoading) {
      onSubmit(value.trim());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask where you were, e.g. 'where was I last Tuesday?'"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-4 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Searching…" : "Ask"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => !isLoading && onSubmit(ex)}
            className="rounded-full border border-border bg-surface px-3 py-1 transition hover:border-accent hover:bg-accent/10 hover:text-accent"
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
