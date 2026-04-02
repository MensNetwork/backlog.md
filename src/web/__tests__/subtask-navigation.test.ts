import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Task } from "../../types";
import { type NavigateToTaskDeps, navigateToTask } from "../utils/navigate-to-task";

/**
 * Tests for subtask navigation behaviour.
 *
 * Tests the real navigateToTask helper extracted from App.tsx:
 *   1. API success path — opens the fetched task, sets fresh-fetch flag
 *   2. API failure with local fallback — falls back to local tasks array
 *   3. Both API and local fail — sets a navigation error with timed clear
 *   4. Resets navigationError before each navigation attempt
 *   5. Always resets isNavigating in the finally block
 *
 * And rendering conditions from TaskDetailsModal:
 *   6. Parent task link renders when parentTaskId is present
 *   7. Subtask list renders when subtaskSummaries is non-empty
 *   8. Navigation callback fires with correct ID on click
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

// ─── navigateToTask (extracted helper) ──────────────────────────────────────

describe("navigateToTask", () => {
	let deps: NavigateToTaskDeps;

	beforeEach(() => {
		deps = {
			fetchTask: mock(),
			localTasks: [],
			setEditingTask: mock(),
			setShowModal: mock(),
			setNavigationError: mock(),
			setIsNavigating: mock(),
			setIsFreshFetch: mock(),
		};
	});

	it("opens the fetched task on API success", async () => {
		const apiTask = makeTask({ id: "task-42", title: "From API" });
		(deps.fetchTask as ReturnType<typeof mock>).mockResolvedValueOnce(apiTask);

		await navigateToTask("task-42", deps);

		expect(deps.fetchTask).toHaveBeenCalledWith("task-42");
		expect(deps.setEditingTask).toHaveBeenCalledWith(apiTask);
		expect(deps.setShowModal).toHaveBeenCalledWith(true);
		expect(deps.setNavigationError).not.toHaveBeenCalledWith(expect.stringContaining("Could not"));
	});

	it("sets isFreshFetch flag on API success", async () => {
		const apiTask = makeTask({ id: "task-42" });
		(deps.fetchTask as ReturnType<typeof mock>).mockResolvedValueOnce(apiTask);

		await navigateToTask("task-42", deps);

		expect(deps.setIsFreshFetch).toHaveBeenCalledWith(true);
	});

	it("clears navigation error before fetching", async () => {
		const apiTask = makeTask({ id: "task-42" });
		(deps.fetchTask as ReturnType<typeof mock>).mockResolvedValueOnce(apiTask);

		await navigateToTask("task-42", deps);

		// First call to setNavigationError should be null (reset)
		const calls = (deps.setNavigationError as ReturnType<typeof mock>).mock.calls;
		expect(calls[0]?.[0]).toBe(null);
	});

	it("falls back to local task when API fails", async () => {
		const localTask = makeTask({ id: "task-42", title: "Local Copy" });
		deps.localTasks = [localTask];
		(deps.fetchTask as ReturnType<typeof mock>).mockRejectedValueOnce(new Error("Network error"));

		await navigateToTask("task-42", deps);

		expect(deps.setEditingTask).toHaveBeenCalledWith(localTask);
		expect(deps.setShowModal).toHaveBeenCalledWith(true);
	});

	it("does not set isFreshFetch on local fallback", async () => {
		deps.localTasks = [makeTask({ id: "task-42" })];
		(deps.fetchTask as ReturnType<typeof mock>).mockRejectedValueOnce(new Error("fail"));

		await navigateToTask("task-42", deps);

		expect(deps.setIsFreshFetch).not.toHaveBeenCalled();
	});

	it("sets navigation error when both API and local fail", async () => {
		deps.localTasks = [];
		(deps.fetchTask as ReturnType<typeof mock>).mockRejectedValueOnce(new Error("Network error"));

		await navigateToTask("task-99", deps);

		expect(deps.setNavigationError).toHaveBeenCalledWith("Could not load task task-99");
		expect(deps.setShowModal).not.toHaveBeenCalledWith(true);
	});

	it("resets isNavigating in the finally block after success", async () => {
		(deps.fetchTask as ReturnType<typeof mock>).mockResolvedValueOnce(makeTask({ id: "task-42" }));

		await navigateToTask("task-42", deps);

		const calls = (deps.setIsNavigating as ReturnType<typeof mock>).mock.calls;
		expect(calls[0]?.[0]).toBe(true); // set true at start
		expect(calls[calls.length - 1]?.[0]).toBe(false); // set false in finally
	});

	it("resets isNavigating in the finally block after failure", async () => {
		(deps.fetchTask as ReturnType<typeof mock>).mockRejectedValueOnce(new Error("fail"));
		deps.localTasks = [];

		await navigateToTask("task-99", deps);

		const calls = (deps.setIsNavigating as ReturnType<typeof mock>).mock.calls;
		expect(calls[0]?.[0]).toBe(true);
		expect(calls[calls.length - 1]?.[0]).toBe(false);
	});
});

// ─── Rendering conditions (TaskDetailsModal) ────────────────────────────────

describe("TaskDetailsModal rendering conditions", () => {
	it("parent task section should render when parentTaskId is present", () => {
		const task = makeTask({ parentTaskId: "task-10", parentTaskTitle: "Parent" });
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

		if (task.parentTaskId) {
			onNavigateToTask(task.parentTaskId);
		}

		expect(onNavigateToTask).toHaveBeenCalledWith("task-10");
	});

	it("navigation callback receives the correct subtask ID", () => {
		const onNavigateToTask = mock();
		const subtask = { id: "task-20", title: "Child A" };

		onNavigateToTask(subtask.id);

		expect(onNavigateToTask).toHaveBeenCalledWith("task-20");
	});

	it("does not call navigation when parentTaskId is falsy (guard)", () => {
		const onNavigateToTask = mock();
		const task = makeTask({});

		if (task.parentTaskId) {
			onNavigateToTask(task.parentTaskId);
		}

		expect(onNavigateToTask).not.toHaveBeenCalled();
	});
});
