import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiClient, type InboxMessage, type InboxListResponse } from "../lib/api";
import MermaidMarkdown from "./MermaidMarkdown";

// ---- Colour scheme per directive ----
const DEPT_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
	CEO: { bg: "#1e2d4a", text: "#60a5fa", border: "#60a5fa33" },
	CTO: { bg: "#1e3a2f", text: "#4ade80", border: "#4ade8033" },
	CMO: { bg: "#2d1e4a", text: "#c084fc", border: "#c084fc33" },
	CFO: { bg: "#3a2a1e", text: "#fb923c", border: "#fb923c33" },
};

const MODULE_COLOUR = { bg: "#1e2535", text: "#94a3b8", border: "#94a3b833" };

function getBadgeStyle(msg: InboxMessage) {
	if (msg.isModule) return MODULE_COLOUR;
	const dept = msg.dept?.toUpperCase();
	return (dept && DEPT_COLOURS[dept]) || MODULE_COLOUR;
}

function getBadgeLabel(msg: InboxMessage): string {
	if (msg.isModule) return msg.module ?? "module";
	return msg.dept?.toUpperCase() ?? "?";
}

function formatDate(date: string | null): string {
	if (!date) return "";
	try {
		return new Date(date).toLocaleDateString("en-GB", {
			day: "2-digit",
			month: "short",
			year: "numeric",
		});
	} catch {
		return date;
	}
}

// ---- Badge component ----
function DeptBadge({ msg }: { msg: InboxMessage }) {
	const style = getBadgeStyle(msg);
	const label = getBadgeLabel(msg);
	return (
		<span
			className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap flex-shrink-0"
			style={{ backgroundColor: style.bg, color: style.text, border: `1px solid ${style.border}` }}
		>
			{label}
		</span>
	);
}

// ---- Message list item ----
function MessageItem({
	msg,
	isSelected,
	isRead,
	onClick,
}: {
	msg: InboxMessage;
	isSelected: boolean;
	isRead: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full text-left px-4 py-3 border-b border-gray-700 transition-colors duration-150 cursor-pointer ${
				isSelected
					? "bg-blue-900/30 border-l-2 border-l-blue-500"
					: "hover:bg-gray-800 border-l-2 border-l-transparent"
			}`}
		>
			<div className="flex items-center gap-2 mb-1">
				{/* Unread dot */}
				{!msg.isProcessed && !isRead ? (
					<span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" aria-label="Unread" />
				) : (
					<span className="w-2 h-2 rounded-full bg-transparent flex-shrink-0" />
				)}
				<DeptBadge msg={msg} />
				{msg.type && (
					<span className="text-xs text-gray-500 dark:text-gray-400 truncate">{msg.type}</span>
				)}
				<span className="ml-auto text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
					{formatDate(msg.date)}
				</span>
			</div>
			<div
				className={`text-sm leading-snug mb-1 truncate ${
					!msg.isProcessed && !isRead ? "font-semibold text-gray-100" : "font-normal text-gray-400"
				}`}
			>
				{msg.title}
			</div>
			{msg.from && (
				<div className="text-xs text-gray-500 truncate">From: {msg.from}</div>
			)}
			{msg.preview && (
				<div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{msg.preview}</div>
			)}
		</button>
	);
}

// ---- Main page ----
export default function InboxPage() {
	const [data, setData] = useState<InboxListResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Filters
	const [deptFilter, setDeptFilter] = useState<string>("All");
	const [moduleFilter, setModuleFilter] = useState<string | null>(null);
	const [showArchived, setShowArchived] = useState(false);

	// Read state (persisted to localStorage)
	const [readIds, setReadIds] = useState<Set<string>>(() => {
		try {
			const stored = localStorage.getItem("backlog:inbox:read");
			return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
		} catch {
			return new Set<string>();
		}
	});
	const autoReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Selection + detail
	const [selectedMsg, setSelectedMsg] = useState<InboxMessage | null>(null);
	const [msgContent, setMsgContent] = useState<string | null>(null);
	const [isLoadingContent, setIsLoadingContent] = useState(false);
	const [isArchiving, setIsArchiving] = useState(false);
	const [archiveError, setArchiveError] = useState<string | null>(null);

	const loadInbox = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);
			const result = await apiClient.fetchInbox();
			setData(result);
		} catch (err) {
			console.error("Failed to load inbox:", err);
			setError("Failed to load inbox. Is the c-suite directory accessible?");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadInbox();
	}, [loadInbox]);

	// Persist readIds to localStorage
	useEffect(() => {
		try {
			localStorage.setItem("backlog:inbox:read", JSON.stringify([...readIds]));
		} catch {}
	}, [readIds]);

	// Auto-mark as read after 5 seconds of viewing
	useEffect(() => {
		if (autoReadTimer.current) clearTimeout(autoReadTimer.current);
		if (selectedMsg && !readIds.has(selectedMsg.id)) {
			autoReadTimer.current = setTimeout(() => {
				setReadIds((prev) => new Set([...prev, selectedMsg.id]));
			}, 5000);
		}
		return () => {
			if (autoReadTimer.current) clearTimeout(autoReadTimer.current);
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedMsg]);

	const toggleRead = useCallback(() => {
		if (!selectedMsg) return;
		setReadIds((prev) => {
			const next = new Set(prev);
			if (next.has(selectedMsg.id)) {
				next.delete(selectedMsg.id);
			} else {
				next.add(selectedMsg.id);
			}
			return next;
		});
	}, [selectedMsg]);

	// Load message content when selection changes
	useEffect(() => {
		if (!selectedMsg) {
			setMsgContent(null);
			return;
		}
		let cancelled = false;
		setIsLoadingContent(true);
		setMsgContent(null);
		setArchiveError(null);

		apiClient
			.fetchInboxMessage(selectedMsg.filePath)
			.then((res) => {
				if (!cancelled) setMsgContent(res.content);
			})
			.catch(() => {
				if (!cancelled) setMsgContent("*Failed to load message content.*");
			})
			.finally(() => {
				if (!cancelled) setIsLoadingContent(false);
			});

		return () => {
			cancelled = true;
		};
	}, [selectedMsg]);

	const handleArchive = useCallback(async () => {
		if (!selectedMsg || selectedMsg.isProcessed) return;
		setIsArchiving(true);
		setArchiveError(null);
		try {
			await apiClient.archiveInboxMessage(selectedMsg.filePath);
			// Reload inbox and clear selection
			const result = await apiClient.fetchInbox();
			setData(result);
			setSelectedMsg(null);
			setMsgContent(null);
		} catch (err) {
			console.error("Archive failed:", err);
			setArchiveError("Failed to archive message.");
		} finally {
			setIsArchiving(false);
		}
	}, [selectedMsg]);

	// Compute filtered messages
	const filteredMessages = React.useMemo(() => {
		if (!data) return [];
		return data.messages.filter((msg) => {
			if (!showArchived && msg.isProcessed) return false;
			if (deptFilter !== "All") {
				if (msg.isModule) return false;
				if (msg.dept?.toUpperCase() !== deptFilter) return false;
			}
			if (moduleFilter !== null) {
				if (!msg.isModule) return false;
				if (msg.module !== moduleFilter) return false;
			}
			return true;
		});
	}, [data, deptFilter, moduleFilter, showArchived]);

	const unreadCount = (data?.messages ?? []).filter((m) => !m.isProcessed && !readIds.has(m.id)).length;
	const modules = data?.modules ?? [];

	const deptTabs = ["All", "CEO", "CTO", "CMO", "CFO"];

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
				<div className="text-center">
					<div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
					<p>Loading inbox…</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center p-8 bg-red-900/20 border border-red-800 rounded-lg max-w-md">
					<p className="text-red-400 mb-4">{error}</p>
					<button
						type="button"
						onClick={loadInbox}
						className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-700 flex-shrink-0 bg-gray-900">
				{/* Dept filter tabs */}
				<div className="flex gap-1">
					{deptTabs.map((dept) => {
						const isActive = deptFilter === dept && moduleFilter === null;
						const style = dept !== "All" ? DEPT_COLOURS[dept] : null;
						return (
							<button
								key={dept}
								type="button"
								onClick={() => {
									setDeptFilter(dept);
									setModuleFilter(null);
								}}
								className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
									isActive
										? "bg-blue-600 text-white"
										: "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
								}`}
								style={
									isActive && style
										? { backgroundColor: style.bg, color: style.text, border: `1px solid ${style.border}` }
										: undefined
								}
							>
								{dept}
							</button>
						);
					})}
				</div>

				{/* Divider */}
				{modules.length > 0 && (
					<span className="text-gray-700 text-xs select-none">|</span>
				)}

				{/* Module pills */}
				{modules.map((mod) => {
					const isActive = moduleFilter === mod;
					return (
						<button
							key={mod}
							type="button"
							onClick={() => {
								setModuleFilter(isActive ? null : mod);
								if (!isActive) setDeptFilter("All");
							}}
							className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
								isActive
									? "border-gray-400 text-gray-100 bg-gray-700"
									: "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
							}`}
						>
							{mod}
						</button>
					);
				})}

				{/* Spacer */}
				<div className="flex-1" />

				{/* Unread toggle */}
				<label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
					<input
						type="checkbox"
						checked={showArchived}
						onChange={(e) => setShowArchived(e.target.checked)}
						className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
					/>
					Show archived
				</label>

				{/* Unread count badge */}
				{unreadCount > 0 && (
					<span className="px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full">
						{unreadCount}
					</span>
				)}
			</div>

			{/* Two-panel layout */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Left panel — message list */}
				<div className="w-80 min-w-80 flex-shrink-0 border-r border-gray-700 overflow-y-auto bg-gray-900">
					{filteredMessages.length === 0 ? (
						<div className="p-6 text-center text-gray-500 text-sm">
							{"No messages"}
						</div>
					) : (
						filteredMessages.map((msg) => (
							<MessageItem
								key={msg.id}
								msg={msg}
								isSelected={selectedMsg?.id === msg.id}
								isRead={readIds.has(msg.id)}
								onClick={() => setSelectedMsg(msg)}
							/>
						))
					)}
				</div>

				{/* Right panel — detail view */}
				<div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-gray-950">
					{selectedMsg ? (
						<>
							{/* Detail header */}
							<div className="flex-shrink-0 px-6 py-4 border-b border-gray-700">
								<div className="flex items-start justify-between gap-4 mb-3">
									<h2 className="text-lg font-semibold text-gray-100 leading-snug flex-1 min-w-0">
										{selectedMsg.title}
									</h2>
									<div className="flex items-center gap-2 flex-shrink-0">
										{/* Read/unread toggle */}
										<button
											type="button"
											onClick={toggleRead}
											className="px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-600 rounded hover:bg-gray-800 transition-colors"
										>
											{readIds.has(selectedMsg.id) ? "Mark unread" : "Mark read"}
										</button>
										{/* Archive button */}
										{!selectedMsg.isProcessed && (
											<button
												type="button"
												onClick={handleArchive}
												disabled={isArchiving}
												className="px-3 py-1.5 text-xs font-medium bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded transition-colors"
											>
												{isArchiving ? "Archiving…" : "Archive"}
											</button>
										)}
										{selectedMsg.isProcessed && (
											<span className="px-2 py-1 text-xs text-gray-500 border border-gray-700 rounded">
												Archived
											</span>
										)}
									</div>
								</div>

								{/* Metadata row */}
								<div className="flex flex-wrap gap-3 text-xs text-gray-500">
									<DeptBadge msg={selectedMsg} />
									{selectedMsg.type && (
										<span className="bg-gray-800 px-2 py-0.5 rounded text-gray-400">
											{selectedMsg.type}
										</span>
									)}
									{selectedMsg.from && (
										<span>
											<span className="text-gray-600">From:</span>{" "}
											<span className="text-gray-400">{selectedMsg.from}</span>
										</span>
									)}
									{selectedMsg.to && (
										<span>
											<span className="text-gray-600">To:</span>{" "}
											<span className="text-gray-400">{selectedMsg.to}</span>
										</span>
									)}
									{selectedMsg.priority && (
										<span>
											<span className="text-gray-600">Priority:</span>{" "}
											<span className="text-gray-400">{selectedMsg.priority}</span>
										</span>
									)}
									{selectedMsg.date && (
										<span className="ml-auto">{formatDate(selectedMsg.date)}</span>
									)}
								</div>

								{archiveError && (
									<p className="mt-2 text-xs text-red-400">{archiveError}</p>
								)}
							</div>

							{/* Detail body */}
							<div className="flex-1 overflow-y-auto px-6 py-5">
								{isLoadingContent ? (
									<div className="flex items-center gap-2 text-gray-500 text-sm">
										<div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
										Loading…
									</div>
								) : msgContent !== null ? (
									<div className="prose prose-invert prose-sm max-w-none">
										<MermaidMarkdown source={msgContent} />
									</div>
								) : null}
							</div>
						</>
					) : (
						<div className="flex-1 flex items-center justify-center text-gray-600">
							<div className="text-center">
								<svg
									className="w-12 h-12 mx-auto mb-3 text-gray-700"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
								<p className="text-sm">Select a message to read</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
