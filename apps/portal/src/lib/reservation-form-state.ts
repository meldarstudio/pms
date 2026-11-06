import { revalidateLogic } from "@tanstack/react-form";
import { clearServerErrorsOnlyOnOwnChangeOrSubmit } from "./form-errors.ts";

export const blurThenChange = () =>
  clearServerErrorsOnlyOnOwnChangeOrSubmit(
    revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
  );
