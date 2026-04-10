interface PageHeaderProps {
  kicker?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ kicker, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {kicker && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary mb-2">{kicker}</p>
        )}
        <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">{title}</h2>
        {description && <p className="text-muted-foreground text-sm mt-2 max-w-lg">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
