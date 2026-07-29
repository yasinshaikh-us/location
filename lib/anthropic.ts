import Anthropic from "@anthropic-ai/sdk";
import type { Stop } from "./simplify";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
    client = new Anthropic({ apiKey });
  }
  return client;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export interface ParsedDateRange {
  start: string; // ISO date (YYYY-MM-DD)
  end: string; // ISO date (YYYY-MM-DD), inclusive
  reasoning: string;
}

/**
 * Turns a natural-language question like "where was I 7 months ago on
 * the 12th" into a concrete start/end date range, anchored to the
 * server's current date (passed in explicitly rather than relying on
 * the model's own notion of "today").
 */
export async function parseDateRangeFromQuestion(
  question: string,
  todayIso: string
): Promise<ParsedDateRange> {
  const anthropic = getClient();

  const system = `You convert a natural-language question about someone's past location into a concrete date range.
Today's date is ${todayIso}. Interpret relative phrases ("7 months ago", "last Tuesday", "in March") relative to today.
Respond with ONLY a JSON object, no markdown fences, no preamble:
{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "reasoning": "one short sentence"}
"start" and "end" are inclusive. If the question implies a single day, start and end are the same date.
If the question is ambiguous, pick the most natural single-day or single-week interpretation.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: question }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text response for date parsing");
  }

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as ParsedDateRange;

  if (!parsed.start || !parsed.end) {
    throw new Error("Claude's date parse response was missing start/end");
  }

  return parsed;
}

/**
 * Given the simplified stops for a range, ask Claude for a short
 * natural-language narrative summary of the day/period.
 */
export async function summarizeStops(
  question: string,
  stops: Stop[],
  dateRange: { start: string; end: string }
): Promise<string> {
  const anthropic = getClient();

  if (stops.length === 0) {
    return "No location data was recorded for that period.";
  }

  const compact = stops.map((s) => ({
    arrival: s.arrival,
    departure: s.departure,
    duration_minutes: s.durationMinutes,
    lat: Number(s.lat.toFixed(5)),
    lon: Number(s.lon.toFixed(5)),
    place: s.placeName ?? null,
  }));

  const system = `You are summarizing someone's own location history back to them, based on GPS stop data.
The question's date range has already been resolved to ${dateRange.start} through ${dateRange.end} (inclusive) — trust this resolution completely. Do not reinterpret, question, or comment on it (e.g. never remark on whether a date is "this year" vs. "last year" or otherwise second-guess the range); just describe what the data shows for that period.
Be concise (3-6 sentences), speak in second person ("you were..."), and mention approximate times and general areas when available.
Do not invent details not present in the data. Refer to places by neighborhood or general area (e.g. "the Capitol Hill area") rather than exact street addresses — approximate is fine, readability matters more than precision here. If no place name is available, describe by neighborhood/coordinates generally.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    messages: [
      {
        role: "user",
        content: `Question: "${question}"\n\nStops data (chronological):\n${JSON.stringify(
          compact,
          null,
          2
        )}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text"
    ? textBlock.text.trim()
    : "Unable to generate a summary.";
}
