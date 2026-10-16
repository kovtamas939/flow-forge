import { createRequire } from "node:module";
import type { AnySchema, ErrorObject } from "ajv";
import {
  workflowDefinitionV1Schema,
  type WorkflowDefinitionV1,
} from "./workflow-definition.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

export type WorkflowDefinitionValidationIssue = {
  path: string;
  keyword: string;
};

export type WorkflowDefinitionValidationResult =
  | {
      valid: true;
      definition: WorkflowDefinitionV1;
    }
  | {
      valid: false;
      issues: WorkflowDefinitionValidationIssue[];
    };

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
});

addFormats(ajv, ["uri"]);

const validateSchema = ajv.compile(
  workflowDefinitionV1Schema as AnySchema,
);

function findDuplicateIdIssue(
  definition: WorkflowDefinitionV1,
): WorkflowDefinitionValidationIssue | null {
  const seenIds = new Set<string>();

  for (const [index, condition] of (definition.conditions ?? []).entries()) {
    if (seenIds.has(condition.id)) {
      return {
        path: `/conditions/${index}/id`,
        keyword: "duplicateId",
      };
    }

    seenIds.add(condition.id);
  }

  for (const [index, action] of definition.actions.entries()) {
    if (seenIds.has(action.id)) {
      return {
        path: `/actions/${index}/id`,
        keyword: "duplicateId",
      };
    }

    seenIds.add(action.id);
  }

  return null;
}

export function validateWorkflowDefinition(
  value: unknown,
): WorkflowDefinitionValidationResult {
  if (!validateSchema(value)) {
    const issues = (validateSchema.errors ?? []).map(
      (error: ErrorObject) => ({
        path: error.instancePath.length === 0 ? "/" : error.instancePath,
        keyword: error.keyword,
      }),
    );

    return {
      valid: false,
      issues,
    };
  }

  const definition = value as WorkflowDefinitionV1;
  const duplicateIdIssue = findDuplicateIdIssue(definition);

  if (duplicateIdIssue !== null) {
    return {
      valid: false,
      issues: [duplicateIdIssue],
    };
  }

  return {
    valid: true,
    definition,
  };
}