import { describe, expect, it, vi } from "vitest";
import { scrollToHashSection } from "./scrollToHash";

function fakeDocument(foundId: string | null) {
  const scrollIntoView = vi.fn();
  const getElementById = vi.fn((id: string) => (id === foundId ? ({ scrollIntoView } as unknown as HTMLElement) : null));
  return { doc: { getElementById }, scrollIntoView };
}

describe("scrollToHashSection", () => {
  it("scrolls to the section when the URL hash names it", () => {
    // Arrange
    const { doc, scrollIntoView } = fakeDocument("products");

    // Act
    const scrolled = scrollToHashSection("products", "#products", doc);

    // Assert
    expect(scrolled).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("leaves the page alone when the URL has no hash", () => {
    const { doc, scrollIntoView } = fakeDocument("products");

    expect(scrollToHashSection("products", "", doc)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("leaves the page alone when the hash names another section", () => {
    const { doc, scrollIntoView } = fakeDocument("products");

    expect(scrollToHashSection("products", "#pricing", doc)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("returns false when the section is not on the page", () => {
    const { doc } = fakeDocument(null);

    expect(scrollToHashSection("products", "#products", doc)).toBe(false);
  });
});
