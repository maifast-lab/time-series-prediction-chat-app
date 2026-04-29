import { ChevronRight, Plus } from 'lucide-react';

interface SidebarToggleButtonProps {
  isSidebarOpen: boolean;
  onToggle: () => void;
  className: string;
}

export default function SidebarToggleButton({
  isSidebarOpen,
  onToggle,
  className,
}: SidebarToggleButtonProps) {
  return (
    <button
      type='button'
      aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      onClick={onToggle}
      className={className}
    >
      {isSidebarOpen ? (
        <Plus className='h-5 w-5 rotate-45' />
      ) : (
        <ChevronRight className='h-5 w-5' />
      )}
    </button>
  );
}
