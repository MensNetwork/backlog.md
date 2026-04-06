import type { Task } from "../types/index.ts";

function normalizeLabel(label: string): string {
	return label.trim().toLowerCase();
}

/**
 * Collect available labels from configuration and tasks, de-duplicated but preserving
 * the first-seen casing so UI surfaces familiar labels.
 */
export function collectAvailableLabels(tasks: Task[], configured: string[] = []): string[] {
	const seen = new Set<string>();
	const ordered: string[] = [];

	const addLabel = (label: string | undefined) => {
		if (!label) return;
		const normalized = normalizeLabel(label);
		if (normalized.length === 0) return;
		if (seen.has(normalized)) return;
		seen.add(normalized);
		ordered.push(label);
	};

	for (const label of configured) {
		addLabel(label);
	}

	for (const task of tasks) {
		for (const label of task.labels || []) {
			addLabel(label);
		}
	}

	return ordered;
}

/**
 * Build a short, footer-friendly summary for the current label filter selection.
 * Examples:
 * - [] => "Labels: All"
 * - ["bug"] => "Labels: bug"
 * - ["bug", "ui"] => "Labels: bug, ui"
 * - ["bug", "ui", "infra"] => "Labels: bug, ui +1"
 */
export function formatLabelSummary(selected: string[]): string {
	if (!selected || selected.length === 0) {
		return "Labels: All";
	}
	if (selected.length === 1) {
		return `Labels: ${selected[0]}`;
	}
	if (selected.length === 2) {
		return `Labels: ${selected[0]}, ${selected[1]}`;
	}
	const remaining = selected.length - 2;
	return `Labels: ${selected[0]}, ${selected[1]} +${remaining}`;
}

export function labelsToLower(labels: string[]): string[] {
	return labels.map(normalizeLabel).filter((label) => label.length > 0);
}

const LABEL_GROUP_PRIORITY: Record<string, number> = { dept: 0, type: 1, module: 2 };

/**
 * Sort labels by group prefix (dept > type > module > other),
 * then alphabetically within each group.
 */
export function sortLabelsByGroup(labels: string[]): string[] {
	return labels.slice().sort((a, b) => {
		const aColon = a.indexOf(":");
		const bColon = b.indexOf(":");
		const aPrefix = aColon > 0 ? a.slice(0, aColon) : "";
		const bPrefix = bColon > 0 ? b.slice(0, bColon) : "";
		const ap = LABEL_GROUP_PRIORITY[aPrefix] ?? 99;
		const bp = LABEL_GROUP_PRIORITY[bPrefix] ?? 99;
		if (ap !== bp) return ap - bp;
		if (aPrefix !== bPrefix) return aPrefix.localeCompare(bPrefix);
		return a.localeCompare(b);
	});
}
