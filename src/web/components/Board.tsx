import React, { useEffect, useMemo, useState } from 'react';
import { type Milestone, type Task } from '../../types';
import { apiClient, type ReorderTaskPayload } from '../lib/api';
import { buildLanes, DEFAULT_LANE_KEY, groupTasksByLaneAndStatus, type LaneMode } from '../lib/lanes';
import { collectArchivedMilestoneKeys, milestoneKey } from '../utils/milestones';
import { collectAvailableLabels } from '../../utils/label-filter';
import TaskColumn from './TaskColumn';
import CleanupModal from './CleanupModal';
import { SuccessToast } from './SuccessToast';

const INACTIVE_STATUSES = new Set(['done', 'cancelled', 'parked']);

interface BoardProps {
  onEditTask: (task: Task) => void;
  onNewTask: () => void;
  highlightTaskId?: string | null;
  tasks: Task[];
  onRefreshData?: () => Promise<void>;
  statuses: string[];
  isLoading: boolean;
  milestones: string[];
  milestoneEntities: Milestone[];
  archivedMilestones: Milestone[];
  laneMode: LaneMode;
  onLaneChange: (mode: LaneMode) => void;
  milestoneFilter?: string | null;
  availableLabels?: string[];
}

const Board: React.FC<BoardProps> = ({
  onEditTask,
  onNewTask,
  highlightTaskId,
  tasks,
  onRefreshData,
  statuses,
  isLoading,
  milestoneEntities,
  archivedMilestones,
  laneMode,
  onLaneChange,
  milestoneFilter,
  availableLabels = [],
}) => {
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [dragSourceStatus, setDragSourceStatus] = useState<string | null>(null);
  const [dragSourceLane, setDragSourceLane] = useState<string | null>(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [sortPriority, setSortPriority] = useState<'asc' | 'desc' | null>(null);
  const [cleanupSuccessMessage, setCleanupSuccessMessage] = useState<string | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({});
  const archivedMilestoneIds = useMemo(
    () => collectArchivedMilestoneKeys(archivedMilestones, milestoneEntities),
    [archivedMilestones, milestoneEntities]
  );
  const milestoneAliasToCanonical = useMemo(() => {
    const aliasMap = new Map<string, string>();
    const activeTitleCounts = new Map<string, number>();
    const collectIdAliasKeys = (value: string): string[] => {
      const normalized = value.trim();
      const normalizedKey = normalized.toLowerCase();
      if (!normalizedKey) return [];
      const keys = new Set<string>([normalizedKey]);
      if (/^\d+$/.test(normalized)) {
        const numericAlias = String(Number.parseInt(normalized, 10));
        keys.add(numericAlias);
        keys.add(`m-${numericAlias}`);
        return Array.from(keys);
      }
      const idMatch = normalized.match(/^m-(\d+)$/i);
      if (idMatch?.[1]) {
        const numericAlias = String(Number.parseInt(idMatch[1], 10));
        keys.add(`m-${numericAlias}`);
        keys.add(numericAlias);
      }
      return Array.from(keys);
    };
    const reservedIdKeys = new Set<string>();
    for (const milestone of [...milestoneEntities, ...archivedMilestones]) {
      for (const key of collectIdAliasKeys(milestone.id)) {
        reservedIdKeys.add(key);
      }
    }
    const setAlias = (aliasKey: string, id: string, allowOverwrite: boolean) => {
      const existing = aliasMap.get(aliasKey);
      if (!existing) {
        aliasMap.set(aliasKey, id);
        return;
      }
      if (!allowOverwrite) {
        return;
      }
      const existingKey = existing.toLowerCase();
      const nextKey = id.toLowerCase();
      const preferredRawId = /^\d+$/.test(aliasKey) ? `m-${aliasKey}` : /^m-\d+$/.test(aliasKey) ? aliasKey : null;
      if (preferredRawId) {
        const existingIsPreferred = existingKey === preferredRawId;
        const nextIsPreferred = nextKey === preferredRawId;
        if (existingIsPreferred && !nextIsPreferred) {
          return;
        }
        if (nextIsPreferred && !existingIsPreferred) {
          aliasMap.set(aliasKey, id);
        }
        return;
      }
      aliasMap.set(aliasKey, id);
    };
    const addIdAliases = (id: string, options?: { allowOverwrite?: boolean }) => {
      const allowOverwrite = options?.allowOverwrite ?? true;
      const idKey = id.toLowerCase();
      setAlias(idKey, id, allowOverwrite);
      const idMatch = id.match(/^m-(\d+)$/i);
      if (!idMatch?.[1]) return;
      const numericAlias = String(Number.parseInt(idMatch[1], 10));
      const canonicalId = `m-${numericAlias}`;
      setAlias(canonicalId, id, allowOverwrite);
      setAlias(numericAlias, id, allowOverwrite);
    };
    for (const milestone of milestoneEntities) {
      const title = milestone.title.trim();
      if (!title) continue;
      const titleKey = title.toLowerCase();
      activeTitleCounts.set(titleKey, (activeTitleCounts.get(titleKey) ?? 0) + 1);
    }
    const activeTitleKeys = new Set(activeTitleCounts.keys());
    for (const milestone of milestoneEntities) {
      const id = milestone.id.trim();
      const title = milestone.title.trim();
      if (!id) continue;
      addIdAliases(id);
      if (title) {
        const titleKey = title.toLowerCase();
        if (!reservedIdKeys.has(titleKey) && activeTitleCounts.get(titleKey) === 1) {
          if (!aliasMap.has(titleKey)) {
            aliasMap.set(titleKey, id);
          }
        }
      }
    }
    const archivedTitleCounts = new Map<string, number>();
    for (const milestone of archivedMilestones) {
      const title = milestone.title.trim();
      if (!title) continue;
      const titleKey = title.toLowerCase();
      if (activeTitleKeys.has(titleKey)) {
        continue;
      }
      archivedTitleCounts.set(titleKey, (archivedTitleCounts.get(titleKey) ?? 0) + 1);
    }
    for (const milestone of archivedMilestones) {
      const id = milestone.id.trim();
      const title = milestone.title.trim();
      if (!id) continue;
      addIdAliases(id, { allowOverwrite: false });
      if (title) {
        const titleKey = title.toLowerCase();
        if (!activeTitleKeys.has(titleKey) && !reservedIdKeys.has(titleKey) && archivedTitleCounts.get(titleKey) === 1) {
          if (!aliasMap.has(titleKey)) {
            aliasMap.set(titleKey, id);
          }
        }
      }
    }
    return aliasMap;
  }, [milestoneEntities, archivedMilestones]);
  const canonicalizeMilestone = (value?: string | null): string => {
    const normalized = (value ?? "").trim();
    if (!normalized) return "";
    const key = normalized.toLowerCase();
    const direct = milestoneAliasToCanonical.get(key);
    if (direct) {
      return direct;
    }
    const idMatch = normalized.match(/^m-(\d+)$/i);
    if (idMatch?.[1]) {
      const numericAlias = String(Number.parseInt(idMatch[1], 10));
      return milestoneAliasToCanonical.get(`m-${numericAlias}`) ?? milestoneAliasToCanonical.get(numericAlias) ?? normalized;
    }
    if (/^\d+$/.test(normalized)) {
      const numericAlias = String(Number.parseInt(normalized, 10));
      return milestoneAliasToCanonical.get(`m-${numericAlias}`) ?? milestoneAliasToCanonical.get(numericAlias) ?? normalized;
    }
    return normalized;
  };
  const canonicalMilestoneFilter = canonicalizeMilestone(milestoneFilter);

  const mergedLabels = useMemo(
    () => collectAvailableLabels(tasks, availableLabels),
    [tasks, availableLabels],
  );

  // Group labels by prefix (dept > type > module > others), sorted within each group
  const LABEL_GROUP_PRIORITY: Record<string, number> = { dept: 0, type: 1, module: 2 };
  const groupedLabels = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const label of mergedLabels) {
      const colon = label.indexOf(':');
      const prefix = colon > 0 ? label.slice(0, colon) : '';
      const key = prefix || '__other__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(label);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const pa = LABEL_GROUP_PRIORITY[a] ?? 99;
        const pb = LABEL_GROUP_PRIORITY[b] ?? 99;
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
      })
      .map(([prefix, labels]) => ({ prefix: prefix === '__other__' ? '' : prefix, labels: labels.sort() }));
  }, [mergedLabels]);

  const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

  // Filter tasks: always exclude subtasks; apply milestone, label, and active-only filters
  const filteredTasks = useMemo(() => {
    let result = tasks.filter(task => !task.parentTaskId);
    if (showActiveOnly) {
      result = result.filter(task => !INACTIVE_STATUSES.has(task.status.toLowerCase()));
    }
    if (milestoneFilter) {
      result = result.filter(task => canonicalizeMilestone(task.milestone) === canonicalMilestoneFilter);
    }
    if (labelFilter.length > 0) {
      result = result.filter(task => labelFilter.some(lf => task.labels.includes(lf)));
    }
    return result;
  }, [tasks, showActiveOnly, milestoneFilter, canonicalMilestoneFilter, milestoneAliasToCanonical, labelFilter]);

  // Handle highlighting a task (opening its edit popup)
  useEffect(() => {
    if (highlightTaskId && tasks.length > 0) {
      const taskToHighlight = tasks.find(task => task.id === highlightTaskId);
      if (taskToHighlight) {
        // Use setTimeout to ensure the task is found and modal opens properly
        setTimeout(() => {
          onEditTask(taskToHighlight);
        }, 100);
      }
    }
  }, [highlightTaskId, tasks, onEditTask]);

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    try {
      await apiClient.updateTask(taskId, updates);
      // Refresh data to reflect the changes
      if (onRefreshData) {
        await onRefreshData();
      }
      setUpdateError(null);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleTaskReorder = async (payload: ReorderTaskPayload) => {
    try {
      await apiClient.reorderTask(payload);
      // Refresh data to reflect the changes
      if (onRefreshData) {
        await onRefreshData();
      }
      setUpdateError(null);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to reorder task');
    }
  };

  const handleCleanupSuccess = async (movedCount: number) => {
    setShowCleanupModal(false);
    setCleanupSuccessMessage(`Successfully moved ${movedCount} task${movedCount !== 1 ? 's' : ''} to completed folder`);

    // Refresh data to reflect the changes
    if (onRefreshData) {
      await onRefreshData();
    }

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setCleanupSuccessMessage(null);
    }, 4000);
  };

  // Use all tasks for building lanes (so we can show/collapse other milestones)
  const lanes = useMemo(
    () => buildLanes(laneMode, tasks, milestoneEntities.map((milestone) => milestone.id), milestoneEntities, {
      archivedMilestoneIds,
      archivedMilestones,
    }),
    [laneMode, tasks, milestoneEntities, archivedMilestoneIds, archivedMilestones]
  );

  // Check if any tasks actually have milestones assigned
  const hasTasksWithMilestones = useMemo(() => {
    if (archivedMilestoneIds.length === 0) {
      return tasks.some(task => task.milestone && task.milestone.trim() !== '');
    }
    const archivedKeys = new Set(archivedMilestoneIds.map((value) => milestoneKey(value)));
    return tasks.some(task => {
      const key = milestoneKey(canonicalizeMilestone(task.milestone));
      return key.length > 0 && !archivedKeys.has(key);
    });
  }, [tasks, archivedMilestoneIds, milestoneAliasToCanonical]);

  // Always group from filteredTasks (subtasks excluded, active-only applied)
  const tasksByLane = useMemo(
    () => groupTasksByLaneAndStatus(laneMode, lanes, statuses, filteredTasks, {
      archivedMilestoneIds,
      milestoneEntities,
      archivedMilestones,
    }),
    [laneMode, lanes, statuses, filteredTasks, archivedMilestoneIds, milestoneEntities, archivedMilestones]
  );

  // Apply priority sort after lane grouping (groupTasksByLaneAndStatus re-sorts internally)
  const displayTasksByLane = useMemo(() => {
    if (!sortPriority) return tasksByLane;
    const sorted = new Map<string, Map<string, Task[]>>();
    for (const [laneKey, statusMap] of tasksByLane) {
      const newStatusMap = new Map<string, Task[]>();
      for (const [status, list] of statusMap) {
        newStatusMap.set(status, list.slice().sort((a, b) => {
          const ra = PRIORITY_RANK[a.priority?.toLowerCase() ?? ''] ?? 99;
          const rb = PRIORITY_RANK[b.priority?.toLowerCase() ?? ''] ?? 99;
          return sortPriority === 'desc' ? ra - rb : rb - ra;
        }));
      }
      sorted.set(laneKey, newStatusMap);
    }
    return sorted;
  }, [tasksByLane, sortPriority]);

  const getTasksForLane = (laneKey: string, status: string): Task[] => {
    const statusMap = displayTasksByLane.get(laneKey);
    if (!statusMap) return [];
    return statusMap.get(status) ?? [];
  };

  const laneTaskCount = (laneKey: string): number => {
    const statusMap = tasksByLane.get(laneKey);
    if (!statusMap) return 0;
    let count = 0;
    for (const list of statusMap.values()) {
      count += list.length;
    }
    return count;
  };

  // Show all status columns; when active-only is on, hide inactive statuses with no tasks
  const visibleStatuses = useMemo(
    () => statuses.filter(status => {
      if (showActiveOnly && INACTIVE_STATUSES.has(status.toLowerCase())) return false;
      return true;
    }),
    [statuses, showActiveOnly]
  );

  const countDoneTasksInLane = (laneKey: string): number => {
    const statusMap = tasksByLane.get(laneKey);
    if (!statusMap) return 0;
    let count = 0;
    for (const [status, taskList] of statusMap) {
      if (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete')) {
        count += taskList.length;
      }
    }
    return count;
  };

  const getLaneProgress = (laneKey: string): number => {
    const total = laneTaskCount(laneKey);
    if (total === 0) return 0;
    const done = countDoneTasksInLane(laneKey);
    return Math.round((done / total) * 100);
  };

  // Filter out empty lanes in milestone mode
  const visibleLanes = useMemo(() => {
    if (laneMode !== 'milestone') return lanes;
    return lanes.filter(l => laneTaskCount(l.key) > 0);
  }, [laneMode, lanes, tasksByLane]);

  // Only show lane headers when multiple lanes exist
  const shouldShowLaneHeaders = useMemo(() => {
    if (laneMode !== 'milestone') return false;
    return visibleLanes.length > 1;
  }, [laneMode, visibleLanes]);

  // Determine if a lane should be collapsed (respects milestoneFilter)
  const isLaneCollapsed = (laneKey: string, laneMilestone?: string): boolean => {
    // If user manually toggled, respect that
    if (collapsedLanes[laneKey] !== undefined) {
      return collapsedLanes[laneKey];
    }
    // When filtering by milestone, collapse all other lanes by default
    if (milestoneFilter && canonicalizeMilestone(laneMilestone) !== canonicalMilestoneFilter) {
      return true;
    }
    return false;
  };

  const getLaneLabel = (lane: typeof lanes[0]): string => {
    if (lane.isNoMilestone || !lane.milestone) {
      return 'Unassigned';
    }
    return lane.label;
  };

  const toggleLaneCollapse = (laneKey: string) => {
    setCollapsedLanes(prev => ({
      ...prev,
      [laneKey]: !prev[laneKey],
    }));
  };

  if (isLoading && statuses.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-lg text-gray-600 dark:text-gray-300 transition-colors duration-200">Loading tasks...</div>
      </div>
    );
  }

  // Dynamic layout using flexbox:
  // - Columns are flex items with equal growth (flex-1) to divide space evenly
  // - A minimum width keeps columns readable; beyond available space, container scrolls horizontally
  // - Works uniformly for any number of columns without per-count conditionals

  return (
    <div className="w-full">
      {updateError && (
        <div className="mb-4 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200 transition-colors duration-200">
          {updateError}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-200">Kanban Board</h2>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800/50 transition-colors duration-200">
            <button
              type="button"
              onClick={() => onLaneChange('none')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                laneMode === 'none'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              All Tasks
            </button>
            <button
              type="button"
              onClick={() => onLaneChange('milestone')}
              disabled={!hasTasksWithMilestones}
              title={!hasTasksWithMilestones ? 'No tasks have milestones. Assign milestones to tasks first.' : 'Group tasks by milestone'}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                !hasTasksWithMilestones
                  ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                  : laneMode === 'milestone'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Milestone
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowActiveOnly((v) => !v)}
            className={`py-2 px-3 text-sm border rounded-lg whitespace-nowrap transition-colors duration-200 ${
              showActiveOnly
                ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title={showActiveOnly ? "Showing active tasks only — click to show all" : "Click to show active tasks only"}
          >
            Active only
          </button>
          <button
            type="button"
            onClick={() => setSortPriority((v) => v === null ? 'desc' : v === 'desc' ? 'asc' : null)}
            className={`py-2 px-3 text-sm border rounded-lg whitespace-nowrap transition-colors duration-200 ${
              sortPriority
                ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title={sortPriority === null ? "Sort by priority" : sortPriority === 'desc' ? "High → Low — click for Low → High" : "Low → High — click to clear sort"}
          >
            Priority {sortPriority === 'desc' ? '↓' : sortPriority === 'asc' ? '↑' : '↕'}
          </button>
          <button
            className="inline-flex items-center px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 dark:focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition-colors duration-200"
            onClick={onNewTask}
          >
            + New Task
          </button>
        </div>
      </div>

      {/* Label filter bar — grouped by prefix, sorted by importance */}
      {groupedLabels.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-2 mb-4 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">Labels:</span>
          {groupedLabels.map(({ prefix, labels }, gi) => (
            <React.Fragment key={prefix || '__other__'}>
              {gi > 0 && <span className="w-px h-4 bg-gray-300 dark:bg-gray-600 shrink-0" aria-hidden="true" />}
              {prefix && (
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider shrink-0">{prefix}</span>
              )}
              {labels.map((label) => {
                const active = labelFilter.includes(label);
                const display = prefix ? label.slice(prefix.length + 1) : label;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setLabelFilter((prev) =>
                        active ? prev.filter((l) => l !== label) : [...prev, label],
                      )
                    }
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0 text-xs font-medium transition-colors ${
                      active
                        ? "bg-blue-600 text-white dark:bg-blue-500"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {display}
                    {active && (
                      <span className="ml-0.5 text-blue-200" aria-hidden="true">×</span>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
          {labelFilter.length > 0 && (
            <button
              type="button"
              onClick={() => setLabelFilter([])}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1 shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {laneMode === 'milestone' ? (
        <div className="space-y-6">
          {visibleLanes.map((lane) => {
            const taskCount = laneTaskCount(lane.key);
            const progress = getLaneProgress(lane.key);
            const isCollapsed = isLaneCollapsed(lane.key, lane.milestone);

            return (
              <div key={lane.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 overflow-hidden">
                {/* Lane header inside the box */}
                {shouldShowLaneHeaders && (
                  <button
                    type="button"
                    onClick={() => toggleLaneCollapse(lane.key)}
                    className={`w-full flex items-center justify-between gap-4 px-4 py-3 bg-gray-100/80 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group ${!isCollapsed ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <svg
                        className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200 truncate">
                        {getLaneLabel(lane)}
                      </h3>
                      <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors duration-200">
                        {taskCount}
                      </span>
                    </div>

                    {/* Mini progress bar */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 text-right">
                        {progress}%
                      </span>
                    </div>
                  </button>
                )}

                {/* Lane content - columns */}
                {!isCollapsed && (
                  <div className="p-4">
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${visibleStatuses.length}, minmax(0, 1fr))` }}>
                      {visibleStatuses.map((status) => (
                        <div key={`${lane.key}-${status}`} className="min-w-0">
                          <TaskColumn
                            title={status}
                            tasks={getTasksForLane(lane.key, status)}
                            onTaskUpdate={handleTaskUpdate}
                            onEditTask={onEditTask}
                            onTaskReorder={handleTaskReorder}
                            dragSourceStatus={dragSourceStatus}
                            dragSourceLane={dragSourceLane}
                            laneId={lane.key}
                            targetMilestone={lane.milestone ?? null}
                            onDragStart={({ status: draggedStatus, laneId }) => {
                              setDragSourceStatus(draggedStatus);
                              setDragSourceLane(laneId ?? null);
                            }}
                            onDragEnd={() => {
                              setDragSourceStatus(null);
                              setDragSourceLane(null);
                            }}
                            onCleanup={status.toLowerCase() === 'done' ? () => setShowCleanupModal(true) : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex flex-row flex-nowrap gap-4 w-full">
            {visibleStatuses.map((status) => (
              <div key={status} className="flex-1 min-w-[16rem]">
                <TaskColumn
                  title={status}
                  tasks={getTasksForLane(DEFAULT_LANE_KEY, status)}
                  onTaskUpdate={handleTaskUpdate}
                  onEditTask={onEditTask}
                  onTaskReorder={handleTaskReorder}
                  dragSourceStatus={dragSourceStatus}
                  dragSourceLane={dragSourceLane}
                  laneId={DEFAULT_LANE_KEY}
                  onDragStart={({ status: draggedStatus, laneId }) => {
                    setDragSourceStatus(draggedStatus);
                    setDragSourceLane(laneId ?? null);
                  }}
                  onDragEnd={() => {
                    setDragSourceStatus(null);
                    setDragSourceLane(null);
                  }}
                  onCleanup={status.toLowerCase() === 'done' ? () => setShowCleanupModal(true) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cleanup Modal */}
      <CleanupModal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        onSuccess={handleCleanupSuccess}
      />

      {/* Cleanup Success Toast */}
      {cleanupSuccessMessage && (
        <SuccessToast
          message={cleanupSuccessMessage}
          onDismiss={() => setCleanupSuccessMessage(null)}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      )}
    </div>
  );
};

export default Board;
