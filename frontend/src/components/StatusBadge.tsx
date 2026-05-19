import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  // Invoice statuses
  generated:       "bg-accent text-accent-foreground",
  pending:         "bg-amber-500/15 text-amber-600",
  sent:            "bg-primary/10 text-primary",
  partially_paid:  "bg-orange-500/15 text-orange-600",
  paid:            "bg-success/15 text-success",
  cancelled:       "bg-destructive/10 text-destructive",
  // Purchase statuses
  draft:           "bg-muted text-muted-foreground",
  booked:          "bg-blue-500/15 text-blue-600",
  // Client/vendor
  active:          "bg-success/15 text-success",
  inactive:        "bg-muted text-muted-foreground",
};

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold",
        statusStyles[normalized] || "bg-muted text-muted-foreground"
      )}
    >
      {formatStatusLabel(normalized)}
    </span>
  );
}
