import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { WorkflowAction, WorkflowCommand } from "../src/lib/api.ts"
import { createWorkflowSaver } from "../src/lib/workflow-save.ts"

const payment: WorkflowAction = {
  type: "financial",
  entry: {
    kind: "payment",
    amountCents: 10000,
    method: "cash",
    paymentDate: "2026-10-10",
  },
}

describe("independent reservation saves", () => {
  it("retries an uncertain payment with the same command, then permits a new intentional payment", async () => {
    const save = createWorkflowSaver()
    const commands: WorkflowCommand[] = []
    await assert.rejects(
      save([payment], 1, async (command) => {
        commands.push(command)
        throw new Error("Connection lost after commit")
      })
    )
    await save([payment], 2, async (command) => {
      commands.push(command)
    })
    assert.deepEqual(commands[1], commands[0])
    await save([payment], 2, async (command) => {
      commands.push(command)
    })
    assert.notEqual(commands[2].requestId, commands[0].requestId)
    assert.equal(commands[2].version, 2)
  })

  it("blocks a second submission while the first payment is saving", async () => {
    const save = createWorkflowSaver()
    let finish!: () => void
    const first = save(
      [payment],
      1,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    let duplicates = 0
    await assert.rejects(
      save([payment], 1, async () => {
        duplicates++
      }),
      /termine/
    )
    assert.equal(duplicates, 0)
    finish()
    await first
  })

  it("keeps guest and payment commands independent and snapshots guest text during a save", async () => {
    const saveGuests = createWorkflowSaver()
    const savePayments = createWorkflowSaver()
    const guests = [
      {
        id: "guest-1",
        fullName: "Ana",
        email: null,
        phone: null,
        reservationRoomId: null,
      },
    ]
    let savedGuestCommand!: WorkflowCommand
    let finish!: () => void
    const first = saveGuests([{ type: "set-guests", guests }], 1, (command) => {
      savedGuestCommand = command
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    guests[0].fullName = "Ana Pérez"
    await savePayments([payment], 1, async (command) => {
      assert.deepEqual(command.actions, [payment])
    })
    assert.equal(savedGuestCommand.actions[0].type, "set-guests")
    if (savedGuestCommand.actions[0].type === "set-guests") {
      assert.equal(savedGuestCommand.actions[0].guests[0].fullName, "Ana")
    }
    finish()
    await first
    await saveGuests([{ type: "set-guests", guests }], 3, async (command) => {
      assert.notEqual(command.requestId, savedGuestCommand.requestId)
      assert.deepEqual(command.actions, [{ type: "set-guests", guests }])
    })
  })
})
