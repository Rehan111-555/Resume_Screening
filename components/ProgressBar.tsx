'use client';

interface ProgressBarProps {
  currentStep: number; // 0-indexed
  totalSteps: number;
  labels: string[];
}

export default function ProgressBar({ currentStep, totalSteps, labels }: ProgressBarProps) {
  const clamp = (n: number) => Math.max(0, Math.min(n, totalSteps - 1));
  const active = clamp(currentStep);

  return (
    <div className="w-full mb-8" aria-label="Progress">
      <div className="flex items-center justify-between mb-2">
        {labels.map((label, index) => {
          const done = index <= active;
          return (
            <div key={label} className="flex flex-col items-center min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  done ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}
                aria-current={index === active ? 'step' : undefined}
              >
                {index + 1}
              </div>
              <span
                className={`text-xs mt-1 truncate max-w-[6.5rem] ${
                  done ? 'text-blue-600 font-semibold' : 'text-gray-500'
                }`}
                title={label}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center" aria-hidden>
        {Array.from({ length: totalSteps - 1 }).map((_, index) => (
          <div
            key={index}
            className={`flex-1 h-1 ${index < active ? 'bg-blue-600' : 'bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
}
