export type WorkflowJsonScalar = string | number | boolean | null;

export type WorkflowJsonValue =
  | WorkflowJsonScalar
  | WorkflowJsonValue[]
  | { [key: string]: WorkflowJsonValue };

export type WorkflowCondition =
  | {
      id: string;
      path: string;
      operator: "exists";
    }
  | {
      id: string;
      path: string;
      operator: "equals" | "not_equals";
      value: WorkflowJsonScalar;
    }
  | {
      id: string;
      path: string;
      operator:
        | "greater_than"
        | "greater_than_or_equal"
        | "less_than"
        | "less_than_or_equal";
      value: number;
    }
  | {
      id: string;
      path: string;
      operator: "contains";
      value: WorkflowJsonScalar;
    };

export type WorkflowAction =
  | {
      id: string;
      type: "log";
      message: string;
    }
  | {
      id: string;
      type: "notification";
      recipient: string;
      message: string;
    }
  | {
      id: string;
      type: "http_request";
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      url: string;
      body?: WorkflowJsonValue;
    };

export type WorkflowDefinitionV1 = {
  schemaVersion: 1;
  trigger: {
    type: "webhook";
  };
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
};

const identifierSchema = {
  type: "string",
  pattern: "^[A-Za-z0-9_-]{1,64}$",
} as const;

const pathSchema = {
  type: "string",
  minLength: 1,
  maxLength: 1024,
  pattern: "^(?:/(?:[^~/]|~[01])*)+$",
} as const;

const jsonScalarSchema = {
  type: ["string", "number", "boolean", "null"],
} as const;

export const workflowDefinitionV1Schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "flowforge:workflow-definition:v1",
  title: "FlowForge workflow definition version 1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "trigger", "actions"],
  properties: {
    schemaVersion: {
      const: 1,
    },
    trigger: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: {
          const: "webhook",
        },
      },
    },
    conditions: {
      type: "array",
      minItems: 1,
      items: {
        oneOf: [
          { $ref: "#/definitions/existsCondition" },
          { $ref: "#/definitions/scalarCondition" },
          { $ref: "#/definitions/numericCondition" },
          { $ref: "#/definitions/containsCondition" },
        ],
      },
    },
    actions: {
      type: "array",
      minItems: 1,
      items: {
        oneOf: [
          { $ref: "#/definitions/logAction" },
          { $ref: "#/definitions/notificationAction" },
          { $ref: "#/definitions/httpRequestAction" },
        ],
      },
    },
  },
  definitions: {
    existsCondition: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "operator"],
      properties: {
        id: identifierSchema,
        path: pathSchema,
        operator: {
          const: "exists",
        },
      },
    },
    scalarCondition: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "operator", "value"],
      properties: {
        id: identifierSchema,
        path: pathSchema,
        operator: {
          enum: ["equals", "not_equals"],
        },
        value: jsonScalarSchema,
      },
    },
    numericCondition: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "operator", "value"],
      properties: {
        id: identifierSchema,
        path: pathSchema,
        operator: {
          enum: [
            "greater_than",
            "greater_than_or_equal",
            "less_than",
            "less_than_or_equal",
          ],
        },
        value: {
          type: "number",
        },
      },
    },
    containsCondition: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "operator", "value"],
      properties: {
        id: identifierSchema,
        path: pathSchema,
        operator: {
          const: "contains",
        },
        value: jsonScalarSchema,
      },
    },
    logAction: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "message"],
      properties: {
        id: identifierSchema,
        type: {
          const: "log",
        },
        message: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
        },
      },
    },
    notificationAction: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "recipient", "message"],
      properties: {
        id: identifierSchema,
        type: {
          const: "notification",
        },
        recipient: {
          type: "string",
          minLength: 1,
          maxLength: 320,
        },
        message: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
        },
      },
    },
    httpRequestAction: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "method", "url"],
      properties: {
        id: identifierSchema,
        type: {
          const: "http_request",
        },
        method: {
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        },
        url: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          format: "uri",
          pattern: "^https?://",
        },
        body: {
          $ref: "#/definitions/jsonValue",
        },
      },
    },
    jsonValue: {
      oneOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
        {
          type: "array",
          items: {
            $ref: "#/definitions/jsonValue",
          },
        },
        {
          type: "object",
          additionalProperties: {
            $ref: "#/definitions/jsonValue",
          },
        },
      ],
    },
  },
} as const;