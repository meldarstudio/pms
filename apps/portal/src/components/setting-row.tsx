import type { ReactNode } from "react";

export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 className="break-words text-sm font-medium">{title}</h2>
        <p className="break-words text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex max-w-full shrink-0 items-center self-end sm:self-center">
        {children}
      </div>
    </div>
  );
}
