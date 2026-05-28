import { useEffect, useRef, useState } from "react";

export type DetectionCondition = "acne" | "redness" | "under_eye_bags";

export interface Detection {
  condition: DetectionCondition;
  severity: number;
  type: "spot" | "zone";
  // spot
  x?: number;
  y?: number;
  radius?: number;
  // zone
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface HeatmapOverlayProps {
  imageUrl: string;
  detections: Detection[];
  angleLabel: string;
}

const CONDITION_LABELS: Record<DetectionCondition, string> = {
  acne: "Acne",
  redness: "Redness",
  under_eye_bags: "Under-eye bags",
};

const CONDITION_COLORS: Record<DetectionCondition, string> = {
  acne: "#DC1414",
  redness: "#E66400",
  under_eye_bags: "#6400C8",
};

function severityLabel(s: number): string {
  if (s < 0.34) return "Mild";
  if (s < 0.67) return "Moderate";
  return "Severe";
}

export function HeatmapOverlay({
  imageUrl,
  detections,
  angleLabel,
}: HeatmapOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);

  const updateScale = () => {
    const img = imgRef.current;
    if (img && img.naturalWidth > 0) {
      setScale({
        x: img.clientWidth / img.naturalWidth,
        y: img.clientHeight / img.naturalHeight,
      });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(updateScale);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const presentConditions = [
    ...new Set(detections.map((d) => d.condition)),
  ] as DetectionCondition[];

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-slate-700"
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={`${angleLabel} heatmap`}
          className="w-full aspect-[4/3] object-cover"
          onLoad={updateScale}
        />

        {scale &&
          detections.map((det, i) => {
            if (det.type === "spot" && det.x !== undefined) {
              const cx = det.x * scale.x;
              const cy = det.y * scale.y;
              const r = (det.radius ?? 15) * Math.min(scale.x, scale.y);
              return (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    left: cx - r,
                    top: cy - r,
                    width: r * 2,
                    height: r * 2,
                    opacity: 0,
                    cursor: "crosshair",
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const container =
                      containerRef.current!.getBoundingClientRect();
                    setTooltip({
                      text: `${CONDITION_LABELS[det.condition]} — ${severityLabel(det.severity)}`,
                      left: rect.left - container.left + r,
                      top: rect.top - container.top - 28,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            }
            if (det.type === "zone" && det.x1 !== undefined) {
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: det.x1 * scale.x,
                    top: det.y1! * scale.y,
                    width: (det.x2! - det.x1) * scale.x,
                    height: (det.y2! - det.y1!) * scale.y,
                    opacity: 0,
                    cursor: "crosshair",
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const container =
                      containerRef.current!.getBoundingClientRect();
                    setTooltip({
                      text: `${CONDITION_LABELS[det.condition]} — ${severityLabel(det.severity)}`,
                      left: rect.left - container.left + (rect.width / 2),
                      top: rect.top - container.top - 28,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            }
            return null;
          })}

        {tooltip && (
          <div
            className="absolute z-50 px-2 py-1 rounded bg-slate-800 text-white text-[11px] pointer-events-none shadow-lg whitespace-nowrap"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.text}
          </div>
        )}

        <p className="text-center text-[11px] py-2 text-on-surface-variant bg-slate-900/60">
          {angleLabel}
        </p>
      </div>

      {presentConditions.length > 0 && (
        <div className="flex gap-3 flex-wrap px-1">
          {presentConditions.map((condition) => (
            <span
              key={condition}
              className="flex items-center gap-1 text-[11px] text-on-surface-variant"
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CONDITION_COLORS[condition] }}
              />
              {CONDITION_LABELS[condition]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
