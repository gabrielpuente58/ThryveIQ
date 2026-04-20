// Simple module-level store for passing workout context from Plan → Chat tab.
// Using a module variable (not AsyncStorage) to avoid async delays on navigation.

interface PendingWorkoutChat {
  message: string;
  workoutContext: string;
}

let _pending: PendingWorkoutChat | null = null;

export function setPendingWorkoutChat(message: string, workoutContext: string): void {
  _pending = { message, workoutContext };
}

export function consumePendingWorkoutChat(): PendingWorkoutChat | null {
  const p = _pending;
  _pending = null;
  return p;
}
