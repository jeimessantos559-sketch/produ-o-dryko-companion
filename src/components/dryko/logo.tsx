export function DrykoLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const escala =
    size === "lg" ? "text-4xl px-4 py-2" : size === "sm" ? "text-base px-2 py-1" : "text-2xl px-3 py-1.5";

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded-md bg-primary font-extrabold uppercase tracking-widest text-primary-foreground ${escala}`}
      >
        Dryko
      </span>
    </div>
  );
}
