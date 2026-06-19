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

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-skin-border"
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={`${angleLabel} heatmap`}
          className="w-full aspect-[4/3] object-cover block"
          onLoad={updateScale}
        />

        {scale &&
          detections.map((det, i) => {
            if (det.type === "spot" && det.x !== undefined && det.y !== undefined) {
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
            className="absolute z-50 px-2 py-1 rounded bg-on-surface text-surface text-[11px] pointer-events-none shadow-lg whitespace-nowrap"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.text}
          </div>
        )}

        <p className="absolute bottom-0 inset-x-0 text-center text-[11px] py-1.5 text-white bg-black/30">
          {angleLabel}
        </p>
      </div>
    </div>
  );
}
