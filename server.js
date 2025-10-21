import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { put } from '@vercel/blob';
import { randomBytes } from 'crypto';

// vblob polyfill
import { Blob, FileReader } from 'vblob';
globalThis.Blob = Blob;
globalThis.FileReader = FileReader;
globalThis.window = globalThis;

// Three.js imports
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// --- HELPER FUNCTION FOR UNIQUE FILENAMES ---
function generateUniqueFilename(text) {
  const sanitizedText = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hash = randomBytes(4).toString('hex');
  const shortText = sanitizedText.substring(0, 30);
  return `label-${shortText}-${hash}.glb`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;
app.use(express.json());

app.post('/generate-text', async (req, res) => {
  console.log('Request received:', req.body);
  const { text, depth = 0.4, animate = true } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "text" in request body' });
  }

  try {
    console.log('Fetching font...');
    const fontUrl = 'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json';
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Font fetch failed: ${response.statusText}`);
    const fontData = await response.json();
    const font = new FontLoader().parse(fontData);

    console.log('Creating geometry...');
    const scene = new THREE.Scene();
    const geometry = new TextGeometry(text, {
      font: font, size: 0.8, depth: depth, curveSegments: 20,
      bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025,
      bevelOffset: 0, bevelSegments: 5
    });

    geometry.computeBoundingBox();
    const { max, min } = geometry.boundingBox;
    geometry.translate(-0.5 * (max.x - min.x), -0.5 * (max.y - min.y), 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0x4a90e2, emissive: 0x4a90e2, emissiveIntensity: 0.2,
      roughness: 0.3, metalness: 0.4
    });

    const textMesh = new THREE.Mesh(geometry, material);
    textMesh.scale.setScalar(1 / Math.sqrt(text.length / 10 + 1));
    scene.add(textMesh);

    if (animate) {
      console.log('Creating animation...');
      const rotation_times = [0, 10]; // 10 second loop
      const startQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
      const endQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI * 2, 0));
      const quaternion_values = [...startQuaternion.toArray(), ...endQuaternion.toArray()];
      const track = new THREE.QuaternionKeyframeTrack('.quaternion', rotation_times, quaternion_values);
      const clip = new THREE.AnimationClip('rotate', -1, [track]);
      textMesh.animations.push(clip);
    }
    
    console.log('Exporting to GLB...');
    const exporter = new GLTFExporter();
    exporter.parse(scene, async (gltf) => {
        try {
          console.log('Export completed. Uploading to Vercel Blob...');
          const filename = generateUniqueFilename(text); // <-- FIX #2: Function is now defined
          const buffer = Buffer.from(gltf);

          const blob = await put(filename, buffer, { access: 'public' });
          
          console.log('File uploaded. URL:', blob.url);
          res.json({ uri: blob.url }); // <-- FIX #1: Use blob.url
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
          res.status(500).json({ error: 'Failed to upload GLB file' });
        }
      },
      (error) => {
        console.error('GLTF Export error:', error);
        res.status(500).json({ error: 'GLTF export failed' });
      },
      { binary: true }
    );
  } catch (error) {
    console.error('Overall Error:', error);
    res.status(500).json({ error: 'Server error during generation' });
  }
});

// Serve the student viewer and status page (optional, but good for testing)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/status', (req, res) => res.status(200).json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Export the app for Vercel
export default app;