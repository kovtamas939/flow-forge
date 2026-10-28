import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  findOrCreateExecutionForEvent,
  updateExecutionStatus,
  type ExecutionRecord,
  type ExecutionStatus,
  type FindOrCreateExecutionResult,
} from "./execution-repository.js";

const LEGAL_EXECUTION_TRANSITIONS: Partial<
  Record<ExecutionStatus, readonly ExecutionStatus[]>
> = {
  PENDING: ["RUNNING"],
  RUNNING: ["RETRY_PENDING", "COMPLETED", "FAILED"],
  RETRY_PENDING: ["RUNNING", "FAILED"],
};

export function isLegalExecutionTransition(
  currentStatus: ExecutionStatus,
  nextStatus: ExecutionStatus,
): boolean {
  return (
    LEGAL_EXECUTION_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false
  );
}

export async function getOrCreateExecutionForEvent(
  pool: Pool,
  eventId: string,
): Promise<FindOrCreateExecutionResult> {
  return withTransaction(pool, (client) =>
    findOrCreateExecutionForEvent(client, eventId),
  );
}

export type TransitionExecutionResult =
  | {
      transitioned: true;
      execution: ExecutionRecord;
    }
  | {
      transitioned: false;
      reason: "illegal_transition" | "state_changed_or_execution_missing";
    };

export async function transitionExecution(
  pool: Pool,
  input: {
    executionId: string;
    expectedStatus: ExecutionStatus;
    nextStatus: ExecutionStatus;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<TransitionExecutionResult> {
  if (!isLegalExecutionTransition(input.expectedStatus, input.nextStatus)) {
    return {
      transitioned: false,
      reason: "illegal_transition",
    };
  }

  return withTransaction(pool, async (client) => {
    const execution = await updateExecutionStatus(client, input);

    if (execution === null) {
      return {
        transitioned: false,
        reason: "state_changed_or_execution_missing",
      };
    }

    return {
      transitioned: true,
      execution,
    };
  });
}