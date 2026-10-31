import { describe, expect, test } from "bun:test";
import {
  chunk,
  cleanItems,
  MAX_ITEMS,
  redact,
  renderFiltered,
  toDigest,
} from "../apps/extension/lib/privacy-digest";

describe("toDigest", () => {
  test("numbers each distinct http(s) link and resolves relative ones", () => {
    const { text, links } = toDigest(
      `<h2><a href="/story/1">First story</a></h2><p>Body &amp; more</p>
       <a href="https://other.example/x">Second</a> <a href="/story/1">again</a>
       <a href="mailto:me@example.com">mail</a> <a href="javascript:alert(1)">js</a>`,
      "https://news.example/front",
    );
    expect(links).toEqual(["https://news.example/story/1", "https://other.example/x"]);
    expect(text).toContain("[1] First story");
    expect(text).toContain("Body & more");
    expect(text).toContain("[2] Second");
    expect(text).toContain("[1] again");
    expect(text).not.toContain("[3]");
  });
});

describe("chunk", () => {
  test("keeps every chunk within the size and loses no text", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i} `.repeat(20)).join("\n");
    const parts = chunk(text, 1000);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.join("\n").replace(/\n/g, "")).toBe(text.replace(/\n/g, ""));
  });

  test("splits a single line longer than the size", () => {
    expect(chunk("x".repeat(2500), 1000).map((p) => p.length)).toEqual([1000, 1000, 500]);
  });
});

describe("redact", () => {
  test("removes emails, phone numbers and long digit runs", () => {
    expect(redact("Write to jane.doe+news@mail.example.com today")).toBe("Write to [email] today");
    expect(redact("Call +61 2 9876 5432 now")).toBe("Call [number] now");
    expect(redact("Card 4111 1111 1111 1111")).toBe("Card [number]");
    expect(redact("Order 123456789")).toBe("Order [number]");
  });

  test("keeps short numbers and dates", () => {
    expect(redact("macOS 27 ships in 2026, 3-1 win")).toBe("macOS 27 ships in 2026, 3-1 win");
  });
});

describe("cleanItems", () => {
  const links = ["https://a.example/1", "https://a.example/2"];

  test("drops items whose link is not on the page, and duplicates", () => {
    const kept = cleanItems(
      [
        { link: 1, title: "One", summary: "s" },
        { link: 3, title: "Invented", summary: "s" },
        { link: 0, title: "Zero", summary: "s" },
        { link: 1.5, title: "Half", summary: "s" },
        { link: 1, title: "One again", summary: "s" },
        { link: 2, title: "Two", summary: "Mail bob@x.example" },
      ],
      links,
    );
    expect(kept.map((i) => i.title)).toEqual(["One", "Two"]);
    expect(kept[1].summary).toBe("Mail [email]");
  });

  test("caps the number of items", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ link: i + 1, title: `t${i}`, summary: "" }));
    const manyLinks = many.map((_, i) => `https://a.example/${i}`);
    expect(cleanItems(many, manyLinks)).toHaveLength(MAX_ITEMS);
  });
});

describe("renderFiltered", () => {
  test("uses only page links and escapes model text", () => {
    const html = renderFiltered(
      "Inbox of jane@x.example",
      [{ link: 1, title: `<script>x</script>`, summary: `"quoted"` }],
      [`https://a.example/?q="1"`],
      0,
    );
    expect(html).toContain(`href="https://a.example/?q=&quot;1&quot;"`);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<h1>Inbox of [email]</h1>");
  });
});
