import { fileTypeConfig, brand } from "@/lib/brandTheme";

interface FileIconProps {
  type: string;
  size?: "lg" | "md" | "sm";
  approved?: boolean;
}

export default function FileIcon({ type, size = "lg", approved = false }: FileIconProps) {
  const config = fileTypeConfig[type] || fileTypeConfig.document;
  const s = size === "lg" ? 1 : size === "md" ? 0.7 : 0.55;

  return (
    <div className="relative flex-shrink-0" style={{ width: 56 * s, height: 64 * s }}>
      <svg width={56 * s} height={64 * s} viewBox="0 0 56 64" fill="none">
        {/* Paper body */}
        <path
          d="M4 4C4 1.79 5.79 0 8 0H36L52 16V60C52 62.21 50.21 64 48 64H8C5.79 64 4 62.21 4 60V4Z"
          fill={config.bg}
        />
        <path
          d="M4 4C4 1.79 5.79 0 8 0H36L52 16V60C52 62.21 50.21 64 48 64H8C5.79 64 4 62.21 4 60V4Z"
          stroke={config.accent}
          strokeWidth="1.5"
          strokeOpacity="0.3"
        />
        {/* Fold corner */}
        <path
          d="M36 0L52 16H40C37.79 16 36 14.21 36 12V0Z"
          fill={config.accent}
          fillOpacity="0.15"
        />
        {/* Type label badge */}
        <rect x="8" y="42" width="32" height="14" rx="3" fill={config.accent} fillOpacity="0.15" />
        <text
          x="24" y="53"
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill={config.accent}
          fontFamily="system-ui"
        >
          {config.icon}
        </text>
        {/* Content lines */}
        <rect x="10" y="22" width="24" height="2.5" rx="1" fill={config.accent} fillOpacity="0.12" />
        <rect x="10" y="28" width="18" height="2" rx="1" fill={config.accent} fillOpacity="0.08" />
        <rect x="10" y="34" width="20" height="2" rx="1" fill={config.accent} fillOpacity="0.06" />
      </svg>

      {/* Approved checkmark overlay */}
      {approved && (
        <div
          className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
          style={{ width: 18 * s, height: 18 * s, backgroundColor: brand.teal }}
        >
          <svg
            style={{ width: 10 * s, height: 10 * s }}
            className="text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
}
