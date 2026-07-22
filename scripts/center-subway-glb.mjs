import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourcePath = path.join(projectRoot, "Source", "subway.glb");
const outputPath = path.join(projectRoot, "assets", "subway-centered.glb");

const source = fs.readFileSync(sourcePath);
if (source.toString("ascii", 0, 4) !== "glTF" || source.readUInt32LE(4) !== 2) {
  throw new Error("Source/subway.glb is not a GLB 2.0 file");
}

const chunks = [];
for (let offset = 12; offset < source.length;) {
  const length = source.readUInt32LE(offset);
  const type = source.readUInt32LE(offset + 4);
  const dataStart = offset + 8;
  chunks.push({ type, data: source.subarray(dataStart, dataStart + length) });
  offset = dataStart + length;
}

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
const binChunk = chunks.find((chunk) => chunk.type === BIN_CHUNK);
if (!jsonChunk) throw new Error("GLB has no JSON chunk");
if (!binChunk) throw new Error("GLB has no binary chunk");

const gltf = JSON.parse(jsonChunk.data.toString("utf8").replace(/[\u0000 ]+$/u, ""));
const positionAccessors = new Set();
for (const mesh of gltf.meshes || []) {
  for (const primitive of mesh.primitives || []) {
    if (Number.isInteger(primitive.attributes?.POSITION)) {
      positionAccessors.add(primitive.attributes.POSITION);
    }
  }
}

const minimum = [Infinity, Infinity, Infinity];
const maximum = [-Infinity, -Infinity, -Infinity];
for (const accessorIndex of positionAccessors) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor?.min || !accessor?.max) continue;
  for (let axis = 0; axis < 3; axis += 1) {
    minimum[axis] = Math.min(minimum[axis], Number(accessor.min[axis]));
    maximum[axis] = Math.max(maximum[axis], Number(accessor.max[axis]));
  }
}
if (minimum.some((value) => !Number.isFinite(value)) || maximum.some((value) => !Number.isFinite(value))) {
  throw new Error("Could not calculate the subway model bounds");
}

const center = minimum.map((value, axis) => (value + maximum[axis]) / 2);
const transformedMeshNode = (gltf.nodes || []).find((node) => (
  Number.isInteger(node.mesh) && (node.matrix || node.translation || node.rotation || node.scale)
));
if (transformedMeshNode) {
  throw new Error("This builder expects the source mesh nodes to have identity transforms");
}

// Bake the center subtraction into every POSITION value. A wrapper-node translation looks
// equivalent in a general glTF viewer, but ScenegraphLayer applies its per-instance rotation
// outside the loaded scenegraph. Baking makes the instance origin unambiguously coincide with
// the train-dot coordinate before heading, roll, or pixel-size scaling are applied.
const centeredBin = Buffer.from(binChunk.data);
for (const accessorIndex of positionAccessors) {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView || accessor.componentType !== 5126 || accessor.type !== "VEC3" || accessor.sparse) {
    throw new Error(`Unsupported POSITION accessor ${accessorIndex}`);
  }
  if ((bufferView.buffer || 0) !== 0) {
    throw new Error(`POSITION accessor ${accessorIndex} is not in GLB buffer 0`);
  }
  const stride = bufferView.byteStride || 12;
  const firstByte = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  for (let vertex = 0; vertex < accessor.count; vertex += 1) {
    const vertexByte = firstByte + vertex * stride;
    for (let axis = 0; axis < 3; axis += 1) {
      const componentByte = vertexByte + axis * 4;
      centeredBin.writeFloatLE(centeredBin.readFloatLE(componentByte) - center[axis], componentByte);
    }
  }
  accessor.min = accessor.min.map((value, axis) => Number(value) - center[axis]);
  accessor.max = accessor.max.map((value, axis) => Number(value) - center[axis]);
}
gltf.asset.extras = Object.assign({}, gltf.asset.extras, {
  generatedFrom: "Source/subway.glb",
  originalBoundsCenter: center,
  centeringMethod: "POSITION values baked around origin"
});

const jsonBytes = Buffer.from(JSON.stringify(gltf), "utf8");
const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
const paddedJson = Buffer.alloc(paddedJsonLength, 0x20);
jsonBytes.copy(paddedJson);

const outputChunks = chunks.map((chunk) => (
  chunk.type === JSON_CHUNK ? { type: chunk.type, data: paddedJson }
    : chunk.type === BIN_CHUNK ? { type: chunk.type, data: centeredBin }
      : chunk
));
const totalLength = 12 + outputChunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
const output = Buffer.alloc(totalLength);
output.write("glTF", 0, "ascii");
output.writeUInt32LE(2, 4);
output.writeUInt32LE(totalLength, 8);

let outputOffset = 12;
for (const chunk of outputChunks) {
  output.writeUInt32LE(chunk.data.length, outputOffset);
  output.writeUInt32LE(chunk.type, outputOffset + 4);
  chunk.data.copy(output, outputOffset + 8);
  outputOffset += 8 + chunk.data.length;
}

fs.writeFileSync(outputPath, output);
console.log(JSON.stringify({
  source: path.relative(projectRoot, sourcePath),
  output: path.relative(projectRoot, outputPath),
  center,
  dimensions: minimum.map((value, axis) => maximum[axis] - value),
  bytes: output.length
}, null, 2));
