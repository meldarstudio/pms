export const COMPLAINT_EVIDENCE_ACCEPT = ".pdf,.jpg,.jpeg,.png";

export function complaintEvidenceProblem(file: File) {
  if (file.size > 5 * 1024 * 1024) return "complaint attachment exceeds 5 MB";
  if (!file.size) return "complaint attachment is empty";
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return "unsupported complaint attachment type";
  return null;
}
