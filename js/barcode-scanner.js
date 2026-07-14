// Barcode Scanner Module
// Uses native BarcodeDetector API (Chrome/Android) with fallback messaging for Safari

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/product';

let barcodeDetector = null;
let scanAnimationFrame = null;
let scanStream = null;

/**
 * Check if BarcodeDetector API is available
 */
function isBarcodeDetectorSupported() {
  return 'BarcodeDetector' in window;
}

/**
 * Initialize barcode scanner
 * @param {HTMLVideoElement} videoEl - The video element to use for scanning
 * @param {Function} onDetect - Callback when a barcode is detected, receives the code string
 * @param {Function} onError - Callback for errors
 */
export async function startBarcodeScanner(videoEl, onDetect, onError) {
  if (!isBarcodeDetectorSupported()) {
    onError('Barcode scanning is not supported in your browser. Please use Chrome or Edge on Android.');
    return false;
  }

  try {
    barcodeDetector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']
    });

    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });

    videoEl.srcObject = scanStream;
    await videoEl.play();

    // Start scanning loop
    const scan = async () => {
      if (!scanStream) return;
      try {
        const barcodes = await barcodeDetector.detect(videoEl);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          stopBarcodeScanner(videoEl);
          onDetect(code);
          return;
        }
      } catch (e) {
        // Detection can fail intermittently, just keep trying
      }
      scanAnimationFrame = requestAnimationFrame(scan);
    };
    scanAnimationFrame = requestAnimationFrame(scan);
    return true;
  } catch (err) {
    onError('Could not access camera: ' + err.message);
    return false;
  }
}

/**
 * Stop the barcode scanner
 */
export function stopBarcodeScanner(videoEl) {
  if (scanAnimationFrame) {
    cancelAnimationFrame(scanAnimationFrame);
    scanAnimationFrame = null;
  }
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  if (videoEl) {
    videoEl.srcObject = null;
  }
}

/**
 * Look up a barcode in the Open Food Facts database
 * @param {string} code - The barcode number
 * @returns {Object|null} - Nutrition data or null if not found
 */
export async function lookupBarcode(code) {
  try {
    const response = await fetch(`${OPEN_FOOD_FACTS_API}/${code}.json`);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;

    const product = data.product;
    const nutriments = product.nutriments || {};
    
    // Get serving size
    const servingSize = product.serving_quantity || 100;
    const productName = product.product_name || product.product_name_en || 'Unknown Product';
    const brand = product.brands || '';
    
    // Per 100g values
    const caloriesPer100 = nutriments['energy-kcal_100g'] || nutriments['energy_100g'] || 0;
    const proteinPer100 = nutriments.proteins_100g || 0;
    const carbsPer100 = nutriments.carbohydrates_100g || 0;
    const fatsPer100 = nutriments.fat_100g || 0;
    
    // Convert to per serving
    const scale = servingSize / 100;
    
    return {
      food_name: brand ? `${productName} (${brand})` : productName,
      calories: Math.round(caloriesPer100 * scale),
      protein: +(proteinPer100 * scale).toFixed(1),
      carbs: +(carbsPer100 * scale).toFixed(1),
      fats: +(fatsPer100 * scale).toFixed(1),
      weight_grams: servingSize,
      display_unit: 'serving',
      household_unit_weight_g: servingSize,
      barcode: code,
      source: 'barcode',
      // Extra info for display
      image_url: product.image_url || product.image_front_url || null,
      per100g: {
        calories: Math.round(caloriesPer100),
        protein: +(proteinPer100).toFixed(1),
        carbs: +(carbsPer100).toFixed(1),
        fats: +(fatsPer100).toFixed(1),
      }
    };
  } catch (err) {
    console.error('Barcode lookup failed:', err);
    return null;
  }
}
