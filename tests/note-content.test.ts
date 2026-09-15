import { describe, expect, it } from "vitest";
import {
  normalizeNoteContent,
  notePlainText,
  plainNoteDocument,
} from "@/domain/note-content";
import { weekDates, shiftDay } from "@/features/organizer/calendar-dates";
describe("rich note content", () => {
  it("preserves plain notes, rich marks, links and task checkboxes", () => {
    expect(
      notePlainText(plainNoteDocument("Revisar bomba\nLlamar al cliente")),
    ).toBe("Revisar bomba\nLlamar al cliente");
    const content = normalizeNoteContent({
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Catálogo",
                      marks: [
                        { type: "bold" },
                        {
                          type: "link",
                          attrs: {
                            href: "https://example.com",
                            onclick: "alert(1)",
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(notePlainText(content!)).toBe("Catálogo");
    expect(JSON.stringify(content)).not.toContain("onclick");
    expect(JSON.stringify(content)).toContain('"checked":true');
  });
  it("rejects scripts, external image tracking and forged image paths", () => {
    for (const src of [
      "https://example.com/tracker.png",
      "javascript:alert(1)",
      "/api/attachments?id=123",
      "data:image/svg+xml;base64,PHN2Zz4=",
    ])
      expect(() =>
        normalizeNoteContent({
          type: "doc",
          content: [{ type: "image", attrs: { src } }],
        }),
      ).toThrow();
    expect(() =>
      normalizeNoteContent({
        type: "doc",
        content: [
          {
            type: "text",
            text: "test",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      normalizeNoteContent({ type: "doc", content: [{ type: "script" }] }),
    ).toThrow();
  });
  it("bounds nested content, text and image count", () => {
    expect(() =>
      normalizeNoteContent(plainNoteDocument("a".repeat(10001))),
    ).toThrow();
    expect(() =>
      normalizeNoteContent({
        type: "doc",
        content: Array.from({ length: 6 }, () => ({
          type: "image",
          attrs: { src: "data:image/png;base64,AAAA" },
        })),
      }),
    ).toThrow();
    let content: unknown = { type: "paragraph" };
    for (let i = 0; i < 14; i++) content = { type: "doc", content: [content] };
    expect(() => normalizeNoteContent(content)).toThrow();
  });
});
describe("calendar week navigation", () => {
  it("keeps Monday through Sunday across year boundaries", () => {
    expect(weekDates("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(weekDates("2026-09-20")[0]).toBe("2026-09-14");
    expect(shiftDay("2026-09-30", 7)).toBe("2026-10-07");
    expect(shiftDay("2026-09-30", -7)).toBe("2026-09-23");
  });
});
