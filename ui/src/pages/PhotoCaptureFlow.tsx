/**
 * Photo Capture Flow Page
 * Multi-view photo capture with face detection guidance
 * Captures front, left, and right photos of user
 */

import React, { useRef, useState } from "react";
import SelfieCamera from "../components/SelfieCamera";
import type { SelfieCameraHandle } from "../components/SelfieCamera";
import { photoService } from "../services/photoService";
import type { FaceDetectionResult, ViewType } from "../types/FaceDetection";

interface CaptureFrame {
  viewType: ViewType;
  dataUrl: string;
  faceDetectionResult: FaceDetectionResult;
  timestamp: Date;
}

type CaptureStatus =
  | "initial"
  | "front_ready"
  | "front_captured"
  | "left_ready"
  | "left_captured"
  | "right_ready"
  | "right_captured"
  | "completed"
  | "uploading"
  | "success"
  | "error";

export const PhotoCaptureFlow: React.FC = () => {
  const camerRef = useRef<SelfieCameraHandle>(null);
  const [status, setStatus] = useState<CaptureStatus>("front_ready");
  const [captures, setCapturesState] = useState<Map<ViewType, CaptureFrame>>(
    new Map(),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Current view being captured
  const currentView: ViewType = status.includes("front")
    ? "front"
    : status.includes("left")
      ? "left"
      : "right";

  // Get display name for view
  const getViewLabel = (view: ViewType) => {
    const labels: Record<ViewType, string> = {
      front: "Straight ahead",
      left: "Left profile",
      right: "Right profile",
    };
    return labels[view];
  };

  // Calculate progress
  const progressPercent = Math.round((captures.size / 3) * 100);

  // Handle photo capture
  const handleCapture = (
    imageDataUrl: string,
    faceDetection?: FaceDetectionResult,
  ) => {
    if (!imageDataUrl || !faceDetection) {
      setUploadError("Photo quality validation failed. Please try again.");
      return;
    }

    const newCaptures = new Map(captures);
    newCaptures.set(currentView, {
      viewType: currentView,
      dataUrl: imageDataUrl,
      faceDetectionResult: faceDetection,
      timestamp: new Date(),
    });
    setCapturesState(newCaptures);

    // Advance to next view or complete
    if (currentView === "front") {
      setStatus("left_ready");
    } else if (currentView === "left") {
      setStatus("right_ready");
    } else if (currentView === "right") {
      setStatus("completed");
    }
  };

  // Reset current capture
  const handleResync = () => {
    if (camerRef.current) {
      camerRef.current.resetCapture();
    }

    // Reset to appropriate state
    if (status.includes("front")) {
      setStatus("front_ready");
    } else if (status.includes("left")) {
      setStatus("left_ready");
    } else if (status.includes("right")) {
      setStatus("right_ready");
    }
  };

  // Go back to previous capture
  const handleGoBack = () => {
    const newCapturesMap = new Map(captures);

    if (status.includes("right")) {
      newCapturesMap.delete("right");
      setCapturesState(newCapturesMap);
      setStatus("left_captured");
    } else if (status.includes("left")) {
      newCapturesMap.delete("left");
      setCapturesState(newCapturesMap);
      setStatus("front_captured");
    }

    if (camerRef.current) {
      camerRef.current.resetCapture();
    }
  };

  // Upload all captures to backend
  const handleUpload = async () => {
    if (captures.size !== 3) {
      setUploadError("All three photos are required");
      return;
    }

    setStatus("uploading");
    setUploadProgress(0);
    setUploadError(null);

    try {
      // Upload each photo
      const allCaptures = Array.from(captures.values());

      for (let i = 0; i < allCaptures.length; i++) {
        const capture = allCaptures[i];
        setUploadProgress(
          Math.round(((i + 1) / (allCaptures.length + 1)) * 100),
        );

        // Upload with proper backend DTO format
        await photoService.uploadPhoto(
          capture.viewType,
          capture.dataUrl,
          capture.faceDetectionResult,
        );
      }

      setUploadProgress(100);
      setStatus("success");

      // Clear captures for next batch
      setTimeout(() => {
        setCapturesState(new Map());
        setUploadProgress(0);
        setStatus("front_ready");
        if (camerRef.current) {
          camerRef.current.resetCapture();
        }
      }, 2000);
    } catch (err) {
      setStatus("error");
      const errorMessage =
        err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadError(errorMessage);
    }
  };

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Photos Uploaded Successfully!
          </h2>
          <p className="text-gray-300 mb-6">
            Your skin progress has been captured and saved.
          </p>
          <p className="text-sm text-gray-400">Preparing for next capture...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Capture Your Progress
          </h1>
          <p className="text-gray-300">
            Three angles for accurate skin analysis
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8 bg-slate-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium text-gray-300">Progress</span>
            <span className="text-sm font-semibold text-blue-400">
              {captures.size}/3 photos
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* View Instructions */}
        <div className="mb-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">
                {getViewLabel(currentView)}
              </h3>
              <p className="text-sm text-gray-400">
                {currentView === "front" &&
                  "Position yourself straight in front of the camera. Your entire face should be visible."}
                {currentView === "left" &&
                  "Turn your head to the left. Show your left profile clearly."}
                {currentView === "right" &&
                  "Turn your head to the right. Show your right profile clearly."}
              </p>
            </div>
            <div className="text-3xl font-bold text-blue-400">
              {captures.size + 1}/3
            </div>
          </div>
        </div>

        {/* Camera */}
        <div className="mb-8">
          {status !== "uploading" && status !== "error" && (
            <SelfieCamera
              ref={camerRef}
              onCapture={handleCapture}
              enableFaceDetection={true}
            />
          )}

          {status === "uploading" && (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-12 text-center">
              <div className="mb-4">
                <div className="inline-block">
                  <svg
                    className="w-12 h-12 text-blue-400 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-lg font-semibold text-white mb-4">
                Uploading {captures.size > 0 ? `${captures.size}/3` : "photos"}
                ...
              </p>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-400 mt-4">
                {uploadProgress}% complete
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
              <div className="mb-4 flex justify-center">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-lg font-semibold text-red-300 mb-2">
                Upload Failed
              </p>
              <p className="text-red-200 mb-6">{uploadError}</p>
              <button
                onClick={() => {
                  setUploadError(null);
                  if (status.includes("right")) {
                    setStatus("right_ready");
                  } else if (status.includes("left")) {
                    setStatus("left_ready");
                  } else {
                    setStatus("front_ready");
                  }
                }}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Captured Photos Review */}
        {captures.size > 0 && (
          <div className="mb-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              Captured Photos
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {(["front", "left", "right"] as const).map((view) => (
                <div key={view} className="relative">
                  {captures.has(view) ? (
                    <>
                      <img
                        src={captures.get(view)!.dataUrl}
                        alt={view}
                        className="w-full aspect-square object-cover rounded-lg border-2 border-green-500/50"
                      />
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                        ✓
                      </div>
                    </>
                  ) : (
                    <div className="w-full aspect-square bg-slate-700 rounded-lg border-2 border-slate-600 flex items-center justify-center">
                      <span className="text-xs text-slate-500 text-center px-2">
                        {view === "front"
                          ? "Front"
                          : view === "left"
                            ? "Left"
                            : "Right"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          {status.includes("captured") && status !== "completed" && (
            <button
              onClick={handleGoBack}
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              Back
            </button>
          )}

          {status.includes("ready") && !status.includes("uploading") && (
            <button
              onClick={handleResync}
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              Retake
            </button>
          )}

          {status === "completed" && (
            <button
              onClick={handleUpload}
              disabled={uploadError !== null}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload All Photos
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoCaptureFlow;
