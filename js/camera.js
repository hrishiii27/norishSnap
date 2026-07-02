/**
 * NourishSnap AI — Camera Module
 * Handles getUserMedia, rear camera stream, frame capture, and fallback to file input.
 */

export class Camera {
  constructor() {
    this.videoEl = document.getElementById('camera-stream');
    this.canvasEl = document.getElementById('capture-canvas');
    this.previewEl = document.getElementById('captured-preview');
    this.fallbackEl = document.getElementById('camera-fallback');
    this.fileInput = document.getElementById('file-upload-input');

    this.stream = null;
    this.ctx = this.canvasEl.getContext('2d');
  }

  /**
   * Start the rear-facing camera stream.
   * Falls back to file upload if camera access is denied.
   */
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();
      return true;
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err.message);
      this.showFallback();
      return false;
    }
  }

  /**
   * Capture the current video frame as a Blob (JPEG).
   * @returns {Promise<{ blob: Blob, dataUrl: string }>}
   */
  async capture() {
    const vw = this.videoEl.videoWidth;
    const vh = this.videoEl.videoHeight;

    this.canvasEl.width = vw;
    this.canvasEl.height = vh;
    this.ctx.drawImage(this.videoEl, 0, 0, vw, vh);

    // Show captured frame as preview
    const dataUrl = this.canvasEl.toDataURL('image/jpeg', 0.92);
    this.previewEl.src = dataUrl;
    this.previewEl.classList.remove('hidden');

    // Pause the live stream
    this.videoEl.pause();

    const blob = await new Promise((resolve) =>
      this.canvasEl.toBlob(resolve, 'image/jpeg', 0.92)
    );

    return { blob, dataUrl };
  }

  /**
   * Read a file from the file input as a captured image.
   * @param {File} file
   * @returns {Promise<{ blob: Blob, dataUrl: string }>}
   */
  async readFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        this.previewEl.src = dataUrl;
        this.previewEl.classList.remove('hidden');
        resolve({ blob: file, dataUrl });
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Resume the live camera stream after a retake.
   */
  resume() {
    this.previewEl.classList.add('hidden');
    this.previewEl.src = '';
    if (this.stream) {
      this.videoEl.play();
    }
  }

  /**
   * Stop the camera stream entirely.
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /** Show the file upload fallback UI */
  showFallback() {
    this.fallbackEl.classList.remove('hidden');
  }

  /** Set up file input change handler */
  onFileSelected(callback) {
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) callback(file);
    });
  }
}
