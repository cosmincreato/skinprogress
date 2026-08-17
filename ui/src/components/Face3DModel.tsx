import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Detection } from "./HeatmapOverlay";

const CONDITION_LABELS: Record<string, string> = {
  acne: "Acne",
  redness: "Redness",
  under_eye_bags: "Dark circles",
};

function severityLabel(s: number): string {
  if (s < 0.34) return "Mild";
  if (s < 0.67) return "Moderate";
  return "Severe";
}

// Condition colors (linear RGB, 0-1) — natural/subtle palette
const ACNE_COLOR    = [0.75, 0.22, 0.17] as const; // crimson
const REDNESS_COLOR = [0.88, 0.44, 0.44] as const; // soft rose
const EYE_COLOR     = [0.55, 0.55, 0.75] as const; // blue-grey

const FACE_MODEL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r168/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb";

// YCrCb skin detection — same thresholds as the Python backend's _build_skin_mask
function isSkinPixel(r: number, g: number, b: number): boolean {
  const Y = 0.299 * r + 0.587 * g + 0.114 * b;
  const Cr = 128 + (r - Y) * 0.713;
  const Cb = 128 + (b - Y) * 0.564;
  return Y > 40 && Y < 240 && Cr > 130 && Cr < 170 && Cb > 80 && Cb < 135;
}

// 2-D Gaussian blob — returns 0-1 weight
function gauss2d(
  nx: number, ny: number,
  cx: number, cy: number,
  sx: number, sy: number,
): number {
  const dx = (nx - cx) / sx;
  const dy = (ny - cy) / sy;
  return Math.exp(-0.5 * (dx * dx + dy * dy));
}


interface FaceRegion {
  skinR: number;
  skinG: number;
  skinB: number;
}

// Detection mapped to model normX/normY space
interface ModelBlob {
  normX: number; // -1..+1
  normY: number; // 0..1 (0=bottom/neck, 1=top/head)
  sigmaX: number;
  sigmaY: number;
  severity: number;
}

interface Props {
  scores: Record<string, number>;
  frontPhotoUrl?: string | null;
  detections?: Detection[];
  perAngle?: Record<string, { scores: Record<string, number> }>;
}

export function Face3DModel({ scores, frontPhotoUrl, detections, perAngle }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<FaceRegion | null>(null);
  const blobsRef = useRef<ModelBlob[]>([]);
  const [pixelVersion, setPixelVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const scoresKey = JSON.stringify(scores) + JSON.stringify(perAngle) + JSON.stringify(detections);

  // Effect 1: sample median skin tone from selfie via YCrCb + normalize detection blobs
  useEffect(() => {
    regionRef.current = null;
    blobsRef.current = [];
    if (!frontPhotoUrl) {
      setPixelVersion((v) => v + 1);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Normalize detections to model normX/normY space while we have image dimensions.
      // Front photo: x=0 is viewer-left (person's right on mirrored selfie), y=0 is top.
      // Model normX: -1=model-left(viewer-right), +1=model-right(viewer-left).
      // Model normY: face occupies ~0.40 (chin) to ~0.92 (forehead) of the full bounding box.
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      if (detections && detections.length > 0 && imgW > 0 && imgH > 0) {
        blobsRef.current = detections.map((det) => {
          let px: number, py: number, pr: number;
          if (det.type === "spot" && det.x !== undefined && det.y !== undefined) {
            px = det.x; py = det.y; pr = det.radius ?? 20;
          } else if (det.x1 !== undefined && det.y1 !== undefined && det.x2 !== undefined && det.y2 !== undefined) {
            px = (det.x1 + det.x2) / 2;
            py = (det.y1 + det.y2) / 2;
            pr = Math.max(det.x2 - det.x1, det.y2 - det.y1) / 2;
          } else {
            return null;
          }
          // Unmirrored saved photo: person's right eye is on the LEFT of the image (low px).
          // Model normX +1 = model's right = viewer's left = person's right → flip x.
          const normX = (0.5 - px / imgW) * 1.8;
          const normY = 0.92 - (py / imgH) * 0.52;
          const sigma = Math.max(0.04, (pr / Math.max(imgW, imgH)) * 1.0);
          return { normX, normY, sigmaX: sigma, sigmaY: sigma * 0.85, severity: det.severity };
        }).filter(Boolean) as ModelBlob[];
        console.log("[Face3DModel] blobs from detections:", blobsRef.current);
      } else {
        console.log("[Face3DModel] no detections — using fallback zones. detections:", detections?.length ?? 0, "imgW:", imgW);
      }

      try {
        const MAX = 600;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const W = Math.floor(img.naturalWidth * scale);
        const H = Math.floor(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setPixelVersion((v) => v + 1); return; }
        ctx.drawImage(img, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);

        // Pass 1: rough centroid of skin pixels
        let skinCount = 0, sumX = 0, sumY = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (isSkinPixel(data[i], data[i + 1], data[i + 2])) {
              sumX += x; sumY += y; skinCount++;
            }
          }
        }
        if (skinCount < 400) { setPixelVersion((v) => v + 1); return; }
        const roughCx = sumX / skinCount;
        const roughCy = sumY / skinCount;

        // Pass 2: face pixels within 45% of min dimension — collect RGB values
        const maxRadius = Math.min(W, H) * 0.45;
        const rVals: number[] = [], gVals: number[] = [], bVals: number[] = [];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (!isSkinPixel(data[i], data[i + 1], data[i + 2])) continue;
            if (Math.hypot(x - roughCx, y - roughCy) > maxRadius) continue;
            rVals.push(data[i]);
            gVals.push(data[i + 1]);
            bVals.push(data[i + 2]);
          }
        }
        if (rVals.length < 200) { setPixelVersion((v) => v + 1); return; }

        rVals.sort((a, b) => a - b);
        gVals.sort((a, b) => a - b);
        bVals.sort((a, b) => a - b);
        const mid = Math.floor(rVals.length / 2);
        regionRef.current = {
          skinR: rVals[mid] ?? 180,
          skinG: gVals[mid] ?? 140,
          skinB: bVals[mid] ?? 120,
        };
      } catch (err) {
        console.warn("Face3DModel: skin detection failed", err);
      }
      setPixelVersion((v) => v + 1);
    };
    img.onerror = () => setPixelVersion((v) => v + 1);
    img.src = frontPhotoUrl;
  }, [frontPhotoUrl, detections]);

  // Effect 2: Three.js scene — anatomical zone coloring driven by severity scores
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const W = mount.clientWidth || 320;
    const H = 320;

    let cleanedUp = false;
    let raf = -1;

    setIsLoading(true);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
    camera.position.set(0, 0, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    // Three-point lighting rig for skin
    scene.add(new THREE.AmbientLight(0xfff0e8, 0.22));
    const key = new THREE.DirectionalLight(0xfff5e0, 1.4);
    key.position.set(1.5, 3.0, 4.0);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff8f0, 0.28);
    fill.position.set(-3, 0.5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff9066, 0.18);
    rim.position.set(0, -1.5, -3);
    scene.add(rim);

    // Interaction
    let dragging = false, px = 0, py = 0;
    let rotX = 0.0, rotY = 0.0;
    let headGroup: THREE.Group | null = null;
    let onHover: ((e: MouseEvent) => void) | null = null;
    let onLeave: (() => void) | null = null;

    const startDrag = (x: number, y: number) => { dragging = true; px = x; py = y; };
    const moveDrag = (x: number, y: number) => {
      if (!dragging) return;
      rotX = Math.max(-1.0, Math.min(1.0, rotX + (y - py) * 0.01));
      rotY += (x - px) * 0.01;
      px = x; py = y;
    };
    const endDrag = () => { dragging = false; };

    const onMD = (e: MouseEvent) => startDrag(e.clientX, e.clientY);
    const onMM = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onTS = (e: TouchEvent) => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); };
    const onTM = (e: TouchEvent) => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); };

    renderer.domElement.addEventListener("mousedown", onMD);
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", endDrag);
    renderer.domElement.addEventListener("touchstart", onTS, { passive: false });
    renderer.domElement.addEventListener("touchmove", onTM, { passive: false });
    renderer.domElement.addEventListener("touchend", endDrag);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dragging && headGroup) rotY += 0.004;
      if (headGroup) { headGroup.rotation.x = rotX; headGroup.rotation.y = rotY; }
      renderer.render(scene, camera);
    };
    loop();

    // Procedural roughness texture — simulates pore microstructure
    const roughCanvas = document.createElement("canvas");
    roughCanvas.width = roughCanvas.height = 512;
    const rc = roughCanvas.getContext("2d")!;
    rc.fillStyle = "#b0b0b0";
    rc.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8000; i++) {
      const v = Math.floor(80 + Math.random() * 120);
      rc.fillStyle = `rgb(${v},${v},${v})`;
      rc.beginPath();
      rc.arc(Math.random() * 512, Math.random() * 512, Math.random() * 1.2, 0, Math.PI * 2);
      rc.fill();
    }
    const roughTex = new THREE.CanvasTexture(roughCanvas);

    // Overall scores (fallback when per-angle data is absent)
    const acneScore    = Math.min(1, scores.acne           ?? 0);
    const rednessScore = Math.min(1, scores.redness        ?? 0);
    const eyeScore     = Math.min(1, scores.under_eye_bags ?? 0);

    // Per-angle score objects
    const frontScores = perAngle?.front?.scores ?? scores;
    const leftScores  = perAngle?.left?.scores  ?? scores;
    const rightScores = perAngle?.right?.scores ?? scores;

    // Acne — per-angle cheek severity (front blobs handled separately via detections)
    const acneLeft  = Math.min(1, leftScores.acne  ?? acneScore);
    const acneRight = Math.min(1, rightScores.acne ?? acneScore);

    // Redness — weighted composite inputs
    const redFront = Math.min(1, frontScores.redness ?? rednessScore);
    const redLeft  = Math.min(1, leftScores.redness  ?? rednessScore);
    const redRight = Math.min(1, rightScores.redness ?? rednessScore);

    // Under-eye — per-angle (left angle sees person's left eye, right angle sees person's right)
    const eyeLeft  = Math.min(1, leftScores.under_eye_bags  ?? eyeScore);
    const eyeRight = Math.min(1, rightScores.under_eye_bags ?? eyeScore);

    // Base skin tone from selfie sample, or warm neutral fallback
    const region = regionRef.current;
    const baseSkinR = region ? region.skinR / 255 : 0.72;
    const baseSkinG = region ? region.skinG / 255 : 0.54;
    const baseSkinB = region ? region.skinB / 255 : 0.44;

    const loader = new GLTFLoader();
    loader.load(
      FACE_MODEL,
      (gltf) => {
        if (cleanedUp) return;

        headGroup = gltf.scene;

        const bbox = new THREE.Box3().setFromObject(headGroup);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const modelScale = 2.5 / Math.max(size.x, size.y, size.z);
        headGroup.scale.setScalar(modelScale);
        headGroup.position.set(
          -center.x * modelScale,
          -center.y * modelScale,
          -center.z * modelScale,
        );

        headGroup.updateMatrixWorld(true);
        const worldBbox = new THREE.Box3().setFromObject(headGroup);
        const wMin = worldBbox.min.clone();
        const wSize = worldBbox.getSize(new THREE.Vector3());

        headGroup.traverse((child: THREE.Object3D) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.updateMatrixWorld(true);

          const geo = child.geometry as THREE.BufferGeometry;
          const posAttr = geo.attributes.position as THREE.BufferAttribute;
          const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
          const colorBuf = new Float32Array(posAttr.count * 3);
          const conditionData: { condition: string; severity: number }[] = new Array(posAttr.count);
          const wm = child.matrixWorld.elements;

          for (let i = 0; i < posAttr.count; i++) {
            const lx = posAttr.getX(i), ly = posAttr.getY(i), lz = posAttr.getZ(i);
            const wx = wm[0]*lx + wm[4]*ly + wm[8]*lz + wm[12];
            const wy = wm[1]*lx + wm[5]*ly + wm[9]*lz + wm[13];

            // World-space normal to determine front-facing weight
            const lnx = normAttr?.getX(i) ?? 0;
            const lny = normAttr?.getY(i) ?? 0;
            const lnz = normAttr?.getZ(i) ?? 1;
            const wnx = wm[0]*lnx + wm[4]*lny + wm[8]*lnz;
            const wny = wm[1]*lnx + wm[5]*lny + wm[9]*lnz;
            const wnz = wm[2]*lnx + wm[6]*lny + wm[10]*lnz;
            const wnLen = Math.hypot(wnx, wny, wnz) || 1;
            const fnz = wnz / wnLen; // +1 = facing camera

            // Normalized position on face (Y: 0=chin, 1=top; X: -1=left, 0=center, +1=right)
            const normY = wSize.y > 0.001 ? Math.max(0, Math.min(1, (wy - wMin.y) / wSize.y)) : 0.5;
            const normX = wSize.x > 0.001 ? Math.max(-1, Math.min(1, wx / (wSize.x * 0.5))) : 0;

            // Soft front-facing gate: full weight at fnz≥0.3, zero at fnz≤-0.1
            const faceW = Math.max(0, Math.min(1, (fnz + 0.1) / 0.4));

            // --- Acne weight ---
            // Front-photo detection blobs + per-angle cheek anatomical blobs (additive)
            let acneW = 0;
            for (const blob of blobsRef.current) {
              const w = gauss2d(normX, normY, blob.normX, blob.normY, blob.sigmaX, blob.sigmaY)
                * blob.severity;
              if (w > acneW) acneW = w;
            }
            acneW = Math.min(1, acneW);
            // Per-angle cheek blobs always contribute alongside front detections
            acneW = Math.min(1, Math.max(
              acneW,
              gauss2d(normX, normY, +0.30, 0.53, 0.13, 0.11) * acneLeft,
              gauss2d(normX, normY, -0.30, 0.53, 0.13, 0.11) * acneRight,
            ));

            // --- Redness weight — spatially localized per-angle zones, wider sigma than acne ---
            const rednessW = Math.min(1, Math.max(
              gauss2d(normX, normY,  0.00, 0.58, 0.22, 0.18) * redFront,  // nose / center
              gauss2d(normX, normY, +0.32, 0.53, 0.22, 0.18) * redLeft,   // left cheek
              gauss2d(normX, normY, -0.32, 0.53, 0.22, 0.18) * redRight,  // right cheek
            ));

            // --- Under-eye weight ---
            const eyeW = Math.min(1, Math.max(
              gauss2d(normX, normY, +0.16, 0.70, 0.08, 0.04) * eyeLeft,
              gauss2d(normX, normY, -0.16, 0.70, 0.08, 0.04) * eyeRight,
            ));

            // Gamma: pushes mid-weights down, keeps high-severity vivid
            const acneBlend    = Math.pow(acneW,    0.7) * faceW;
            const rednessBlend = Math.pow(rednessW, 0.7) * faceW;
            const eyeBlend     = Math.pow(eyeW,     0.7) * faceW;

            // Additive multi-condition blend over base skin tone
            let r = baseSkinR + acneBlend * (ACNE_COLOR[0] - baseSkinR)
                               + rednessBlend * (REDNESS_COLOR[0] - baseSkinR)
                               + eyeBlend * (EYE_COLOR[0] - baseSkinR);
            let g = baseSkinG + acneBlend * (ACNE_COLOR[1] - baseSkinG)
                               + rednessBlend * (REDNESS_COLOR[1] - baseSkinG)
                               + eyeBlend * (EYE_COLOR[1] - baseSkinG);
            let b = baseSkinB + acneBlend * (ACNE_COLOR[2] - baseSkinB)
                               + rednessBlend * (REDNESS_COLOR[2] - baseSkinB)
                               + eyeBlend * (EYE_COLOR[2] - baseSkinB);
            r = Math.min(1, Math.max(0, r));
            g = Math.min(1, Math.max(0, g));
            b = Math.min(1, Math.max(0, b));

            colorBuf[i * 3]     = r;
            colorBuf[i * 3 + 1] = g;
            colorBuf[i * 3 + 2] = b;

            // Dominant condition for hover tooltip
            const candidates = [
              { condition: "acne",           w: acneBlend    },
              { condition: "redness",        w: rednessBlend },
              { condition: "under_eye_bags", w: eyeBlend     },
            ];
            const dom = candidates.reduce((a, b) => a.w >= b.w ? a : b);
            conditionData[i] = dom.w > 0.08 ? { condition: dom.condition, severity: dom.w } : { condition: "", severity: 0 };
          }

          geo.setAttribute("color", new THREE.BufferAttribute(colorBuf, 3));
          child.userData.conditionData = conditionData;
          child.material = new THREE.MeshPhysicalMaterial({
            vertexColors: true,
            roughness: 0.68,
            metalness: 0.0,
            roughnessMap: roughTex,
            sheen: 0.08,
            sheenRoughness: 0.90,
            sheenColor: new THREE.Color(0.80, 0.70, 0.60),
          });
        });

        scene.add(headGroup);

        const raycaster = new THREE.Raycaster();
        onHover = (e: MouseEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          const mx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
          const my = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
          raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
          const hits = raycaster.intersectObject(headGroup!, true);
          if (!hits.length || !hits[0].face) { setTooltip(null); return; }
          const mesh = hits[0].object as THREE.Mesh;
          const cd = mesh.userData.conditionData as { condition: string; severity: number }[] | undefined;
          if (!cd) { setTooltip(null); return; }
          const { a, b, c } = hits[0].face;
          const best = [a, b, c].reduce<{ condition: string; severity: number }>(
            (acc, vi) => (cd[vi]?.severity ?? 0) > acc.severity ? cd[vi] : acc,
            { condition: "", severity: 0 },
          );
          if (best.condition) {
            setTooltip({
              text: `${CONDITION_LABELS[best.condition]} — ${severityLabel(best.severity)}`,
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          } else {
            setTooltip(null);
          }
        };
        onLeave = () => setTooltip(null);
        renderer.domElement.addEventListener("mousemove", onHover);
        renderer.domElement.addEventListener("mouseleave", onLeave);

        if (!cleanedUp) setIsLoading(false);
      },
      undefined,
      (err) => {
        console.error("Face model load error:", err);
        if (!cleanedUp) setIsLoading(false);
      },
    );

    return () => {
      cleanedUp = true;
      if (raf !== -1) cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("mousedown", onMD);
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup", endDrag);
      renderer.domElement.removeEventListener("touchstart", onTS);
      renderer.domElement.removeEventListener("touchmove", onTM);
      renderer.domElement.removeEventListener("touchend", endDrag);
      if (onHover) renderer.domElement.removeEventListener("mousemove", onHover);
      if (onLeave) renderer.domElement.removeEventListener("mouseleave", onLeave);
      scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material))
            obj.material.forEach((m: THREE.Material) => m.dispose());
          else obj.material.dispose();
        }
      });
      roughTex.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [pixelVersion, scoresKey]);

  return (
    <div className="space-y-1">
      <div
        ref={mountRef}
        className="w-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing select-none relative"
        style={{ height: 320 }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b1120] rounded-xl z-10">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-blue-300/70">Loading face model…</p>
            </div>
          </div>
        )}
        {tooltip && (
          <div
            className="absolute z-50 px-2 py-1 rounded bg-gray-900 text-white border border-white/10 text-[11px] pointer-events-none shadow-lg whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y - 28 }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
      <p className="text-[10px] text-center text-on-surface-variant/50">
        {frontPhotoUrl
          ? "Skin color sampled from your selfie"
          : "Colors derived from severity scores"}{" "}
        · Drag to rotate
      </p>
    </div>
  );
}
