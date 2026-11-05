import { RecentLogs } from '@/history/recent-logs';
import { useAskWhatStays } from '@/workouts/choice';
import { WorkoutsScreen } from '@/workouts/workouts-screen';

// The finished workouts come from the history, which the workouts do not depend on.
export default function WorkoutTab() {
  useAskWhatStays();
  return <WorkoutsScreen history={<RecentLogs />} />;
}
