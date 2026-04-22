/**
 * Face Detection Service
 * Real-time face detection using face-api.js with guidance system
 */

import * as faceapi from "@vladmandic/face-api";
import type {
  FaceDetectionResult,
  GuidanceMessage,
  BoundingBox,
  CaptureConstraints,
  AlignmentCheckResult,
} from "../types/FaceDetection";

// Default constraints for single-face selfie capture
const DEFAULT_CONSTRAINTS: CaptureConstraints = {
  MIN_BRIGHTNESS: 30,
  MAX_BRIGHTNESS: 100,
  MIN_FACE_CONFIDENCE: 0.8,
  MAX_FACE_COUNT: 1,
  CENTER_TOLERANCE: 0.15,
};

export class FaceDetectionService {
  private modelsLoaded = false;
  private constraints: CaptureConstraints;

  constructor(constraints: Partial<CaptureConstraints> = {}) {
    this.constraints = { ...DEFAULT_CONSTRAINTS, ...constraints };
  }

  /**
   * Initialize face detection models.
   * Must be called once before any detection.
   */
  async initialize(): Promise<void> {
    if (this.modelsLoaded) return;

    try {
      const MODEL_URL = "/models/";

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      this.modelsLoaded = true;
      console.log("Face detection models loaded successfully");
    } catch (error) {
      console.error("Failed to load face detection models:", error);
      throw new Error("Could not load face detection models");
    }
  }

  /**
   * Detect faces in video frame and provide guidance.
   */
  async detectFaces(video: HTMLVideoElement): Promise<FaceDetectionResult> {
    if (!this.modelsLoaded) {
      throw new Error("Face detection models not initialized");
    }

    try {
      // Detect faces with landmarks
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (!detections || detections.length === 0) {
        return {
          detected: false,
          confidence: 0,
          faceCount: 0,
          guidance: {
            text: "No face detected. Please look at the camera.",
            severity: "warning",
            isOptimal: false,
          },
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          brightness: this.estimateVideoFrameBrightness(video),
        };
      }

      // Check if too many faces
      if (detections.length > this.constraints.MAX_FACE_COUNT) {
        return {
          detected: true,
          confidence: detections[0].detection.score,
          faceCount: detections.length,
          guidance: {
            text: `Multiple faces detected (${detections.length}). Only one person per photo.`,
            severity: "error",
            isOptimal: false,
          },
          boundingBox: this.getBoundingBox(
            detections[0],
            video.videoWidth,
            video.videoHeight
          ),
          brightness: this.estimateVideoFrameBrightness(video),
        };
      }

      const detection = detections[0];
      const confidence = detection.detection.score;

      // Check confidence threshold
      if (confidence < this.constraints.MIN_FACE_CONFIDENCE) {
        return {
          detected: true,
          confidence,
          faceCount: 1,
          guidance: {
            text: `Face quality too low (${(confidence * 100).toFixed(0)}%). Move closer or improve lighting.`,
            severity: "warning",
            isOptimal: false,
          },
          boundingBox: this.getBoundingBox(
            detection,
            video.videoWidth,
            video.videoHeight
          ),
          brightness: this.estimateVideoFrameBrightness(video),
        };
      }

      // Check alignment and brightness
      const alignment = this.checkAlignment(
        detection,
        video.videoWidth,
        video.videoHeight
      );
      const brightness = this.estimateVideoFrameBrightness(video);

      // Generate guidance based on alignment and lighting
      const guidance = this.generateGuidance(alignment, brightness);

      return {
        detected: true,
        confidence,
        faceCount: 1,
        guidance,
        boundingBox: this.getBoundingBox(
          detection,
          video.videoWidth,
          video.videoHeight
        ),
        brightness,
      };
    } catch (error) {
      console.error("Face detection error:", error);
      return {
        detected: false,
        confidence: 0,
        faceCount: 0,
        guidance: {
          text: "Face detection error. Check camera permissions.",
          severity: "error",
          isOptimal: false,
        },
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        brightness: 0,
      };
    }
  }

  /**
   * Extract bounding box from detection result.
   */
  private getBoundingBox(
    detection: faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<{}>>,
    videoWidth: number,
    videoHeight: number
  ): BoundingBox {
    const { x, y, width, height } = detection.detection.box;
    return {
      x: (x / videoWidth) * 100,
      y: (y / videoHeight) * 100,
      width: (width / videoWidth) * 100,
      height: (height / videoHeight) * 100,
    };
  }

  /**
   * Check face alignment (forehead centered, eyes level, face centered).
   */
  private checkAlignment(
    detection: faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<{}>>,
    videoWidth: number,
    videoHeight: number
  ): AlignmentCheckResult {
    const landmarks = detection.landmarks.positions;

    // Get key points
    const leftEye = landmarks[36]; // Left eye outer corner
    const rightEye = landmarks[45]; // Right eye outer corner
    const nose = landmarks[30]; // Nose tip

    // Face center
    const faceBox = detection.detection.box;
    const faceCenterX = faceBox.x + faceBox.width / 2;
    const faceCenterY = faceBox.y + faceBox.height / 2;

    // Video center
    const videoCenterX = videoWidth / 2;
    const videoCenterY = videoHeight / 2;

    // Calculate offsets (-1.0 to 1.0)
    const xOffset = (faceCenterX - videoCenterX) / (videoWidth / 2);
    const yOffset = (faceCenterY - videoCenterY) / (videoHeight / 2);

    // Check if face is centered (tolerance 15%)
    const isFaceInCenter =
      Math.abs(xOffset) < 0.15 && Math.abs(yOffset) < 0.15;

    // Check if eyes are level (y distance < threshold relative to face width)
    const eyeHeightDiff = Math.abs(leftEye.y - rightEye.y);
    const isEyeHeightCorrect =
      eyeHeightDiff < faceBox.width * 0.1; // Eyes within 10% of face width

    // Check if forehead is centered (nose roughly aligned with video center)
    const noseOffsetX = (nose.x - videoCenterX) / (videoWidth / 2);
    const isForeheadCentered = Math.abs(noseOffsetX) < 0.15;

    // Estimate distance from face size
    const faceWidthPercent = (faceBox.width / videoWidth) * 100;
    let distanceFromCamera: "too_close" | "optimal" | "too_far";
    if (faceWidthPercent > 70) {
      distanceFromCamera = "too_close";
    } else if (faceWidthPercent < 30) {
      distanceFromCamera = "too_far";
    } else {
      distanceFromCamera = "optimal";
    }

    return {
      isForeheadCentered,
      isEyeHeightCorrect,
      isFaceInCenter,
      xOffset,
      yOffset,
      distanceFromCamera,
    };
  }

  /**
   * Generate user guidance based on alignment and brightness.
   */
  private generateGuidance(
    alignment: AlignmentCheckResult,
    brightness: number
  ): GuidanceMessage {
    // Check brightness first
    if (brightness < this.constraints.MIN_BRIGHTNESS) {
      return {
        text: `Lighting too low (${Math.round(brightness)}%). Move to a brighter area.`,
        severity: "warning",
        isOptimal: false,
      };
    }

    if (brightness > this.constraints.MAX_BRIGHTNESS) {
      return {
        text: `Lighting too bright. Reduce direct light.`,
        severity: "warning",
        isOptimal: false,
      };
    }

    // Check alignment issues
    if (alignment.distanceFromCamera === "too_close") {
      return {
        text: "Too close. Move back a bit.",
        severity: "warning",
        isOptimal: false,
      };
    }

    if (alignment.distanceFromCamera === "too_far") {
      return {
        text: "Too far. Move closer to camera.",
        severity: "warning",
        isOptimal: false,
      };
    }

    if (!alignment.isFaceInCenter) {
      if (Math.abs(alignment.xOffset) > Math.abs(alignment.yOffset)) {
        return {
          text: alignment.xOffset > 0 ? "Move left" : "Move right",
          severity: "info",
          isOptimal: false,
        };
      } else {
        return {
          text: alignment.yOffset > 0 ? "Move up" : "Move down",
          severity: "info",
          isOptimal: false,
        };
      }
    }

    if (!alignment.isEyeHeightCorrect) {
      return {
        text: "Straighten your head",
        severity: "info",
        isOptimal: false,
      };
    }

    // All checks passed
    return {
      text: "Perfect! Tap to capture.",
      severity: "success",
      isOptimal: true,
    };
  }

  /**
   * Estimate image brightness from video frame.
   * Returns 0-100 percentage.
   */
  private estimateVideoFrameBrightness(video: HTMLVideoElement): number {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return 50; // Default if context unavailable

    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    const data = imageData.data;

    let totalBrightness = 0;
    // Sample every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Calculate relative luminance
      totalBrightness += (r + g + b) / 3;
    }

    const avgBrightness = totalBrightness / (data.length / 16);
    return Math.min(100, Math.round((avgBrightness / 255) * 100));
  }

  /**
   * Update constraints (e.g., require higher confidence for front photo).
   */
  updateConstraints(constraints: Partial<CaptureConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
  }

  /**
   * Get current constraints.
   */
  getConstraints(): CaptureConstraints {
    return { ...this.constraints };
  }
}

// Export singleton instance
export const faceDetectionService = new FaceDetectionService();
