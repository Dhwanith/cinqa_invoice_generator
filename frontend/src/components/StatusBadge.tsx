import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  generated: "bg-accent text-accent-foreground",
  sent: "bg-primary/10 text-primary",
  paid: "bg-success/15 text-success",
  active: "bg-success/15 text-success",
  inactive: "bg-muted text-muted-foreground",
};

export default function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize", statusStyles[normalized] || "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}
