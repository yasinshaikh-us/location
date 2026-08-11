import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Stop } from "./simplify";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// lib/anthropic.ts caches its Anthropic client in a module-level `client`
// singleton that's only (re)validated against ANTHROPIC_API_KEY on first
// use. The "missing API key" test below must run before any test that
// successfully constructs the client, or the cached instance would mask
// the missing-env-var check — hence it's first in the file.
import { parseDateRangeFromQuestion, summarizeStops } from "./anthropic";

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("parseDateRangeFromQuestion / summarizeStops", () => {
  const realEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...realEnv };
    mockCreate.mockReset();
  });

  it("throws when ANTHROPIC_API_KEY is missing (must run before the client is ever constructed)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(parseDateRangeFromQuestion("where was I yesterday", "2026-07-30")).rejects.toThrow(
      "Missing ANTHROPIC_API_KEY env var"
    );
  });

  describe("once a client exists", () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = "test-key";
    });

    it("sends the question and anchors 'today' in the system prompt", async () => {
      mockCreate.mockResolvedValueOnce(
        textResponse('{"isLocationQuery": true, "start": "2026-07-28", "end": "2026-07-28"}')
      );

      await parseDateRangeFromQuestion("where was I yesterday", "2026-07-30");

      const call = mockCreate.mock.calls[0][0];
      expect(call.system).toContain("2026-07-30");
      expect(call.messages).toEqual([{ role: "user", content: "where was I yesterday" }]);
    });

    it("parses a well-formed location-query response", async () => {
      mockCreate.mockResolvedValueOnce(
        textResponse('{"isLocationQuery": true, "start": "2026-07-28", "end": "2026-07-28", "reasoning": "yesterday"}')
      );
      const result = await parseDateRangeFromQuestion("where was I yesterday", "2026-07-30");
      expect(result).toEqual({
        isLocationQuery: true,
        start: "2026-07-28",
        end: "2026-07-28",
        reasoning: "yesterday",
      });
    });

    it("strips markdown code fences before parsing", async () => {
      mockCreate.mockResolvedValueOnce(
        textResponse('```json\n{"isLocationQuery": false}\n```')
      );
      const result = await parseDateRangeFromQuestion("what's the capital of France", "2026-07-30");
      expect(result).toEqual({ isLocationQuery: false });
    });

    it("passes through an off-topic classification without requiring start/end", async () => {
      mockCreate.mockResolvedValueOnce(textResponse('{"isLocationQuery": false}'));
      const result = await parseDateRangeFromQuestion("write me a poem", "2026-07-30");
      expect(result.isLocationQuery).toBe(false);
    });

    it("throws when Claude claims isLocationQuery but omits start/end", async () => {
      mockCreate.mockResolvedValueOnce(textResponse('{"isLocationQuery": true}'));
      await expect(parseDateRangeFromQuestion("where was I", "2026-07-30")).rejects.toThrow(
        "missing start/end"
      );
    });

    it("throws when Claude returns no text block", async () => {
      mockCreate.mockResolvedValueOnce({ content: [{ type: "tool_use" }] });
      await expect(parseDateRangeFromQuestion("where was I", "2026-07-30")).rejects.toThrow(
        "did not return a text response"
      );
    });

    it("returns the canned message for zero stops without calling Claude", async () => {
      const summary = await summarizeStops("where was I", [], { start: "2026-01-01", end: "2026-01-01" });
      expect(summary).toBe("No location data was recorded for that period.");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("summarizes stops, rounding coordinates and defaulting a missing place name to null", async () => {
      mockCreate.mockResolvedValueOnce(textResponse("  You were at Capitol Hill in the morning.  "));
      const stops: Stop[] = [
        {
          lat: 47.612345678,
          lon: -122.312345678,
          arrival: "2026-01-01T08:00:00Z",
          departure: "2026-01-01T09:00:00Z",
          durationMinutes: 60,
          pingCount: 5,
          arrivalKnown: true,
          departureKnown: true,
        },
      ];
      const summary = await summarizeStops("where was I", stops, {
        start: "2026-01-01",
        end: "2026-01-01",
      });

      expect(summary).toBe("You were at Capitol Hill in the morning.");
      const call = mockCreate.mock.calls[0][0];
      expect(call.system).toContain("2026-01-01 through 2026-01-01");
      expect(call.system).toContain("Pacific Time");
      const userContent = call.messages[0].content as string;
      expect(userContent).toContain('"lat": 47.61235');
      expect(userContent).toContain('"place": null');
    });

    it("flags the shared place-cache 'place' field as untrusted input, not just the question", async () => {
      mockCreate.mockResolvedValueOnce(textResponse("You were downtown."));
      const stops: Stop[] = [
        {
          lat: 47.6,
          lon: -122.3,
          arrival: "2026-01-01T08:00:00Z",
          departure: "2026-01-01T09:00:00Z",
          durationMinutes: 60,
          pingCount: 5,
          arrivalKnown: true,
          departureKnown: true,
        },
      ];
      await summarizeStops("where was I", stops, { start: "2026-01-01", end: "2026-01-01" });

      const call = mockCreate.mock.calls[0][0];
      expect(call.system).toContain('"place"');
      expect(call.system.toLowerCase()).toContain("untrusted");
      expect(call.system.toLowerCase()).toContain("shared");
    });

    it("formats stop times in Pacific Time (not raw UTC) for a single-day range, matching the table/map", async () => {
      mockCreate.mockResolvedValueOnce(textResponse("You were there in the morning."));
      const stops: Stop[] = [
        {
          lat: 47.6,
          lon: -122.3,
          arrival: "2026-01-01T08:00:00Z", // midnight Pacific (PST, UTC-8, January)
          departure: "2026-01-01T09:00:00Z", // 1am Pacific
          durationMinutes: 60,
          pingCount: 5,
          arrivalKnown: true,
          departureKnown: true,
        },
      ];
      await summarizeStops("where was I", stops, { start: "2026-01-01", end: "2026-01-01" });

      const userContent = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(userContent).toContain('"arrival": "12:00 AM"');
      expect(userContent).toContain('"departure": "1:00 AM"');
      expect(userContent).not.toContain("2026-01-01T08:00:00Z");
    });

    it("formats stop times with the date included for a multi-day range", async () => {
      mockCreate.mockResolvedValueOnce(textResponse("You visited a few places."));
      const stops: Stop[] = [
        {
          lat: 47.6,
          lon: -122.3,
          arrival: "2026-01-01T08:00:00Z",
          departure: "2026-01-02T09:00:00Z",
          durationMinutes: 1500,
          pingCount: 5,
          arrivalKnown: true,
          departureKnown: true,
        },
      ];
      await summarizeStops("where was I this week", stops, { start: "2026-01-01", end: "2026-01-05" });

      const userContent = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(userContent).toContain('"arrival": "Jan 1, 12:00 AM"');
      expect(userContent).toContain('"departure": "Jan 2, 1:00 AM"');
    });

    it("falls back to a generic message when Claude returns no text block", async () => {
      mockCreate.mockResolvedValueOnce({ content: [] });
      const stops: Stop[] = [
        {
          lat: 47.6,
          lon: -122.3,
          arrival: "2026-01-01T08:00:00Z",
          departure: "2026-01-01T09:00:00Z",
          durationMinutes: 60,
          pingCount: 5,
          arrivalKnown: true,
          departureKnown: true,
        },
      ];
      const summary = await summarizeStops("where was I", stops, {
        start: "2026-01-01",
        end: "2026-01-01",
      });
      expect(summary).toBe("Unable to generate a summary.");
    });
  });
});
