export { cn } from "cn";

export function formatPhoneNumber(number: string) {
  const cleaned = number.replace(/\D/g, "");
  const match = cleaned.match(/^(\d{2})(\d{3})(\d{3})(\d{3})$/);
  if (match) {
    return `+${match[1]}\u00a0${match[2]}\u00a0${match[3]}\u00a0${match[4]}`;
  }
  return number;
}
