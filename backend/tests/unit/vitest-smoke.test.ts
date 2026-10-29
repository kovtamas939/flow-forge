import { describe, expect, it } from "vitest";

describe("Vitest setup", () => {
  it("runs on a supported Node.js version", () => {
    const nodeMajorVersion = Number.parseInt(
      process.versions.node,
      10,
    );

    expect(nodeMajorVersion).toBeGreaterThanOrEqual(24);
  });
});