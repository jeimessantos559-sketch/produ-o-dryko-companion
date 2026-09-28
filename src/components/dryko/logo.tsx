export function DrykoLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const escala = size === "lg" ? "h-14" : size === "sm" ? "h-7" : "h-10";

  return (
    <span className="inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm">
      <img
        src="/dryko-logo.png"
        alt="DRYKO Impermeabilizantes"
        className={`w-auto object-contain ${escala}`}
      />
    </span>
  );
}
