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
    <div className="@container min-w-0">
      <div className="flex min-w-0 flex-col gap-4 px-4 py-5 @md:flex-row @md:items-center @md:justify-between @md:gap-6 @md:px-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="break-words text-sm font-medium">{title}</h2>
          <p className="break-words text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className="-mr-(--control-px) flex max-w-full shrink-0 items-center self-end @md:self-center">
          {children}
        </div>
      </div>
    </div>
  );
}
