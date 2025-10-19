import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// vblob polyfill FIRST (before Three.js)
import { Blob, FileReader } from 'vblob';
globalThis.Blob = Blob;
globalThis.FileReader = FileReader;
globalThis.window = globalThis;

// Import Three.js AFTER polyfills
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000; // Use environment port or 3000
const TEMP_DIR = path.join(__dirname, 'temp');
const serverStartTime = new Date();

app.use(express.json());
app.use('/temp', express.static(TEMP_DIR));
// Add this line to your server.js



app.post('/generate-text', async (req, res) => {
  console.log('Request received:', req.body);

  const { text, depth = 0.4 ,animate = true} = req.body;  // Simplified: Only text required; depth defaults to slim 0.08
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "text" in request body' });
  }

  try {
    const filename = `label-${text}.glb`;
    const filepath = path.join(TEMP_DIR, filename);
    console.log('Starting generation for text:', text, 'depth:', depth);

    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // Load font
    console.log('Fetching font...');
    const fontUrl = 'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json';
    let font;
    try {
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const fontData = await response.json();
      const loader = new FontLoader();
      font = loader.parse(fontData);
      console.log('Font created successfully');
    } catch (fontError) {
      console.error('Font loading error:', fontError);
      throw new Error(`Font failed: ${fontError.message}`);
    }

    // Create geometry
    console.log('Creating geometry...');
    const scene = new THREE.Scene();
    const geometry = new TextGeometry(text, {
      font: font,
      size: 0.8,
      depth: depth,  // Slim extrusion for clean 3D
      curveSegments: 20,
      bevelEnabled: true,
      bevelThickness: 0.025,  // Enhanced: Crisper edges for attractiveness
      bevelSize: 0.025,
      bevelOffset: 0,
      bevelSegments: 5
    });
    console.log('Geometry created with depth:', depth);

    // Center geometry
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    const centerOffsetX = -0.5 * (boundingBox.max.x - boundingBox.min.x);
    const centerOffsetY = -0.5 * (boundingBox.max.y - boundingBox.min.y);
    geometry.translate(centerOffsetX, centerOffsetY, 0);
    console.log('Geometry centered');

    // Enhanced material: Added emissive for subtle glow
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a90e2,  // Vibrant blue
      emissive: 0x4a90e2,  // Soft inner glow
      emissiveIntensity: 0.2,  // Subtle, not overwhelming
      roughness: 0.3,
      metalness: 0.4  // Higher for metallic sheen
    });

    // Mesh with auto-scale for consistent visibility (based on text length)
    const textMesh = new THREE.Mesh(geometry, material);
    textMesh.name = 'AnimatedText'; // <-- ADD THIS LINE
    const textLength = text.length;
    textMesh.scale.setScalar(1 / Math.sqrt(textLength / 10 + 1));  // Slight scale down for longer text
    scene.add(textMesh);
    console.log('Mesh added with scale');

    // Enhanced lights: Added side light for highlights/depth
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);  // Soft fill
    scene.add(ambientLight);
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);  // Front key
    directionalLight1.position.set(1, 1, 1);
    scene.add(directionalLight1);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);  // Side highlight
    directionalLight2.position.set(-1, 0.5, 0.5);
    scene.add(directionalLight2);



    let animations = [];
    if (animate) {
      console.log('Creating animation...');

      // 1. Create the keyframes for a full 360-degree rotation.
      const rotation_times = [0, 30]; // Start at 0 seconds, end at 10 seconds
      const rotation_values = [
          0, 0, 0, 1, // Quaternion for 0 degrees (x, y, z, w)
          0, 1, 0, 0  // Quaternion for 360 degrees (this will be normalized by three.js)
      ];
      
      // To be precise, let's build it from Euler angles
      const startQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
      const endQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI * 2, 0));
      
      const quaternion_values = [
          ...startQuaternion.toArray(),
          ...endQuaternion.toArray()
      ];

      // 2. Create a track that targets the mesh's quaternion property.
      //    The track name is now LOCAL ('.quaternion') because it will be
      //    part of the mesh itself.
      const track = new THREE.QuaternionKeyframeTrack(
          '.quaternion',
          rotation_times,
          quaternion_values
      );

      // 3. Create the clip containing the track.
      const clip = new THREE.AnimationClip('rotate', -1, [track]);

      // 4. THIS IS THE KEY STEP: Attach the clip to the mesh's animations array.
      textMesh.animations.push(clip);

      console.log('Animation clip created and attached to mesh');
    }

  



    // Export
    console.log('Exporting to GLB...');
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (gltf) => {
        try {
          console.log('Export completed. gltf length:', gltf.byteLength || 'N/A');
          fs.writeFileSync(filepath, Buffer.from(gltf));
          console.log('File written');
          const serverUrl = `https://pzgj4j-3000.csb.app/`; 
          const uri = `${serverUrl}/temp/${filename}`;
          res.json({ uri });
        } catch (writeError) {
          console.error('Write error:', writeError);
          res.status(500).json({ error: 'Failed to write GLB' });
        }
      },
      (error) => {
        console.error('Export error:', error);
        res.status(500).json({ error: 'GLTF export failed' });
      },
      { binary: true}  
    );

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/list-files', (req, res) => {
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) {
      console.error("Could not list the directory.", err);
      return res.status(500).json({ error: 'Failed to list files' });
    }

    // Filter the list to only include .glb files
    const glbFiles = files.filter(file => path.extname(file).toLowerCase() === '.glb');
    
    res.json(glbFiles);
  });
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/status', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running.',
    startTime: serverStartTime.toISOString() // Send start time as a standard ISO string
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});




