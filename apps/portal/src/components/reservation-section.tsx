import type { ReactNode } from "react";
import { cn } from "cn";

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
      <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function ReservationSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      role="region"
      aria-label={title}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <SectionHeading title={title} action={action} />
      {children}
    </section>
  );
}
