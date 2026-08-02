"use client";

import { useEffect, useState, type FormEvent } from "react";
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

function randomExample(): string {
  return EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
}

export default function QueryBox({ onSubmit, isLoading }: QueryBoxProps) {
  const [value, setValue] = useState("");
  // A single example, shown as placeholder text rather than as separate
  // suggestion chips. This page is statically prerendered, so picking the
  // random example directly in useState's initializer would bake one
  // fixed choice into the build's static HTML forever; rolling it in an
  // effect instead defers the pick to each real page load in the
  // browser. Re-rolled again on each submit so the hint doesn't go stale
  // for the next question.
  const [example, setExample] = useState(EXAMPLES[0]);
  useEffect(() => {
    // Intentional: this deliberately re-renders once on mount to replace
    // the static first example with a randomly-picked one (see comment
    // above) — not the "derive state from props" antipattern this rule
    // otherwise guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExample(randomExample());
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() && !isLoading) {
      onSubmit(value.trim());
      setValue("");
      setExample(randomExample());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Ask where you were, e.g. "${example}"`}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-4 text-sm text-text outline-hidden transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10"
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
    </form>
  );
}
