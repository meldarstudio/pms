import { expect, it } from "vite-plus/test";
import config from "../cloudflare.config";

it("schedules payment recovery every minute", () => {
  expect(
    config.worker.triggers
      ?.filter((trigger) => trigger.type === "scheduled")
      .map((trigger) => trigger.schedule),
  ).toEqual(["* * * * *"]);
});
