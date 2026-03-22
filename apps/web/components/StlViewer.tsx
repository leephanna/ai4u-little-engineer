"use client";

import { useEffect, useRef, useState } from "react";

interface StlViewerProps {
  url: string;
  width?: number;
  height?: number;
  className?: string;
}

export function StlViewer({ url, width = 400, height = 400, className = "" }: StlViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const wireframeRef = useRef(wireframe);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    wireframeRef.current = wireframe;
    // Update material if scene already loaded
    if (cleanupRef.current) {
      // Re-trigger by changing a flag — handled inside the effect
    }
  }, [wireframe]);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    let animationId: number;
    let isUserInteracting = false;

    async function init() {
      try {
        // Dynamic import to avoid SSR issues
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");

        const w = container.clientWidth || width;
        const h = container.clientHeight || height;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f172a);

        // Camera
        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
        camera.position.set(0, 0, 200);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(1, 2, 3);
        scene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.3);
        dirLight2.position.set(-2, -1, -1);
        scene.add(dirLight2);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.addEventListener("start", () => { isUserInteracting = true; });

        // Load STL
        const loader = new STLLoader();
        const geometry = await new Promise<import("three").BufferGeometry>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });

        geometry.computeVertexNormals();
        geometry.center();

        // Scale to fit view
        const box = new THREE.Box3().setFromBufferAttribute(
          geometry.attributes.position as import("three").BufferAttribute
        );
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 100 / maxDim;
        geometry.scale(scale, scale, scale);

        camera.position.set(0, 0, maxDim * scale * 1.8);
        controls.update();

        // Material
        const material = new THREE.MeshPhongMaterial({
          color: 0x94a3b8,
          specular: 0x334155,
          shininess: 30,
          wireframe: wireframeRef.current,
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        setLoading(false);

        // Animate
        function animate() {
          animationId = requestAnimationFrame(animate);
          if (!isUserInteracting) {
            mesh.rotation.y += 0.003;
          }
          // Sync wireframe toggle
          if (material.wireframe !== wireframeRef.current) {
            material.wireframe = wireframeRef.current;
          }
          controls.update();
          renderer.render(scene, camera);
        }
        animate();

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
          const w2 = container.clientWidth;
          const h2 = container.clientHeight;
          camera.aspect = w2 / h2;
          camera.updateProjectionMatrix();
          renderer.setSize(w2, h2);
        });
        resizeObserver.observe(container);

        cleanupRef.current = () => {
          cancelAnimationFrame(animationId);
          resizeObserver.disconnect();
          renderer.dispose();
          geometry.dispose();
          material.dispose();
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        };
      } catch (err) {
        console.error("STL viewer error:", err);
        setError("Preview unavailable — download to inspect");
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelAnimationFrame(animationId);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 bg-steel-900"
    : `relative rounded-xl overflow-hidden ${className}`;

  const containerStyle = fullscreen
    ? {}
    : { width: "100%", aspectRatio: `${width}/${height}` };

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-steel-900 z-10">
          <div className="text-4xl mb-3 animate-spin">⚙️</div>
          <p className="text-steel-400 text-sm">Rendering model…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-steel-900 z-10">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-steel-400 text-sm text-center px-4">{error}</p>
        </div>
      )}

      {/* Three.js mount point */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Controls overlay */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 flex gap-2 z-20">
          <button
            onClick={() => setWireframe((w) => !w)}
            className="bg-steel-800/80 hover:bg-steel-700 text-steel-300 text-xs px-2 py-1 rounded border border-steel-600 transition-colors"
          >
            {wireframe ? "Shaded" : "Wireframe"}
          </button>
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="bg-steel-800/80 hover:bg-steel-700 text-steel-300 text-xs px-2 py-1 rounded border border-steel-600 transition-colors"
          >
            {fullscreen ? "Exit" : "⛶ Expand"}
          </button>
        </div>
      )}
    </div>
  );
}
