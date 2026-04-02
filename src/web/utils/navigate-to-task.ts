import type { Task } from "../../types";

export interface NavigateToTaskDeps {
	fetchTask: (taskId: string) => Promise<Task>;
	localTasks: Task[];
	setEditingTask: (task: Task) => void;
	setShowModal: (show: boolean) => void;
	setNavigationError: (error: string | null) => void;
	setIsNavigating: (navigating: boolean) => void;
	setIsFreshFetch: (fresh: boolean) => void;
}

/**
 * Core navigation logic extracted from App.tsx handleNavigateToTask.
 *
 * Fetches a task by ID from the API. On failure, falls back to the local
 * tasks array. If both fail, sets a navigation error that auto-clears
 * after 4 seconds.
 */
export async function navigateToTask(taskId: string, deps: NavigateToTaskDeps): Promise<void> {
	const { fetchTask, localTasks, setEditingTask, setShowModal, setNavigationError, setIsNavigating, setIsFreshFetch } =
		deps;

	setIsNavigating(true);
	setNavigationError(null);
	try {
		const task = await fetchTask(taskId);
		setIsFreshFetch(true);
		setEditingTask(task);
		setShowModal(true);
	} catch {
		// Try finding it in the local tasks array as fallback
		const localTask = localTasks.find((t) => t.id === taskId);
		if (localTask) {
			setEditingTask(localTask);
			setShowModal(true);
		} else {
			setNavigationError(`Could not load task ${taskId}`);
			setTimeout(() => setNavigationError(null), 4000);
		}
	} finally {
		setIsNavigating(false);
	}
}
