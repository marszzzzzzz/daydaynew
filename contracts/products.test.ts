import { describe, expect, it } from "vitest";
import { isImageDataUrl, parseKeywords, productInputSchema, publicName, safeJsonLd, seoChecks, seoScore, showcaseJsonLd } from "./products";

const good = {
  sourceName: "Neoflam 陶瓷保鮮盒 (Sqaure) Gray 900 ml",
  displayName: "Neoflam 陶瓷保鮮盒 900ml 灰色",
  description: "韓國 Neoflam 陶瓷保鮮盒，900ml 方形，可入焗爐同雪櫃，北角日日新格仔鋪有現貨。",
  keywords: "陶瓷保鮮盒, Neoflam, 北角",
  hasImage: true,
};

describe("parseKeywords", () => {
  it("splits on English and Chinese commas, trims and removes duplicates", () => {
    expect(parseKeywords(" 保鮮盒，Neoflam、北角,保鮮盒 \n 廚具 ")).toEqual(["保鮮盒", "Neoflam", "北角", "廚具"]);
  });
  it("returns an empty list for blank input", () => {
    expect(parseKeywords("  ,， ")).toEqual([]);
  });
});

describe("publicName", () => {
  it("uses the SEO name when set, otherwise the POS name", () => {
    expect(publicName({ sourceName: "D100 米奇背包", displayName: "  " })).toBe("D100 米奇背包");
    expect(publicName({ sourceName: "D100 米奇背包", displayName: "迪士尼米奇背包 D100" })).toBe("迪士尼米奇背包 D100");
  });
});

describe("seoChecks", () => {
  it("passes every check for a fully optimised product", () => {
    expect(seoChecks(good).every((c) => c.ok)).toBe(true);
    expect(seoScore(good)).toBe(100);
  });
  it("flags a product that still uses its raw POS name with nothing else filled", () => {
    const checks = seoChecks({ sourceName: "髮夾", displayName: "", description: "", keywords: "", hasImage: false });
    expect(checks.filter((c) => c.ok).map((c) => c.id)).toEqual([]);
    expect(seoScore({ sourceName: "髮夾", displayName: "", description: "", keywords: "", hasImage: false })).toBe(0);
  });
  it("requires the name to contain one of the keywords", () => {
    const checks = seoChecks({ ...good, keywords: "廚具, 北角" });
    expect(checks.find((c) => c.id === "nameKeyword")?.ok).toBe(false);
  });
  it("flags names that are too long for search results", () => {
    const checks = seoChecks({ ...good, displayName: "陶瓷保鮮盒".repeat(9) });
    expect(checks.find((c) => c.id === "nameLength")?.ok).toBe(false);
  });
});

describe("productInputSchema", () => {
  it("accepts a valid edit and trims text", () => {
    const r = productInputSchema.parse({ sourceName: " 髮夾 ", displayName: " 韓系珍珠髮夾 ", description: "", keywords: "", category: "", featured: true, hidden: false });
    expect(r.sourceName).toBe("髮夾");
    expect(r.displayName).toBe("韓系珍珠髮夾");
  });
  it("rejects a product that is both featured and hidden", () => {
    expect(productInputSchema.safeParse({ sourceName: "髮夾", displayName: "", description: "", keywords: "", category: "", featured: true, hidden: true }).success).toBe(false);
  });
  it("rejects names longer than the limit", () => {
    expect(productInputSchema.safeParse({ sourceName: "髮夾", displayName: "長".repeat(61), description: "", keywords: "", category: "", featured: false, hidden: false }).success).toBe(false);
  });
});

describe("isImageDataUrl", () => {
  it("accepts small webp / jpeg / png data URLs", () => {
    expect(isImageDataUrl("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isImageDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
  });
  it("rejects SVG (can carry scripts), non-images and oversized files", () => {
    expect(isImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isImageDataUrl("data:text/html;base64,PGh0bWw+")).toBe(false);
    expect(isImageDataUrl("data:image/png;base64," + "A".repeat(600_000))).toBe(false);
  });
});

describe("JSON-LD", () => {
  it("escapes < so a product name cannot close the script tag", () => {
    const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
  it("lists products with HKD offers and absolute image URLs", () => {
    const ld = showcaseJsonLd(
      [
        { name: "陶瓷保鮮盒", description: "900ml", category: "廚具", price: "89.00", imageUrl: "/api/products/3/image?v=2" },
        { name: "髮夾", description: "", category: "", price: null, imageUrl: null },
      ],
      "https://daydaynew.trize.shop",
    );
    expect(ld["@type"]).toBe("ItemList");
    const first = ld.itemListElement[0].item;
    expect(first.image).toBe("https://daydaynew.trize.shop/api/products/3/image?v=2");
    expect(first.offers).toMatchObject({ price: "89.00", priceCurrency: "HKD" });
    expect(ld.itemListElement[1].item.offers).toBeUndefined();
    expect(ld.itemListElement[1].position).toBe(2);
  });
});
