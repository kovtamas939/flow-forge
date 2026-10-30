import { describe, expect, it } from "vitest";
import {
  validateWorkflowDefinition,
  type WorkflowDefinitionValidationIssue,
} from "../../src/workflows/workflow-definition-validation.js";
import type {
  WorkflowDefinitionV1,
} from "../../src/workflows/workflow-definition.js";

const validDefinition: WorkflowDefinitionV1 = {
  schemaVersion: 1,
  trigger: {
    type: "webhook",
  },
  conditions: [
    {
      id: "has-order-id",
      path: "/order/id",
      operator: "exists",
    },
  ],
  actions: [
    {
      id: "write-log",
      type: "log",
      message: "Order received",
    },
  ],
};

function expectInvalidDefinition(
  value: unknown,
): WorkflowDefinitionValidationIssue[] {
  const result = validateWorkflowDefinition(value);

  expect(result.valid).toBe(false);

  if (result.valid) {
    throw new Error("Expected the workflow definition to be invalid");
  }

  return result.issues;
}

describe("validateWorkflowDefinition", () => {
  it("accepts a valid version 1 definition", () => {
    const result = validateWorkflowDefinition(validDefinition);

    expect(result).toEqual({
      valid: true,
      definition: validDefinition,
    });
  });

  it("accepts a definition without conditions", () => {
    const { conditions: _conditions, ...definitionWithoutConditions } =
      validDefinition;

    const result = validateWorkflowDefinition(
      definitionWithoutConditions,
    );

    expect(result.valid).toBe(true);
  });

  it("rejects an unsupported schema version", () => {
    const issues = expectInvalidDefinition({
      ...validDefinition,
      schemaVersion: 2,
    });

    expect(
      issues.some((issue) => issue.path === "/schemaVersion"),
    ).toBe(true);
  });

  it("rejects an empty actions array", () => {
    const issues = expectInvalidDefinition({
      ...validDefinition,
      actions: [],
    });

    expect(
      issues.some(
        (issue) =>
          issue.path === "/actions" && issue.keyword === "minItems",
      ),
    ).toBe(true);
  });

  it("rejects duplicate condition IDs", () => {
    const definitionWithDuplicateConditions: WorkflowDefinitionV1 = {
      ...validDefinition,
      conditions: [
        {
          id: "same-id",
          path: "/order/id",
          operator: "exists",
        },
        {
          id: "same-id",
          path: "/order/total",
          operator: "greater_than",
          value: 0,
        },
      ],
    };

    const issues = expectInvalidDefinition(
      definitionWithDuplicateConditions,
    );

    expect(issues).toEqual([
      {
        path: "/conditions/1/id",
        keyword: "duplicateId",
      },
    ]);
  });

  it("rejects an action ID that duplicates a condition ID", () => {
    const definitionWithDuplicateIds: WorkflowDefinitionV1 = {
      ...validDefinition,
      actions: [
        {
          id: "has-order-id",
          type: "log",
          message: "Order received",
        },
      ],
    };

    const issues = expectInvalidDefinition(
      definitionWithDuplicateIds,
    );

    expect(issues).toEqual([
      {
        path: "/actions/0/id",
        keyword: "duplicateId",
      },
    ]);
  });

  it("rejects duplicate action IDs", () => {
    const definitionWithDuplicateActions: WorkflowDefinitionV1 = {
      ...validDefinition,
      actions: [
        {
          id: "same-action-id",
          type: "log",
          message: "First message",
        },
        {
          id: "same-action-id",
          type: "log",
          message: "Second message",
        },
      ],
    };

    const issues = expectInvalidDefinition(
      definitionWithDuplicateActions,
    );

    expect(issues).toEqual([
      {
        path: "/actions/1/id",
        keyword: "duplicateId",
      },
    ]);
  });

  it("rejects an invalid HTTP method", () => {
    const issues = expectInvalidDefinition({
      ...validDefinition,
      actions: [
        {
          id: "send-request",
          type: "http_request",
          method: "TRACE",
          url: "https://example.com",
        },
      ],
    });

    expect(
      issues.some((issue) => issue.path === "/actions/0/method"),
    ).toBe(true);
  });
});