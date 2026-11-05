import { RecentLogs } from '@/history/recent-logs';
import { WorkoutsScreen } from '@/workouts/workouts-screen';

// The finished workouts come from the history, which the workouts do not depend on.
export default function WorkoutTab() {
  return <WorkoutsScreen history={<RecentLogs />} />;
}
