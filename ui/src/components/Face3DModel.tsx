import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type RGB = [number, number, number];

interface ZoneColors {
  forehead: THREE.Color;
  leftCheek: THREE.Color;
  rightCheek: THREE.Color;
  nose: THREE.Color;
  chin: THREE.Color;
  underEye: THREE.Color;
  base: THREE.Color;
  back: THREE.Color;
}

function scoreToHeatColor(score: number): THREE.Color {
  const t = Math.max(0, Math.min(1, score));
  if (t < 0.5) {
    const s = t * 2;
    // green #22c55e → yellow #eab308
    return new THREE.Color(0.133 + s * 0.785, 0.773 - s * 0.071, 0.369 - s * 0.338);
  }
  const s = (t - 0.5) * 2;
  // yellow #eab308 → red #ef4444
  return new THREE.Color(0.918 + s * 0.019, 0.702 - s * 0.435, 0.031 + s * 0.236);
}

function vertexZoneColor(nx: number, ny: number, nz: number, z: ZoneColors): THREE.Color {
  const lerp = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);

  if (nz < -0.1) return z.back;
  if (nz < 0.15) return lerp(z.back, z.base, (nz + 0.1) / 0.25);

  // Under-eye bands (flanking center, upper-middle of face)
  if (ny > 0.08 && ny < 0.44 && Math.abs(nx) > 0.07 && Math.abs(nx) < 0.44 && nz > 0.26) {
    return lerp(z.base, z.underEye, 0.75);
  }

  // Forehead (top of face)
  if (ny > 0.36) {
    return lerp(z.base, z.forehead, Math.min(1, (ny - 0.36) / 0.32) * 0.85);
  }

  // Cheeks (sides, mid-face height)
  if (ny > -0.2 && ny < 0.36) {
    if (nx < -0.28) return lerp(z.base, z.rightCheek, Math.min(1, (-nx - 0.28) / 0.3) * 0.82);
    if (nx > 0.28) return lerp(z.base, z.leftCheek, Math.min(1, (nx - 0.28) / 0.3) * 0.82);
  }

  // Nose bridge (narrow center strip, front-facing)
  if (Math.abs(nx) < 0.18 && ny > -0.14 && ny < 0.14 && nz > 0.48) {
    return lerp(z.base, z.nose, 0.72);
  }

  // Chin (lower face)
  if (ny < -0.24) {
    return lerp(z.base, z.chin, Math.min(1, (-ny - 0.24) / 0.38) * 0.7);
  }

  return z.base;
}

interface Props {
  scores: Record<string, number>; // 0–1 scale
  frontHeatmapUrl?: string | null;
}

export function Face3DModel({ scores, frontHeatmapUrl }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [sampled, setSampled] = useState<Record<string, RGB> | null>(null);

  // Sample zone colors strictly from heatmap-colored face pixels
  useEffect(() => {
    if (!frontHeatmapUrl) { setSampled(null); return; }

    const img = new Image();
    img.onload = () => {
      // Work at reduced resolution for performance
      const MAX_DIM = 480;
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.floor(img.naturalWidth * scale);
      const H = Math.floor(img.naturalHeight * scale);

      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      // Detect pixels visibly colored by the heatmap overlay (green / yellow / red).
      // The AI blends at up to alpha=170/255 (~67%) over skin, so thresholds account for blending.
      //   Green  (#22c55e blended): g - r > 40
      //   Yellow (#eab308 blended): r - b > 90  AND  g - b > 60
      //   Red    (#ef4444 blended): r - g > 70  AND  r > 140
      const isHeatmap = (r: number, g: number, b: number) =>
        (g - r > 40 && g > 100) ||
        (r - b > 90 && g - b > 60 && b < 130) ||
        (r - g > 70 && r > 140);

      // Find bounding box of heatmap pixels to locate the face
      let minX = W, maxX = 0, minY = H, maxY = 0;
      let count = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (isHeatmap(data[i], data[i + 1], data[i + 2])) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            count++;
          }
        }
      }

      // Need enough heatmap pixels to be meaningful
      if (count < 200 || maxX <= minX || maxY <= minY) {
        setSampled(null);
        return;
      }

      const fW = maxX - minX;
      const fH = maxY - minY;

      // Sample average color from a rectangle within the face bbox.
      // Only counts pixels that are heatmap-colored so background leaking
      // at the edges of the bbox doesn't pollute the sample.
      const sampleZone = (rx: number, ry: number, rw: number, rh: number): RGB => {
        const x0 = Math.floor(minX + rx * fW);
        const y0 = Math.floor(minY + ry * fH);
        const x1 = Math.min(W, Math.floor(x0 + rw * fW));
        const y1 = Math.min(H, Math.floor(y0 + rh * fH));
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4;
            const pr = data[i], pg = data[i + 1], pb = data[i + 2];
            if (isHeatmap(pr, pg, pb)) { r += pr; g += pg; b += pb; n++; }
          }
        }
        // Fall back to all pixels in the zone if no heatmap found there
        if (n === 0) {
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * W + x) * 4;
              r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
            }
          }
        }
        return n > 0 ? [r / n, g / n, b / n] : [128, 128, 128];
      };

      // Zone layout relative to detected face bbox
      setSampled({
        forehead:   sampleZone(0.18, 0.00, 0.64, 0.22),
        underEye:   sampleZone(0.12, 0.17, 0.76, 0.16),
        leftCheek:  sampleZone(0.54, 0.28, 0.38, 0.32), // viewer's right
        rightCheek: sampleZone(0.08, 0.28, 0.38, 0.32),
        nose:       sampleZone(0.33, 0.32, 0.34, 0.24),
        chin:       sampleZone(0.18, 0.68, 0.64, 0.22),
      });
    };
    img.onerror = () => setSampled(null);
    img.src = frontHeatmapUrl;
  }, [frontHeatmapUrl]);

  const zoneColors = useMemo((): ZoneColors => {
    const base = new THREE.Color(0.10, 0.16, 0.24);
    const back = new THREE.Color(0.05, 0.08, 0.13);

    if (sampled) {
      const tc = ([r, g, b]: RGB) => new THREE.Color(r / 255, g / 255, b / 255);
      return {
        forehead:   tc(sampled.forehead),
        leftCheek:  tc(sampled.leftCheek),
        rightCheek: tc(sampled.rightCheek),
        nose:       tc(sampled.nose),
        chin:       tc(sampled.chin),
        underEye:   tc(sampled.underEye),
        base,
        back,
      };
    }

    const acne  = scores.acne ?? 0;
    const red   = scores.redness ?? 0;
    const eye   = scores.under_eye_bags ?? 0;
    return {
      forehead:   scoreToHeatColor(acne * 0.9),
      leftCheek:  scoreToHeatColor(red),
      rightCheek: scoreToHeatColor(red),
      nose:       scoreToHeatColor((acne + red) / 2),
      chin:       scoreToHeatColor(acne * 0.7),
      underEye:   scoreToHeatColor(eye),
      base,
      back,
    };
  }, [sampled, scores]);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const W = mount.clientWidth || 320;
    const H = 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
    camera.position.set(0, 0.1, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6688cc, 0.35);
    fill.position.set(-2, -1, 2);
    scene.add(fill);

    // Head geometry — slightly elongated sphere
    const geo = new THREE.SphereGeometry(1.4, 80, 60);
    geo.applyMatrix4(new THREE.Matrix4().makeScale(0.85, 1.1, 0.85));

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colorBuf = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      // Un-apply the scale to get a unit-sphere normal direction
      const x = pos.getX(i) / 0.85;
      const y = pos.getY(i) / 1.1;
      const z = pos.getZ(i) / 0.85;
      const len = Math.sqrt(x * x + y * y + z * z);
      const col = vertexZoneColor(x / len, y / len, z / len, zoneColors);
      colorBuf[i * 3]     = col.r;
      colorBuf[i * 3 + 1] = col.g;
      colorBuf[i * 3 + 2] = col.b;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colorBuf, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.04,
    });

    const head = new THREE.Mesh(geo, mat);
    scene.add(head);

    // Simple eye socket markers
    const eyeGeo = new THREE.SphereGeometry(0.14, 12, 8);
    eyeGeo.applyMatrix4(new THREE.Matrix4().makeScale(1.9, 0.65, 0.6));
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x060a12, roughness: 0.9 });
    const lEye = new THREE.Mesh(eyeGeo, eyeMat);
    lEye.position.set(0.34, 0.38, 1.06);
    head.add(lEye);
    const rEye = new THREE.Mesh(eyeGeo.clone(), eyeMat);
    rEye.position.set(-0.34, 0.38, 1.06);
    head.add(rEye);

    // Nose tip bump
    const noseGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const noseMesh = new THREE.Mesh(noseGeo, eyeMat.clone());
    noseMesh.position.set(0, -0.02, 1.26);
    head.add(noseMesh);

    // Drag + touch rotation
    let dragging = false;
    let px = 0, py = 0;
    let rotX = 0.08, rotY = 0;

    const startDrag = (x: number, y: number) => { dragging = true; px = x; py = y; };
    const moveDrag  = (x: number, y: number) => {
      if (!dragging) return;
      rotX = Math.max(-1.1, Math.min(1.1, rotX + (y - py) * 0.012));
      rotY += (x - px) * 0.012;
      px = x; py = y;
    };
    const endDrag = () => { dragging = false; };

    const onMD = (e: MouseEvent)  => startDrag(e.clientX, e.clientY);
    const onMM = (e: MouseEvent)  => moveDrag(e.clientX, e.clientY);
    const onMU = ()               => endDrag();
    const onTS = (e: TouchEvent)  => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); };
    const onTM = (e: TouchEvent)  => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); };
    const onTE = ()               => endDrag();

    renderer.domElement.addEventListener("mousedown", onMD);
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup",   onMU);
    renderer.domElement.addEventListener("touchstart", onTS, { passive: false });
    renderer.domElement.addEventListener("touchmove",  onTM, { passive: false });
    renderer.domElement.addEventListener("touchend",   onTE);

    let raf: number;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dragging) rotY += 0.006;
      head.rotation.x = rotX;
      head.rotation.y = rotY;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("mousedown", onMD);
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup",   onMU);
      renderer.domElement.removeEventListener("touchstart", onTS);
      renderer.domElement.removeEventListener("touchmove",  onTM);
      renderer.domElement.removeEventListener("touchend",   onTE);
      geo.dispose();
      mat.dispose();
      eyeGeo.dispose();
      eyeMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [zoneColors]);

  return (
    <div className="space-y-1">
      <div
        ref={mountRef}
        className="w-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ height: 260 }}
      />
      <p className="text-[10px] text-center text-on-surface-variant/50">
        {frontHeatmapUrl ? "Colors sampled from heatmap" : "Colors derived from severity scores"} · Drag to rotate
      </p>
    </div>
  );
}
