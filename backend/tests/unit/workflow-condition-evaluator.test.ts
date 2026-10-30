import { describe, expect, it } from "vitest";
import {
  evaluateWorkflowCondition,
} from "../../src/workflows/workflow-condition-evaluator.js";
import type {
  WorkflowCondition,
} from "../../src/workflows/workflow-definition.js";

describe("evaluateWorkflowCondition", () => {
  describe("exists", () => {
    it("returns true when the path exists with a null value", () => {
      const condition: WorkflowCondition = {
        id: "check-null",
        path: "/customer/name",
        operator: "exists",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          customer: { name: null },
        }),
      ).toBe(true);
    });

    it("returns false when the path is missing", () => {
      const condition: WorkflowCondition = {
        id: "check-missing",
        path: "/customer/name",
        operator: "exists",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          customer: {},
        }),
      ).toBe(false);
    });
  });

  describe("equals and not_equals", () => {
    it("matches equal scalar values", () => {
      const condition: WorkflowCondition = {
        id: "check-status",
        path: "/status",
        operator: "equals",
        value: "paid",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          status: "paid",
        }),
      ).toBe(true);
    });

    it("does not match values with different JSON types", () => {
      const condition: WorkflowCondition = {
        id: "check-total",
        path: "/total",
        operator: "equals",
        value: 5,
      };

      expect(
        evaluateWorkflowCondition(condition, {
          total: "5",
        }),
      ).toBe(false);
    });

    it("can match a present null value", () => {
      const condition: WorkflowCondition = {
        id: "check-null",
        path: "/value",
        operator: "equals",
        value: null,
      };

      expect(
        evaluateWorkflowCondition(condition, {
          value: null,
        }),
      ).toBe(true);
    });

    it("does not treat a missing path as not equal", () => {
      const condition: WorkflowCondition = {
        id: "check-missing",
        path: "/value",
        operator: "not_equals",
        value: "expected",
      };

      expect(
        evaluateWorkflowCondition(condition, {}),
      ).toBe(false);
    });

    it("does not compare object values as scalars", () => {
      const condition: WorkflowCondition = {
        id: "check-object",
        path: "/value",
        operator: "not_equals",
        value: "expected",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          value: { nested: true },
        }),
      ).toBe(false);
    });
  });

  describe("numeric comparisons", () => {
    const comparisonCases: Array<{
      name: string;
      condition: WorkflowCondition;
      payload: unknown;
      expected: boolean;
    }> = [
      {
        name: "greater_than matches a larger number",
        condition: {
          id: "check-total",
          path: "/total",
          operator: "greater_than",
          value: 10,
        },
        payload: { total: 11 },
        expected: true,
      },
      {
        name: "greater_than_or_equal matches the same number",
        condition: {
          id: "check-total",
          path: "/total",
          operator: "greater_than_or_equal",
          value: 10,
        },
        payload: { total: 10 },
        expected: true,
      },
      {
        name: "less_than matches a smaller number",
        condition: {
          id: "check-total",
          path: "/total",
          operator: "less_than",
          value: 10,
        },
        payload: { total: 9 },
        expected: true,
      },
      {
        name: "less_than_or_equal matches the same number",
        condition: {
          id: "check-total",
          path: "/total",
          operator: "less_than_or_equal",
          value: 10,
        },
        payload: { total: 10 },
        expected: true,
      },
      {
        name: "does not compare a numeric string",
        condition: {
          id: "check-total",
          path: "/total",
          operator: "greater_than",
          value: 10,
        },
        payload: { total: "11" },
        expected: false,
      },
      {
        name: "does not compare a missing value",
        condition: {
          id: "check-total",
          path: "/total",
          operator: "less_than",
          value: 10,
        },
        payload: {},
        expected: false,
      },
    ];

    it.each(comparisonCases)(
      "$name",
      ({ condition, payload, expected }) => {
        expect(
          evaluateWorkflowCondition(condition, payload),
        ).toBe(expected);
      },
    );
  });

  describe("contains", () => {
    it("matches a substring in a string", () => {
      const condition: WorkflowCondition = {
        id: "check-email",
        path: "/email",
        operator: "contains",
        value: "@example.com",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          email: "user@example.com",
        }),
      ).toBe(true);
    });

    it("matches a scalar array element", () => {
      const condition: WorkflowCondition = {
        id: "check-tags",
        path: "/tags",
        operator: "contains",
        value: "priority",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          tags: ["new", "priority"],
        }),
      ).toBe(true);
    });

    it("does not match array elements with a different JSON type", () => {
      const condition: WorkflowCondition = {
        id: "check-values",
        path: "/values",
        operator: "contains",
        value: 5,
      };

      expect(
        evaluateWorkflowCondition(condition, {
          values: ["5"],
        }),
      ).toBe(false);
    });

    it("does not match an object value", () => {
      const condition: WorkflowCondition = {
        id: "check-value",
        path: "/value",
        operator: "contains",
        value: "part",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          value: { text: "part" },
        }),
      ).toBe(false);
    });
  });

  describe("JSON Pointer paths", () => {
    it("decodes escaped slash and tilde characters", () => {
      const condition: WorkflowCondition = {
        id: "check-key",
        path: "/a~1b/~0key",
        operator: "equals",
        value: "found",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          "a/b": {
            "~key": "found",
          },
        }),
      ).toBe(true);
    });

    it("can read an array element by index", () => {
      const condition: WorkflowCondition = {
        id: "check-first-item",
        path: "/items/0",
        operator: "equals",
        value: "first",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          items: ["first", "second"],
        }),
      ).toBe(true);
    });

    it("treats an invalid JSON Pointer escape as missing", () => {
      const condition: WorkflowCondition = {
        id: "check-invalid-path",
        path: "/value~2",
        operator: "exists",
      };

      expect(
        evaluateWorkflowCondition(condition, {
          "value~2": true,
        }),
      ).toBe(false);
    });
  });
});