import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { WorkflowAction, WorkflowCommand } from "../src/lib/api.ts";
import { createWorkflowSaver } from "../src/lib/workflow-save.ts";

const payment: WorkflowAction = {
  type: "add-payment",
  payment: {
    amountCents: 10000,
    method: "cash",
    paymentDate: "2026-10-10",
  },
};

describe("independent reservation saves", () => {
  it("blocks a duplicate during an uncertain payment, retries the same command, then permits a new payment", async () => {
    const save = createWorkflowSaver();
    const commands: WorkflowCommand[] = [];
    let fail!: () => void;
    const first = save([payment], (command) => {
      commands.push(command);
      return new Promise<void>((_, reject) => {
        fail = () => reject(new Error("Connection lost after commit"));
      });
    });
    await assert.rejects(
      save([payment], async (command) => {
        commands.push(command);
      }),
      /termine/,
    );
    assert.equal(commands.length, 1);
    fail();
    await assert.rejects(first);
    await save([payment], async (command) => {
      commands.push(command);
    });
    assert.deepEqual(commands[1], commands[0]);
    await save([payment], async (command) => {
      commands.push(command);
    });
    assert.notEqual(commands[2].requestId, commands[0].requestId);
  });

  it("keeps guest and payment commands independent and snapshots guest text during a save", async () => {
    const saveGuests = createWorkflowSaver();
    const savePayments = createWorkflowSaver();
    const guests = [
      {
        id: "guest-1",
        fullName: "Ana",
        email: null,
        phone: null,
        reservationRoomId: null,
      },
    ];
    let savedGuestCommand!: WorkflowCommand;
    let finish!: () => void;
    const first = saveGuests([{ type: "set-guests", guests }], (command) => {
      savedGuestCommand = command;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    guests[0].fullName = "Ana Pérez";
    await savePayments([payment], async (command) => {
      assert.deepEqual(command.actions, [payment]);
    });
    assert.equal(savedGuestCommand.actions[0].type, "set-guests");
    if (savedGuestCommand.actions[0].type === "set-guests") {
      assert.equal(savedGuestCommand.actions[0].guests[0].fullName, "Ana");
    }
    finish();
    await first;
    await saveGuests([{ type: "set-guests", guests }], async (command) => {
      assert.notEqual(command.requestId, savedGuestCommand.requestId);
      assert.deepEqual(command.actions, [{ type: "set-guests", guests }]);
    });
  });
});
