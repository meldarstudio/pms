import { expect, test as base } from "@playwright/test";

const failedRequestNotice = /^Failed to load resource\b/;

export const test = base.extend<{ failOnBrowserErrors: void }>({
  failOnBrowserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !failedRequestNotice.test(message.text()))
          errors.push(message.text());
      });
      await use();
      expect(errors, "errors logged in the browser").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
