import { revalidateLogic } from "@tanstack/react-form"

export const blurThenChange = () =>
  revalidateLogic({ mode: "blur", modeAfterSubmission: "change" })
