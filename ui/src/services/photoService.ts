/**
 * Photo Service
 * HTTP client for backend photo API endpoints
 */

import axios from "axios";
import type { AxiosInstance, AxiosError } from "axios";
import type { FaceDetectionResult } from "../types/FaceDetection";

// API Request/Response types - Must match backend PhotoUploadRequestDto
export interface PhotoUploadRequest {
  /** Base64-encoded JPEG image data (converted from data URL by service) */
  ImageDataBase64: string;
  /** Camera view type: "front", "left", or "right" */
  ViewType: "front" | "left" | "right";
  /** Capture date in yyyy-MM-dd format */
  CaptureDate: string;
  /** Face detection confidence (0.0-1.0) */
  FaceDetectionConfidence: number;
  /** Number of faces detected */
  FaceCount: number;
  /** Device model (optional) */
  DeviceModel?: string;
  /** Image orientation (optional) */
  Orientation?: string;
  /** Image brightness as percentage (0-100) */
  Brightness: number;
  /** Full EXIF data as JSON string (optional) */
  ExifRaw?: string;
}

export interface PhotoUploadResponse {
  success: boolean;
  photoId: string;
  captureId: string;
  sessionId: string;
  fileSize: number;
  url: string;
  message: string;
}

export interface PhotoHistoryItem {
  photoId: string;
  viewType: "front" | "left" | "right";
  url: string;
  captureDate: string;
  fileSize: number;
  brightness?: number;
  faceConfidence?: number;
}

export interface PhotoCaptureSession {
  sessionId: string;
  captureDate: string;
  status: "complete" | "partial";
  photos: PhotoHistoryItem[];
}

export interface PhotoHistoryResponse {
  success: boolean;
  totalSessions: number;
  sessions: PhotoCaptureSession[];
}

export interface StorageQuotaInfo {
  used: number;
  usedFormatted: string;
  available: number;
  availableFormatted: string;
  total: number;
  totalFormatted: string;
  percentUsed: number;
}

export interface PhotoHealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export class PhotoService {
  private client: AxiosInstance;

  constructor(baseURL: string = "/api") {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add auth token to requests if available
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle errors globally
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired - clear auth
          localStorage.removeItem("authToken");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Upload a photo to the server.
   * Converts data URL to base64 and formats payload to match backend DTO.
   * @param viewType View angle: "front" | "left" | "right"
   * @param imageDataUrl Data URL from canvas.toDataURL()
   * @param faceDetection Face detection result with confidence and brightness
   * @returns Upload response with photoId and location
   */
  async uploadPhoto(
    viewType: "front" | "left" | "right",
    imageDataUrl: string,
    faceDetection: FaceDetectionResult
  ): Promise<PhotoUploadResponse> {
    try {
      // Convert data URL to base64 (remove data:image/jpeg;base64, prefix)
      const base64Data = imageDataUrl.split(",")[1] || imageDataUrl;

      // Get today's date in yyyy-MM-dd format
      const today = new Date();
      const captureDate = today.toISOString().split("T")[0];

      // Build request matching backend PhotoUploadRequestDto
      const request: PhotoUploadRequest = {
        ImageDataBase64: base64Data,
        ViewType: viewType,
        CaptureDate: captureDate,
        FaceDetectionConfidence: faceDetection.confidence,
        FaceCount: faceDetection.faceCount,
        Brightness: faceDetection.brightness,
        DeviceModel: navigator.userAgent.substring(0, 200), // Optional: device info
        // Orientation and ExifRaw would be extracted from actual EXIF data in real app
      };

      const response = await this.client.post<PhotoUploadResponse>(
        "/photos/capture",
        request
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error, "Photo upload failed");
    }
  }

  /**
   * Get photo history for the current user.
   * @param days How many days of history to retrieve (default: 30)
   * @returns Array of photo capture sessions
   */
  async getPhotoHistory(days: number = 30): Promise<PhotoCaptureSession[]> {
    try {
      const response = await this.client.get<PhotoHistoryResponse>(
        "/photos/history",
        {
          params: { days },
        }
      );
      return response.data.sessions;
    } catch (error) {
      throw this.handleError(error, "Failed to load photo history");
    }
  }

  /**
   * Get current storage quota information.
   * @returns Storage quota details
   */
  async getStorageQuota(): Promise<StorageQuotaInfo> {
    try {
      const response = await this.client.get<StorageQuotaInfo>("/photos/quota");
      return response.data;
    } catch (error) {
      throw this.handleError(error, "Failed to load storage quota");
    }
  }

  /**
   * Delete a photo and reclaim storage quota.
   * @param photoId ID of the photo to delete
   */
  async deletePhoto(photoId: string): Promise<void> {
    try {
      await this.client.delete(`/photos/${photoId}`);
    } catch (error) {
      throw this.handleError(error, "Failed to delete photo");
    }
  }

  /**
   * Get photo by ID.
   * @param photoId ID of the photo
   * @returns Photo data
   */
  async getPhoto(
    photoId: string
  ): Promise<{ url: string; metadata: Record<string, unknown> }> {
    try {
      const response = await this.client.get(`/photos/${photoId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to load photo ${photoId}`);
    }
  }

  /**
   * Check health of photo service.
   * @returns Health status
   */
  async healthCheck(): Promise<PhotoHealthResponse> {
    try {
      const response = await this.client.get<PhotoHealthResponse>(
        "/photos/health"
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error, "Health check failed");
    }
  }

  /**
   * Convert image file to data URL for upload.
   * @param file Image file to convert
   * @returns Promise resolving to data URL
   */
  static fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert canvas to blob and then data URL.
   * @param canvas Canvas element to convert
   * @param quality JPEG quality (0-1)
   * @returns Promise resolving to data URL
   */
  static canvasToDataUrl(canvas: HTMLCanvasElement, quality: number = 0.85): string {
    return canvas.toDataURL("image/jpeg", quality);
  }

  /**
   * Convert canvas to blob.
   * @param canvas Canvas element to convert
   * @param type MIME type (default: image/jpeg)
   * @param quality JPEG quality (0-1, default: 0.85)
   * @returns Promise resolving to blob
   */
  static canvasToBlob(
    canvas: HTMLCanvasElement,
    type: string = "image/jpeg",
    quality: number = 0.85
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas to blob conversion failed"));
        },
        type,
        quality
      );
    });
  }

  /**
   * Estimate if image file is too large.
   * @param file File to check
   * @param maxSizeMB Maximum size in MB (default: 5)
   * @returns true if file exceeds max size
   */
  static isFileTooLarge(file: File, maxSizeMB: number = 5): boolean {
    return file.size > maxSizeMB * 1024 * 1024;
  }

  /**
   * Handle and format API errors.
   */
  private handleError(error: unknown, defaultMessage: string): Error {
    if (axios.isAxiosError(error)) {
      // Extract error message from response
      const data = error.response?.data as Record<string, unknown>;
      const message = data?.message || data?.error || defaultMessage;
      const status = error.response?.status;

      let errorMessage = `${message}`;
      if (status) {
        errorMessage += ` (${status})`;
      }

      const err = new Error(errorMessage);
      (err as any).status = status;
      (err as any).originalError = error;
      return err;
    }

    return new Error(defaultMessage);
  }
}

// Export singleton instance
export const photoService = new PhotoService("/api");
