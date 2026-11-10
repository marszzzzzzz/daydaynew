import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionButton } from "./ui";

const render = (props: Parameters<typeof ActionButton>[0]) => renderToStaticMarkup(createElement(ActionButton, props));

describe("ActionButton type", () => {
  it("is a plain button when it has a click handler, so it never submits the form around it", () => {
    // Arrange / Act
    const html = render({ children: "上載相片", onClick: () => {} });

    // Assert
    expect(html).toContain('type="button"');
  });

  it("stays a submit button when it has no click handler (the form's own save button)", () => {
    const html = render({ children: "儲存" });

    expect(html).toContain('type="submit"');
  });

  it("respects an explicit type", () => {
    expect(render({ children: "送出", onClick: () => {}, type: "submit" })).toContain('type="submit"');
    expect(render({ children: "x", type: "button" })).toContain('type="button"');
  });
});
