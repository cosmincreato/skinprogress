import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Detection } from "./HeatmapOverlay";

const CONDITION_COLORS: Record<string, [number, number, number]> = {
  acne:           [0.863, 0.078, 0.078], // #DC1414
  redness:        [0.902, 0.392, 0.0],   // #E66400
  under_eye_bags: [0.392, 0.0,   0.784], // #6400C8
};

function hitTestDetection(imgX: number, imgY: number, det: Detection): boolean {
  if (det.type === "spot") {
    if (det.x == null || det.y == null || det.radius == null) return false;
    return Math.hypot(imgX - det.x, imgY - det.y) < det.radius * 1.3;
  }
  if (det.type === "zone") {
    if (det.x1 == null || det.y1 == null || det.x2 == null || det.y2 == null)
      return false;
    return imgX >= det.x1 && imgX <= det.x2 && imgY >= det.y1 && imgY <= det.y2;
  }
  return false;
}

const FACE_MODEL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r168/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb";


// YCrCb skin detection — same thresholds as the Python backend's _build_skin_mask
function isSkinPixel(r: number, g: number, b: number): boolean {
  const Y = 0.299 * r + 0.587 * g + 0.114 * b;
  const Cr = 128 + (r - Y) * 0.713;
  const Cb = 128 + (b - Y) * 0.564;
  return Y > 40 && Y < 240 && Cr > 130 && Cr < 170 && Cb > 80 && Cb < 135;
}

interface FaceRegion {
  W: number;
  H: number;
  cx: number; // face centroid x in image pixels
  cy: number; // face centroid y in image pixels
  rx: number; // face half-width
  ry: number; // face half-height
  skinR: number; // median skin R channel, 0-255
  skinG: number; // median skin G channel, 0-255
  skinB: number; // median skin B channel, 0-255
}

interface Props {
  scores: Record<string, number>;
  frontPhotoUrl?: string | null;
  detections?: Detection[];
}

// @ts-expect-error TS6133 -- scores is part of the Props interface for API compatibility
export function Face3DModel({ scores, frontPhotoUrl, detections }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<FaceRegion | null>(null);
  const [pixelVersion, setPixelVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const detectionsKey = JSON.stringify(detections ?? []);

  // Effect 1: load original selfie, detect face skin region via YCrCb
  useEffect(() => {
    regionRef.current = null;
    if (!frontPhotoUrl) {
      setPixelVersion((v) => v + 1);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const MAX = 600;
        const scale = Math.min(
          1,
          MAX / Math.max(img.naturalWidth, img.naturalHeight),
        );
        const W = Math.floor(img.naturalWidth * scale);
        const H = Math.floor(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setPixelVersion((v) => v + 1);
          return;
        }
        ctx.drawImage(img, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);

        // Pass 1: rough centroid of all skin pixels
        let skinCount = 0,
          sumX = 0,
          sumY = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (isSkinPixel(data[i], data[i + 1], data[i + 2])) {
              sumX += x;
              sumY += y;
              skinCount++;
            }
          }
        }
        if (skinCount < 400) {
          setPixelVersion((v) => v + 1);
          return;
        }
        const roughCx = sumX / skinCount;
        const roughCy = sumY / skinCount;

        // Pass 2: face skin pixels within 45% of min dimension — collect geometry + pixel values
        const maxRadius = Math.min(W, H) * 0.45;
        let faceCount = 0,
          faceSumX = 0,
          faceSumY = 0;
        let minX = W,
          maxX = 0,
          minY = H,
          maxY = 0;
        const rVals: number[] = [],
          gVals: number[] = [],
          bVals: number[] = [];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (!isSkinPixel(data[i], data[i + 1], data[i + 2])) continue;
            if (Math.hypot(x - roughCx, y - roughCy) > maxRadius) continue;
            faceSumX += x;
            faceSumY += y;
            faceCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            rVals.push(data[i]);
            gVals.push(data[i + 1]);
            bVals.push(data[i + 2]);
          }
        }

        if (faceCount < 200 || maxX <= minX || maxY <= minY) {
          setPixelVersion((v) => v + 1);
          return;
        }

        rVals.sort((a, b) => a - b);
        gVals.sort((a, b) => a - b);
        bVals.sort((a, b) => a - b);
        const mid = Math.floor(rVals.length / 2);

        regionRef.current = {
          W,
          H,
          cx: faceSumX / faceCount,
          cy: faceSumY / faceCount,
          rx: (maxX - minX) / 2,
          ry: (maxY - minY) / 2,
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
  }, [frontPhotoUrl]);

  // Effect 2: Three.js scene — color 3D face with real skin tones from the selfie
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

    // Lighting — three-point rig tuned for skin
    scene.add(new THREE.AmbientLight(0xfff0e8, 0.22));
    const key = new THREE.DirectionalLight(0xfff5e0, 1.4);
    key.position.set(1.5, 3.0, 4.0);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ab0ff, 0.42);
    fill.position.set(-3, 0.5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff9066, 0.18);
    rim.position.set(0, -1.5, -3);
    scene.add(rim);

    // Interaction
    let dragging = false,
      px = 0,
      py = 0;
    let rotX = 0.0,
      rotY = 0.0;
    let headGroup: THREE.Group | null = null;

    const startDrag = (x: number, y: number) => {
      dragging = true;
      px = x;
      py = y;
    };
    const moveDrag = (x: number, y: number) => {
      if (!dragging) return;
      rotX = Math.max(-1.0, Math.min(1.0, rotX + (y - py) * 0.01));
      rotY += (x - px) * 0.01;
      px = x;
      py = y;
    };
    const endDrag = () => {
      dragging = false;
    };

    const onMD = (e: MouseEvent) => startDrag(e.clientX, e.clientY);
    const onMM = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onTS = (e: TouchEvent) => {
      e.preventDefault();
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTM = (e: TouchEvent) => {
      e.preventDefault();
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    };

    renderer.domElement.addEventListener("mousedown", onMD);
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", endDrag);
    renderer.domElement.addEventListener("touchstart", onTS, {
      passive: false,
    });
    renderer.domElement.addEventListener("touchmove", onTM, { passive: false });
    renderer.domElement.addEventListener("touchend", endDrag);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dragging && headGroup) rotY += 0.004;
      if (headGroup) {
        headGroup.rotation.x = rotX;
        headGroup.rotation.y = rotY;
      }
      renderer.render(scene, camera);
    };
    loop();

    const skinDark = new THREE.Color(0.25, 0.14, 0.10);

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
      rc.arc(
        Math.random() * 512,
        Math.random() * 512,
        Math.random() * 1.2,
        0,
        Math.PI * 2,
      );
      rc.fill();
    }
    const roughTex = new THREE.CanvasTexture(roughCanvas);

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

        const region = regionRef.current;

        headGroup.traverse((child: THREE.Object3D) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.updateMatrixWorld(true);

          const geo = child.geometry as THREE.BufferGeometry;
          const posAttr = geo.attributes.position as THREE.BufferAttribute;
          const normAttr = geo.attributes
            .normal as THREE.BufferAttribute | undefined;
          const colorBuf = new Float32Array(posAttr.count * 3);
          const wm = child.matrixWorld.elements;

          for (let i = 0; i < posAttr.count; i++) {
            const lx = posAttr.getX(i),
              ly = posAttr.getY(i),
              lz = posAttr.getZ(i);

            const wx = wm[0] * lx + wm[4] * ly + wm[8] * lz + wm[12];
            const wy = wm[1] * lx + wm[5] * ly + wm[9] * lz + wm[13];

            const lnx = normAttr?.getX(i) ?? 0;
            const lny = normAttr?.getY(i) ?? 0;
            const lnz = normAttr?.getZ(i) ?? 1;
            const wnx = wm[0] * lnx + wm[4] * lny + wm[8] * lnz;
            const wny = wm[1] * lnx + wm[5] * lny + wm[9] * lnz;
            const wnz = wm[2] * lnx + wm[6] * lny + wm[10] * lnz;
            const wnLen = Math.hypot(wnx, wny, wnz) || 1;
            const fnz = wnz / wnLen; // +1 = facing camera, -1 = back of head

            const normY =
              wSize.y > 0.001
                ? Math.max(0, Math.min(1, (wy - wMin.y) / wSize.y))
                : 0.5;
            const normX =
              wSize.x > 0.001
                ? Math.max(-1, Math.min(1, wx / (wSize.x * 0.5)))
                : 0;

            let r: number, g: number, b: number;
            const blend = Math.max(0, Math.min(1, (fnz + 0.05) / 0.35)) ** 1.5;

            if (!region || fnz < -0.05) {
              r = skinDark.r;
              g = skinDark.g;
              b = skinDark.b;
            } else {
              const imgX = region.cx + normX * region.rx;
              const imgY = region.cy + region.ry * (1 - 2 * normY);

              let bestDet: Detection | null = null;
              let bestSev = -1;
              for (const det of (detections ?? [])) {
                if (hitTestDetection(imgX, imgY, det) && det.severity > bestSev) {
                  bestSev = det.severity;
                  bestDet = det;
                }
              }

              const skinMR = region.skinR / 255;
              const skinMG = region.skinG / 255;
              const skinMB = region.skinB / 255;

              let targetR: number, targetG: number, targetB: number;
              if (bestDet) {
                const cc = CONDITION_COLORS[bestDet.condition] ?? [0.863, 0.078, 0.078];
                targetR = skinMR + 0.82 * (cc[0] - skinMR);
                targetG = skinMG + 0.82 * (cc[1] - skinMG);
                targetB = skinMB + 0.82 * (cc[2] - skinMB);
              } else {
                targetR = skinMR;
                targetG = skinMG;
                targetB = skinMB;
              }

              r = skinDark.r + blend * (targetR - skinDark.r);
              g = skinDark.g + blend * (targetG - skinDark.g);
              b = skinDark.b + blend * (targetB - skinDark.b);
            }

            colorBuf[i * 3] = r;
            colorBuf[i * 3 + 1] = g;
            colorBuf[i * 3 + 2] = b;
          }

          geo.setAttribute("color", new THREE.BufferAttribute(colorBuf, 3));

          child.material = new THREE.MeshPhysicalMaterial({
            vertexColors: true,
            roughness: 0.68,
            metalness: 0.0,
            roughnessMap: roughTex,
            sheen: 0.30,
            sheenRoughness: 0.82,
            sheenColor: new THREE.Color(0.62, 0.38, 0.28),
          });
        });

        scene.add(headGroup);
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
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, [pixelVersion, detectionsKey]);

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
