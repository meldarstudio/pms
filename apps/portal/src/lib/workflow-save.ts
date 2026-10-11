import type { WorkflowAction, WorkflowCommand } from "./api.ts"

// Keep the same request after an uncertain response so retrying cannot add a
// duplicate payment. A later intentional save receives a new request ID.
export function createWorkflowSaver() {
  let pending: { payload: string; command: WorkflowCommand } | null = null
  let saving = false
  return async function save<T>(
    actions: WorkflowAction[],
    version: number,
    commit: (command: WorkflowCommand) => Promise<T>
  ): Promise<T> {
    if (saving) throw new Error("Espera a que termine el guardado.")
    saving = true
    try {
      const payload = JSON.stringify(actions)
      if (pending?.payload !== payload) {
        pending = {
          payload,
          command: {
            requestId: crypto.randomUUID(),
            version,
            actions: JSON.parse(payload) as WorkflowAction[],
          },
        }
      }
      const result = await commit(pending.command)
      pending = null
      return result
    } finally {
      saving = false
    }
  }
}
