// ===== State =====
const state = {
  tool: 'pen',
  color: '#ffffff',
  brushSize: 4,
  isDrawing: false,
  hasDrawn: false,
  history: [],
  historyIndex: -1,
  maxHistory: 40,
  apiKey: localStorage.getItem('gemini_api_key') || '',
  apiKeySource: localStorage.getItem('gemini_api_key') ? 'browser' : null,
  isGenerating: false,
  generationStartTime: null,
  loadingStage: 0,
  loadingInterval: null,
  timerInterval: null,
  selectedStyle: null,
  generationHistory: JSON.parse(localStorage.getItem('generation_history') || '[]'),
};

// Gemini model to use — gemini-2.5-flash-image is the stable image gen model
const GEMINI_MODEL = 'gemini-2.5-flash-image';

// Production URL for sharing
const PRODUCTION_URL = 'https://cartoon-master-ucztfostta-uc.a.run.app';
const getShareUrl = () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? PRODUCTION_URL 
  : window.location.origin;

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const canvas = $('#drawingCanvas');
const ctx = canvas.getContext('2d');

const els = {
  canvasContainer: $('#canvasContainer'),
  placeholder: $('#canvasPlaceholder'),
  penTool: $('#penTool'),
  eraserTool: $('#eraserTool'),
  colorPicker: $('#colorPicker'),
  colorPreview: $('#colorPreview'),
  brushSize: $('#brushSize'),
  sizeLabel: $('#sizeLabel'),
  undoBtn: $('#undoBtn'),
  redoBtn: $('#redoBtn'),
  clearBtn: $('#clearBtn'),
  promptInput: $('#promptInput'),
  generateBtn: $('#generateBtn'),
  loadingBar: $('#loadingBar'),
  loadingText: $('#loadingText'),
  loadingTimer: $('#loadingTimer'),
  resultShimmer: $('#resultShimmer'),
  uploadBtn: $('#uploadBtn'),
  uploadInput: $('#uploadInput'),
  stylePresets: $('#stylePresets'),
  historyBtn: $('#historyBtn'),
  historyModal: $('#historyModal'),
  historyGrid: $('#historyGrid'),
  closeHistory: $('#closeHistory'),
  shareBtn: $('#shareBtn'),
  shareModal: $('#shareModal'),
  sharePreview: $('#sharePreview'),
  closeShare: $('#closeShare'),
  downloadShareBtn: $('#downloadShareBtn'),
  copyShareBtn: $('#copyShareBtn'),
  twitterShareBtn: $('#twitterShareBtn'),
  nativeShareBtn: $('#nativeShareBtn'),
  resultImage: $('#resultImage'),
  resultPlaceholder: $('#resultPlaceholder'),
  resultDescription: $('#resultDescription'),
  downloadBtn: $('#downloadBtn'),
  apiKeyBtn: $('#apiKeyBtn'),
  apiKeyModal: $('#apiKeyModal'),
  apiKeyInput: $('#apiKeyInput'),
  apiKeyStatus: $('#apiKeyStatus'),
  saveApiKey: $('#saveApiKey'),
  cancelApiKey: $('#cancelApiKey'),
  toggleKeyVisibility: $('#toggleKeyVisibility'),
};

// ===== Load API key from server (.env) =====
async function loadApiKeyFromServer() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const config = await res.json();
    if (config.apiKey) {
      state.apiKey = config.apiKey;
      state.apiKeySource = 'env';
      updateApiKeyStatus();
    }
  } catch {
    // Server not running or no /api/config — silently fall back to localStorage
  }
}

// ===== Canvas Setup =====
function resizeCanvas() {
  const container = els.canvasContainer;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Save current drawing before resize
  const prevDataUrl = canvas.width > 0 && canvas.height > 0 && state.hasDrawn
    ? canvas.toDataURL()
    : null;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);

  // Fill background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Restore drawing
  if (prevDataUrl) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = prevDataUrl;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function initCanvas() {
  resizeCanvas();
  saveToHistory();
}

// ===== Drawing =====
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches ? e.touches[0] : e;
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
}

function startDrawing(e) {
  e.preventDefault();
  state.isDrawing = true;
  const pos = getPos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);

  if (state.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = state.color;
  }
  ctx.lineWidth = state.brushSize;

  // Draw a dot on single click
  ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
  ctx.stroke();

  if (!state.hasDrawn) {
    state.hasDrawn = true;
    els.placeholder.classList.add('hidden');
  }
}

function draw(e) {
  if (!state.isDrawing) return;
  e.preventDefault();
  const pos = getPos(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

function stopDrawing() {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  ctx.closePath();
  ctx.globalCompositeOperation = 'source-over';
  saveToHistory();
}

// ===== History (Undo/Redo) =====
function saveToHistory() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(canvas.toDataURL('image/png'));
  if (state.history.length > state.maxHistory) state.history.shift();
  state.historyIndex = state.history.length - 1;
}

function restoreFromHistory(index) {
  const img = new Image();
  img.onload = () => {
    const rect = els.canvasContainer.getBoundingClientRect();
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);
  };
  img.src = state.history[index];
}

function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    restoreFromHistory(state.historyIndex);
  }
}

function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    restoreFromHistory(state.historyIndex);
  }
}

// ===== Tool Selection =====
function selectTool(tool) {
  state.tool = tool;
  els.penTool.classList.toggle('active', tool === 'pen');
  els.eraserTool.classList.toggle('active', tool === 'eraser');
  els.canvasContainer.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
}

// ===== API Key Management =====
function updateApiKeyStatus() {
  if (!els.apiKeyStatus) return;
  if (state.apiKey) {
    const label = state.apiKeySource === 'env' ? 'Key (via .env)' : 'Key Set';
    els.apiKeyStatus.textContent = label;
    els.apiKeyStatus.className = 'key-status key-set';
  } else {
    els.apiKeyStatus.textContent = 'API Key';
    els.apiKeyStatus.className = 'key-status key-missing';
  }
}

function showApiKeyModal() {
  if (!els.apiKeyModal || !els.apiKeyInput) return;
  // Don't pre-fill if key came from .env (show placeholder instead)
  els.apiKeyInput.value = state.apiKeySource === 'env' ? '' : state.apiKey;
  els.apiKeyInput.placeholder = state.apiKeySource === 'env'
    ? 'Key loaded from .env — paste here to override'
    : 'Enter your API key...';
  els.apiKeyModal.classList.add('active');
  setTimeout(() => els.apiKeyInput.focus(), 100);
}

function hideApiKeyModal() {
  if (!els.apiKeyModal) return;
  els.apiKeyModal.classList.remove('active');
}

function saveApiKeyHandler() {
  const key = els.apiKeyInput.value.trim();
  if (key) {
    state.apiKey = key;
    state.apiKeySource = 'browser';
    localStorage.setItem('gemini_api_key', key);
    showToast('API key saved to browser!', 'success');
  } else if (state.apiKeySource !== 'env') {
    state.apiKey = '';
    state.apiKeySource = null;
    localStorage.removeItem('gemini_api_key');
    showToast('API key removed', 'success');
  }
  updateApiKeyStatus();
  hideApiKeyModal();
}

// ===== Loading Stage Messages =====
const LOADING_STAGES = [
  'Analyzing your sketch...',
  'Applying artistic styles...',
  'Adding fine details...',
  'Enhancing colors and lighting...',
  'Polishing the masterpiece...',
  'Almost there...',
];

function startLoadingAnimation() {
  state.generationStartTime = Date.now();
  state.loadingStage = 0;
  
  // Show shimmer in result panel
  if (els.resultShimmer) {
    els.resultShimmer.style.display = 'block';
    els.resultPlaceholder.style.display = 'none';
  }
  
  // Update loading text
  updateLoadingText();
  
  // Rotate through stages every 3 seconds
  state.loadingInterval = setInterval(() => {
    state.loadingStage = (state.loadingStage + 1) % LOADING_STAGES.length;
    updateLoadingText();
  }, 3000);
  
  // Update timer every second
  state.timerInterval = setInterval(updateLoadingTimer, 1000);
}

function updateLoadingText() {
  if (els.loadingText) {
    els.loadingText.textContent = LOADING_STAGES[state.loadingStage];
  }
}

function updateLoadingTimer() {
  if (els.loadingTimer && state.generationStartTime) {
    const elapsed = Math.floor((Date.now() - state.generationStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    els.loadingTimer.textContent = mins > 0 
      ? `${mins}:${secs.toString().padStart(2, '0')}` 
      : `${secs}s`;
  }
}

function stopLoadingAnimation() {
  if (state.loadingInterval) {
    clearInterval(state.loadingInterval);
    state.loadingInterval = null;
  }
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  if (els.resultShimmer) {
    els.resultShimmer.style.display = 'none';
  }
  state.generationStartTime = null;
}

// ===== Toast Notifications =====
function showToast(message, type = 'error') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== Generate Masterpiece =====
async function generateMasterpiece() {
  if (state.isGenerating) return;

  if (!state.apiKey) {
    showApiKeyModal();
    return;
  }

  if (!state.hasDrawn) {
    showToast('Draw something on the canvas first!');
    return;
  }

  state.isGenerating = true;
  els.generateBtn.disabled = true;
  els.loadingBar.classList.add('active');
  startLoadingAnimation();

  try {
    const canvasDataUrl = canvas.toDataURL('image/png');
    const base64Image = canvasDataUrl.split(',')[1];

    const userKeywords = els.promptInput.value.trim();
    let prompt = 'Transform this rough sketch into a stunning, detailed, professional artwork. ';
    prompt += 'Interpret the shapes and lines in the sketch and create a beautiful, polished illustration. ';
    if (userKeywords) {
      prompt += `Style and theme: ${userKeywords}. `;
    }
    prompt += 'Maintain the subject and composition from the sketch but elevate it dramatically in quality, detail, and artistry.';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${state.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/png', data: base64Image } },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = errorData?.error?.message || `API error: ${response.status}`;
      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts) {
      throw new Error('No content in response. The model may have refused the request.');
    }

    let imageBase64 = null;
    let imageMime = 'image/png';
    let description = '';

    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        imageMime = part.inlineData.mimeType || 'image/png';
      } else if (part.text) {
        description = part.text;
      }
    }

    if (!imageBase64) {
      throw new Error(
        'No image returned. Try a different sketch or prompt.' +
        (description ? ` Model responded: "${description}"` : '')
      );
    }

    // Show result
    els.resultImage.src = `data:${imageMime};base64,${imageBase64}`;
    els.resultImage.style.display = 'block';
    els.resultPlaceholder.style.display = 'none';
    els.downloadBtn.style.display = 'flex';
    if (els.shareBtn) els.shareBtn.style.display = 'flex';

    if (description) {
      els.resultDescription.textContent = description;
      els.resultDescription.style.display = 'block';
    } else {
      els.resultDescription.style.display = 'none';
    }

    // Save to history
    saveToGenerationHistory(canvasDataUrl, `data:${imageMime};base64,${imageBase64}`, userKeywords);
    
    showToast('✨ Masterpiece generated!', 'success');
  } catch (err) {
    console.error('Generation error:', err);
    showToast(err.message || 'Failed to generate. Please try again.');
  } finally {
    state.isGenerating = false;
    els.generateBtn.disabled = false;
    els.loadingBar.classList.remove('active');
    stopLoadingAnimation();
  }
}

// ===== Generation History =====
async function saveToGenerationHistory(sketchDataUrl, resultDataUrl, prompt) {
  // If user is logged in, save to cloud
  if (typeof currentUser !== 'undefined' && currentUser) {
    const cloudResult = await saveGenerationToCloud(
      sketchDataUrl, 
      resultDataUrl, 
      prompt, 
      state.selectedStyle || ''
    );
    if (cloudResult) {
      console.log('Generation saved to cloud');
      return;
    }
  }
  
  // Fallback: save to localStorage for guests (with thumbnail)
  const entry = {
    id: Date.now(),
    sketch: createThumbnail(sketchDataUrl),
    result: createThumbnail(resultDataUrl),
    prompt: prompt || '',
    timestamp: new Date().toISOString(),
  };
  
  state.generationHistory.unshift(entry);
  
  // Keep only last 10 entries to avoid localStorage quota issues
  if (state.generationHistory.length > 10) {
    state.generationHistory = state.generationHistory.slice(0, 10);
  }
  
  // Try to save, with fallback cleanup if quota exceeded
  try {
    localStorage.setItem('generation_history', JSON.stringify(state.generationHistory));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Clear old entries and try again
      state.generationHistory = state.generationHistory.slice(0, 5);
      try {
        localStorage.setItem('generation_history', JSON.stringify(state.generationHistory));
      } catch (e2) {
        // Last resort: clear all history
        state.generationHistory = [entry];
        localStorage.setItem('generation_history', JSON.stringify(state.generationHistory));
        console.warn('Cleared old history due to storage quota');
      }
    }
  }
}

// Create a smaller thumbnail for localStorage
function createThumbnail(dataUrl) {
  // For now, return the original - we'll optimize later if needed
  // A proper implementation would resize to ~200px
  return dataUrl;
}

async function showHistoryModal() {
  if (els.historyModal) {
    els.historyModal.classList.add('active');
  }
  await renderHistoryGrid();
}

function hideHistoryModal() {
  if (els.historyModal) {
    els.historyModal.classList.remove('active');
  }
}

async function renderHistoryGrid() {
  if (!els.historyGrid) return;
  
  // Show loading state
  els.historyGrid.innerHTML = '<p class="history-loading">Loading history...</p>';
  
  let historyItems = [];
  
  // If logged in, load from cloud
  if (typeof currentUser !== 'undefined' && currentUser && typeof loadCloudHistory === 'function') {
    const cloudHistory = await loadCloudHistory();
    historyItems = cloudHistory.map(entry => ({
      id: entry.id,
      sketch: entry.sketchUrl,
      result: entry.resultUrl,
      prompt: entry.prompt || '',
      timestamp: entry.timestamp,
      isCloud: true
    }));
  } else {
    // Use localStorage history for guests
    historyItems = state.generationHistory;
  }
  
  if (historyItems.length === 0) {
    els.historyGrid.innerHTML = '<p class="history-empty">No generations yet. Create your first masterpiece!</p>';
    return;
  }
  
  els.historyGrid.innerHTML = historyItems.map(entry => `
    <div class="history-item" data-id="${entry.id}" data-cloud="${entry.isCloud || false}">
      <img src="${entry.result}" alt="Generated artwork" loading="lazy">
      <div class="history-item-overlay">
        <span class="history-date">${new Date(entry.timestamp).toLocaleDateString()}</span>
        ${entry.prompt ? `<span class="history-prompt">${entry.prompt}</span>` : ''}
      </div>
    </div>
  `).join('');
  
  // Store items for click handler
  const itemsMap = new Map(historyItems.map(e => [String(e.id), e]));
  
  // Add click handlers
  els.historyGrid.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const entry = itemsMap.get(id);
      if (entry) {
        els.resultImage.src = entry.result;
        els.resultImage.style.display = 'block';
        els.resultPlaceholder.style.display = 'none';
        els.downloadBtn.style.display = 'flex';
        if (els.shareBtn) els.shareBtn.style.display = 'flex';
        hideHistoryModal();
      }
    });
  });
}

function clearHistory() {
  if (confirm('Clear all generation history?')) {
    state.generationHistory = [];
    localStorage.removeItem('generation_history');
    renderHistoryGrid();
    showToast('History cleared', 'success');
  }
}

// ===== Image Upload =====
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const rect = els.canvasContainer.getBoundingClientRect();
      
      // Clear canvas
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // Calculate scaling to fit
      const scale = Math.min(rect.width / img.width, rect.height / img.height);
      const x = (rect.width - img.width * scale) / 2;
      const y = (rect.height - img.height * scale) / 2;
      
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      
      state.hasDrawn = true;
      els.placeholder.classList.add('hidden');
      saveToHistory();
      showToast('Image loaded!', 'success');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  
  // Reset input so same file can be uploaded again
  e.target.value = '';
}

// ===== Style Presets =====
const STYLE_PRESETS = [
  { id: 'anime', label: 'Anime', prompt: 'anime style, vibrant colors, clean lines, Studio Ghibli inspired' },
  { id: 'oil', label: 'Oil Painting', prompt: 'oil painting style, rich textures, classical art, painterly brushstrokes' },
  { id: 'watercolor', label: 'Watercolor', prompt: 'watercolor painting, soft edges, flowing colors, artistic wash' },
  { id: 'pixel', label: 'Pixel Art', prompt: 'pixel art style, retro gaming aesthetic, 16-bit, crisp pixels' },
  { id: 'realistic', label: 'Realistic', prompt: 'photorealistic, highly detailed, professional photography' },
  { id: 'comic', label: 'Comic Book', prompt: 'comic book style, bold outlines, halftone dots, superhero aesthetic' },
];

function selectStylePreset(presetId) {
  const preset = STYLE_PRESETS.find(p => p.id === presetId);
  if (!preset) return;
  
  // Toggle selection
  if (state.selectedStyle === presetId) {
    state.selectedStyle = null;
    els.promptInput.value = '';
  } else {
    state.selectedStyle = presetId;
    els.promptInput.value = preset.prompt;
  }
  
  // Update UI
  document.querySelectorAll('.style-preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === state.selectedStyle);
  });
}

function initStylePresets() {
  if (!els.stylePresets) return;
  
  els.stylePresets.innerHTML = STYLE_PRESETS.map(preset => `
    <button class="style-preset" data-style="${preset.id}" title="${preset.prompt}">
      ${preset.label}
    </button>
  `).join('');
  
  els.stylePresets.querySelectorAll('.style-preset').forEach(btn => {
    btn.addEventListener('click', () => selectStylePreset(btn.dataset.style));
  });
}

// ===== Download =====
function downloadResult() {
  const link = document.createElement('a');
  link.download = `masterpiece-${Date.now()}.png`;
  link.href = els.resultImage.src;
  link.click();
}

// ===== Share Feature =====
let currentShareImage = null;

function generateShareImage() {
  return new Promise((resolve) => {
    const sketchDataUrl = canvas.toDataURL('image/png');
    const resultDataUrl = els.resultImage.src;
    
    const sketchImg = new Image();
    const resultImg = new Image();
    let loaded = 0;
    
    const checkLoaded = () => {
      loaded++;
      if (loaded === 2) {
        // Create combined canvas
        const padding = 20;
        const labelHeight = 40;
        const imgSize = 400;
        const totalWidth = imgSize * 2 + padding * 3;
        const totalHeight = imgSize + padding * 2 + labelHeight;
        
        const shareCanvas = document.createElement('canvas');
        shareCanvas.width = totalWidth;
        shareCanvas.height = totalHeight;
        const ctx = shareCanvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, totalWidth, totalHeight);
        
        // Draw sketch
        ctx.drawImage(sketchImg, padding, padding, imgSize, imgSize);
        
        // Draw result
        ctx.drawImage(resultImg, imgSize + padding * 2, padding, imgSize, imgSize);
        
        // Labels
        ctx.fillStyle = '#9898b0';
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sketch', padding + imgSize / 2, imgSize + padding + 28);
        ctx.fillText('Masterpiece', imgSize + padding * 2 + imgSize / 2, imgSize + padding + 28);
        
        // Arrow
        ctx.fillStyle = '#8B5CF6';
        ctx.font = '24px sans-serif';
        ctx.fillText('→', totalWidth / 2, imgSize / 2 + padding);
        
        // Branding
        ctx.fillStyle = '#5a5a78';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('Made with Sketch to Masterpiece', totalWidth - padding, totalHeight - 8);
        
        resolve(shareCanvas.toDataURL('image/png'));
      }
    };
    
    sketchImg.onload = checkLoaded;
    resultImg.onload = checkLoaded;
    sketchImg.src = sketchDataUrl;
    resultImg.src = resultDataUrl;
  });
}

let currentShareUrl = null;

async function showShareModal() {
  if (!els.resultImage.src || els.resultImage.style.display === 'none') {
    showToast('Generate a masterpiece first!');
    return;
  }
  
  // Show modal with loading state
  els.shareModal.classList.add('active');
  els.sharePreview.innerHTML = '<div class="share-loading">Generating preview...</div>';
  
  // Generate the combined image
  currentShareImage = await generateShareImage();
  
  // Check if user is logged in for cloud sharing
  if (typeof currentUser !== 'undefined' && currentUser) {
    els.sharePreview.innerHTML = `
      <img src="${currentShareImage}" alt="Share preview">
      <div class="share-uploading">Creating shareable link...</div>
    `;
    
    // Upload to Firebase and get shareable link
    const shareResult = await uploadShareImage(currentShareImage, {
      prompt: els.promptInput.value || '',
      style: state.selectedStyle || ''
    });
    
    if (shareResult) {
      currentShareUrl = shareResult.shareUrl;
      els.sharePreview.innerHTML = `
        <img src="${currentShareImage}" alt="Share preview">
        <div class="share-link-container">
          <input type="text" class="share-link-input" value="${currentShareUrl}" readonly id="shareLinkInput" onclick="this.select()">
          <button class="copy-link-btn" id="copyLinkBtn" title="Copy link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy Link
          </button>
        </div>
      `;
      
      // Add copy link listener
      document.getElementById('copyLinkBtn')?.addEventListener('click', copyShareLink);
    } else {
      els.sharePreview.innerHTML = `<img src="${currentShareImage}" alt="Share preview">`;
    }
  } else {
    els.sharePreview.innerHTML = `
      <img src="${currentShareImage}" alt="Share preview">
      <p class="share-signin-hint">✨ Sign in to get a shareable link!</p>
    `;
  }
  
  // Show/hide native share button based on support
  if (navigator.share && navigator.canShare) {
    els.nativeShareBtn.style.display = 'flex';
  } else {
    els.nativeShareBtn.style.display = 'none';
  }
}

function hideShareModal() {
  els.shareModal.classList.remove('active');
  currentShareImage = null;
  currentShareUrl = null;
}

function copyShareLink() {
  if (!currentShareUrl) return;
  navigator.clipboard.writeText(currentShareUrl)
    .then(() => showToast('Link copied!', 'success'))
    .catch(() => showToast('Failed to copy link'));
}

function downloadShareImage() {
  if (!currentShareImage) return;
  const link = document.createElement('a');
  link.download = `sketch-to-masterpiece-${Date.now()}.png`;
  link.href = currentShareImage;
  link.click();
  showToast('Image downloaded!', 'success');
}

async function copyShareImage() {
  if (!currentShareImage) return;
  try {
    const response = await fetch(currentShareImage);
    const blob = await response.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    showToast('Copied to clipboard!', 'success');
  } catch (err) {
    showToast('Failed to copy. Try downloading instead.');
  }
}

function shareToTwitter() {
  const text = encodeURIComponent('Check out my AI-generated masterpiece! ✨🎨 Made with Sketch to Masterpiece');
  const url = encodeURIComponent(currentShareUrl || getShareUrl());
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

async function nativeShare() {
  if (!currentShareImage) return;
  try {
    const response = await fetch(currentShareImage);
    const blob = await response.blob();
    const file = new File([blob], 'masterpiece.png', { type: 'image/png' });
    
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Sketch to Masterpiece',
        text: 'Check out my AI-generated masterpiece! ✨🎨',
        files: [file]
      });
    } else {
      await navigator.share({
        title: 'Sketch to Masterpiece',
        text: 'Check out my AI-generated masterpiece! ✨🎨',
        url: currentShareUrl || getShareUrl()
      });
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast('Sharing failed. Try downloading instead.');
    }
  }
}

// ===== Clear Canvas =====
function clearCanvas() {
  const rect = els.canvasContainer.getBoundingClientRect();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, rect.width, rect.height);
  state.hasDrawn = false;
  els.placeholder.classList.remove('hidden');
  saveToHistory();
}

// ===== Event Listeners =====
function setupEvents() {
  // Drawing — mouse
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  // Drawing — touch
  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);

  // Tools
  els.penTool.addEventListener('click', () => selectTool('pen'));
  els.eraserTool.addEventListener('click', () => selectTool('eraser'));

  // Color
  els.colorPicker.addEventListener('input', (e) => {
    state.color = e.target.value;
    els.colorPreview.style.background = e.target.value;
  });
  // Open native color picker when clicking the preview swatch
  els.colorPreview.addEventListener('click', () => els.colorPicker.click());
  els.colorPreview.style.background = state.color;

  // Brush size
  els.brushSize.addEventListener('input', (e) => {
    state.brushSize = parseInt(e.target.value);
    els.sizeLabel.textContent = state.brushSize + 'px';
  });

  // Canvas actions
  els.undoBtn.addEventListener('click', undo);
  els.redoBtn.addEventListener('click', redo);
  els.clearBtn.addEventListener('click', clearCanvas);

  // Generate
  els.generateBtn.addEventListener('click', generateMasterpiece);
  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generateMasterpiece();
  });

  // Download
  els.downloadBtn.addEventListener('click', downloadResult);

  // Image Upload
  if (els.uploadBtn && els.uploadInput) {
    els.uploadBtn.addEventListener('click', () => els.uploadInput.click());
    els.uploadInput.addEventListener('change', handleImageUpload);
  }

  // History Modal
  if (els.historyBtn) {
    els.historyBtn.addEventListener('click', showHistoryModal);
  }
  if (els.closeHistory) {
    els.closeHistory.addEventListener('click', hideHistoryModal);
  }
  if (els.historyModal) {
    els.historyModal.addEventListener('click', (e) => {
      if (e.target === els.historyModal) hideHistoryModal();
    });
  }

  // Share Modal
  if (els.shareBtn) {
    els.shareBtn.addEventListener('click', showShareModal);
  }
  if (els.closeShare) {
    els.closeShare.addEventListener('click', hideShareModal);
  }
  if (els.shareModal) {
    els.shareModal.addEventListener('click', (e) => {
      if (e.target === els.shareModal) hideShareModal();
    });
  }
  if (els.downloadShareBtn) {
    els.downloadShareBtn.addEventListener('click', downloadShareImage);
  }
  if (els.copyShareBtn) {
    els.copyShareBtn.addEventListener('click', copyShareImage);
  }
  if (els.twitterShareBtn) {
    els.twitterShareBtn.addEventListener('click', shareToTwitter);
  }
  if (els.nativeShareBtn) {
    els.nativeShareBtn.addEventListener('click', nativeShare);
  }

  // API Key modal (optional - may be removed from UI)
  if (els.apiKeyBtn) {
    els.apiKeyBtn.addEventListener('click', showApiKeyModal);
  }
  if (els.saveApiKey) {
    els.saveApiKey.addEventListener('click', saveApiKeyHandler);
  }
  if (els.cancelApiKey) {
    els.cancelApiKey.addEventListener('click', hideApiKeyModal);
  }
  if (els.apiKeyModal) {
    els.apiKeyModal.addEventListener('click', (e) => {
      if (e.target === els.apiKeyModal) hideApiKeyModal();
    });
  }
  if (els.apiKeyInput) {
    els.apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveApiKeyHandler();
      if (e.key === 'Escape') hideApiKeyModal();
    });
  }
  if (els.toggleKeyVisibility) {
    els.toggleKeyVisibility.addEventListener('click', () => {
      els.apiKeyInput.type = els.apiKeyInput.type === 'password' ? 'text' : 'password';
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault(); undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault(); redo();
    }
  });

  // Resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeCanvas, 150);
  });
}

// ===== Init =====
async function init() {
  updateApiKeyStatus();
  initCanvas();
  setupEvents();
  initStylePresets();
  // Try to load key from server .env (async, non-blocking)
  await loadApiKeyFromServer();
}

init();
