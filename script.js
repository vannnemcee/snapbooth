/**
 * SNAPBOOTH — Interactive Web Photobooth Studio
 * Pure Vanilla JavaScript (ES6+), Web MediaDevices API, HTML5 Canvas API
 */

(() => {
  'use strict';

  /* ========================================================================
     1. CONSTANTS & TEMPLATE DEFINITIONS
     ======================================================================== */
  const STORAGE_KEY = 'snapbooth_prefs_v1';

  const ASPECT_RATIOS = {
    '4:3': 4 / 3,
    '1:1': 1,
    '3:2': 3 / 2,
    '16:9': 16 / 9
  };

  const TEMPLATES = [
    {
      id: 'classic',
      name: 'Classic Strip',
      badge: '1-COL BOOTH',
      layoutSpec: 'Vertical Single-Column Booth Strip',
      description: 'Timeless photobooth vertical frame in crisp gallery white with hairline borders and classic bottom chin.',
      defaultBg: '#FFFFFF',
      defaultTitle: 'SNAPBOOTH'
    },
    {
      id: 'minimal',
      name: 'Minimal Studio',
      badge: 'EDITORIAL GRID',
      layoutSpec: 'Asymmetric / Architectural Gallery Sheet',
      description: 'Warm studio cream contact sheet with razor-sharp edges, asymmetric trio or balanced architectural grid.',
      defaultBg: '#F5F1E8',
      defaultTitle: 'MINIMAL STUDIO'
    },
    {
      id: 'retro',
      name: 'Retro Film',
      badge: '35MM ANALOG',
      layoutSpec: 'Perforated 35mm Celluloid Strip',
      description: 'Darkroom analog film stock featuring sprocket perforations, amber edge frame numbers, and vintage date stamp.',
      defaultBg: '#171514',
      defaultTitle: 'ANALOG ARCHIVE'
    },
    {
      id: 'darkroom',
      name: 'Darkroom',
      badge: 'SPINE + PROOF',
      layoutSpec: 'Obsidian Print with Vertical Metadata Spine',
      description: 'Luxury black proof sheet with a rotated technical metadata rail and precision corner registration marks.',
      defaultBg: '#0F0F0F',
      defaultTitle: 'DARKROOM EDITION'
    },
    {
      id: 'pastel',
      name: 'Pastel Memories',
      badge: 'STAGGERED CARD',
      layoutSpec: 'Soft Matted Polaroid Collage',
      description: 'Gentle pastel blush backdrop with rounded white inner photo mats, staggered rhythm, and geometric accents.',
      defaultBg: '#FBEAE7',
      defaultTitle: 'SWEET MEMORIES'
    },
    {
      id: 'event',
      name: 'Event Special',
      badge: 'POSTER + STUB',
      layoutSpec: 'Commemorative Marquee & Mosaic Ticket',
      description: 'Celebratory event poster with a prominent title & date marquee, feature mosaic layout, and perforated barcode stub.',
      defaultBg: '#FAF6EE',
      defaultTitle: 'SPECIAL EVENT'
    }
  ];

  /* ========================================================================
     2. APPLICATION STATE
     ======================================================================== */
  function formatTodayDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }

  function loadPreferences() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  const savedPrefs = loadPreferences();

  const state = {
    currentView: 'studio', // 'studio' | 'templates' | 'about'
    currentStep: 1,        // 1..6
    photoCount: [3, 4, 6].includes(savedPrefs.photoCount) ? savedPrefs.photoCount : 4,
    galleryPreviewCount: [3, 4, 6].includes(savedPrefs.photoCount) ? savedPrefs.photoCount : 4,
    aspectRatio: ASPECT_RATIOS[savedPrefs.aspectRatio] ? savedPrefs.aspectRatio : '4:3',
    timerSeconds: [0, 3, 5, 10].includes(savedPrefs.timerSeconds) ? savedPrefs.timerSeconds : 3,
    isMirrored: typeof savedPrefs.isMirrored === 'boolean' ? savedPrefs.isMirrored : true,
    showGrid: typeof savedPrefs.showGrid === 'boolean' ? savedPrefs.showGrid : true,
    autoSequence: Boolean(savedPrefs.autoSequence),
    templateId: TEMPLATES.some((t) => t.id === savedPrefs.templateId) ? savedPrefs.templateId : 'classic',

    // Camera runtime
    stream: null,
    isCameraActive: false,
    facingMode: 'user',
    currentDeviceId: null,
    videoDevices: [],
    isCapturing: false,
    abortCapture: false,
    countdownTimeoutId: null,

    // Captured frames: sparse/indexed array of { canvas, thumbUrl, capturedAt }
    photos: [],
    retakeIndex: null,

    // Editor state
    edit: {
      filter: 'normal',
      brightness: 0,
      contrast: 0,
      saturation: 0,
      customBg: null, // null -> uses active template's defaultBg
      title: '',
      titleTouched: false,
      date: formatTodayDate()
    },

    // Modal callback
    pendingConfirmAction: null
  };

  // Initialize default title from selected template
  const initialTemplate = getTemplateById(state.templateId);
  state.edit.title = initialTemplate.defaultTitle;

  function savePreferences() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          photoCount: state.photoCount,
          aspectRatio: state.aspectRatio,
          timerSeconds: state.timerSeconds,
          isMirrored: state.isMirrored,
          showGrid: state.showGrid,
          autoSequence: state.autoSequence,
          templateId: state.templateId
        })
      );
    } catch {
      // Ignore storage quota / private mode restrictions
    }
  }

  function getTemplateById(id) {
    return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
  }

  /* ========================================================================
     3. DOM REFERENCES
     ======================================================================== */
  const dom = {
    // Header & Views
    brandLogo: document.getElementById('brandLogo'),
    navLinks: document.querySelectorAll('[data-nav]'),
    headerStartBtn: document.getElementById('headerStartBtn'),
    viewStudio: document.getElementById('viewStudio'),
    viewTemplates: document.getElementById('viewTemplates'),
    viewAbout: document.getElementById('viewAbout'),

    // Stepper & Stages
    stepperItems: document.querySelectorAll('.stepper-item'),
    stepperBtns: document.querySelectorAll('[data-goto-step]'),
    stageWelcome: document.getElementById('stageWelcome'),
    stageCamera: document.getElementById('stageCamera'),
    stageTemplates: document.getElementById('stageTemplates'),
    stageEditor: document.getElementById('stageEditor'),
    stageExport: document.getElementById('stageExport'),

    // Step 1: Welcome
    modeCards: document.querySelectorAll('.mode-card'),
    welcomeStartBtn: document.getElementById('welcomeStartBtn'),
    welcomeExploreTemplatesBtn: document.getElementById('welcomeExploreTemplatesBtn'),
    heroSampleCanvasA: document.getElementById('heroSampleCanvasA'),
    heroSampleCanvasB: document.getElementById('heroSampleCanvasB'),

    // Step 2 & 3: Camera Studio
    cameraBackBtn: document.getElementById('cameraBackBtn'),
    cameraStatusDot: document.getElementById('cameraStatusDot'),
    cameraStatusText: document.getElementById('cameraStatusText'),
    stripCountBtns: document.querySelectorAll('[data-strip-count]'),
    ratioBtns: document.querySelectorAll('[data-ratio]'),
    timerBtns: document.querySelectorAll('[data-timer]'),
    viewfinderShell: document.getElementById('viewfinderShell'),
    viewfinderStage: document.getElementById('viewfinderStage'),
    cameraVideo: document.getElementById('cameraVideo'),
    compositionGrid: document.getElementById('compositionGrid'),
    hudRatioLabel: document.getElementById('hudRatioLabel'),
    hudRetakeBanner: document.getElementById('hudRetakeBanner'),
    hudShotCounter: document.getElementById('hudShotCounter'),
    countdownOverlay: document.getElementById('countdownOverlay'),
    countdownNumber: document.getElementById('countdownNumber'),
    countdownSub: document.getElementById('countdownSub'),
    flashOverlay: document.getElementById('flashOverlay'),
    cameraPlaceholder: document.getElementById('cameraPlaceholder'),
    placeholderTitle: document.getElementById('placeholderTitle'),
    placeholderDesc: document.getElementById('placeholderDesc'),
    enableCameraBtn: document.getElementById('enableCameraBtn'),
    fallbackUploadLabel: document.getElementById('fallbackUploadLabel'),
    fallbackFileInput: document.getElementById('fallbackFileInput'),
    cameraErrorMsg: document.getElementById('cameraErrorMsg'),

    toggleCameraPowerBtn: document.getElementById('toggleCameraPowerBtn'),
    toggleCameraPowerText: document.getElementById('toggleCameraPowerText'),
    switchCameraBtn: document.getElementById('switchCameraBtn'),
    mirrorToggleBtn: document.getElementById('mirrorToggleBtn'),
    takePhotoBtn: document.getElementById('takePhotoBtn'),
    shutterCaption: document.getElementById('shutterCaption'),
    autoSequenceBtn: document.getElementById('autoSequenceBtn'),
    autoSequenceLabel: document.getElementById('autoSequenceLabel'),
    gridToggleBtn: document.getElementById('gridToggleBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),

    // Session Tray
    trayProgressText: document.getElementById('trayProgressText'),
    clearPhotosBtn: document.getElementById('clearPhotosBtn'),
    deviceSelectRow: document.getElementById('deviceSelectRow'),
    cameraDeviceSelect: document.getElementById('cameraDeviceSelect'),
    photoSlotsGrid: document.getElementById('photoSlotsGrid'),
    toTemplatesBtn: document.getElementById('toTemplatesBtn'),
    trayHintText: document.getElementById('trayHintText'),

    // Step 4: Templates
    templateBackToCameraBtn: document.getElementById('templateBackToCameraBtn'),
    templateToEditorBtn: document.getElementById('templateToEditorBtn'),
    templateStageCanvas: document.getElementById('templateStageCanvas'),
    templateStageName: document.getElementById('templateStageName'),
    templateStageSpec: document.getElementById('templateStageSpec'),
    stepTemplateGrid: document.getElementById('stepTemplateGrid'),

    // Step 5: Editor
    editorBackBtn: document.getElementById('editorBackBtn'),
    editorToExportBtn: document.getElementById('editorToExportBtn'),
    editorCanvas: document.getElementById('editorCanvas'),
    editorResolutionLabel: document.getElementById('editorResolutionLabel'),
    editorTemplatePills: document.getElementById('editorTemplatePills'),
    filterChips: document.querySelectorAll('[data-filter]'),
    brightnessSlider: document.getElementById('brightnessSlider'),
    contrastSlider: document.getElementById('contrastSlider'),
    saturationSlider: document.getElementById('saturationSlider'),
    brightnessVal: document.getElementById('brightnessVal'),
    contrastVal: document.getElementById('contrastVal'),
    saturationVal: document.getElementById('saturationVal'),
    bgSwatches: document.querySelectorAll('[data-bg]'),
    customBgPicker: document.getElementById('customBgPicker'),
    resetBgColorBtn: document.getElementById('resetBgColorBtn'),
    stripTitleInput: document.getElementById('stripTitleInput'),
    stripDateInput: document.getElementById('stripDateInput'),
    resetEditsBtn: document.getElementById('resetEditsBtn'),

    // Step 6: Export & Print
    finalCanvas: document.getElementById('finalCanvas'),
    exportMetaTemplate: document.getElementById('exportMetaTemplate'),
    exportMetaFrames: document.getElementById('exportMetaFrames'),
    exportMetaDimensions: document.getElementById('exportMetaDimensions'),
    exportMetaFilter: document.getElementById('exportMetaFilter'),
    downloadPngBtn: document.getElementById('downloadPngBtn'),
    downloadJpgBtn: document.getElementById('downloadJpgBtn'),
    printStripBtn: document.getElementById('printStripBtn'),
    backToEditorBtn: document.getElementById('backToEditorBtn'),
    startNewSessionBtn: document.getElementById('startNewSessionBtn'),
    printableStripImage: document.getElementById('printableStripImage'),

    // Catalog & About
    galleryCountBtns: document.querySelectorAll('[data-gallery-count]'),
    catalogTemplatesGrid: document.getElementById('catalogTemplatesGrid'),
    aboutStartBtn: document.getElementById('aboutStartBtn'),

    // Toast & Modal
    toastContainer: document.getElementById('toastContainer'),
    confirmModal: document.getElementById('confirmModal'),
    confirmModalTitle: document.getElementById('confirmModalTitle'),
    confirmModalBody: document.getElementById('confirmModalBody'),
    confirmCancelBtn: document.getElementById('confirmCancelBtn'),
    confirmAcceptBtn: document.getElementById('confirmAcceptBtn')
  };

  /* ========================================================================
     4. AUDIO FEEDBACK (Subtle Web Audio Shutter & Tick)
     ======================================================================== */
  let audioCtx = null;

  function ensureAudioCtx() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    } catch {
      return null;
    }
  }

  function playTickSound() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.065);
    } catch {
      // Ignore audio errors
    }
  }

  function playShutterSound() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const bufferSize = Math.floor(ctx.sampleRate * 0.055);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch {
      // Ignore audio errors
    }
  }

  /* ========================================================================
     5. TOAST & MODAL UTILITIES
     ======================================================================== */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  function openConfirmModal(title, body, acceptLabel, onAccept) {
    dom.confirmModalTitle.textContent = title;
    dom.confirmModalBody.textContent = body;
    dom.confirmAcceptBtn.textContent = acceptLabel || 'Confirm';
    state.pendingConfirmAction = onAccept;
    dom.confirmModal.hidden = false;
  }

  function closeConfirmModal() {
    dom.confirmModal.hidden = true;
    state.pendingConfirmAction = null;
  }

  /* ========================================================================
     6. SESSION HELPERS & NAVIGATION
     ======================================================================== */
  function getCapturedCount() {
    let count = 0;
    for (let i = 0; i < state.photoCount; i++) {
      if (state.photos[i] && state.photos[i].canvas) count++;
    }
    return count;
  }

  function isSessionComplete() {
    return getCapturedCount() === state.photoCount;
  }

  function getNextTargetSlotIndex() {
    if (state.retakeIndex !== null && state.retakeIndex < state.photoCount) {
      return state.retakeIndex;
    }
    for (let i = 0; i < state.photoCount; i++) {
      if (!state.photos[i]) return i;
    }
    return null;
  }

  function canAccessStep(step) {
    if (step <= 3) return true;
    return isSessionComplete();
  }

  function switchView(viewName) {
    state.currentView = viewName;
    dom.navLinks.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.nav === viewName);
    });

    dom.viewStudio.classList.toggle('is-active', viewName === 'studio');
    dom.viewTemplates.classList.toggle('is-active', viewName === 'templates');
    dom.viewAbout.classList.toggle('is-active', viewName === 'about');

    if (viewName === 'templates') {
      renderCatalogView();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToStep(stepNumber) {
    if (state.isCapturing) {
      cancelCountdown();
    }

    if (!canAccessStep(stepNumber)) {
      showToast(`Capture all ${state.photoCount} photos first to unlock this step.`);
      return;
    }

    if (state.currentView !== 'studio') {
      switchView('studio');
    }

    state.currentStep = stepNumber;

    // Show matching stage (Steps 2 & 3 share #stageCamera seamlessly)
    dom.stageWelcome.classList.toggle('is-active', stepNumber === 1);
    dom.stageCamera.classList.toggle('is-active', stepNumber === 2 || stepNumber === 3);
    dom.stageTemplates.classList.toggle('is-active', stepNumber === 4);
    dom.stageEditor.classList.toggle('is-active', stepNumber === 5);
    dom.stageExport.classList.toggle('is-active', stepNumber === 6);

    updateStepperUI();
    updateCameraUI();

    if (stepNumber === 4) {
      renderStep4Templates();
    } else if (stepNumber === 5) {
      syncEditorControls();
      renderEditorPreview();
    } else if (stepNumber === 6) {
      renderFinalExportStage();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateStepperUI() {
    const complete = isSessionComplete();
    dom.stepperItems.forEach((item) => {
      const step = Number(item.dataset.step);
      const btn = item.querySelector('.stepper-btn');
      const isActive = step === state.currentStep;
      let isDone = false;

      if (step < state.currentStep) {
        isDone = true;
      } else if (step <= 3 && complete && state.currentStep >= 4) {
        isDone = true;
      }

      item.classList.toggle('is-active', isActive);
      item.classList.toggle('is-done', !isActive && isDone);
      btn.disabled = !canAccessStep(step);
    });
  }

  /* ========================================================================
     7. CAMERA MANAGEMENT (MediaDevices API)
     ======================================================================== */
  async function refreshVideoDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.videoDevices = devices.filter((d) => d.kind === 'videoinput');

      if (state.videoDevices.length > 1) {
        dom.deviceSelectRow.hidden = false;
        dom.cameraDeviceSelect.innerHTML = '';
        state.videoDevices.forEach((device, idx) => {
          const opt = document.createElement('option');
          opt.value = device.deviceId;
          opt.textContent = device.label || `Camera ${idx + 1}`;
          if (device.deviceId === state.currentDeviceId) {
            opt.selected = true;
          }
          dom.cameraDeviceSelect.appendChild(opt);
        });
      } else {
        dom.deviceSelectRow.hidden = true;
      }
    } catch {
      dom.deviceSelectRow.hidden = true;
    }
  }

  async function startCamera(options = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      handleCameraError({
        name: 'UnsupportedError',
        message: 'Browser camera API unavailable. Open SnapBooth via localhost or HTTPS.'
      });
      return;
    }

    dom.cameraErrorMsg.hidden = true;
    dom.enableCameraBtn.disabled = true;

    // Stop previous tracks cleanly before opening a new stream
    stopCameraStreamOnly();

    const targetDeviceId = options.deviceId !== undefined ? options.deviceId : state.currentDeviceId;
    const targetFacing = options.facingMode || state.facingMode;

    const videoConstraints = {
      width: { ideal: 1920 },
      height: { ideal: 1440 }
    };

    if (targetDeviceId) {
      videoConstraints.deviceId = { exact: targetDeviceId };
    } else {
      videoConstraints.facingMode = { ideal: targetFacing };
    }

    try {
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });
      } catch (constraintErr) {
        // Fallback to basic video constraint if exact device or resolution failed
        if (
          constraintErr.name === 'OverconstrainedError' ||
          constraintErr.name === 'ConstraintNotSatisfiedError' ||
          constraintErr.name === 'NotFoundError'
        ) {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        } else {
          throw constraintErr;
        }
      }

      state.stream = mediaStream;
      dom.cameraVideo.srcObject = mediaStream;
      await dom.cameraVideo.play();

      const activeTrack = mediaStream.getVideoTracks()[0];
      if (activeTrack) {
        const settings = activeTrack.getSettings ? activeTrack.getSettings() : {};
        if (settings.deviceId) {
          state.currentDeviceId = settings.deviceId;
        }
        if (settings.facingMode) {
          state.facingMode = settings.facingMode;
          if (options.autoMirrorOnSwitch) {
            state.isMirrored = settings.facingMode !== 'environment';
            savePreferences();
          }
        }
      }

      state.isCameraActive = true;
      dom.cameraPlaceholder.hidden = true;
      dom.enableCameraBtn.disabled = false;

      await refreshVideoDevices();

      // Automatically move from Step 2 (Setup) to Step 3 (Take Photos) once live
      if (state.currentStep === 2) {
        state.currentStep = 3;
        updateStepperUI();
      }

      updateCameraUI();
    } catch (err) {
      dom.enableCameraBtn.disabled = false;
      handleCameraError(err);
    }
  }

  function stopCameraStreamOnly() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    dom.cameraVideo.srcObject = null;
    state.isCameraActive = false;
  }

  function stopCamera() {
    cancelCountdown();
    stopCameraStreamOnly();
    dom.cameraPlaceholder.hidden = false;
    dom.placeholderTitle.textContent = 'Camera Paused';
    dom.placeholderDesc.textContent = 'Click Enable Camera whenever you are ready to resume your live preview.';
    updateCameraUI();
  }

  function handleCameraError(err) {
    state.isCameraActive = false;
    dom.cameraPlaceholder.hidden = false;
    dom.fallbackUploadLabel.hidden = false;
    dom.cameraErrorMsg.hidden = false;

    let friendlyMessage = 'Unable to access camera. Please check your device permissions and try again.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      dom.placeholderTitle.textContent = 'Camera Permission Denied';
      friendlyMessage = 'Camera access was blocked. Allow camera permission in your browser address bar, then click Enable Camera.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      dom.placeholderTitle.textContent = 'No Camera Detected';
      friendlyMessage = 'No camera hardware was found on this device. Connect a webcam or use Import Photos Instead to test templates & printing.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      dom.placeholderTitle.textContent = 'Camera Busy';
      friendlyMessage = 'Your camera is currently in use by another application. Close other camera apps and try again.';
    } else if (err.name === 'UnsupportedError') {
      dom.placeholderTitle.textContent = 'Camera API Restricted';
      friendlyMessage = err.message;
    }

    dom.cameraErrorMsg.textContent = friendlyMessage;
    dom.cameraStatusDot.className = 'status-indicator is-error';
    dom.cameraStatusText.textContent = 'Camera Unavailable';
    updateCameraUI();
  }

  async function switchCamera() {
    if (state.isCapturing) return;
    await refreshVideoDevices();

    if (state.videoDevices.length > 1) {
      const currentIdx = state.videoDevices.findIndex((d) => d.deviceId === state.currentDeviceId);
      const nextDevice = state.videoDevices[(currentIdx + 1) % state.videoDevices.length];
      state.currentDeviceId = nextDevice.deviceId;
      await startCamera({ deviceId: nextDevice.deviceId, autoMirrorOnSwitch: true });
      showToast(`Switched to ${nextDevice.label || 'alternate camera'}`);
    } else {
      // Attempt mobile front/back toggle via facingMode
      const nextFacing = state.facingMode === 'user' ? 'environment' : 'user';
      const prevDeviceId = state.currentDeviceId;
      state.facingMode = nextFacing;
      state.currentDeviceId = null;
      await startCamera({ deviceId: null, facingMode: nextFacing, autoMirrorOnSwitch: true });

      if (state.currentDeviceId && state.currentDeviceId === prevDeviceId && state.videoDevices.length <= 1) {
        showToast('Only one camera detected on this device.');
      }
    }
  }

  function toggleFullscreen() {
    const elem = dom.viewfinderShell;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  /* ========================================================================
     8. PHOTO CAPTURE & RETAKE SYSTEM
     ======================================================================== */
  function cancelCountdown() {
    state.abortCapture = true;
    state.isCapturing = false;
    if (state.countdownTimeoutId) {
      clearTimeout(state.countdownTimeoutId);
      state.countdownTimeoutId = null;
    }
    dom.countdownOverlay.hidden = true;
    updateCameraUI();
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      state.countdownTimeoutId = setTimeout(resolve, ms);
    });
  }

  async function triggerCaptureFlow() {
    if (!state.isCameraActive || state.isCapturing) return;

    let targetIndex = getNextTargetSlotIndex();
    if (targetIndex === null) {
      showToast('All frames captured! Click Retake on any slot or proceed to Templates.');
      return;
    }

    // Ensure stepper reflects Step 3 (Take Photos)
    if (state.currentStep !== 3) {
      state.currentStep = 3;
      updateStepperUI();
    }

    state.isCapturing = true;
    state.abortCapture = false;
    updateCameraUI();

    const shootMultiple = state.autoSequence && state.retakeIndex === null;

    while (targetIndex !== null && !state.abortCapture) {
      const ok = await runSingleShotWithTimer(targetIndex);
      if (!ok || state.abortCapture) break;

      if (!shootMultiple) break;
      targetIndex = getNextTargetSlotIndex();
      if (targetIndex !== null) {
        await sleep(650);
      }
    }

    state.isCapturing = false;
    dom.countdownOverlay.hidden = true;
    updateCameraUI();
    renderPhotoSlots();
    updateStepperUI();

    if (isSessionComplete()) {
      showToast('Photostrip roll complete! Ready to choose a template.');
    }
  }

  async function runSingleShotWithTimer(slotIndex) {
    const seconds = state.timerSeconds;
    if (seconds > 0) {
      dom.countdownOverlay.hidden = false;
      for (let remaining = seconds; remaining >= 1; remaining--) {
        if (state.abortCapture || !state.isCameraActive) {
          dom.countdownOverlay.hidden = true;
          return false;
        }
        dom.countdownNumber.textContent = String(remaining);
        // Retrigger pop animation cleanly
        dom.countdownNumber.style.animation = 'none';
        void dom.countdownNumber.offsetWidth;
        dom.countdownNumber.style.animation = '';
        dom.countdownSub.textContent = `Frame ${slotIndex + 1} of ${state.photoCount}`;
        playTickSound();
        await sleep(1000);
      }
      dom.countdownOverlay.hidden = true;
    }

    if (state.abortCapture || !state.isCameraActive) return false;

    const captured = captureFrameFromVideo();
    if (!captured) return false;

    triggerFlashEffect();
    playShutterSound();

    state.photos[slotIndex] = captured;
    if (state.retakeIndex === slotIndex) {
      state.retakeIndex = null;
    }

    renderPhotoSlots();
    updateCameraUI();
    return true;
  }

  function triggerFlashEffect() {
    dom.flashOverlay.classList.remove('is-flashing');
    void dom.flashOverlay.offsetWidth;
    dom.flashOverlay.classList.add('is-flashing');
  }

  function captureFrameFromVideo() {
    const video = dom.cameraVideo;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const targetRatio = ASPECT_RATIOS[state.aspectRatio] || 4 / 3;
    const sourceRatio = vw / vh;

    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;

    if (sourceRatio > targetRatio) {
      sw = Math.round(vh * targetRatio);
      sx = Math.round((vw - sw) / 2);
    } else if (sourceRatio < targetRatio) {
      sh = Math.round(vw / targetRatio);
      sy = Math.round((vh - sh) / 2);
    }

    // Cap width at 1600px for crisp print quality with fast memory footprint
    const maxW = 1600;
    const outW = Math.min(sw, maxW);
    const outH = Math.round(outW / targetRatio);

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = outW;
    frameCanvas.height = outH;
    const ctx = frameCanvas.getContext('2d');

    ctx.save();
    if (state.isMirrored) {
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    ctx.restore();

    // Generate compact preview thumbnail URL for the session tray
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 360;
    thumbCanvas.height = Math.round(360 / targetRatio);
    thumbCanvas.getContext('2d').drawImage(frameCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    return {
      canvas: frameCanvas,
      thumbUrl: thumbCanvas.toDataURL('image/jpeg', 0.85),
      capturedAt: Date.now()
    };
  }

  // Fallback file import when hardware has no camera
  function handleFallbackFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;

    let loaded = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const slotIdx = getNextTargetSlotIndex();
          if (slotIdx === null) return;

          const targetRatio = ASPECT_RATIOS[state.aspectRatio] || 4 / 3;
          const outW = Math.min(Math.max(img.naturalWidth, 900), 1600);
          const outH = Math.round(outW / targetRatio);

          const c = document.createElement('canvas');
          c.width = outW;
          c.height = outH;
          drawImageCover(c.getContext('2d'), img, 0, 0, outW, outH, 0);

          const thumbC = document.createElement('canvas');
          thumbC.width = 360;
          thumbC.height = Math.round(360 / targetRatio);
          thumbC.getContext('2d').drawImage(c, 0, 0, thumbC.width, thumbC.height);

          state.photos[slotIdx] = {
            canvas: c,
            thumbUrl: thumbC.toDataURL('image/jpeg', 0.85),
            capturedAt: Date.now()
          };
          if (state.retakeIndex === slotIdx) {
            state.retakeIndex = null;
          }

          loaded++;
          renderPhotoSlots();
          updateCameraUI();
          updateStepperUI();

          if (loaded === files.length && isSessionComplete()) {
            showToast('Photos imported! Click Choose Template to continue.');
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ========================================================================
     9. CAMERA WORKSPACE & TRAY UI SYNC
     ======================================================================== */
  function updateCameraUI() {
    // Sync mode cards on Step 1 & pill buttons on Step 2/3
    dom.modeCards.forEach((card) => {
      const selected = Number(card.dataset.photoCount) === state.photoCount;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-checked', String(selected));
    });

    dom.stripCountBtns.forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.stripCount) === state.photoCount);
    });

    dom.ratioBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.ratio === state.aspectRatio);
    });

    dom.timerBtns.forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.timer) === state.timerSeconds);
    });

    dom.viewfinderStage.dataset.aspect = state.aspectRatio;
    dom.cameraVideo.classList.toggle('is-mirrored', state.isMirrored);
    dom.mirrorToggleBtn.classList.toggle('is-toggled', state.isMirrored);
    dom.mirrorToggleBtn.setAttribute('aria-pressed', String(state.isMirrored));

    dom.compositionGrid.hidden = !state.showGrid;
    dom.gridToggleBtn.classList.toggle('is-toggled', state.showGrid);
    dom.gridToggleBtn.setAttribute('aria-pressed', String(state.showGrid));

    dom.autoSequenceBtn.classList.toggle('is-toggled', state.autoSequence);
    dom.autoSequenceBtn.setAttribute('aria-pressed', String(state.autoSequence));
    dom.autoSequenceLabel.textContent = state.autoSequence ? 'Auto Strip' : 'Single Shot';

    // Status indicator & power toggle
    if (state.isCameraActive) {
      dom.cameraStatusDot.className = 'status-indicator is-live';
      dom.cameraStatusText.textContent = 'Camera Live';
      dom.toggleCameraPowerText.textContent = 'Stop Camera';
    } else if (dom.cameraErrorMsg.hidden) {
      dom.cameraStatusDot.className = 'status-indicator';
      dom.cameraStatusText.textContent = 'Camera Standby';
      dom.toggleCameraPowerText.textContent = 'Start Camera';
    } else {
      dom.toggleCameraPowerText.textContent = 'Start Camera';
    }

    // HUD & Shutter caption
    const capturedCount = getCapturedCount();
    const targetSlot = getNextTargetSlotIndex();
    dom.hudRatioLabel.textContent = `${state.aspectRatio} FRAME`;
    dom.hudShotCounter.textContent = `${capturedCount} / ${state.photoCount} CAPTURED`;

    if (state.retakeIndex !== null && state.retakeIndex < state.photoCount) {
      dom.hudRetakeBanner.hidden = false;
      dom.hudRetakeBanner.textContent = `RETAKING PHOTO #${state.retakeIndex + 1}`;
    } else {
      dom.hudRetakeBanner.hidden = true;
    }

    if (state.isCapturing) {
      dom.takePhotoBtn.disabled = true;
      dom.shutterCaption.textContent = 'Capturing...';
    } else if (!state.isCameraActive) {
      dom.takePhotoBtn.disabled = true;
      dom.shutterCaption.textContent = 'Take Photo';
    } else if (targetSlot === null) {
      dom.takePhotoBtn.disabled = true;
      dom.shutterCaption.textContent = 'Roll Complete';
    } else if (state.retakeIndex !== null) {
      dom.takePhotoBtn.disabled = false;
      dom.shutterCaption.textContent = `Retake #${state.retakeIndex + 1}`;
    } else if (state.autoSequence) {
      dom.takePhotoBtn.disabled = false;
      dom.shutterCaption.textContent = `Shoot ${state.photoCount - capturedCount} Photos`;
    } else {
      dom.takePhotoBtn.disabled = false;
      dom.shutterCaption.textContent = `Take Photo (${targetSlot + 1}/${state.photoCount})`;
    }

    // Session Tray progress & Continue button
    dom.trayProgressText.textContent = `${capturedCount} of ${state.photoCount} frames captured`;
    dom.clearPhotosBtn.hidden = capturedCount === 0;
    dom.toTemplatesBtn.disabled = !isSessionComplete();
    dom.trayHintText.textContent = isSessionComplete()
      ? 'All frames ready! Proceed to templates or retake any shot.'
      : `Capture ${state.photoCount - capturedCount} more frame${state.photoCount - capturedCount === 1 ? '' : 's'} to continue.`;
  }

  function renderPhotoSlots() {
    dom.photoSlotsGrid.innerHTML = '';
    const nextSlot = getNextTargetSlotIndex();

    for (let i = 0; i < state.photoCount; i++) {
      const item = state.photos[i];
      const slotEl = document.createElement('div');
      slotEl.className = 'photo-slot';

      if (item && item.thumbUrl) {
        slotEl.classList.add('is-filled');
        if (state.retakeIndex === i) {
          slotEl.classList.add('is-target');
        }

        const img = document.createElement('img');
        img.className = 'slot-thumb';
        img.src = item.thumbUrl;
        img.alt = `Captured frame ${i + 1}`;

        const badge = document.createElement('span');
        badge.className = 'slot-badge';
        badge.textContent = `#0${i + 1}`;

        const retakeBtn = document.createElement('button');
        retakeBtn.type = 'button';
        retakeBtn.className = 'slot-retake-btn';
        retakeBtn.textContent = state.retakeIndex === i ? 'Cancel' : 'Retake';
        retakeBtn.addEventListener('click', () => {
          if (state.isCapturing) return;
          if (state.retakeIndex === i) {
            state.retakeIndex = null;
          } else {
            state.retakeIndex = i;
            showToast(`Ready to retake Photo #${i + 1}. Press Take Photo.`);
          }
          renderPhotoSlots();
          updateCameraUI();
        });

        slotEl.append(img, badge, retakeBtn);
      } else {
        if (nextSlot === i) {
          slotEl.classList.add('is-target');
        }
        const label = document.createElement('span');
        label.className = 'slot-empty-label';
        label.textContent = nextSlot === i ? `NEXT · #0${i + 1}` : `SLOT #0${i + 1}`;
        slotEl.appendChild(label);
      }

      dom.photoSlotsGrid.appendChild(slotEl);
    }
  }

  /* ========================================================================
     10. HIGH-RESOLUTION CANVAS PHOTOSTRIP & TEMPLATE ENGINE
     ======================================================================== */
  function hexToRgb(hex) {
    const clean = (hex || '#FFFFFF').replace('#', '').trim();
    const full = clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.padEnd(6, 'F').slice(0, 6);
    const num = parseInt(full, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function getLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function getContrastPalette(bgHex) {
    const lum = getLuminance(bgHex);
    const isDark = lum < 0.44;
    return {
      isDark,
      ink: isDark ? '#FAF8F5' : '#141413',
      muted: isDark ? 'rgba(250, 248, 245, 0.62)' : 'rgba(20, 20, 19, 0.56)',
      rule: isDark ? 'rgba(250, 248, 245, 0.2)' : 'rgba(20, 20, 19, 0.14)',
      frameBorder: isDark ? 'rgba(250, 248, 245, 0.24)' : 'rgba(20, 20, 19, 0.1)',
      accent: lum > 0.35 && lum < 0.62 ? '#FFFFFF' : '#EA580C'
    };
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (radius === 0) {
      ctx.rect(x, y, w, h);
    } else {
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
    }
    ctx.closePath();
  }

  function drawImageCover(ctx, source, x, y, w, h, radius = 0) {
    const sw0 = source.videoWidth || source.naturalWidth || source.width;
    const sh0 = source.videoHeight || source.naturalHeight || source.height;
    if (!sw0 || !sh0) return;

    const targetRatio = w / h;
    const srcRatio = sw0 / sh0;
    let sx = 0;
    let sy = 0;
    let sw = sw0;
    let sh = sh0;

    if (srcRatio > targetRatio) {
      sw = sh0 * targetRatio;
      sx = (sw0 - sw) / 2;
    } else {
      sh = sw0 / targetRatio;
      sy = (sh0 - sh) / 2;
    }

    ctx.save();
    roundedRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  }

  function buildFilterString(editState) {
    const b = 100 + Number(editState.brightness || 0);
    const c = 100 + Number(editState.contrast || 0);
    const s = Math.max(0, 100 + Number(editState.saturation || 0));

    switch (editState.filter) {
      case 'grayscale':
        return `brightness(${b}%) contrast(${Math.round(c * 1.06)}%) saturate(0%) grayscale(100%)`;
      case 'vintage':
        return `brightness(${Math.round(b * 1.02)}%) contrast(${Math.round(c * 0.94)}%) saturate(${Math.round(s * 0.82)}%) sepia(38%)`;
      case 'warm':
        return `brightness(${Math.round(b * 1.02)}%) contrast(${c}%) saturate(${Math.round(s * 1.12)}%) sepia(18%)`;
      case 'cool':
        return `brightness(${b}%) contrast(${Math.round(c * 1.04)}%) saturate(${Math.round(s * 0.92)}%) hue-rotate(8deg)`;
      default:
        return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
    }
  }

  function drawFilteredPhoto(ctx, photoSource, x, y, w, h, radius, editState, frameIndex) {
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, radius);
    ctx.clip();

    if (photoSource) {
      const filterStr = buildFilterString(editState);
      if (typeof ctx.filter === 'string') {
        ctx.filter = filterStr;
      }
      drawImageCover(ctx, photoSource, x, y, w, h, 0);
      ctx.filter = 'none';

      // Subtle studio color-toning overlays for Vintage, Warm, Cool
      if (editState.filter === 'vintage') {
        ctx.fillStyle = 'rgba(244, 218, 178, 0.12)';
        ctx.fillRect(x, y, w, h);
        const vig = ctx.createRadialGradient(
          x + w / 2,
          y + h / 2,
          Math.min(w, h) * 0.3,
          x + w / 2,
          y + h / 2,
          Math.max(w, h) * 0.75
        );
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(24, 18, 12, 0.26)');
        ctx.fillStyle = vig;
        ctx.fillRect(x, y, w, h);
      } else if (editState.filter === 'warm') {
        ctx.fillStyle = 'rgba(255, 166, 77, 0.09)';
        ctx.fillRect(x, y, w, h);
      } else if (editState.filter === 'cool') {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.09)';
        ctx.fillRect(x, y, w, h);
      }
    } else {
      // Clean architectural sample frame (used ONLY for layout preview before capture)
      drawArchitecturalPreviewSlot(ctx, x, y, w, h, frameIndex);
    }

    ctx.restore();
  }

  function drawArchitecturalPreviewSlot(ctx, x, y, w, h, index) {
    const tones = ['#DCD6CC', '#D2CCC1', '#C8C1B4', '#DED9D0', '#D5CFC4', '#CBC4B8'];
    ctx.fillStyle = tones[index % tones.length];
    ctx.fillRect(x, y, w, h);

    // Subtle geometric studio subject silhouette / aperture composition
    const cx = x + w / 2;
    const cy = y + h / 2;
    const minDim = Math.min(w, h);

    ctx.strokeStyle = 'rgba(20, 20, 19, 0.14)';
    ctx.lineWidth = Math.max(1.5, minDim * 0.008);
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(234, 88, 12, 0.18)';
    ctx.beginPath();
    ctx.arc(cx + minDim * 0.08, cy - minDim * 0.08, minDim * 0.11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(20, 20, 19, 0.48)';
    ctx.font = `500 ${Math.max(12, Math.round(minDim * 0.075))}px "DM Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`FRAME 0${index + 1}`, cx, cy + minDim * 0.34);
  }

  function drawFourPointStar(ctx, cx, cy, outerR, innerR, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCropMark(ctx, x, y, size, dirX, dirY, color, lineW) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.moveTo(x, y + dirY * size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dirX * size, y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Computes exact master geometry and renders any of the 6 templates.
   * options: { templateId, count, photos, edit, scale }
   */
  function renderPhotostrip(canvas, options = {}) {
    const template = getTemplateById(options.templateId || state.templateId);
    const count = options.count || state.photoCount;
    const photos = options.photos || state.photos;
    const edit = options.edit || state.edit;
    const scale = options.scale || 1;

    const bgHex = edit.customBg || template.defaultBg;
    const palette = getContrastPalette(bgHex);
    const titleText = (edit.title !== undefined && edit.title !== '' ? edit.title : template.defaultTitle).trim() || template.defaultTitle;
    const dateText = (edit.date !== undefined ? edit.date : formatTodayDate()).trim();

    let baseW = 1080;
    let baseH = 2800;
    const slots = [];

    // ----------------------------------------------------------------------
    // 1. CALCULATE TEMPLATE-SPECIFIC GEOMETRY
    // ----------------------------------------------------------------------
    if (template.id === 'classic') {
      // Single vertical booth strip (3, 4, or 6 frames)
      baseW = 1000;
      const padX = 76;
      const padTop = 76;
      const gap = count === 6 ? 32 : 40;
      const slotW = baseW - padX * 2;
      const slotH = count === 6 ? Math.round(slotW * 0.66) : Math.round(slotW * 0.75);
      const footerH = 250;

      for (let i = 0; i < count; i++) {
        slots.push({
          x: padX,
          y: padTop + i * (slotH + gap),
          w: slotW,
          h: slotH,
          r: 4
        });
      }
      baseH = padTop + count * slotH + (count - 1) * gap + footerH;
    } else if (template.id === 'minimal') {
      // Swiss architectural cream sheet: 1+2 for 3, 2x2 for 4, 2x3 for 6
      baseW = 1360;
      const padX = 96;
      const headerH = 150;
      const footerH = 190;
      const gap = 34;
      const innerW = baseW - padX * 2;

      if (count === 3) {
        const heroH = 700;
        slots.push({ x: padX, y: headerH, w: innerW, h: heroH, r: 0 });
        const halfW = Math.round((innerW - gap) / 2);
        const rowH = 520;
        slots.push({ x: padX, y: headerH + heroH + gap, w: halfW, h: rowH, r: 0 });
        slots.push({ x: padX + halfW + gap, y: headerH + heroH + gap, w: innerW - halfW - gap, h: rowH, r: 0 });
        baseH = headerH + heroH + gap + rowH + footerH;
      } else {
        const rows = count === 4 ? 2 : 3;
        const colW = Math.round((innerW - gap) / 2);
        const rowH = Math.round(colW * 0.78);
        for (let i = 0; i < count; i++) {
          const r = Math.floor(i / 2);
          const c = i % 2;
          slots.push({
            x: padX + c * (colW + gap),
            y: headerH + r * (rowH + gap),
            w: colW,
            h: rowH,
            r: 0
          });
        }
        baseH = headerH + rows * rowH + (rows - 1) * gap + footerH;
      }
    } else if (template.id === 'retro') {
      // 35mm perforated analog strip (single strip for 3/4, twin contact strips for 6)
      if (count === 6) {
        baseW = 1640;
        const stripW = 740;
        const stripGap = 64;
        const leftMargin = Math.round((baseW - stripW * 2 - stripGap) / 2);
        const railW = 92;
        const slotW = stripW - railW * 2;
        const slotH = Math.round(slotW * 0.68);
        const topPad = 110;
        const frameGap = 54;
        const footerH = 210;

        for (let i = 0; i < 6; i++) {
          const stripIdx = i < 3 ? 0 : 1;
          const rowIdx = i % 3;
          const stripOriginX = leftMargin + stripIdx * (stripW + stripGap);
          slots.push({
            x: stripOriginX + railW,
            y: topPad + rowIdx * (slotH + frameGap),
            w: slotW,
            h: slotH,
            r: 6,
            stripOriginX,
            stripW
          });
        }
        baseH = topPad + 3 * slotH + 2 * frameGap + footerH;
      } else {
        baseW = 1080;
        const railW = 128;
        const topPad = 100;
        const frameGap = 58;
        const slotW = baseW - railW * 2;
        const slotH = Math.round(slotW * 0.67); // 3:2 35mm ratio
        const footerH = 220;

        for (let i = 0; i < count; i++) {
          slots.push({
            x: railW,
            y: topPad + i * (slotH + frameGap),
            w: slotW,
            h: slotH,
            r: 6,
            stripOriginX: 0,
            stripW: baseW
          });
        }
        baseH = topPad + count * slotH + (count - 1) * frameGap + footerH;
      }
    } else if (template.id === 'darkroom') {
      // Obsidian Darkroom proof with Left Vertical Metadata Spine + right stage
      baseW = 1420;
      const spineW = 176;
      const padRight = 84;
      const padLeftStage = spineW + 68;
      const stageW = baseW - padLeftStage - padRight;
      const topPad = 92;
      const footerH = 185;
      const gap = 36;

      if (count === 3) {
        const slotH = 560;
        for (let i = 0; i < 3; i++) {
          slots.push({
            x: padLeftStage,
            y: topPad + i * (slotH + gap),
            w: stageW,
            h: slotH,
            r: 0
          });
        }
        baseH = topPad + 3 * slotH + 2 * gap + footerH;
      } else if (count === 4) {
        // Editorial spread: Wide top + 2 middle duo + Wide bottom
        const wideH = 520;
        const midH = 470;
        const halfW = Math.round((stageW - gap) / 2);
        slots.push({ x: padLeftStage, y: topPad, w: stageW, h: wideH, r: 0 });
        slots.push({ x: padLeftStage, y: topPad + wideH + gap, w: halfW, h: midH, r: 0 });
        slots.push({ x: padLeftStage + halfW + gap, y: topPad + wideH + gap, w: stageW - halfW - gap, h: midH, r: 0 });
        slots.push({ x: padLeftStage, y: topPad + wideH + gap + midH + gap, w: stageW, h: wideH, r: 0 });
        baseH = topPad + wideH * 2 + midH + gap * 2 + footerH;
      } else {
        const halfW = Math.round((stageW - gap) / 2);
        const rowH = 460;
        for (let i = 0; i < 6; i++) {
          const r = Math.floor(i / 2);
          const c = i % 2;
          slots.push({
            x: padLeftStage + c * (halfW + gap),
            y: topPad + r * (rowH + gap),
            w: halfW,
            h: rowH,
            r: 0
          });
        }
        baseH = topPad + 3 * rowH + 2 * gap + footerH;
      }
    } else if (template.id === 'pastel') {
      // Soft rounded matted Polaroid collage with staggered rhythm
      if (count === 3) {
        baseW = 1080;
        const padX = 105;
        const topPad = 150;
        const cardGap = 44;
        const slotW = baseW - padX * 2;
        const slotH = Math.round(slotW * 0.72);
        const footerH = 220;
        for (let i = 0; i < 3; i++) {
          slots.push({
            x: padX,
            y: topPad + i * (slotH + cardGap),
            w: slotW,
            h: slotH,
            r: 22
          });
        }
        baseH = topPad + 3 * slotH + 2 * cardGap + footerH;
      } else {
        baseW = 1380;
        const padX = 92;
        const topPad = 160;
        const gap = 46;
        const staggerOffset = 48;
        const rows = count === 4 ? 2 : 3;
        const colW = Math.round((baseW - padX * 2 - gap) / 2);
        const rowH = Math.round(colW * 0.82);
        const footerH = 220;

        for (let i = 0; i < count; i++) {
          const r = Math.floor(i / 2);
          const c = i % 2;
          slots.push({
            x: padX + c * (colW + gap),
            y: topPad + r * (rowH + gap) + (c === 1 ? staggerOffset : 0),
            w: colW,
            h: rowH,
            r: 22
          });
        }
        baseH = topPad + rows * rowH + (rows - 1) * gap + staggerOffset + footerH;
      }
    } else if (template.id === 'event') {
      // Event Special Poster: Prominent Top Marquee + Feature Mosaic + Ticket Stub Footer
      baseW = count === 6 ? 1620 : 1380;
      const padX = 84;
      const headerH = 285;
      const footerH = 215;
      const gap = 30;
      const innerW = baseW - padX * 2;

      if (count === 3) {
        // Left tall hero (56%) + Right 2 stacked frames (44%)
        const leftW = Math.round((innerW - gap) * 0.56);
        const rightW = innerW - gap - leftW;
        const rightH = 470;
        const totalMosaicH = rightH * 2 + gap;
        slots.push({ x: padX, y: headerH, w: leftW, h: totalMosaicH, r: 8 });
        slots.push({ x: padX + leftW + gap, y: headerH, w: rightW, h: rightH, r: 8 });
        slots.push({ x: padX + leftW + gap, y: headerH + rightH + gap, w: rightW, h: rightH, r: 8 });
        baseH = headerH + totalMosaicH + footerH;
      } else if (count === 4) {
        // Large top feature banner + 3-column bottom strip
        const topHeroH = 660;
        const triW = Math.round((innerW - gap * 2) / 3);
        const triH = 380;
        slots.push({ x: padX, y: headerH, w: innerW, h: topHeroH, r: 8 });
        for (let i = 0; i < 3; i++) {
          slots.push({
            x: padX + i * (triW + gap),
            y: headerH + topHeroH + gap,
            w: i === 2 ? innerW - (triW + gap) * 2 : triW,
            h: triH,
            r: 8
          });
        }
        baseH = headerH + topHeroH + gap + triH + footerH;
      } else {
        // 3 columns x 2 rows wide commemorative event postcard
        const colW = Math.round((innerW - gap * 2) / 3);
        const rowH = Math.round(colW * 0.78);
        for (let i = 0; i < 6; i++) {
          const r = Math.floor(i / 3);
          const c = i % 3;
          slots.push({
            x: padX + c * (colW + gap),
            y: headerH + r * (rowH + gap),
            w: c === 2 ? innerW - (colW + gap) * 2 : colW,
            h: rowH,
            r: 8
          });
        }
        baseH = headerH + 2 * rowH + gap + footerH;
      }
    }

    // ----------------------------------------------------------------------
    // 2. INITIALIZE SCALED CANVAS & DRAW BACKGROUND
    // ----------------------------------------------------------------------
    canvas.width = Math.round(baseW * scale);
    canvas.height = Math.round(baseH * scale);
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(scale, scale);

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, baseW, baseH);

    // ----------------------------------------------------------------------
    // 3. PRE-PHOTO DECORATIONS (Sprockets, Spines, Mats, Headers)
    // ----------------------------------------------------------------------
    if (template.id === 'minimal') {
      const padX = 96;
      ctx.fillStyle = palette.muted;
      ctx.font = '500 22px "DM Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('SNAPBOOTH // STUDIO CONTACT SHEET', padX, 76);

      ctx.textAlign = 'right';
      ctx.fillText(`0${count} FRAMES`, baseW - padX, 76);

      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, 112);
      ctx.lineTo(baseW - padX, 112);
      ctx.stroke();
    } else if (template.id === 'retro') {
      const amber = palette.isDark ? '#F59E0B' : '#B45309';
      const holeFill = palette.isDark ? '#FAF8F5' : '#191716';

      const strips = count === 6
        ? [
            { x: slots[0].stripOriginX, w: slots[0].stripW },
            { x: slots[3].stripOriginX, w: slots[3].stripW }
          ]
        : [{ x: 0, w: baseW }];

      strips.forEach((st) => {
        // Subtle film stock edge border
        if (count === 6) {
          ctx.fillStyle = palette.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect(st.x, 44, st.w, baseH - 220);
        }

        const holeW = count === 6 ? 28 : 36;
        const holeH = count === 6 ? 42 : 52;
        const pitch = count === 6 ? 78 : 92;
        const marginSide = count === 6 ? 28 : 38;
        const endY = baseH - 195;

        ctx.fillStyle = holeFill;
        for (let y = 76; y < endY; y += pitch) {
          roundedRectPath(ctx, st.x + marginSide, y, holeW, holeH, 7);
          ctx.fill();
          roundedRectPath(ctx, st.x + st.w - marginSide - holeW, y, holeW, holeH, 7);
          ctx.fill();
        }
      });

      // Top film stock code
      ctx.fillStyle = amber;
      ctx.font = '500 22px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('KODAK / SNAPBOOTH 400 · SAFETY FILM', baseW / 2, 56);
    } else if (template.id === 'darkroom') {
      const spineW = 176;
      // Vertical spine separator line
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(spineW, 64);
      ctx.lineTo(spineW, baseH - 64);
      ctx.stroke();

      // Rotated vertical typography inside left spine
      ctx.save();
      ctx.translate(88, baseH - 92);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = palette.ink;
      ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(titleText.toUpperCase(), 0, -14);

      ctx.fillStyle = palette.muted;
      ctx.font = '500 20px "DM Mono", monospace';
      ctx.fillText(`DARKROOM MASTER  ·  ISO 400  ·  ${dateText}`, 0, 22);
      ctx.restore();

      // Accent orange calibration square at top of spine
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(72, 92, 32, 32);
    } else if (template.id === 'pastel') {
      // Top pill badge + subtle vector stars
      const pillW = 340;
      const pillH = 52;
      const pillX = (baseW - pillW) / 2;
      const pillY = 58;

      ctx.fillStyle = palette.isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF';
      roundedRectPath(ctx, pillX, pillY, pillW, pillH, 26);
      ctx.fill();

      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = palette.ink;
      ctx.font = '600 20px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PASTEL MEMORIES', baseW / 2, pillY + pillH / 2 + 1);

      drawFourPointStar(ctx, pillX - 38, pillY + pillH / 2, 16, 5, '#EA580C');
      drawFourPointStar(ctx, pillX + pillW + 38, pillY + pillH / 2, 16, 5, '#EA580C');

      // White inner polaroid mats behind each photo slot
      slots.forEach((s) => {
        ctx.save();
        ctx.shadowColor = 'rgba(20, 20, 19, 0.08)';
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = palette.isDark ? '#22201E' : '#FFFFFF';
        roundedRectPath(ctx, s.x - 16, s.y - 16, s.w + 32, s.h + 32, s.r + 8);
        ctx.fill();
        ctx.restore();
      });
    } else if (template.id === 'event') {
      // Structured Event Header Marquee
      const padX = 84;
      const boxY = 56;
      const boxH = 192;
      const boxW = baseW - padX * 2;

      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 3;
      ctx.strokeRect(padX, boxY, boxW, boxH);

      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(padX + 10, boxY + 10, boxW - 20, boxH - 20);

      // Coral event tag
      const tagW = 250;
      const tagH = 36;
      ctx.fillStyle = '#EA580C';
      roundedRectPath(ctx, padX + 34, boxY + 30, tagW, tagH, 6);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '500 18px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OFFICIAL PHOTO PASS', padX + 34 + tagW / 2, boxY + 30 + tagH / 2 + 1);

      // Large Event Title
      ctx.fillStyle = palette.ink;
      ctx.font = '700 54px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(titleText.toUpperCase(), padX + 34, boxY + 146);

      // Right-aligned Date Stamp Block
      ctx.textAlign = 'right';
      ctx.fillStyle = palette.muted;
      ctx.font = '500 19px "DM Mono", monospace';
      ctx.fillText('SESSION DATE', baseW - padX - 34, boxY + 86);

      ctx.fillStyle = palette.ink;
      ctx.font = '600 32px "DM Mono", monospace';
      ctx.fillText(dateText || formatTodayDate(), baseW - padX - 34, boxY + 136);
    }

    // ----------------------------------------------------------------------
    // 4. DRAW PHOTOS INTO SLOTS + PER-SLOT FRAMES/MARKS
    // ----------------------------------------------------------------------
    slots.forEach((slot, idx) => {
      const entry = photos[idx];
      const srcCanvas = entry && entry.canvas ? entry.canvas : null;

      drawFilteredPhoto(ctx, srcCanvas, slot.x, slot.y, slot.w, slot.h, slot.r, edit, idx);

      if (template.id === 'classic') {
        ctx.strokeStyle = palette.frameBorder;
        ctx.lineWidth = 2;
        roundedRectPath(ctx, slot.x, slot.y, slot.w, slot.h, slot.r);
        ctx.stroke();
      } else if (template.id === 'retro') {
        const amber = palette.isDark ? '#F59E0B' : '#B45309';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 2;
        roundedRectPath(ctx, slot.x, slot.y, slot.w, slot.h, slot.r);
        ctx.stroke();

        // Amber frame number in film rebate below each shot
        ctx.fillStyle = amber;
        ctx.font = '500 21px "DM Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`▸ 0${idx + 1}A`, slot.x + 6, slot.y + slot.h + 27);

        ctx.textAlign = 'right';
        ctx.fillText(`EXP.${idx + 1}`, slot.x + slot.w - 6, slot.y + slot.h + 27);
      } else if (template.id === 'darkroom') {
        // Precision corner registration marks around each frame
        const m = 18;
        const off = 8;
        const markColor = palette.isDark ? 'rgba(250,248,245,0.55)' : 'rgba(20,20,19,0.45)';
        drawCropMark(ctx, slot.x - off, slot.y - off, m, 1, 1, markColor, 2);
        drawCropMark(ctx, slot.x + slot.w + off, slot.y - off, m, -1, 1, markColor, 2);
        drawCropMark(ctx, slot.x - off, slot.y + slot.h + off, m, 1, -1, markColor, 2);
        drawCropMark(ctx, slot.x + slot.w + off, slot.y + slot.h + off, m, -1, -1, markColor, 2);
      } else if (template.id === 'event') {
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = 2.5;
        roundedRectPath(ctx, slot.x, slot.y, slot.w, slot.h, slot.r);
        ctx.stroke();
      }
    });

    // ----------------------------------------------------------------------
    // 5. TEMPLATE FOOTERS (Title, Date, Decorative Marks)
    // ----------------------------------------------------------------------
    if (template.id === 'classic') {
      const padX = 76;
      const lineY = baseH - 188;
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, lineY);
      ctx.lineTo(baseW - padX, lineY);
      ctx.stroke();

      ctx.fillStyle = palette.ink;
      ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(titleText.toUpperCase(), baseW / 2, baseH - 112);

      ctx.fillStyle = palette.muted;
      ctx.font = '500 24px "DM Mono", monospace';
      ctx.fillText(dateText ? `${dateText}  ·  SNAPBOOTH` : 'SNAPBOOTH STUDIO', baseW / 2, baseH - 64);
    } else if (template.id === 'minimal') {
      const padX = 96;
      const lineY = baseH - 140;
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, lineY);
      ctx.lineTo(baseW - padX, lineY);
      ctx.stroke();

      ctx.fillStyle = palette.ink;
      ctx.font = '700 40px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(titleText, padX, baseH - 72);

      ctx.fillStyle = palette.muted;
      ctx.font = '500 24px "DM Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(dateText, baseW - padX, baseH - 74);
    } else if (template.id === 'retro') {
      const amber = palette.isDark ? '#F59E0B' : '#B45309';
      ctx.fillStyle = palette.ink;
      ctx.font = '700 40px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(titleText.toUpperCase(), baseW / 2, baseH - 96);

      ctx.fillStyle = amber;
      ctx.font = '500 25px "DM Mono", monospace';
      ctx.fillText(`[ ${dateText || '35MM FILM'} ]`, baseW / 2, baseH - 50);
    } else if (template.id === 'darkroom') {
      const padLeftStage = 176 + 68;
      const padRight = 84;
      ctx.fillStyle = palette.ink;
      ctx.font = '600 28px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(titleText, padLeftStage, baseH - 74);

      ctx.fillStyle = palette.muted;
      ctx.font = '500 22px "DM Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${dateText}  //  PROOF SHEET`, baseW - padRight, baseH - 74);
    } else if (template.id === 'pastel') {
      const footerY = baseH - 118;
      ctx.fillStyle = palette.ink;
      ctx.font = '700 42px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(titleText, baseW / 2, footerY);

      ctx.fillStyle = palette.muted;
      ctx.font = '500 23px "DM Mono", monospace';
      ctx.fillText(dateText, baseW / 2, footerY + 42);

      drawFourPointStar(ctx, baseW / 2 - 220, footerY - 14, 14, 4, '#EA580C');
      drawFourPointStar(ctx, baseW / 2 + 220, footerY - 14, 14, 4, '#EA580C');
    } else if (template.id === 'event') {
      // Perforated Ticket Stub Footer with Vector Barcode
      const padX = 84;
      const perfY = baseH - 165;

      ctx.save();
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 12]);
      ctx.beginPath();
      ctx.moveTo(padX, perfY);
      ctx.lineTo(baseW - padX, perfY);
      ctx.stroke();
      ctx.restore();

      // Ticket side notches
      ctx.fillStyle = palette.isDark ? '#2A2826' : '#E5DFD3';
      ctx.beginPath();
      ctx.arc(0, perfY, 22, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(baseW, perfY, 22, Math.PI / 2, (Math.PI * 3) / 2);
      ctx.fill();

      ctx.fillStyle = palette.ink;
      ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`SNAPBOOTH // ${titleText.toUpperCase()}`, padX, baseH - 92);

      ctx.fillStyle = palette.muted;
      ctx.font = '500 21px "DM Mono", monospace';
      ctx.fillText(`ADMIT ONE KEEPSAKE  ·  ${dateText}`, padX, baseH - 54);

      // Crisp geometric barcode on bottom right
      const barWidths = [4, 2, 6, 2, 3, 7, 2, 4, 2, 5, 3, 2, 6, 4, 2, 3, 5, 2, 4];
      let bx = baseW - padX;
      const by = baseH - 126;
      const bh = 74;
      ctx.fillStyle = palette.ink;
      for (let i = barWidths.length - 1; i >= 0; i--) {
        const bw = barWidths[i];
        bx -= bw;
        ctx.fillRect(bx, by, bw, bh);
        bx -= 5;
      }
    }

    ctx.restore();
    return { masterWidth: baseW, masterHeight: baseH };
  }

  /* ========================================================================
     11. TEMPLATE SELECTION, EDITOR & EXPORT RENDERERS
     ======================================================================== */
  function selectTemplate(templateId, reRenderTarget = true) {
    const tpl = getTemplateById(templateId);
    state.templateId = tpl.id;
    if (!state.edit.titleTouched) {
      state.edit.title = tpl.defaultTitle;
    }
    savePreferences();

    if (reRenderTarget) {
      if (state.currentStep === 4) {
        renderStep4Templates();
      } else if (state.currentStep === 5) {
        syncEditorControls();
        renderEditorPreview();
      } else if (state.currentStep === 6) {
        renderFinalExportStage();
      }
    }
  }

  function renderHeroSampleStrips() {
    renderPhotostrip(dom.heroSampleCanvasA, {
      templateId: 'classic',
      count: 3,
      photos: [],
      edit: { filter: 'normal', brightness: 0, contrast: 0, saturation: 0, customBg: null, title: 'SNAPBOOTH', date: formatTodayDate() },
      scale: 0.34
    });
    renderPhotostrip(dom.heroSampleCanvasB, {
      templateId: 'retro',
      count: 3,
      photos: [],
      edit: { filter: 'normal', brightness: 0, contrast: 0, saturation: 0, customBg: null, title: 'ANALOG 400', date: formatTodayDate() },
      scale: 0.34
    });
  }

  function renderStep4Templates() {
    const activeTpl = getTemplateById(state.templateId);
    renderPhotostrip(dom.templateStageCanvas, {
      templateId: activeTpl.id,
      count: state.photoCount,
      photos: state.photos,
      edit: state.edit,
      scale: 0.62
    });
    dom.templateStageName.textContent = activeTpl.name.toUpperCase();
    dom.templateStageSpec.textContent = activeTpl.layoutSpec.toUpperCase();

    dom.stepTemplateGrid.innerHTML = '';
    TEMPLATES.forEach((tpl) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `template-option-card${tpl.id === state.templateId ? ' is-selected' : ''}`;

      const thumbStage = document.createElement('div');
      thumbStage.className = 'template-thumb-stage';
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'template-thumb-canvas';

      const previewEdit = {
        ...state.edit,
        customBg: tpl.id === state.templateId ? state.edit.customBg : null,
        title: state.edit.titleTouched ? state.edit.title : tpl.defaultTitle
      };

      renderPhotostrip(thumbCanvas, {
        templateId: tpl.id,
        count: state.photoCount,
        photos: state.photos,
        edit: previewEdit,
        scale: 0.2
      });
      thumbStage.appendChild(thumbCanvas);

      const metaRow = document.createElement('div');
      metaRow.className = 'template-card-meta';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'template-card-name';
      nameSpan.textContent = tpl.name;
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'template-card-badge';
      badgeSpan.textContent = tpl.badge;
      metaRow.append(nameSpan, badgeSpan);

      const desc = document.createElement('p');
      desc.className = 'template-card-desc';
      desc.textContent = tpl.description;

      card.append(thumbStage, metaRow, desc);
      card.addEventListener('click', () => {
        // Reset customBg when deliberately picking a new template so its signature palette shines
        if (tpl.id !== state.templateId) {
          state.edit.customBg = null;
        }
        selectTemplate(tpl.id, true);
      });

      dom.stepTemplateGrid.appendChild(card);
    });
  }

  function renderEditorTemplatePills() {
    dom.editorTemplatePills.innerHTML = '';
    TEMPLATES.forEach((tpl) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `template-mini-pill${tpl.id === state.templateId ? ' is-active' : ''}`;
      btn.textContent = tpl.name;
      btn.addEventListener('click', () => {
        if (tpl.id !== state.templateId) {
          state.edit.customBg = null;
        }
        selectTemplate(tpl.id, true);
      });
      dom.editorTemplatePills.appendChild(btn);
    });
  }

  function syncEditorControls() {
    renderEditorTemplatePills();

    dom.filterChips.forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.filter === state.edit.filter);
    });

    dom.brightnessSlider.value = String(state.edit.brightness);
    dom.contrastSlider.value = String(state.edit.contrast);
    dom.saturationSlider.value = String(state.edit.saturation);

    dom.brightnessVal.textContent = state.edit.brightness > 0 ? `+${state.edit.brightness}` : String(state.edit.brightness);
    dom.contrastVal.textContent = state.edit.contrast > 0 ? `+${state.edit.contrast}` : String(state.edit.contrast);
    dom.saturationVal.textContent = state.edit.saturation > 0 ? `+${state.edit.saturation}` : String(state.edit.saturation);

    const activeBg = (state.edit.customBg || getTemplateById(state.templateId).defaultBg).toUpperCase();
    dom.bgSwatches.forEach((sw) => {
      sw.classList.toggle('is-active', sw.dataset.bg.toUpperCase() === activeBg);
    });
    dom.customBgPicker.value = activeBg;

    dom.stripTitleInput.value = state.edit.title;
    dom.stripDateInput.value = state.edit.date;
  }

  function renderEditorPreview() {
    const dims = renderPhotostrip(dom.editorCanvas, {
      templateId: state.templateId,
      count: state.photoCount,
      photos: state.photos,
      edit: state.edit,
      scale: 0.65
    });
    dom.editorResolutionLabel.textContent = `MASTER ${dims.masterWidth} × ${dims.masterHeight} PX`;
  }

  function resetEditorAdjustments() {
    const tpl = getTemplateById(state.templateId);
    state.edit = {
      filter: 'normal',
      brightness: 0,
      contrast: 0,
      saturation: 0,
      customBg: null,
      title: tpl.defaultTitle,
      titleTouched: false,
      date: formatTodayDate()
    };
    syncEditorControls();
    renderEditorPreview();
    showToast('Editor settings reset to template defaults.');
  }

  function renderFinalExportStage() {
    const tpl = getTemplateById(state.templateId);
    const dims = renderPhotostrip(dom.finalCanvas, {
      templateId: state.templateId,
      count: state.photoCount,
      photos: state.photos,
      edit: state.edit,
      scale: 1
    });

    dom.exportMetaTemplate.textContent = tpl.name;
    dom.exportMetaFrames.textContent = `${state.photoCount} Photos`;
    dom.exportMetaDimensions.textContent = `${dims.masterWidth} × ${dims.masterHeight} px`;
    dom.exportMetaFilter.textContent = state.edit.filter.charAt(0).toUpperCase() + state.edit.filter.slice(1);

    // Populate dedicated print image so @media print renders crisply without browser canvas print bugs
    dom.printableStripImage.src = dom.finalCanvas.toDataURL('image/png');
  }

  function downloadStrip(format) {
    // Ensure master canvas is freshly rendered at scale = 1
    renderFinalExportStage();

    const isJpg = format === 'jpg';
    const mime = isJpg ? 'image/jpeg' : 'image/png';
    const ext = isJpg ? 'jpg' : 'png';
    const dataUrl = isJpg
      ? dom.finalCanvas.toDataURL(mime, 0.95)
      : dom.finalCanvas.toDataURL(mime);

    const safeTitle = (state.edit.title || 'snapbooth')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'snapbooth';

    const link = document.createElement('a');
    link.download = `${safeTitle}-${state.templateId}-${Date.now()}.${ext}`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast(`Downloaded high-resolution ${ext.toUpperCase()} photostrip.`);
  }

  function printPhotostrip() {
    renderFinalExportStage();
    const triggerPrint = () => {
      window.print();
    };
    if (dom.printableStripImage.complete) {
      triggerPrint();
    } else {
      dom.printableStripImage.onload = () => {
        dom.printableStripImage.onload = null;
        triggerPrint();
      };
    }
  }

  /* ========================================================================
     12. TEMPLATES CATALOG VIEW (Header "Templates" Tab)
     ======================================================================== */
  function renderCatalogView() {
    dom.galleryCountBtns.forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.galleryCount) === state.galleryPreviewCount);
    });

    const hasRealPhotos = getCapturedCount() >= state.galleryPreviewCount;
    const previewPhotos = hasRealPhotos ? state.photos : [];

    dom.catalogTemplatesGrid.innerHTML = '';
    TEMPLATES.forEach((tpl) => {
      const card = document.createElement('article');
      card.className = 'catalog-card';

      const previewBox = document.createElement('div');
      previewBox.className = 'catalog-preview-box';
      const canvas = document.createElement('canvas');
      renderPhotostrip(canvas, {
        templateId: tpl.id,
        count: state.galleryPreviewCount,
        photos: previewPhotos,
        edit: {
          filter: 'normal',
          brightness: 0,
          contrast: 0,
          saturation: 0,
          customBg: null,
          title: tpl.defaultTitle,
          date: formatTodayDate()
        },
        scale: 0.24
      });
      previewBox.appendChild(canvas);

      const body = document.createElement('div');
      body.className = 'catalog-card-body';
      const h3 = document.createElement('h3');
      h3.textContent = tpl.name;
      const p = document.createElement('p');
      p.textContent = tpl.description;
      body.append(h3, p);

      const footer = document.createElement('div');
      footer.className = 'catalog-card-footer';
      const spec = document.createElement('span');
      spec.className = 'mono-tag';
      spec.textContent = tpl.badge;

      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = tpl.id === state.templateId ? 'btn btn-dark btn-sm' : 'btn btn-primary btn-sm';
      useBtn.textContent = tpl.id === state.templateId ? 'Selected — Open Studio' : 'Use Template';
      useBtn.addEventListener('click', () => {
        state.photoCount = state.galleryPreviewCount;
        state.edit.customBg = null;
        selectTemplate(tpl.id, false);
        renderPhotoSlots();
        updateCameraUI();
        switchView('studio');
        if (isSessionComplete()) {
          goToStep(5);
        } else {
          goToStep(state.isCameraActive ? 3 : 2);
        }
        showToast(`${tpl.name} selected.`);
      });

      footer.append(spec, useBtn);
      card.append(previewBox, body, footer);
      dom.catalogTemplatesGrid.appendChild(card);
    });
  }

  /* ========================================================================
     13. EVENT LISTENERS
     ======================================================================== */
  function bindEvents() {
    // Header Navigation
    dom.brandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('studio');
    });

    dom.navLinks.forEach((btn) => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.nav);
      });
    });

    dom.headerStartBtn.addEventListener('click', () => {
      switchView('studio');
      if (state.currentStep === 1) {
        goToStep(state.isCameraActive ? 3 : 2);
      }
    });

    // Stepper Buttons
    dom.stepperBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Number(btn.dataset.gotoStep);
        goToStep(target);
      });
    });

    // Step 1: Welcome
    dom.modeCards.forEach((card) => {
      card.addEventListener('click', () => {
        setPhotoCount(Number(card.dataset.photoCount));
      });
    });

    dom.welcomeStartBtn.addEventListener('click', () => {
      goToStep(state.isCameraActive ? 3 : 2);
    });

    dom.welcomeExploreTemplatesBtn.addEventListener('click', () => {
      switchView('templates');
    });

    dom.aboutStartBtn.addEventListener('click', () => {
      switchView('studio');
      goToStep(state.isCameraActive ? 3 : 2);
    });

    // Step 2 & 3: Camera Toolbar & Controls
    dom.cameraBackBtn.addEventListener('click', () => {
      if (state.currentStep === 3) {
        goToStep(2);
      } else {
        goToStep(1);
      }
    });

    dom.stripCountBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.isCapturing) return;
        setPhotoCount(Number(btn.dataset.stripCount));
      });
    });

    dom.ratioBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.isCapturing) return;
        state.aspectRatio = btn.dataset.ratio;
        savePreferences();
        updateCameraUI();
      });
    });

    dom.timerBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.isCapturing) return;
        state.timerSeconds = Number(btn.dataset.timer);
        savePreferences();
        updateCameraUI();
      });
    });

    dom.enableCameraBtn.addEventListener('click', () => {
      startCamera();
    });

    dom.toggleCameraPowerBtn.addEventListener('click', () => {
      if (state.isCameraActive) {
        stopCamera();
      } else {
        startCamera();
      }
    });

    dom.switchCameraBtn.addEventListener('click', () => {
      switchCamera();
    });

    dom.cameraDeviceSelect.addEventListener('change', (e) => {
      state.currentDeviceId = e.target.value;
      startCamera({ deviceId: state.currentDeviceId, autoMirrorOnSwitch: true });
    });

    dom.mirrorToggleBtn.addEventListener('click', () => {
      state.isMirrored = !state.isMirrored;
      savePreferences();
      updateCameraUI();
    });

    dom.autoSequenceBtn.addEventListener('click', () => {
      state.autoSequence = !state.autoSequence;
      savePreferences();
      updateCameraUI();
      showToast(state.autoSequence ? 'Auto Strip mode enabled: shoots full roll automatically.' : 'Single Shot mode enabled.');
    });

    dom.gridToggleBtn.addEventListener('click', () => {
      state.showGrid = !state.showGrid;
      savePreferences();
      updateCameraUI();
    });

    dom.fullscreenBtn.addEventListener('click', () => {
      toggleFullscreen();
    });

    document.addEventListener('fullscreenchange', () => {
      dom.fullscreenBtn.classList.toggle('is-toggled', Boolean(document.fullscreenElement));
    });

    dom.takePhotoBtn.addEventListener('click', () => {
      triggerCaptureFlow();
    });

    dom.fallbackFileInput.addEventListener('change', (e) => {
      handleFallbackFiles(e.target.files);
      e.target.value = '';
    });

    dom.clearPhotosBtn.addEventListener('click', () => {
      openConfirmModal(
        'Reset captured photos?',
        'This will clear the current photos in your Session Roll so you can retake them.',
        'Reset Roll',
        () => {
          state.photos = [];
          state.retakeIndex = null;
          renderPhotoSlots();
          updateCameraUI();
          updateStepperUI();
          showToast('Session roll cleared.');
        }
      );
    });

    dom.toTemplatesBtn.addEventListener('click', () => {
      goToStep(4);
    });

    // Step 4: Template Selection Navigation
    dom.templateBackToCameraBtn.addEventListener('click', () => {
      goToStep(3);
    });

    dom.templateToEditorBtn.addEventListener('click', () => {
      goToStep(5);
    });

    // Step 5: Photo Editor Controls
    dom.editorBackBtn.addEventListener('click', () => {
      goToStep(4);
    });

    dom.editorToExportBtn.addEventListener('click', () => {
      goToStep(6);
    });

    dom.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        state.edit.filter = chip.dataset.filter;
        syncEditorControls();
        renderEditorPreview();
      });
    });

    const handleSliderInput = () => {
      state.edit.brightness = Number(dom.brightnessSlider.value);
      state.edit.contrast = Number(dom.contrastSlider.value);
      state.edit.saturation = Number(dom.saturationSlider.value);
      dom.brightnessVal.textContent = state.edit.brightness > 0 ? `+${state.edit.brightness}` : String(state.edit.brightness);
      dom.contrastVal.textContent = state.edit.contrast > 0 ? `+${state.edit.contrast}` : String(state.edit.contrast);
      dom.saturationVal.textContent = state.edit.saturation > 0 ? `+${state.edit.saturation}` : String(state.edit.saturation);
      renderEditorPreview();
    };

    dom.brightnessSlider.addEventListener('input', handleSliderInput);
    dom.contrastSlider.addEventListener('input', handleSliderInput);
    dom.saturationSlider.addEventListener('input', handleSliderInput);

    dom.bgSwatches.forEach((sw) => {
      sw.addEventListener('click', () => {
        state.edit.customBg = sw.dataset.bg;
        syncEditorControls();
        renderEditorPreview();
      });
    });

    dom.customBgPicker.addEventListener('input', (e) => {
      state.edit.customBg = e.target.value;
      syncEditorControls();
      renderEditorPreview();
    });

    dom.resetBgColorBtn.addEventListener('click', () => {
      state.edit.customBg = null;
      syncEditorControls();
      renderEditorPreview();
    });

    dom.stripTitleInput.addEventListener('input', (e) => {
      state.edit.title = e.target.value;
      state.edit.titleTouched = true;
      renderEditorPreview();
    });

    dom.stripDateInput.addEventListener('input', (e) => {
      state.edit.date = e.target.value;
      renderEditorPreview();
    });

    dom.resetEditsBtn.addEventListener('click', () => {
      resetEditorAdjustments();
    });

    // Step 6: Export & Print
    dom.downloadPngBtn.addEventListener('click', () => downloadStrip('png'));
    dom.downloadJpgBtn.addEventListener('click', () => downloadStrip('jpg'));
    dom.printStripBtn.addEventListener('click', () => printPhotostrip());

    dom.backToEditorBtn.addEventListener('click', () => {
      goToStep(5);
    });

    dom.startNewSessionBtn.addEventListener('click', () => {
      openConfirmModal(
        'Start a new session?',
        'Your current captured photos and edits will be cleared so you can begin a fresh photobooth session.',
        'Start New Session',
        () => {
          state.photos = [];
          state.retakeIndex = null;
          const tpl = getTemplateById(state.templateId);
          state.edit = {
            filter: 'normal',
            brightness: 0,
            contrast: 0,
            saturation: 0,
            customBg: null,
            title: tpl.defaultTitle,
            titleTouched: false,
            date: formatTodayDate()
          };
          renderPhotoSlots();
          goToStep(state.isCameraActive ? 3 : 2);
          showToast('Started a fresh photobooth session.');
        }
      );
    });

    // Templates Catalog View Count Filter
    dom.galleryCountBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.galleryPreviewCount = Number(btn.dataset.galleryCount);
        renderCatalogView();
      });
    });

    // Confirmation Modal
    dom.confirmCancelBtn.addEventListener('click', closeConfirmModal);
    dom.confirmModal.addEventListener('click', (e) => {
      if (e.target === dom.confirmModal) closeConfirmModal();
    });
    dom.confirmAcceptBtn.addEventListener('click', () => {
      const fn = state.pendingConfirmAction;
      closeConfirmModal();
      if (typeof fn === 'function') fn();
    });

    // Keyboard Shortcuts (Spacebar shutter in Camera Studio, Escape for modal)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dom.confirmModal.hidden) {
        closeConfirmModal();
        return;
      }

      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (
        e.code === 'Space' &&
        state.currentView === 'studio' &&
        (state.currentStep === 2 || state.currentStep === 3) &&
        state.isCameraActive &&
        !dom.takePhotoBtn.disabled
      ) {
        e.preventDefault();
        triggerCaptureFlow();
      }
    });
  }

  function setPhotoCount(newCount) {
    if (![3, 4, 6].includes(newCount)) return;
    state.photoCount = newCount;
    state.galleryPreviewCount = newCount;
    if (state.retakeIndex !== null && state.retakeIndex >= newCount) {
      state.retakeIndex = null;
    }
    savePreferences();
    renderPhotoSlots();
    updateCameraUI();
    updateStepperUI();
  }

  /* ========================================================================
     14. BOOTSTRAP
     ======================================================================== */
  function init() {
    bindEvents();
    renderHeroSampleStrips();
    renderPhotoSlots();
    updateCameraUI();
    updateStepperUI();
  }

  init();
})();
