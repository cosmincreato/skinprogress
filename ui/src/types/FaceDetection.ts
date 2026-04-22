/**
 * Face Detection Types
 * Contracts for face detection results and guidance
 */

export interface BoundingBox {
  /** X position as percentage of video width (0-100) */
  x: number;
  /** Y position as percentage of video height (0-100) */
  y: number;
  /** Width as percentage of video width (0-100) */
  width: number;
  /** Height as percentage of video height (0-100) */
  height: number;
}

export type GuidanceSeverity = "info" | "warning" | "error" | "success";

export interface GuidanceMessage {
  /** Human-readable guidance text */
  text: string;
  /** Severity level for styling */
  severity: GuidanceSeverity;
  /** Whether conditions are optimal for capture */
  isOptimal: boolean;
}

export type FaceDistance = "too_close" | "optimal" | "too_far";

export interface AlignmentCheckResult {
  /** Whether forehead is centered in frame */
  isForeheadCentered: boolean;
  /** Whether eyes are roughly level */
  isEyeHeightCorrect: boolean;
  /** Whether face is centered in video */
  isFaceInCenter: boolean;
  /** Horizontal offset from center (-1.0 to 1.0) */
  xOffset: number;
  /** Vertical offset from center (-1.0 to 1.0) */
  yOffset: number;
  /** Distance from camera based on face size */
  distanceFromCamera: FaceDistance;
}

export interface CaptureConstraints {
  /** Minimum brightness percentage (0-100) */
  MIN_BRIGHTNESS: number;
  /** Maximum brightness percentage (0-100) */
  MAX_BRIGHTNESS: number;
  /** Minimum face detection confidence (0.0-1.0) */
  MIN_FACE_CONFIDENCE: number;
  /** Maximum number of faces allowed */
  MAX_FACE_COUNT: number;
  /** Center tolerance for alignment (percentage, 0-1.0) */
  CENTER_TOLERANCE: number;
}

export interface FaceDetectionResult {
  /** Whether a face was detected */
  detected: boolean;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** Number of faces detected */
  faceCount: number;
  /** Guidance message for user */
  guidance: GuidanceMessage;
  /** Bounding box around detected face(s) */
  boundingBox: BoundingBox;
  /** Estimated image brightness (0-100) */
  brightness: number;
}

export type ViewType = "front" | "left" | "right";

export interface CaptureProgress {
  /** View type being captured */
  current: ViewType;
  /** Views captured so far */
  completed: ViewType[];
  /** Views remaining */
  remaining: ViewType[];
  /** Overall progress (0-100) */
  percentComplete: number;
}

export interface CaptureBatch {
  /** Unique batch ID */
  batchId: string;
  /** Timestamp of batch start */
  startTime: Date;
  /** Photos captured in this batch */
  photos: {
    viewType: ViewType;
    dataUrl: string;
    faceDetectionResult: FaceDetectionResult;
    timestamp: Date;
  }[];
  /** Current upload status */
  uploadStatus: "pending" | "uploading" | "completed" | "failed";
  /** Any upload error message */
  uploadError?: string;
}
