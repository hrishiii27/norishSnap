/**
 * NourishSnap AI — Image Compression Utility
 * Client-side canvas-based compression to keep payloads < 1.2MB
 * per FR-1.2 requirement.
 */

const MAX_FILE_SIZE = 1.2 * 1024 * 1024; // 1.2 MB
const MAX_DIMENSION = 1280;
const MIN_QUALITY = 0.5;

/**
 * Compress an image blob/dataUrl to under 1.2MB using canvas downscaling + JPEG quality iteration.
 * @param {Blob|string} input - Image blob or data URL
 * @returns {Promise<{ blob: Blob, base64: string, width: number, height: number }>}
 */
export async function compressImage(input) {
  const img = await loadImage(input);

  // Calculate target dimensions (max 1280px on longest edge)
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  // Iteratively reduce quality until under size limit
  let quality = 0.88;
  let blob;

  do {
    blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_FILE_SIZE) break;
    quality -= 0.08;
  } while (quality >= MIN_QUALITY);

  // If still too large, scale down further
  if (blob.size > MAX_FILE_SIZE) {
    const scale = Math.sqrt(MAX_FILE_SIZE / blob.size);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await canvasToBlob(canvas, MIN_QUALITY);
  }

  const base64 = await blobToBase64(blob);

  return {
    blob,
    base64,
    width: canvas.width,
    height: canvas.height,
  };
}

/** Load an image from blob or data URL */
function loadImage(input) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = typeof input === 'string' ? input : URL.createObjectURL(input);
  });
}

/** Canvas to Blob helper */
function canvasToBlob(canvas, quality) {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
}

/** Blob to base64 data URL */
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
