import { describe, it, expect } from "vitest";
import App from "../app/app";

describe("App", () => {
  it("should be importable", () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe("function");
  });
});
