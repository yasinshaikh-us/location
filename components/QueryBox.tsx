"use client";

import { useState, type FormEvent } from "react";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask where you were, e.g. 'where was I last Tuesday?'"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLoading ? "Searching…" : "Ask"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => !isLoading && onSubmit(ex)}
            className="rounded-full border border-gray-200 px-3 py-1 hover:bg-gray-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
