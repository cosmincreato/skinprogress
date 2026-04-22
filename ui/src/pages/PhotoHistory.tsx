/**
 * Photo History Page
 * Display and manage captured photo sessions
 */

import React, { useEffect, useState } from "react";
import { photoService } from "../services/photoService";
import type {
  PhotoCaptureSession,
  StorageQuotaInfo,
} from "../services/photoService";

export const PhotoHistory: React.FC = () => {
  const [sessions, setSessions] = useState<PhotoCaptureSession[]>([]);
  const [quota, setQuota] = useState<StorageQuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // Load photo history and quota
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsData, quotaData] = await Promise.all([
        photoService.getPhotoHistory(90),
        photoService.getStorageQuota(),
      ]);
      setSessions(sessionsData);
      setQuota(quotaData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load photo history";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Delete a photo
  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm("Delete this photo?")) return;

    setDeletingPhotoId(photoId);
    try {
      await photoService.deletePhoto(photoId);
      // Reload data
      await loadData();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete photo";
      setError(errorMessage);
    } finally {
      setDeletingPhotoId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6V4m6 2a8 8 0 11-16 0 8 8 0 0116 0zm0 0a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
          <p className="text-gray-300">Loading your photos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Your Skin Progress
          </h1>
          <p className="text-gray-300">
            Track your journey with saved photo sessions
          </p>
        </div>

        {/* Storage Quota */}
        {quota && (
          <div className="mb-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-medium text-gray-300">
                Storage Used
              </span>
              <span className="text-sm font-semibold text-blue-400">
                {quota.usedFormatted} / {quota.totalFormatted}
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  quota.percentUsed > 90
                    ? "bg-red-500"
                    : quota.percentUsed > 70
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${quota.percentUsed}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {quota.percentUsed.toFixed(1)}% full - {quota.availableFormatted}{" "}
              remaining
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-200">{error}</p>
            <button
              onClick={loadData}
              className="mt-3 text-sm text-red-300 hover:text-red-200 font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {/* No Sessions */}
        {sessions.length === 0 && !error && (
          <div className="bg-slate-800 rounded-lg p-12 text-center border border-slate-700">
            <div className="mb-4 flex justify-center">
              <svg
                className="w-16 h-16 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">
              No photos yet
            </h3>
            <p className="text-gray-400 mb-6">
              Start capturing your skin progress to see sessions here
            </p>
            <a
              href="/capture"
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Capture Now
            </a>
          </div>
        )}

        {/* Sessions List */}
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden"
            >
              {/* Session Header */}
              <button
                onClick={() =>
                  setExpandedSession(
                    expandedSession === session.sessionId
                      ? null
                      : session.sessionId,
                  )
                }
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-white">
                    {new Date(session.captureDate).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {session.photos.length} photo
                    {session.photos.length !== 1 ? "s" : ""}
                    {session.status === "complete" && (
                      <span className="ml-2 inline-block px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded">
                        Complete
                      </span>
                    )}
                    {session.status === "partial" && (
                      <span className="ml-2 inline-block px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded">
                        Partial
                      </span>
                    )}
                  </p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedSession === session.sessionId ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </button>

              {/* Session Details */}
              {expandedSession === session.sessionId && (
                <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {session.photos.map((photo) => (
                      <div
                        key={photo.photoId}
                        className="relative group rounded-lg overflow-hidden bg-slate-700"
                      >
                        <img
                          src={photo.url}
                          alt={photo.viewType}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                          <p className="text-white font-semibold capitalize mb-3">
                            {photo.viewType}
                          </p>
                          <button
                            onClick={() => handleDeletePhoto(photo.photoId)}
                            disabled={deletingPhotoId === photo.photoId}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-500 text-white text-sm font-medium rounded transition-colors"
                          >
                            {deletingPhotoId === photo.photoId
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                        <div className="absolute top-2 left-2 px-2 py-1 bg-slate-900/80 rounded text-xs text-gray-300 capitalize">
                          {photo.viewType}
                        </div>
                        {photo.brightness && (
                          <div className="absolute bottom-2 right-2 text-xs text-gray-300 bg-slate-900/80 px-2 py-1 rounded">
                            {Math.round(photo.brightness)}% bright
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Session Actions */}
                  <div className="mt-4 pt-4 border-t border-slate-700 flex gap-2">
                    <a
                      href={`/compare?session=${session.sessionId}`}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors text-center"
                    >
                      Compare with Previous
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PhotoHistory;
