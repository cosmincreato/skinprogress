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
  if (!visible || !result) {
    return null;
  }

  // Get severity color for guidance
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error":
        return "#ef4444"; // red-500
      case "warning":
        return "#eab308"; // yellow-500
      case "info":
        return "#3b82f6"; // blue-500
      case "success":
        return "#22c55e"; // green-500
      default:
        return "#6b7280"; // gray-500
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

  const boundingBox = getBoundingBoxPixels(result.boundingBox);
  const guidanceColor = getSeverityColor(result.guidance.severity);
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg width={containerWidth} height={containerHeight} className="absolute">
        {/* Center crosshair guide */}
        <line
          x1={centerX - 20}
          y1={centerY}
          x2={centerX + 20}
          y2={centerY}
          stroke={guidanceColor}
          strokeWidth="2"
          opacity="0.6"
        />
        <line
          x1={centerX}
          y1={centerY - 20}
          x2={centerX}
          y2={centerY + 20}
          stroke={guidanceColor}
          strokeWidth="2"
          opacity="0.6"
        />

        {/* Safe zone rectangle (centered, 70% of screen) */}
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

        {/* Face bounding box */}
        {result.detected && (
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

        {/* Alignment corner markers when face detected */}
        {result.detected && (
          <>
            {/* Top-left corner */}
            <line
              x1={boundingBox.x}
              y1={boundingBox.y}
              x2={boundingBox.x + 15}
              y2={boundingBox.y}
              stroke={guidanceColor}
              strokeWidth="3"
            />
            <line
              x1={boundingBox.x}
              y1={boundingBox.y}
              x2={boundingBox.x}
              y2={boundingBox.y + 15}
              stroke={guidanceColor}
              strokeWidth="3"
            />

            {/* Top-right corner */}
            <line
              x1={boundingBox.x + boundingBox.width}
              y1={boundingBox.y}
              x2={boundingBox.x + boundingBox.width - 15}
              y2={boundingBox.y}
              stroke={guidanceColor}
              strokeWidth="3"
            />
            <line
              x1={boundingBox.x + boundingBox.width}
              y1={boundingBox.y}
              x2={boundingBox.x + boundingBox.width}
              y2={boundingBox.y + 15}
              stroke={guidanceColor}
              strokeWidth="3"
            />

            {/* Bottom-left corner */}
            <line
              x1={boundingBox.x}
              y1={boundingBox.y + boundingBox.height}
              x2={boundingBox.x + 15}
              y2={boundingBox.y + boundingBox.height}
              stroke={guidanceColor}
              strokeWidth="3"
            />
            <line
              x1={boundingBox.x}
              y1={boundingBox.y + boundingBox.height}
              x2={boundingBox.x}
              y2={boundingBox.y + boundingBox.height - 15}
              stroke={guidanceColor}
              strokeWidth="3"
            />

            {/* Bottom-right corner */}
            <line
              x1={boundingBox.x + boundingBox.width}
              y1={boundingBox.y + boundingBox.height}
              x2={boundingBox.x + boundingBox.width - 15}
              y2={boundingBox.y + boundingBox.height}
              stroke={guidanceColor}
              strokeWidth="3"
            />
            <line
              x1={boundingBox.x + boundingBox.width}
              y1={boundingBox.y + boundingBox.height}
              x2={boundingBox.x + boundingBox.width}
              y2={boundingBox.y + boundingBox.height - 15}
              stroke={guidanceColor}
              strokeWidth="3"
            />
          </>
        )}
      </svg>

      {/* Guidance message and status */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50">
        {/* Brightness indicator */}
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-300">
              Brightness
            </span>
            <span className="text-xs text-gray-400">{result.brightness}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
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
        </div>

        {/* Confidence and face count */}
        <div className="mb-3 flex justify-between">
          {result.faceCount > 0 && (
            <span className="text-xs text-gray-300">
              Confidence:{" "}
              <span
                className={
                  result.confidence > 0.9 ? "text-green-400" : "text-yellow-400"
                }
              >
                {(result.confidence * 100).toFixed(0)}%
              </span>
            </span>
          )}
          {result.faceCount > 1 && (
            <span className="text-xs text-red-400">
              Faces: {result.faceCount}
            </span>
          )}
        </div>

        {/* Guidance message */}
        <div
          className={`px-4 py-2 rounded-lg text-center font-medium text-sm ${
            result.guidance.severity === "error"
              ? "bg-red-500 bg-opacity-20 text-red-200"
              : result.guidance.severity === "warning"
                ? "bg-yellow-500 bg-opacity-20 text-yellow-200"
                : result.guidance.severity === "success"
                  ? "bg-green-500 bg-opacity-20 text-green-200"
                  : "bg-blue-500 bg-opacity-20 text-blue-200"
          }`}
        >
          {result.guidance.text}
        </div>

        {/* Capture-ready indicator */}
        {result.guidance.isOptimal && (
          <div className="mt-3 flex justify-center">
            <div className="animate-pulse flex items-center gap-2 text-green-400 text-sm font-semibold">
              <span className="inline-block w-2 h-2 bg-green-400 rounded-full"></span>
              Ready to capture
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceDetectionOverlay;
