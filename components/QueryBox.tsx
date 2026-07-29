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
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask where you were, e.g. 'where was I last Tuesday?'"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Searching…" : "Ask"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => !isLoading && onSubmit(ex)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
