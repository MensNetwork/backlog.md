/** Departmental colour scheme for dept:* labels */
export interface LabelColour {
	bg: string;
	text: string;
	border: string;
	activeBg: string;
	activeText: string;
}

const DEPT_COLOURS: Record<string, LabelColour> = {
	ceo: { bg: "#1e2d4a", text: "#60a5fa", border: "#60a5fa33", activeBg: "#1e3a6a", activeText: "#93c5fd" },
	cto: { bg: "#1e3a2f", text: "#4ade80", border: "#4ade8033", activeBg: "#1a4a30", activeText: "#86efac" },
	cmo: { bg: "#2d1e4a", text: "#c084fc", border: "#c084fc33", activeBg: "#3a1e6a", activeText: "#d8b4fe" },
	cfo: { bg: "#3a2a1e", text: "#fb923c", border: "#fb923c33", activeBg: "#4a3010", activeText: "#fdba74" },
};

/**
 * Returns colour styles for a label if it's a known dept:* label, otherwise null.
 */
export function getDeptLabelColour(label: string): LabelColour | null {
	if (!label.startsWith("dept:")) return null;
	const dept = label.slice(5).toLowerCase();
	return DEPT_COLOURS[dept] ?? null;
}
