interface VplGradeBadgeProps {
  score: number | null;
  grade: string | null;
  size?: "sm" | "md";
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-200",
  B: "bg-blue-100 text-blue-800 border-blue-200",
  C: "bg-yellow-100 text-yellow-800 border-yellow-200",
  D: "bg-orange-100 text-orange-800 border-orange-200",
  F: "bg-red-100 text-red-800 border-red-200",
};

export function VplGradeBadge({ score, grade, size = "sm" }: VplGradeBadgeProps) {
  if (score == null || grade == null) return null;

  const colorClass = GRADE_COLORS[grade] ?? "bg-gray-100 text-gray-700 border-gray-200";
  const textSize = size === "md" ? "text-sm font-bold" : "text-xs font-semibold";
  const padding = size === "md" ? "px-2.5 py-1" : "px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border ${colorClass} ${textSize} ${padding}`}
      title={`Virtual Print Lab Score: ${score}/100`}
    >
      <span>🧪</span>
      <span>{grade}</span>
      <span className="opacity-70">{score}</span>
    </span>
  );
}
