import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// ...existing code...
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const TEMP_DIR = path.join(__dirname, 'temp');

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from /temp (for accessing .glb via URI)
app.use('/temp', express.static(TEMP_DIR));

// POST endpoint: /generate-text
app.post('/generate-text', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "text" in request body' });
  }

  try {
    // Generate unique filename
    const filename = `label-${Date.now()}.glb`;
    const filepath = path.join(TEMP_DIR, filename);

    // Ensure temp dir exists
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // Load a font (download helvetiker JSON from threejs.org)
    const loader = new FontLoader();
    const fontUrl = 'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json';
    const font = await new Promise((resolve, reject) => {
      loader.load(fontUrl, resolve, undefined, reject);
    });

    // Create scene
    const scene = new THREE.Scene();

    // Create 3D text geometry
    const geometry = new TextGeometry(text, {
      font: font,
      size: 0.5,
      height: 0.1,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelOffset: 0,
      bevelSegments: 5
    });

    // Center the geometry
    geometry.computeBoundingBox();
    const centerOffsetX = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
    geometry.translate(centerOffsetX, 0, 0);

    // Create material (simple white for floating label)
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Create mesh
    const textMesh = new THREE.Mesh(geometry, material);
    scene.add(textMesh);

    // Export to GLB
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      async (gltf) => {
        // gltf is ArrayBuffer when binary:true
        fs.writeFileSync(filepath, Buffer.from(gltf));
        const uri = `http://localhost:${PORT}/temp/${filename}`;
        res.json({ uri });
      },
      { binary: true },
      (error) => {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to generate GLB' });
      }
    );
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: 'Server error during generation' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Test endpoint: POST /generate-text with body { "text": "Your Text Here" }`);
});
// ...existing code...