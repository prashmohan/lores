import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BreadcrumbBarProps {
  history: BreadcrumbItem[];
  onSelectPerson: (id: string) => void;
  onReset?: () => void;
}

export const BreadcrumbBar: React.FC<BreadcrumbBarProps> = ({
  history,
  onSelectPerson,
  onReset,
}) => {
  if (history.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Focus Navigation History"
      className="bg-white border-y border-slate-200 px-4 sm:px-8 py-2.5 shadow-inner"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto text-sm">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center cursor-pointer"
            title="Reset focus"
            aria-label="Home"
          >
            <Home className="w-4 h-4" />
          </button>
        )}

        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1 hidden sm:inline">
          Trail:
        </span>

        <ol className="flex items-center gap-1.5 flex-nowrap">
          {history.map((item, index) => {
            const isLast = index === history.length - 1;

            return (
              <li key={`${item.id}-${index}`} className="flex items-center gap-1.5 whitespace-nowrap">
                {index > 0 && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />}
                {isLast ? (
                  <span
                    className="font-extrabold text-slate-950 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-md text-sm"
                    aria-current="page"
                  >
                    {item.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectPerson(item.id)}
                    className="font-medium text-slate-600 hover:text-slate-950 hover:underline hover:bg-slate-100 px-2 py-0.5 rounded transition-colors cursor-pointer text-sm"
                  >
                    {item.name}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
};
