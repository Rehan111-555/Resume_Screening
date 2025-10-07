"use client";

type Props = {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
};

export default function ProgressBar({ currentStep, totalSteps, labels = [] }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100)));
  return (
    <div className="mb-6">
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
      </div>
      {labels.length === totalSteps && (
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          {labels.map((l, i) => (
            <span key={i} className={i + 1 <= currentStep ? "text-indigo-600" : ""}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
