/**
 * Face Detection Overlay Component
 * Visual feedback for face alignment and capture readiness
 */

import React from "react";
import type { FaceDetectionResult, BoundingBox } from "../types/FaceDetection";

interface FaceDetectionOverlayProps {
  result: FaceDetectionResult | null;
  containerWidth: number;
  containerHeight: number;
  visible?: boolean;
}

const FaceDetectionOverlay: React.FC<FaceDetectionOverlayProps> = ({
  result,
  containerWidth,
  containerHeight,
  visible = true,
}) => {
  if (!visible) {
    return null;
  }

  // Get severity color for guidance
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error":
        return "#ef4444";
      case "warning":
        return "#eab308";
      case "info":
        return "#3b82f6";
      case "success":
        return "#22c55e";
      default:
        return "#6b7280";
    }
  };

  // Convert percentage coordinates to pixel coordinates
  const getBoundingBoxPixels = (box: BoundingBox) => {
    return {
      x: (box.x / 100) * containerWidth,
      y: (box.y / 100) * containerHeight,
      width: (box.width / 100) * containerWidth,
      height: (box.height / 100) * containerHeight,
    };
  };

  const guidanceColor = result ? getSeverityColor(result.guidance.severity) : "#6b7280";
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;
  const boundingBox = result ? getBoundingBoxPixels(result.boundingBox) : null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg width={containerWidth} height={containerHeight} className="absolute">
        {/* Center crosshair guide — always visible */}
        <line x1={centerX - 20} y1={centerY} x2={centerX + 20} y2={centerY} stroke={guidanceColor} strokeWidth="2" opacity="0.6" />
        <line x1={centerX} y1={centerY - 20} x2={centerX} y2={centerY + 20} stroke={guidanceColor} strokeWidth="2" opacity="0.6" />

        {/* Safe zone rectangle — always visible */}
        <rect
          x={centerX - containerWidth * 0.35}
          y={centerY - containerHeight * 0.35}
          width={containerWidth * 0.7}
          height={containerHeight * 0.7}
          fill="none"
          stroke={guidanceColor}
          strokeWidth="1"
          strokeDasharray="5,5"
          opacity="0.4"
        />

        {/* Face bounding box — only when detected */}
        {result?.detected && boundingBox && (
          <rect
            x={boundingBox.x}
            y={boundingBox.y}
            width={boundingBox.width}
            height={boundingBox.height}
            fill="none"
            stroke={guidanceColor}
            strokeWidth="3"
            rx="8"
          />
        )}

        {/* Alignment corner markers — only when detected */}
        {result?.detected && boundingBox && (
          <>
            <line x1={boundingBox.x} y1={boundingBox.y} x2={boundingBox.x + 15} y2={boundingBox.y} stroke={guidanceColor} strokeWidth="3" />
            <line x1={boundingBox.x} y1={boundingBox.y} x2={boundingBox.x} y2={boundingBox.y + 15} stroke={guidanceColor} strokeWidth="3" />
            <line x1={boundingBox.x + boundingBox.width} y1={boundingBox.y} x2={boundingBox.x + boundingBox.width - 15} y2={boundingBox.y} stroke={guidanceColor} strokeWidth="3" />
            <line x1={boundingBox.x + boundingBox.width} y1={boundingBox.y} x2={boundingBox.x + boundingBox.width} y2={boundingBox.y + 15} stroke={guidanceColor} strokeWidth="3" />
            <line x1={boundingBox.x} y1={boundingBox.y + boundingBox.height} x2={boundingBox.x + 15} y2={boundingBox.y + boundingBox.height} stroke={guidanceColor} strokeWidth="3" />
            <line x1={boundingBox.x} y1={boundingBox.y + boundingBox.height} x2={boundingBox.x} y2={boundingBox.y + boundingBox.height - 15} stroke={guidanceColor} strokeWidth="3" />
            <line x1={boundingBox.x + boundingBox.width} y1={boundingBox.y + boundingBox.height} x2={boundingBox.x + boundingBox.width - 15} y2={boundingBox.y + boundingBox.height} stroke={guidanceColor} strokeWidth="3" />
            <line x1={boundingBox.x + boundingBox.width} y1={boundingBox.y + boundingBox.height} x2={boundingBox.x + boundingBox.width} y2={boundingBox.y + boundingBox.height - 15} stroke={guidanceColor} strokeWidth="3" />
          </>
        )}
      </svg>

      {/* Compact guidance pill at bottom */}
      <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-1.5">
        {result ? (
          <>
            {/* Brightness strip */}
            <div className="flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
              <span className="text-[10px] text-gray-400">☀</span>
              <div className="w-20 bg-gray-700 rounded-full h-1 overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    result.brightness < 30 || result.brightness > 100
                      ? "bg-red-500"
                      : result.brightness < 40 || result.brightness > 95
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(result.brightness, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400">{result.brightness}%</span>
            </div>

            {/* Guidance pill */}
            <div
              className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                result.guidance.severity === "error"
                  ? "bg-red-500/70 text-white"
                  : result.guidance.severity === "warning"
                    ? "bg-yellow-500/70 text-white"
                    : result.guidance.severity === "success"
                      ? "bg-green-500/70 text-white"
                      : "bg-black/60 text-gray-200"
              }`}
            >
              {result.guidance.isOptimal && <span className="mr-1">✓</span>}
              {result.guidance.text}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
            <div className="w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-gray-400">Initializing…</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceDetectionOverlay;
