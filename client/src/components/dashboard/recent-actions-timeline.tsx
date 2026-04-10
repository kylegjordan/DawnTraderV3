// Stub component — retained since it is imported elsewhere
interface RecentActionsTimelineProps {
  source: 'feed' | 'formula';
  maxItems?: number;
}

export function RecentActionsTimeline({ source, maxItems = 5 }: RecentActionsTimelineProps) {
  return null;
}
