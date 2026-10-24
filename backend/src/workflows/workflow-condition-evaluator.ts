import type {
  WorkflowCondition,
  WorkflowJsonScalar,
} from "./workflow-definition.js";

export type WorkflowConditionWithoutContains = Exclude<
  WorkflowCondition,
  {
    operator: "contains";
  }
>;

type JsonPointerLookup =
  | {
      found: true;
      value: unknown;
    }
  | {
      found: false;
    };

function decodeJsonPointerToken(token: string): string | null {
  if (/~(?![01])/.test(token)) {
    return null;
  }

  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function lookupJsonPointer(
  document: unknown,
  pointer: string,
): JsonPointerLookup {
  if (!pointer.startsWith("/")) {
    return { found: false };
  }

  const tokens = pointer.slice(1).split("/");
  let current: unknown = document;

  for (const token of tokens) {
    const key = decodeJsonPointerToken(token);

    if (key === null || current === null || typeof current !== "object") {
      return { found: false };
    }

    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        return { found: false };
      }

      const index = Number(token);

      if (
        !Number.isSafeInteger(index) ||
        index >= current.length ||
        !Object.hasOwn(current, index)
      ) {
        return { found: false };
      }

      current = current[index];
      continue;
    }

    if (!Object.hasOwn(current, key)) {
      return { found: false };
    }

    current = (current as Record<string, unknown>)[key];
  }

  return {
    found: true,
    value: current,
  };
}

function isJsonScalar(value: unknown): value is WorkflowJsonScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateWorkflowCondition(
  condition: WorkflowConditionWithoutContains,
  payload: unknown,
): boolean {
  const lookup = lookupJsonPointer(payload, condition.path);

  if (condition.operator === "exists") {
    return lookup.found;
  }

  if (!lookup.found) {
    return false;
  }

  switch (condition.operator) {
    case "equals":
      return (
        isJsonScalar(lookup.value) &&
        lookup.value === condition.value
      );

    case "not_equals":
      return (
        isJsonScalar(lookup.value) &&
        lookup.value !== condition.value
      );

    case "greater_than":
      return (
        isFiniteNumber(lookup.value) &&
        isFiniteNumber(condition.value) &&
        lookup.value > condition.value
      );

    case "greater_than_or_equal":
      return (
        isFiniteNumber(lookup.value) &&
        isFiniteNumber(condition.value) &&
        lookup.value >= condition.value
      );

    case "less_than":
      return (
        isFiniteNumber(lookup.value) &&
        isFiniteNumber(condition.value) &&
        lookup.value < condition.value
      );

    case "less_than_or_equal":
      return (
        isFiniteNumber(lookup.value) &&
        isFiniteNumber(condition.value) &&
        lookup.value <= condition.value
      );
  }
}