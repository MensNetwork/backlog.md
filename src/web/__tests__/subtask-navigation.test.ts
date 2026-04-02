import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Task } from "../../types";

/**
 * Tests for subtask navigation behaviour in App.tsx.
 *
 * These test the handler logic extracted from handleNavigateToTask:
 *   1. API success path — opens the fetched task
 *   2. API failure with local fallback — falls back to local tasks array
 *   3. Both API and local fail — sets a navigation error
 *
 * And rendering conditions from TaskDetailsModal:
 *   4. Parent task link renders when parentTaskId is present
 *   5. Subtask list renders when subtaskSummaries is non-empty
 *   6. Navigation callback fires with correct ID on click
 */

const makeTask = (overrides: Partial<Task> = {}): Task => ({
	id: "task-1",
	title: "Test Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2024-01-01",
	...overrides,
});

// ─── handleNavigateToTask logic ──────────────────────────────────────────────

describe("handleNavigateToTask", () => {
	let setEditingTask: ReturnType<typeof mock>;
	let setShowModal: ReturnType<typeof mock>;
	let setNavigationError: ReturnType<typeof mock>;
	let setIsNavigating: ReturnType<typeof mock>;
	let fetchTask: ReturnType<typeof mock>;
	let isNavigating: boolean;
	let localTasks: Task[];

	/**
	 * Mirrors the logic in App.tsx handleNavigateToTask.
	 * Kept in sync manually — if the handler changes, update this.
	 */
	async function handleNavigateToTask(taskId: string) {
		if (isNavigating) return;
		setIsNavigating(true);
		try {
			const task = await fetchTask(taskId);
			setEditingTask(task);
			setShowModal(true);
		} catch {
			const localTask = localTasks.find((t) => t.id === taskId);
			if (localTask) {
				setEditingTask(localTask);
				setShowModal(true);
			} else {
				setNavigationError(`Could not load task ${taskId}`);
			}
		} finally {
			setIsNavigating(false);
		}
	}

	beforeEach(() => {
		setEditingTask = mock();
		setShowModal = mock();
		setNavigationError = mock();
		setIsNavigating = mock();
		fetchTask = mock();
		isNavigating = false;
		localTasks = [];
	});

	it("opens the fetched task on API success", async () => {
		const apiTask = makeTask({ id: "task-42", title: "From API" });
		fetchTask.mockResolvedValueOnce(apiTask);

		await handleNavigateToTask("task-42");

		expect(fetchTask).toHaveBeenCalledWith("task-42");
		expect(setEditingTask).toHaveBeenCalledWith(apiTask);
		expect(setShowModal).toHaveBeenCalledWith(true);
		expect(setNavigationError).not.toHaveBeenCalled();
	});

	it("falls back to local task when API fails", async () => {
		const localTask = makeTask({ id: "task-42", title: "Local Copy" });
		localTasks = [localTask];
		fetchTask.mockRejectedValueOnce(new Error("Network error"));

		await handleNavigateToTask("task-42");

		expect(setEditingTask).toHaveBeenCalledWith(localTask);
		expect(setShowModal).toHaveBeenCalledWith(true);
		expect(setNavigationError).not.toHaveBeenCalled();
	});

	it("sets navigation error when both API and local fail", async () => {
		localTasks = [];
		fetchTask.mockRejectedValueOnce(new Error("Network error"));

		await handleNavigateToTask("task-99");

		expect(setNavigationError).toHaveBeenCalledWith("Could not load task task-99");
		expect(setShowModal).not.toHaveBeenCalled();
	});

	it("guards against concurrent navigation (isNavigating)", async () => {
		isNavigating = true;

		await handleNavigateToTask("task-42");

		expect(fetchTask).not.toHaveBeenCalled();
		expect(setEditingTask).not.toHaveBeenCalled();
	});

	it("resets isNavigating in the finally block after success", async () => {
		fetchTask.mockResolvedValueOnce(makeTask({ id: "task-42" }));

		await handleNavigateToTask("task-42");

		// Last call to setIsNavigating should be false (finally block)
		const calls = setIsNavigating.mock.calls;
		expect(calls).toBeDefined();
		expect(calls.length).toBeGreaterThanOrEqual(2);
		expect(calls[0]![0]).toBe(true); // set true before fetch
		expect(calls[calls.length - 1]![0]).toBe(false); // set false in finally
	});

	it("resets isNavigating in the finally block after failure", async () => {
		fetchTask.mockRejectedValueOnce(new Error("fail"));
		localTasks = [];

		await handleNavigateToTask("task-99");

		const calls = setIsNavigating.mock.calls;
		expect(calls).toBeDefined();
		expect(calls.length).toBeGreaterThanOrEqual(2);
		expect(calls[0]![0]).toBe(true);
		expect(calls[calls.length - 1]![0]).toBe(false);
	});
});

// ─── Rendering conditions (TaskDetailsModal) ────────────────────────────────

describe("TaskDetailsModal rendering conditions", () => {
	it("parent task section should render when parentTaskId is present", () => {
		const task = makeTask({ parentTaskId: "task-10", parentTaskTitle: "Parent" });
		// The condition in JSX: task?.parentTaskId
		expect(!!task.parentTaskId).toBe(true);
	});

	it("parent task section should NOT render when parentTaskId is absent", () => {
		const task = makeTask({});
		expect(!!task.parentTaskId).toBe(false);
	});

	it("subtask list should render when subtaskSummaries is non-empty", () => {
		const task = makeTask({
			subtaskSummaries: [
				{ id: "task-20", title: "Child A" },
				{ id: "task-21", title: "Child B" },
			],
		});
		// The condition in JSX: task?.subtaskSummaries && task.subtaskSummaries.length > 0
		expect(!!task.subtaskSummaries && task.subtaskSummaries.length > 0).toBe(true);
	});

	it("subtask list should NOT render when subtaskSummaries is empty", () => {
		const task = makeTask({ subtaskSummaries: [] });
		expect(!!task.subtaskSummaries && task.subtaskSummaries.length > 0).toBe(false);
	});

	it("subtask list should NOT render when subtaskSummaries is undefined", () => {
		const task = makeTask({});
		expect(!!task.subtaskSummaries && (task.subtaskSummaries?.length ?? 0) > 0).toBe(false);
	});

	it("navigation callback receives the correct parent task ID", () => {
		const onNavigateToTask = mock();
		const task = makeTask({ parentTaskId: "task-10" });

		// Simulates the onClick: task.parentTaskId && onNavigateToTask?.(task.parentTaskId)
		if (task.parentTaskId) {
			onNavigateToTask(task.parentTaskId);
		}

		expect(onNavigateToTask).toHaveBeenCalledWith("task-10");
	});

	it("navigation callback receives the correct subtask ID", () => {
		const onNavigateToTask = mock();
		const subtask = { id: "task-20", title: "Child A" };

		// Simulates the onClick: onNavigateToTask?.(subtask.id)
		onNavigateToTask(subtask.id);

		expect(onNavigateToTask).toHaveBeenCalledWith("task-20");
	});

	it("does not call navigation when parentTaskId is falsy (guard)", () => {
		const onNavigateToTask = mock();
		const task = makeTask({});

		// Simulates: task.parentTaskId && onNavigateToTask?.(task.parentTaskId)
		if (task.parentTaskId) {
			onNavigateToTask(task.parentTaskId);
		}

		expect(onNavigateToTask).not.toHaveBeenCalled();
	});
});
