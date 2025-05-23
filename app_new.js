import { Imagebox3 } from "https://episphere.github.io/imagebox3/imagebox3.mjs"
import { UMAP } from "https://esm.sh/umap-js"
// import { Decentifai } from "https://prafulb.github.io/decentifai/index.js"
import { Decentifai } from "http://localhost:5502/index.js"

const fedEmbed = {}
fedEmbed.peerName = `Peer-${crypto.randomUUID().slice(0, 8)}`;
fedEmbed.htmlElements = {
    inputTypeFile: document.getElementById('inputTypeFile'),
    inputTypeUrl: document.getElementById('inputTypeUrl'),
    fileInputContainer: document.getElementById('fileInputContainer'),
    urlInputContainer: document.getElementById('urlInputContainer'),
    fileInput: document.getElementById('wsiFile'),
    urlInput: document.getElementById('wsiUrl'),
    loadAndViewBtn: document.getElementById('loadAndViewBtn'),

    parameterControls: document.getElementById('parameterControls'),
    numPatchesInput: document.getElementById('numPatches'),
    modelSelect: document.getElementById('modelSelect'),
    patchWidthInput: document.getElementById('patchWidth'),
    patchHeightInput: document.getElementById('patchHeight'),
    shareEmbeddingsCheck: document.getElementById('shareEmbeddingsCheck'),
    generateBtn: document.getElementById('generateBtn'),

    processingStatusDiv: document.getElementById('processing-status'),
    statusText: document.getElementById('status-text'),
    patchingProgressBar: document.getElementById('patching-progress'),
    embeddingProgressBar: document.getElementById('embedding-progress'), // Assuming you have this HTML element

    trainingControls: document.getElementById('trainingControls'),
    trainBtn: document.getElementById('trainBtn'),
    trainingStatusText: document.getElementById('training-status-text'),
    trainingProgressBar: document.getElementById('training-progress'),
    resultsOutput: document.getElementById('results-output'),
    trainingResultsArea: document.getElementById('trainingResultsArea'), // For convergence plot & log

    visualizationArea: document.getElementById('visualization-area'),
    osdViewerDiv: document.getElementById('osd-viewer'),
    plotContainer: document.getElementById('plot-container'),
    visualizationPlaceholder: document.getElementById('visualization-placeholder'),
    plotControls: document.getElementById('plot-controls'),
    colorBySelect: document.getElementById('colorBySelect'),

    convergencePlotContainer: document.getElementById('convergencePlotContainer'),
    convergenceStatusText: document.getElementById('convergenceStatusText')
};

fedEmbed.imagebox3Instance = undefined;
fedEmbed.umapInstance = undefined;
fedEmbed.decentifaiInstance = null;

fedEmbed.currentInputType = 'file';
fedEmbed.currentWsiIdentifier = null;
fedEmbed.currentWsiIdentifierString = "";
fedEmbed.osdViewer = null;
// fedEmbed.selectionPlugin = null;

fedEmbed.currentROI = null;
fedEmbed.currentLocalEmbeddings = [];
fedEmbed.allSharedEmbeddings = [];
fedEmbed.trainedModel = null;
fedEmbed.availableColorByProps = [];
fedEmbed.embeddingModel = undefined;

// // --- Mock data if not defined elsewhere ---
// const SUPPORTED_MODELS = window.SUPPORTED_MODELS || [
//     { modelId: 'ctranspath', modelName: 'CTransPath (Pathology Foundation Model)', modelURL: 'https://huggingface.co/stanfordaimi/ctranspath/resolve/main/ctranspath.onnx?download=true', defaultNumPatches: 50, enabled: true },
//     // Add other models here
// ];
// const EXAMPLE_DATA = window.EXAMPLE_DATA || [ {id: "luad-lusc-example", path: "https://episphere.github.io/fedembed/data/luad-lusc-embeddings-ctranspath-1k.json", colorBy: "site_code"} ]; // Ensure this is defined
// const DEFAULT_OSD_VIEWER_OPTIONS = window.DEFAULT_OSD_VIEWER_OPTIONS || {
//     id: "osd-viewer",
//     prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
//     constrainDuringPan: true,
//     visibilityRatio: 1,
//     minZoomLevel: 1,
//     defaultZoomLevel: 1,
//     maxZoomPixelRatio: 10,
//     showNavigator: true
// };
// // --- End Mock Data ---


function populateModelSelector() {
    fedEmbed.htmlElements.modelSelect.innerHTML = '';
    SUPPORTED_MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.modelId;
        option.textContent = model.modelName;
        option.dataset.defaultPatches = model.defaultNumPatches;
        fedEmbed.htmlElements.modelSelect.appendChild(option);
        if (!model.enabled) {
            option.disabled = true;
        }
    });
    updateNumPatchesDefault();
}

function updateNumPatchesDefault() {
    const selectedOption = fedEmbed.htmlElements.modelSelect.options[fedEmbed.htmlElements.modelSelect.selectedIndex];
    if (selectedOption && selectedOption.dataset.defaultPatches) {
        fedEmbed.htmlElements.numPatchesInput.value = selectedOption.dataset.defaultPatches;
    }
}

function showViewer(type) { // 'osd', 'plot', or 'placeholder'
    fedEmbed.htmlElements.osdViewerDiv.style.display = (type === 'osd') ? 'block' : 'none';
    fedEmbed.htmlElements.plotContainer.style.display = (type === 'plot') ? 'block' : 'none';
    if (type === 'placeholder') {
        fedEmbed.htmlElements.visualizationPlaceholder.classList.add('d-flex');
        fedEmbed.htmlElements.visualizationPlaceholder.style.display = 'flex';
    } else {
        fedEmbed.htmlElements.visualizationPlaceholder.classList.remove('d-flex');
        fedEmbed.htmlElements.visualizationPlaceholder.style.display = 'none';
    }
}

function updateStatus(message, isProcessing = false) {
    fedEmbed.htmlElements.processingStatusDiv.style.display = 'block';
    fedEmbed.htmlElements.statusText.textContent = message;
    fedEmbed.htmlElements.generateBtn.disabled = isProcessing;
    fedEmbed.htmlElements.loadAndViewBtn.disabled = isProcessing;
    if (isProcessing) {
        fedEmbed.htmlElements.trainingControls.style.display = 'none';
    }
}

function updateTrainingStatus(message, isTraining = false) {
    if (fedEmbed.htmlElements.trainingStatusText) {
        fedEmbed.htmlElements.trainingStatusText.textContent = message;
    }
    if (fedEmbed.htmlElements.trainBtn) {
        fedEmbed.htmlElements.trainBtn.disabled = isTraining;
    }
    // fedEmbed.htmlElements.generateBtn.disabled = isTraining;
}


function appendToResultsOutput(message) {
    if (fedEmbed.htmlElements.resultsOutput) {
        fedEmbed.htmlElements.resultsOutput.textContent += message + "\n";
        fedEmbed.htmlElements.resultsOutput.scrollTop = fedEmbed.htmlElements.resultsOutput.scrollHeight;
    } else {
        console.log("Training Log:", message);
    }
}


function showProgress(barElement, percentage) {
    if (barElement && barElement.parentElement) {
        barElement.parentElement.style.display = 'block';
        barElement.style.width = `${percentage}%`;
        barElement.setAttribute('aria-valuenow', percentage);
        barElement.textContent = percentage > 5 ? `${percentage}%` : '';
    }
}

function hideProgress(barElement) {
    if (barElement && barElement.parentElement) {
        barElement.parentElement.style.display = 'none';
        barElement.style.width = '0%';
        barElement.setAttribute('aria-valuenow', 0);
        barElement.textContent = '';
    }
}

function populateColorBySelector(embeddingObjects) {
    fedEmbed.htmlElements.colorBySelect.innerHTML = '';
    const paramControlRow = fedEmbed.htmlElements.parameterControls.querySelector('.row');
    if (paramControlRow) {
        paramControlRow.querySelectorAll(".colorByParameter").forEach(e => e.remove());
    }
    fedEmbed.availableColorByProps = [];

    if (!embeddingObjects || embeddingObjects.length === 0 || !embeddingObjects[0].properties) {
        const option = document.createElement('option');
        option.value = '_none_';
        option.textContent = 'N/A (Default Color)';
        fedEmbed.htmlElements.colorBySelect.appendChild(option);
        fedEmbed.htmlElements.colorBySelect.disabled = true;
        return;
    }

    const firstProps = embeddingObjects[0].properties;
    fedEmbed.availableColorByProps = Object.keys(firstProps);

    const noneOption = document.createElement('option');
    noneOption.value = '_none_';
    noneOption.textContent = 'Default Color';
    fedEmbed.htmlElements.colorBySelect.appendChild(noneOption);

    fedEmbed.availableColorByProps.forEach(propKey => {
        const option = document.createElement('option');
        option.value = propKey;
        option.textContent = propKey;
        fedEmbed.htmlElements.colorBySelect.appendChild(option);

        if (paramControlRow) {
            const colorByParameterHTML = `
            <div class="col-sm-6 colorByParameter">
                <label for="${propKey}" class="form-label">${propKey}</label>
                <input type="text" class="form-control form-control-sm" id="${propKey}-propInput" value="">
            </div>`;
            paramControlRow.insertAdjacentHTML('beforeend', colorByParameterHTML);
        }
    });

    fedEmbed.htmlElements.colorBySelect.disabled = false;
}


function display3DPlot(embeddingObjects, colorByKey = "_none_") {
    if (!embeddingObjects || embeddingObjects.length === 0) {
        console.warn("No embeddings to plot.");
        showViewer('placeholder');
        fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'No embeddings available for plotting.';
        fedEmbed.htmlElements.plotControls.style.display = 'none';
        return;
    }
    const firstEmbeddingWith3D = embeddingObjects.find(e => e.embedding3d && e.embedding3d.length >= 3);
    if (!firstEmbeddingWith3D) {
        console.error("Embeddings do not contain valid 'embedding3d' data for plotting.");
        showViewer('placeholder');
        fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'Error: Embeddings lack 3D data for plotting.';
        fedEmbed.htmlElements.plotControls.style.display = 'none';
        return;
    }

    Plotly.purge(fedEmbed.htmlElements.plotContainer);
    showViewer('plot');

    let plotData = [];
    const layout = {
        title: '3D UMAP Projection of Patch Embeddings' + (colorByKey !== "_none_" ? ` (Colored by ${colorByKey})` : ''),
        margin: { l: 0, r: 0, b: 0, t: 50 },
        scene: {
            xaxis: { title: 'UMAP Dim 1', zeroline: true, showgrid: true, showticklabels: false },
            yaxis: { title: 'UMAP Dim 2', zeroline: true, showgrid: true, showticklabels: false },
            zaxis: { title: 'UMAP Dim 3', zeroline: true, showgrid: true, showticklabels: false }
        },
        legend: { itemsizing: 'constant', orientation: 'h', yanchor: 'bottom', y: 0.01, xanchor: 'center', x: 0.5}
    };

    if (colorByKey === "_none_" || !fedEmbed.availableColorByProps.includes(colorByKey)) {
        const trace = {
            x: embeddingObjects.map(e => e.embedding3d[0]),
            y: embeddingObjects.map(e => e.embedding3d[1]),
            z: embeddingObjects.map(e => e.embedding3d[2]),
            mode: 'markers', type: 'scatter3d',
            marker: { size: 3.5, opacity: 0.7 },
            text: embeddingObjects.map(e => `Source: ${e.displayName || e.sourcePeer || 'Local'}<br>WSI: ${e.wsiId || 'N/A'}<br>Tile: ${e.tileParams?.tileX},${e.tileParams?.tileY}`),
            hoverinfo: 'text'
        };
        plotData.push(trace);
        layout.showlegend = false;
    } else {
        const groups = {};
        embeddingObjects.forEach(e => {
            const value = e.properties?.[colorByKey] !== undefined ? e.properties[colorByKey] : 'N/A';
            if (!groups[value]) {
                groups[value] = { x: [], y: [], z: [], text: [], name: `${colorByKey}: ${value}` };
            }
            if (e.embedding3d && e.embedding3d.length >= 3) {
                groups[value].x.push(e.embedding3d[0]);
                groups[value].y.push(e.embedding3d[1]);
                groups[value].z.push(e.embedding3d[2]);
                let hover = `<b>${colorByKey}: ${value}</b><br>Source: ${e.displayName || e.sourcePeer || 'Local'}<br>WSI: ${e.wsiId || 'N/A'}<br>Tile: ${e.tileParams?.tileX},${e.tileParams?.tileY}`;
                if (e.properties) {
                    Object.entries(e.properties).forEach(([key, val]) => {
                        if (key !== colorByKey) hover += `<br>${key}: ${val}`;
                    });
                }
                groups[value].text.push(hover);
            }
        });

        Object.values(groups).forEach(groupData => {
            const trace = {
                x: groupData.x, y: groupData.y, z: groupData.z,
                name: groupData.name, mode: 'markers', type: 'scatter3d',
                marker: { size: 3.5, opacity: 0.8 },
                text: groupData.text, hoverinfo: 'text'
            };
            plotData.push(trace);
        });
        layout.showlegend = true;
    }

    Plotly.newPlot(fedEmbed.htmlElements.plotContainer, plotData, layout);
    fedEmbed.htmlElements.plotControls.style.display = 'block';
}


function displayConvergencePlot(convergenceData) {
    const container = fedEmbed.htmlElements.convergencePlotContainer;
    const statusEl = fedEmbed.htmlElements.convergenceStatusText;
    if (!container || !statusEl) {
        console.warn("Convergence plot container or status element not found.");
        return;
    }

    if (!convergenceData || convergenceData.rounds === undefined || convergenceData.rounds === 0) {
        container.innerHTML = '<p class="text-center">No convergence data yet. Training needs to run for a few rounds.</p>';
        statusEl.textContent = '';
        return;
    }
    Plotly.purge(container);

    const rounds = Array.from({ length: convergenceData.rounds }, (_, i) => i + 1);
    const traces = [];

    if (convergenceData.parameterDistance && convergenceData.parameterDistance.data.length > 0) {
        traces.push({
            x: rounds.slice(0, convergenceData.parameterDistance.data.length),
            y: convergenceData.parameterDistance.data,
            mode: 'lines+markers', name: 'Param Distance', yaxis: 'y1'
        });
    }
    if (convergenceData.modelLoss && convergenceData.modelLoss.data.length > 0) {
        traces.push({
            x: rounds.slice(0, convergenceData.modelLoss.data.length),
            y: convergenceData.modelLoss.data,
            mode: 'lines+markers', name: 'Loss', yaxis: 'y2'
        });
    }
    if (convergenceData.trainingAccuracy && convergenceData.trainingAccuracy.data.length > 0) {
        traces.push({
            x: rounds.slice(0, convergenceData.trainingAccuracy.data.length),
            y: convergenceData.trainingAccuracy.data,
            mode: 'lines+markers', name: 'Accuracy', yaxis: 'y3'
        });
    }

    if (traces.length === 0) {
         container.innerHTML = '<p class="text-center">Metrics (Loss, Accuracy, Distance) are not being tracked or available.</p>';
         statusEl.textContent = `Data available for ${convergenceData.rounds} rounds, but no plottable metrics found.`;
         return;
    }

    const layout = {
        height: 400,
        xaxis: { title: 'Federation Round', domain: [0.1, 0.9] },
        yaxis: { title: 'Param Distance', side: 'left', titlefont: {color: 'blue'}, tickfont: {color: 'blue'}},
        yaxis2: { title: 'Loss', overlaying: 'y', side: 'right', titlefont: {color: 'red'}, tickfont: {color: 'red'}, showgrid: false},
        yaxis3: { title: 'Accuracy', overlaying: 'y', side: 'right', position: 0.95,
            titlefont: {color: 'green'}, tickfont: {color: 'green'}, showgrid: false, anchor: 'free' },
        legend: { x: 0.5, y: 1.15, xanchor: 'center', orientation: 'h' },
        margin: { l: 60, r: 120, b: 50, t: 30 }
    };
    Plotly.newPlot(container, traces, layout);
    statusEl.textContent = `Metrics for ${convergenceData.rounds} rounds. ParamDist trend: ${convergenceData.parameterDistance?.trend || 'N/A'}. Loss trend: ${convergenceData.modelLoss?.trend || 'N/A'}. Acc trend: ${convergenceData.trainingAccuracy?.trend || 'N/A'}.`;
}


function destroyOSDViewer() {
    if (fedEmbed.osdViewer) {
        // if (fedEmbed.selectionPlugin) { 
        //     fedEmbed.selectionPlugin.destroy();
        //     fedEmbed.selectionPlugin = null;
        // }
        fedEmbed.osdViewer.destroy();
        fedEmbed.osdViewer = null;
    }
    fedEmbed.htmlElements.osdViewerDiv.innerHTML = '';
    fedEmbed.currentROI = null;
}

function initializeOSDViewer(tileSource) {
    destroyOSDViewer();
    showViewer('osd');
    fedEmbed.htmlElements.parameterControls.style.display = 'none';

    try {
        fedEmbed.osdViewer = OpenSeadragon({ ...DEFAULT_OSD_VIEWER_OPTIONS });
        fedEmbed.osdViewer.addHandler('open', () => {
            console.log("OSD Viewer opened.");
            fedEmbed.htmlElements.parameterControls.style.display = 'block';
            fedEmbed.htmlElements.processingStatusDiv.style.display = 'none';
        });
        fedEmbed.osdViewer.addHandler('open-failed', (event) => {
            console.error("OSD Error:", event);
            showViewer('placeholder');
            fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = `Error loading WSI: ${event.message || 'Unknown error'}`;
        });
        fedEmbed.osdViewer.open(tileSource);
    } catch (error) {
        console.error("Failed to initialize OpenSeadragon:", error);
        showViewer('placeholder');
        fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'Failed to initialize viewer.';
    }
}

async function createTileSource(identifier) {
    const isFile = identifier instanceof File;
    const imageId = isFile ? identifier.name : identifier;

    if (!fedEmbed.imagebox3Instance) {
        const numWorkers = Math.max(1, Math.floor(navigator.hardwareConcurrency / 2));
        fedEmbed.imagebox3Instance = new Imagebox3(identifier, numWorkers);
        try {
            await fedEmbed.imagebox3Instance.init();
        } catch (e) {
             console.error("Imagebox3 init failed:", e);
             alert(`Error initializing Imagebox3: ${e.message}`);
             return undefined;
        }
    } else {
        fedEmbed.imagebox3Instance.changeImageSource(identifier)
    }

    let tileSources = {};
    try {
        tileSources = await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(identifier, {
            logLatency: false, cache: true, slideOnly: true, pool: fedEmbed.imagebox3Instance.workerPool
        });
    } catch (e) {
        console.error("GeoTIFFTileSource error:", e);
        alert("An error occurred while loading the image. Check console for details.");
        return undefined;
    }
    return tileSources;
}


const findTissueRegionsInImage = (gridDim = 8, thumbnailWidth = 1024) => new Promise(async (resolve, reject) => {
    if (!fedEmbed.imagebox3Instance) return reject("Imagebox not initialized");
    try {
        const imageInfo = await fedEmbed.imagebox3Instance.getInfo();
        const thumbnailHeight = Math.floor(thumbnailWidth * imageInfo.height / imageInfo.width);
        const blob = await fedEmbed.imagebox3Instance.getThumbnail(thumbnailWidth, thumbnailHeight);

        const thumbnailURL = URL.createObjectURL(blob);
        const thumbnailImg = new Image();
        thumbnailImg.crossOrigin = "Anonymous";
        thumbnailImg.src = thumbnailURL;

        const offscreenCanvas = new OffscreenCanvas(Math.floor(thumbnailWidth / gridDim), Math.floor(thumbnailHeight / gridDim));
        const offscreenCtx = offscreenCanvas.getContext('2d');
        const tileWidthInThumb = offscreenCanvas.width;
        const tileHeightInThumb = offscreenCanvas.height;

        thumbnailImg.onload = () => {
            const tissueRegions = [];
            for (let rowIdx = 0; rowIdx < gridDim; rowIdx++) {
                for (let colIdx = 0; colIdx < gridDim; colIdx++) {
                    const sx = colIdx * tileWidthInThumb;
                    const sy = rowIdx * tileHeightInThumb;
                    offscreenCtx.clearRect(0,0, offscreenCanvas.width, offscreenCanvas.height);
                    offscreenCtx.drawImage(thumbnailImg, sx, sy, tileWidthInThumb, tileHeightInThumb, 0, 0, tileWidthInThumb, tileHeightInThumb);

                    const emptyPercentage = isTileEmpty(offscreenCanvas, offscreenCtx, 0.9, true);
                    const actualTileWidth = imageInfo.width / gridDim;
                    const actualTileHeight = imageInfo.height / gridDim;

                    tissueRegions.push({
                        topX: Math.floor(colIdx * actualTileWidth),
                        topY: Math.floor(rowIdx * actualTileHeight),
                        bottomX: Math.floor((colIdx + 1) * actualTileWidth),
                        bottomY: Math.floor((rowIdx + 1) * actualTileHeight),
                        emptyPercentage
                    });
                }
            }
            URL.revokeObjectURL(thumbnailURL); // Clean up blob URL
            resolve(tissueRegions.sort((a, b) => a.emptyPercentage - b.emptyPercentage).slice(0, Math.floor(gridDim*gridDim / 2))); // Keep less empty half
        };
        thumbnailImg.onerror = () => { URL.revokeObjectURL(thumbnailURL); reject("Thumbnail image load error"); };
    } catch (e) {
        console.error("Error in findTissueRegions:", e);
        resolve([]); // Resolve with empty array on error
    }
});

const getRandomTileParams = async (imagebox3Instance, tissueRegions, patchSize = 224) => {
    if (!imagebox3Instance) return { tileX: NaN };
    const imageInfo = await imagebox3Instance.getInfo();
    let randomRegion = { topX: 0, topY: 0, bottomX: imageInfo.width, bottomY: imageInfo.height };

    if (Array.isArray(tissueRegions) && tissueRegions.length > 0) {
        randomRegion = tissueRegions[Math.floor(Math.random() * tissueRegions.length)];
    }

    const regionWidth = randomRegion.bottomX - randomRegion.topX;
    const regionHeight = randomRegion.bottomY - randomRegion.topY;

    if (regionWidth <= patchSize || regionHeight <= patchSize) { // Region too small
        // Fallback to using the whole image or a larger default region if this happens often
        // For now, just use what's available or slightly adjust if possible
        return {
            tileX: randomRegion.topX,
            tileY: randomRegion.topY,
            tileWidth: Math.min(regionWidth, patchSize), // Or actual image width if smaller than patchSize
            tileHeight: Math.min(regionHeight, patchSize), // Or actual image height
            tileSize: patchSize // This is desired output size, ImageBox3 might handle scaling if getTile gets different w/h
        };
    }

    return {
        tileX: Math.floor(randomRegion.topX + Math.random() * (regionWidth - patchSize)),
        tileY: Math.floor(randomRegion.topY + Math.random() * (regionHeight - patchSize)),
        tileWidth: patchSize, // Requesting a tile of patchSize x patchSize at level 0
        tileHeight: patchSize,
        tileSize: patchSize     // Output canvas size
    };
};


const isTileEmpty = (canvas, ctx, threshold = 0.9, returnEmptyProportion = false) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const numPixels = pixels.length / 4;
    if (numPixels === 0) return returnEmptyProportion ? 0 : true; // Handle empty canvas

    let whitePixelCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220) { // Adjusted threshold for "white"
            whitePixelCount++;
        }
    }
    const whitePercentage = whitePixelCount / numPixels;
    return returnEmptyProportion ? whitePercentage : (whitePercentage >= threshold);
};

function imageTransforms(imageArray, targetSize = 224, mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225]) {
    // Assuming imageArray is a flat array of R,G,B,A values from a canvas of targetSize x targetSize
    const numPixels = targetSize * targetSize;
    const float32Array = new Float32Array(3 * numPixels);
    let R = [], G = [], B = [];

    for (let i = 0; i < numPixels; i++) {
        R.push(imageArray[i * 4] / 255);
        G.push(imageArray[i * 4 + 1] / 255);
        B.push(imageArray[i * 4 + 2] / 255);
    }

    // Interleave: RRR...GGG...BBB... to RGBRGBRGB... then normalize
    // Correct interleaving should be C x H x W for PyTorch models typically (CHW format)
    // ONNX runtime default is NCHW
    let k = 0;
    // Channel 1 (R)
    for (let i = 0; i < numPixels; i++) float32Array[k++] = (R[i] - mean[0]) / std[0];
    // Channel 2 (G)
    for (let i = 0; i < numPixels; i++) float32Array[k++] = (G[i] - mean[1]) / std[1];
    // Channel 3 (B)
    for (let i = 0; i < numPixels; i++) float32Array[k++] = (B[i] - mean[2]) / std[2];

    return float32Array;
}


async function generatePatchesAndEmbeddings(wsiIdentifierString, params) {
    showViewer('osd');
    const onnxRuntime = await import("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/esm/ort.min.js");

    if (!fedEmbed.embeddingModel || fedEmbed.embeddingModel.modelId !== params.modelInfo.modelId) {
        updateStatus(`Loading Embedding Model: ${params.modelInfo.modelName}...`, true);
        try {
            onnxRuntime.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
            fedEmbed.embeddingModel = await onnxRuntime.InferenceSession.create(params.modelInfo.modelURL, { executionProviders: ['wasm'] });
            fedEmbed.embeddingModel.modelId = params.modelInfo.modelId;
        } catch (e) {
            console.error("Failed to load ONNX model:", e);
            updateStatus(`Error loading model: ${e.message}`, false);
            throw e;
        }
    }

    if (!fedEmbed.imagebox3Instance) {
        updateStatus('Error: Image viewer not initialized.', false);
        throw new Error("Imagebox3 instance not available.");
    }

    updateStatus(`Finding tissue regions in ${wsiIdentifierString}...`, true);
    const tissueRegions = await findTissueRegionsInImage();
    updateStatus(`Embedding ${params.numPatches} patches from ${wsiIdentifierString}...`, true);


    let currentPatchNum = 0;
    const patchEmbeddings = [];
    const patchCanvas = new OffscreenCanvas(params.patchWidth, params.patchHeight); // Use configured patch W/H for drawing
    const patchCtx = patchCanvas.getContext("2d");

    const targetEmbeddingPatchSize = 224; // Most vision models expect 224x224

    for (let i = 0; i < params.numPatches * 2 && currentPatchNum < params.numPatches; i++) { // Try more times to get enough non-empty
        showProgress(fedEmbed.htmlElements.patchingProgressBar, Math.round(100 * currentPatchNum / params.numPatches));
        // Request tile of targetEmbeddingPatchSize for model input, Imagebox3 will handle source resolution
        const tileParams = await getRandomTileParams(fedEmbed.imagebox3Instance, tissueRegions, targetEmbeddingPatchSize);

        if (isNaN(tileParams.tileX)) continue;

        let tileBlob;
        try {
            tileBlob = await fedEmbed.imagebox3Instance.getTile(tileParams.tileX, tileParams.tileY, tileParams.tileWidth, tileParams.tileHeight, tileParams.tileSize);
        } catch (e) {
            console.warn("Failed to get tile:", tileParams, e);
            continue;
        }
        if (!tileBlob || tileBlob.size === 0) continue;

        const tileURL = URL.createObjectURL(tileBlob);
        const tempImg = new Image();
        tempImg.src = tileURL;
        tempImg.crossOrigin = "anonymous";

        let imageTensor;
        try {
            await new Promise((resolve, reject) => {
                tempImg.onload = () => {
                    patchCtx.clearRect(0,0, patchCanvas.width, patchCanvas.height);
                    patchCtx.drawImage(tempImg, 0, 0, targetEmbeddingPatchSize, targetEmbeddingPatchSize);
                    URL.revokeObjectURL(tileURL);

                    if (isTileEmpty(patchCanvas, patchCtx)) {
                        resolve(undefined); return;
                    }
                    const imageData = patchCtx.getImageData(0, 0, targetEmbeddingPatchSize, targetEmbeddingPatchSize).data;
                    const transformedData = imageTransforms(imageData, targetEmbeddingPatchSize);
                    resolve(new onnxRuntime.Tensor("float32", transformedData, [1, 3, targetEmbeddingPatchSize, targetEmbeddingPatchSize]));
                };
                tempImg.onerror = () => { URL.revokeObjectURL(tileURL); reject("Image load error for patch."); };
            }).then(tensor => imageTensor = tensor);
        } catch (e) {
            console.warn("Error processing patch:", e);
            continue;
        }

        if (!imageTensor) continue;

        if (fedEmbed.osdViewer && fedEmbed.osdViewer.isOpen()) {
            const existingOverlay = document.getElementById("runtime-patch-overlay");
            if (existingOverlay) fedEmbed.osdViewer.removeOverlay(existingOverlay);

            const elt = document.createElement("div");
            elt.id = "runtime-patch-overlay";
            elt.className = "highlight"; // Add CSS for .highlight { border: 2px solid yellow; }
            fedEmbed.osdViewer.addOverlay({
                element: elt,
                location: fedEmbed.osdViewer.viewport.imageToViewportRectangle(tileParams.tileX, tileParams.tileY, tileParams.tileWidth, tileParams.tileHeight)
            });
        }

        const { embedding: embeddingOutput } = await fedEmbed.embeddingModel.run({ image: imageTensor }); // Ensure 'image' is the correct input name
        const rawEmbedding = Array.from(embeddingOutput.data); // .data for Ort.Tensor

        patchEmbeddings.push({
            wsiId: wsiIdentifierString,
            tileParams, // tileX, tileY, tileWidth, tileHeight, tileSize (output size)
            embedding: rawEmbedding,
            sourcePeer: fedEmbed.decentifaiInstance ? fedEmbed.decentifaiInstance.getSelfPeerId() : 'local',
            displayName: fedEmbed.decentifaiInstance ? (fedEmbed.decentifaiInstance.awareness.getLocalState()?.metadata?.name || fedEmbed.peerName) : fedEmbed.peerName
        });
        currentPatchNum++;
    }

    hideProgress(fedEmbed.htmlElements.patchingProgressBar);
    if (patchEmbeddings.length === 0) {
        updateStatus(`No valid patches found or embedded from ${wsiIdentifierString}. Try different parameters or WSI.`, false);
        return [];
    }

    updateStatus(`Generated ${patchEmbeddings.length} embeddings. Projecting with UMAP...`, true);
    const embeddingVectors = patchEmbeddings.map(p => p.embedding);
    const embeddingVectorsUMAP = await runUMAP(embeddingVectors);

    const patchEmbeddingsDimReduced = patchEmbeddings.map((p, i) => {
        p['embedding3d'] = embeddingVectorsUMAP[i];
        p['properties'] = fedEmbed.availableColorByProps.reduce((o, propKey) => {
            const inputEl = document.getElementById(`${propKey}-propInput`);
            o[propKey] = inputEl ? inputEl.value : params[propKey]; // Use live value from input
            return o;
        }, {});
        return p;
    });
    updateStatus(`Generated and projected ${patchEmbeddingsDimReduced.length} embeddings.`, false);
    return patchEmbeddingsDimReduced;
}

async function trainClassifierModel(embeddingObjects) {
    fedEmbed.htmlElements.trainingResultsArea.style.display = 'flex'; // Show the area
    appendToResultsOutput("Preparing data for training...");

    const tf = await import('https://esm.sh/@tensorflow/tfjs');
    if (!embeddingObjects || embeddingObjects.length < 10) { // Need enough data
        updateTrainingStatus("Not enough embeddings to train (need at least 10).", false);
        appendToResultsOutput("Error: Not enough embeddings for training.");
        return;
    }

    // Ensure there's a property to use as label, and it has enough variation.
    const labelKey = fedEmbed.availableColorByProps[0]; // Use the first available property as label
    if (!labelKey) {
        updateTrainingStatus("No property selected/available for labels.", false);
        appendToResultsOutput("Error: No property available to use as training labels.");
        return;
    }
    appendToResultsOutput(`Using property "${labelKey}" as label.`);

    const uniqueLabels = [...new Set(embeddingObjects.map(p => p.properties[labelKey]))];
    if (uniqueLabels.length < 2) {
        updateTrainingStatus(`Not enough unique label values in property "${labelKey}" to train (need at least 2).`, false);
        appendToResultsOutput(`Error: Property "${labelKey}" has fewer than 2 unique values.`);
        return;
    }
    appendToResultsOutput(`Unique labels found for "${labelKey}": ${uniqueLabels.join(', ')}`);


    // Create a mapping from original label values to 0-based integer indices
    const labelMap = {};
    uniqueLabels.forEach((label, index) => {
        labelMap[label] = index;
    });
    const numClasses = uniqueLabels.length;

    const data = embeddingObjects.map(p => ({
        embedding: p.embedding,
        labelValue: p.properties[labelKey]
    }));

    // Shuffle data
    for (let i = data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [data[i], data[j]] = [data[j], data[i]];
    }

    const trainTestRatio = 0.8;
    const splitIndex = Math.floor(data.length * trainTestRatio);
    const trainingDataRaw = data.slice(0, splitIndex);
    const testDataRaw = data.slice(splitIndex);

    if (trainingDataRaw.length === 0 || testDataRaw.length === 0) {
        updateTrainingStatus("Data split resulted in empty training or test set.", false);
        appendToResultsOutput("Error: Could not split data for training/testing.");
        return;
    }

    const trainX = tf.tensor2d(trainingDataRaw.map(p => p.embedding));
    const trainY = tf.oneHot(tf.tensor1d(trainingDataRaw.map(p => labelMap[p.labelValue]), 'int32'), numClasses);
    const testX = tf.tensor2d(testDataRaw.map(p => p.embedding));
    const testY = tf.oneHot(tf.tensor1d(testDataRaw.map(p => labelMap[p.labelValue]), 'int32'), numClasses);

    const trainingDataObject = { x: trainX, y: trainY };
    const testDataObject = { x: testX, y: testY };

    appendToResultsOutput(`Training data: ${trainX.shape[0]} samples. Test data: ${testX.shape[0]} samples. Num classes: ${numClasses}.`);

    const inputShape = trainX.shape[1];
    const initialModel = await buildModel(inputShape, numClasses); // Pass inputShape and numClasses
    initialModel.compile({
        loss: 'categoricalCrossentropy',
        optimizer: tf.train.adam(0.001), // Switched to adam
        metrics: ["accuracy"] // precision might require specific setup with TFJS
    });

    const model = extendTFModel(initialModel, trainingDataObject, testDataObject); // Pass test data for getLoss/Acc

    if (fedEmbed.decentifaiInstance) {
        fedEmbed.decentifaiInstance.disconnect(); // Disconnect previous session if any
        fedEmbed.decentifaiInstance = null;
    }

    fedEmbed.decentifaiInstance = new Decentifai({
        model, // The extended TFJS model
        backend: "tfjs",
        roomId: `fedembed-room-${document.getElementById('modelSelect').value}`, // Room per model type
        trainingData: trainingDataObject, // {x: Tensor, y: Tensor}
        // testData: testDataObject, // testData for Decentifai is for its internal evaluation if supported, not used by getLoss/Acc
        trainingOptions: { epochs: 5, batchSize: Math.min(32, trainX.shape[0]) }, // Ensure batchSize <= samples
        autoTrain: true,
        federationOptions: {
            minPeers: 2,
            waitTime: 3000, // Increased wait time
            maxRounds: 50,
            convergenceThresholds: { stabilityWindow: 3, parameterDistance: 0.01, lossDelta: 0.005, accuracyDelta: 0.005 }
        },
        metadata: { name: fedEmbed.peerName },
        debug: true
    });
    appendToResultsOutput("Decentifai instance created. Joining federation...");
    updateTrainingStatus("Joining federation, waiting for peers...", false); // Not training yet

    setupDecentifaiEventListeners(fedEmbed.decentifaiInstance, model);
    setupSharedEmbeddingObserver(fedEmbed.decentifaiInstance);
}

function setupDecentifaiEventListeners(federation, model) { // model passed for logging metrics
    federation.on("autoTrainingStarted", () => {
        appendToResultsOutput("Auto-training process started.");
        updateTrainingStatus("Auto-training started. Waiting for peers/round.", true);
    });

    federation.on("peersAdded", (e) => {
        const peerDetails = federation.getPeers(e.detail.peerId);
        const name = peerDetails?.metadata?.name || e.detail.peerId;
        appendToResultsOutput(`Peer connected: ${name}. Total peers in list: ${e.detail.peers.length}.`);
        updateTrainingStatus(`Peers connected: ${e.detail.peers.length + 1}. Waiting for minimum ${federation.options.federationOptions.minPeers}.`, federation.isTraining);
    });
     federation.on("peersRemoved", (e) => {
        appendToResultsOutput(`Peer disconnected. Total peers in list: ${e.detail.peers.length}.`);
         updateTrainingStatus(`Peers connected: ${e.detail.peers.length + 1}.`, federation.isTraining);
    });


    federation.on("roundProposed", (e) => {
        appendToResultsOutput(`Round ${e.detail.round} proposed by ${e.detail.initiator === federation.getSelfPeerId() ? 'self' : e.detail.initiator}.`);
        updateTrainingStatus(`Round ${e.detail.round} proposed. Waiting for acknowledgements.`, true);
    });

    federation.on("roundQuorumReached", (e) => {
        appendToResultsOutput(`Quorum reached for round ${e.detail.round}. Training will start.`);
        // With autoTrain:true, Decentifai handles starting the round.
    });

    federation.on("roundStarted", (e) => {
        appendToResultsOutput(`Training started for round ${e.detail.round}.`);
        showProgress(fedEmbed.htmlElements.trainingProgressBar, 0); // Reset progress for the round
        updateTrainingStatus(`Training round ${e.detail.round} in progress...`, true);
    });

    federation.on("localTrainingCompleted", async (e) => {
        appendToResultsOutput(`Local training completed for round ${e.detail.round}. Sharing parameters.`);
        showProgress(fedEmbed.htmlElements.trainingProgressBar, 50); // Indicate local part done
        // Log metrics from local training if model.fit history is accessible
        if (e.detail.modelInfo && e.detail.modelInfo.history) {
             const loss = e.detail.modelInfo.history.loss.slice(-1)[0];
             const acc = e.detail.modelInfo.history.acc.slice(-1)[0];
             appendToResultsOutput(`Local training - Epoch Loss: ${loss?.toFixed(4)}, Acc: ${acc?.toFixed(4)}`);
        }
    });

    federation.on("parametersReceived", (e) => {
        const numPeersSharing = Object.keys(e.detail.parametersByPeer).length;
        appendToResultsOutput(`Received parameters from ${numPeersSharing} peer(s) for current round.`);
        // You could update progress based on numPeersWhoSharedParameters / minPeers
        const progress = 50 + (federation.getNumPeersWhoSharedParameters() / federation.options.federationOptions.minPeers) * 50;
        showProgress(fedEmbed.htmlElements.trainingProgressBar, Math.min(90, Math.round(progress)));
    });

    federation.on("roundFinalized", async (e) => {
        showProgress(fedEmbed.htmlElements.trainingProgressBar, 100);
        const metrics = federation.getConvergenceVisualization(); // Get latest metrics
        const currentLoss = model.getLoss ? (await model.getLoss()) : 'N/A';
        const currentAcc = model.getAccuracy ? (await model.getAccuracy()) : 'N/A';

        appendToResultsOutput(`Round ${e.detail.round} finalized. Participants: ${e.detail.participants}. Aggregated Loss: ${currentLoss !== 'N/A' ? currentLoss.toFixed(4) : 'N/A'}, Accuracy: ${currentAcc !== 'N/A' ? currentAcc.toFixed(4) : 'N/A'}`);
        displayConvergencePlot(metrics); // Update convergence plot
        updateTrainingStatus(`Round ${e.detail.round} completed. Waiting for next round or convergence.`, false); // Ready for next
        if (federation.converged) { // Check if converged after this round
             updateTrainingStatus(`Model converged after round ${e.detail.round}!`, false);
             hideProgress(fedEmbed.htmlElements.trainingProgressBar);
        }
    });

    federation.on("modelConverged", (e) => {
        appendToResultsOutput(`🎉 Model converged at round ${e.detail.round}! Final metrics below.`);
        displayConvergencePlot(e.detail.convergenceMetrics); // Display final convergence state
        updateTrainingStatus(`Model converged at round ${e.detail.round}! Training finished.`, false);
        hideProgress(fedEmbed.htmlElements.trainingProgressBar);
        fedEmbed.trainedModel = model; // Store the converged model
    });

    federation.on("autoTrainingError", (e) => {
        appendToResultsOutput(`Training Error (round ${e.detail.round || 'N/A'}): ${e.detail.error}`);
        updateTrainingStatus(`Error during training: ${e.detail.error}`, false);
        hideProgress(fedEmbed.htmlElements.trainingProgressBar);
    });
     federation.on("autoTrainingStopped", (e) => {
        appendToResultsOutput(`Auto-training stopped. Reason: ${e.detail.reason}.`);
        updateTrainingStatus(`Training stopped: ${e.detail.reason}.`, false);
        hideProgress(fedEmbed.htmlElements.trainingProgressBar);
    });
    federation.on("autoTrainingPaused", (e) => {
        appendToResultsOutput(`Auto-training paused. Reason: ${e.detail.reason}.`);
        updateTrainingStatus(`Training paused: ${e.detail.reason}. Waiting...`, false);
    });
}


const buildModel = async (inputShape, numClasses, arch = [128, 64], activation = "relu") => {
    const tf = await import('https://esm.sh/@tensorflow/tfjs');
    const model = tf.sequential();
    // Input layer
    model.add(tf.layers.dense({
        inputShape: [inputShape],
        units: arch[0],
        activation: activation,
        useBias: true // Often good to use bias
    }));
    // Hidden layers
    for (let i = 1; i < arch.length; i++) {
        model.add(tf.layers.dense({ units: arch[i], activation: activation, useBias: true }));
        model.add(tf.layers.dropout({rate: 0.3})); // Add dropout for regularization
    }
    // Output layer
    model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
    model.summary();
    return model;
};

// extendTFModel now also accepts testData to be stored for consistent evaluation
const extendTFModel = (model, trainingData, testData) => { // trainingData and testData are {x, y}
    model.currentTrainingData = trainingData; // Store for access if needed
    model.currentTestData = testData;         // Store for consistent evaluation

    model.train = async ({ data, options = {} }) => { // data here is {x, y} from Decentifai
        const { epochs = 10, batchSize = 32, verbose = 0 } = options;
        // Decentifai passes data as {x,y} if trainingData was {x,y}
        return await model.fit(data.x, data.y, { epochs, batchSize, verbose });
    };

    // test method is not directly used by Decentifai's default flow but good for manual testing
    model.test = async ({ data, options = {} }) => {
        const { x } = data; // data typically is {x, y}
        return model.predict(x, { batchSize: options.batchSize || 32 });
    };

    model.getLoss = async () => {
        if (model.currentTestData && model.currentTestData.x && model.currentTestData.y) {
            const evaluation = model.evaluate(model.currentTestData.x, model.currentTestData.y, { batchSize: 32 });
            // evaluation is an array of Tensors [loss, acc]
            const lossTensor = Array.isArray(evaluation) ? evaluation[0] : evaluation; // tf.Scalar if single metric
            const loss = await lossTensor.data();
            return loss[0]; // Return the scalar value
        }
        // Fallback to training history if no test data or error
        const lastEpochLoss = model.history?.history?.loss?.slice(-1)[0];
        return typeof lastEpochLoss === 'number' ? lastEpochLoss : 0.0; // Ensure number
    };

    model.getAccuracy = async () => {
        if (model.currentTestData && model.currentTestData.x && model.currentTestData.y) {
            const evaluation = model.evaluate(model.currentTestData.x, model.currentTestData.y, { batchSize: 32 });
            const accTensor = Array.isArray(evaluation) ? evaluation[1] : null; // tf.Scalar for accuracy
             if (accTensor) {
                const acc = await accTensor.data();
                return acc[0]; // Return the scalar value
             }
        }
        const lastEpochAcc = model.history?.history?.acc?.slice(-1)[0];
        return typeof lastEpochAcc === 'number' ? lastEpochAcc : 0.0; // Ensure number
    };
    return model;
};


async function shareEmbeddingsViaWebRTC(localEmbeddingsToShare) {
    if (!fedEmbed.decentifaiInstance) {
        console.warn("Decentifai instance not available for sharing embeddings.");
        appendToResultsOutput("Warning: P2P instance not ready for sharing.");
        return;
    }
    if (!localEmbeddingsToShare || localEmbeddingsToShare.length === 0) {
        console.warn("No local embeddings to share.");
        return;
    }

    const sharedMapName = 'peerPathologyEmbeddings_UMAP'; // More specific name
    const sharedEmbeddingsMap = fedEmbed.decentifaiInstance.getCustomSharedMap(sharedMapName);

    if (sharedEmbeddingsMap) {
        const peerId = fedEmbed.decentifaiInstance.getSelfPeerId();
        const peerState = fedEmbed.decentifaiInstance.awareness.getLocalState();
        const displayName = peerState?.metadata?.name || `Peer ${peerId.toString().slice(-4)}`;

        // Prepare serializable embeddings (only UMAP projection and key properties)
        const serializableEmbeddings = localEmbeddingsToShare.map(emb => ({
            wsiId: emb.wsiId, // Ensure this is a string (e.g., filename or URL)
            tileParams: emb.tileParams, // Should be simple JSON
            embedding3d: emb.embedding3d, // The UMAP projected 3D array
            properties: emb.properties,   // User-defined properties
            sourcePeer: peerId,
            displayName: displayName
        }));

        // Use a unique key for this peer's batch of embeddings for the current WSI
        // This allows a peer to update their contribution if they re-process the same WSI
        const batchKey = `${peerId}_${fedEmbed.currentWsiIdentifierString.replace(/[^a-zA-Z0-9]/g, '-')}`; // Sanitize WSI id for key

        sharedEmbeddingsMap.set(batchKey, serializableEmbeddings);
        appendToResultsOutput(`Shared ${serializableEmbeddings.length} projected embeddings for WSI "${fedEmbed.currentWsiIdentifierString}".`);

        // Update local master list and re-plot (includes self)
        // This logic is now primarily handled by the observer to ensure consistency
        // For immediate local reflection before Yjs sync:
        // fedEmbed.allSharedEmbeddings = fedEmbed.allSharedEmbeddings.filter(e => e.sourcePeer !== peerId || e.wsiId !== fedEmbed.currentWsiIdentifierString);
        // fedEmbed.allSharedEmbeddings.push(...serializableEmbeddings);
        // display3DPlot(fedEmbed.allSharedEmbeddings, fedEmbed.htmlElements.colorBySelect.value);
        // populateColorBySelector(fedEmbed.allSharedEmbeddings);
    }
}

function setupSharedEmbeddingObserver(decentifaiInstance) {
    if (!decentifaiInstance) return;

    const sharedMapName = 'peerPathologyEmbeddings_UMAP';
    const sharedEmbeddingsMap = decentifaiInstance.getCustomSharedMap(sharedMapName);

    if (sharedEmbeddingsMap) {
        fedEmbed.allSharedEmbeddings = []; // Reset on new setup

        const updateGlobalPlotFromMap = () => {
            fedEmbed.allSharedEmbeddings = [];
            sharedEmbeddingsMap.forEach(batch => {
                if (Array.isArray(batch)) {
                    // Ensure displayName is present
                     batch.forEach(e => {
                        if (!e.displayName && e.sourcePeer) {
                            const peerState = decentifaiInstance.awareness.getStates().get(parseInt(e.sourcePeer));
                            e.displayName = peerState?.metadata?.name || `Peer ${e.sourcePeer.toString().slice(-4)}`;
                        }
                    });
                    fedEmbed.allSharedEmbeddings.push(...batch);
                }
            });

            if (fedEmbed.allSharedEmbeddings.length > 0) {
                display3DPlot(fedEmbed.allSharedEmbeddings, fedEmbed.htmlElements.colorBySelect.value);
                populateColorBySelector(fedEmbed.allSharedEmbeddings);
                appendToResultsOutput(`Displaying ${fedEmbed.allSharedEmbeddings.length} total shared embeddings.`);
            } else if (fedEmbed.currentLocalEmbeddings.length > 0 && !fedEmbed.htmlElements.shareEmbeddingsCheck.checked) {
                // If not sharing, and no shared data, show local
                display3DPlot(fedEmbed.currentLocalEmbeddings, fedEmbed.htmlElements.colorBySelect.value);
                populateColorBySelector(fedEmbed.currentLocalEmbeddings);
            } else {
                 showViewer('placeholder');
                 fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'No embeddings to display. Generate or wait for peers to share.';
            }
        };

        // Initial load
        updateGlobalPlotFromMap();

        // Observe changes
        sharedEmbeddingsMap.observe(yMapEvent => {
            appendToResultsOutput("Shared embeddings map updated by a peer.");
            updateGlobalPlotFromMap(); // Re-read the whole map and update plot
        });
        appendToResultsOutput(`Listening for shared embeddings on map: "${sharedMapName}".`);
    }
}


const loadWSI = async () => {
    fedEmbed.currentWsiIdentifier = null;
    fedEmbed.currentWsiIdentifierString = "";

    if (fedEmbed.currentInputType === 'file') {
        if (fedEmbed.htmlElements.fileInput.files.length > 0) {
            fedEmbed.currentWsiIdentifier = fedEmbed.htmlElements.fileInput.files[0];
            fedEmbed.currentWsiIdentifierString = fedEmbed.currentWsiIdentifier.name;
        } else { alert("Please select a file."); return; }
    } else { // url
        const urlValue = fedEmbed.htmlElements.urlInput.value.trim();
        if (urlValue) {
            try {
                new URL(urlValue); // Basic URL validation
                fedEmbed.currentWsiIdentifier = urlValue;
                fedEmbed.currentWsiIdentifierString = urlValue;
            } catch (_) { alert("Please enter a valid URL."); return; }
        } else { alert("Please enter a URL."); return; }
    }

    if (fedEmbed.currentWsiIdentifier) {
        showViewer('placeholder');
        fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'Loading WSI viewer...';
        fedEmbed.htmlElements.parameterControls.style.display = 'none';
        fedEmbed.htmlElements.processingStatusDiv.style.display = 'none';
        fedEmbed.htmlElements.trainingControls.style.display = 'none';
        fedEmbed.htmlElements.plotControls.style.display = 'none';
        fedEmbed.currentROI = null;
        // If not sharing, or want to clear shared view on new WSI load:
        // fedEmbed.allSharedEmbeddings = []; display3DPlot([]);

        try {
            const tileSource = await createTileSource(fedEmbed.currentWsiIdentifier);
            if (tileSource) {
                initializeOSDViewer(tileSource);
            } else {
                 showViewer('placeholder');
                 fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'Failed to create tile source for the WSI.';
            }
        } catch (error) {
            console.error("Error creating tile source or initializing viewer:", error);
            showViewer('placeholder');
            fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = `Error: ${error.message}`;
        }
    }
};


fedEmbed.htmlElements.inputTypeFile.addEventListener('change', () => {
    fedEmbed.currentInputType = 'file';
    fedEmbed.htmlElements.fileInputContainer.style.display = 'block';
    fedEmbed.htmlElements.urlInputContainer.style.display = 'none';
});
fedEmbed.htmlElements.inputTypeUrl.addEventListener('change', () => {
    fedEmbed.currentInputType = 'url';
    fedEmbed.htmlElements.fileInputContainer.style.display = 'none';
    fedEmbed.htmlElements.urlInputContainer.style.display = 'block';
});
fedEmbed.htmlElements.fileInput.addEventListener('change', loadWSI);
fedEmbed.htmlElements.loadAndViewBtn.addEventListener('click', loadWSI);
fedEmbed.htmlElements.modelSelect.addEventListener('change', updateNumPatchesDefault);

fedEmbed.htmlElements.generateBtn.addEventListener('click', async () => {
    if (!fedEmbed.currentWsiIdentifier || !fedEmbed.currentWsiIdentifierString) {
        alert("Please load a WSI first."); return;
    }
    const selectedModelOption = fedEmbed.htmlElements.modelSelect.options[fedEmbed.htmlElements.modelSelect.selectedIndex];
    const selectedModel = SUPPORTED_MODELS.find(m => m.modelId == selectedModelOption.value);
    if (!selectedModel) { alert("Invalid model selected."); return; }

    const params = {
        numPatches: parseInt(fedEmbed.htmlElements.numPatchesInput.value, 10) || 50,
        patchWidth: parseInt(fedEmbed.htmlElements.patchWidthInput.value, 10) || 224, // Default to model input size
        patchHeight: parseInt(fedEmbed.htmlElements.patchHeightInput.value, 10) || 224,
        modelInfo: selectedModel
        // ROI not implemented in patch generation yet: roi: fedEmbed.currentROI
    };
    fedEmbed.availableColorByProps.forEach(propKey => {
         const inputEl = document.getElementById(`${propKey}-propInput`);
         if(inputEl) params[propKey] = inputEl.value;
    });

    if (params.numPatches <= 0 || params.patchWidth <= 0 || params.patchHeight <= 0) {
        alert("Please enter valid positive numbers for patch count and dimensions."); return;
    }

    fedEmbed.htmlElements.trainingControls.style.display = 'none';
    fedEmbed.htmlElements.plotControls.style.display = 'none';
    console.log("STARTING EMBEDDING")
    try {
        const newEmbeddings = await generatePatchesAndEmbeddings(fedEmbed.currentWsiIdentifierString, params);
        if (!newEmbeddings || newEmbeddings.length === 0) {
            throw new Error("No embeddings were generated. Check WSI or parameters.");
        }
        let embeddingsToPlot = [...fedEmbed.currentLocalEmbeddings, ...newEmbeddings];
        console.log(fedEmbed.currentLocalEmbeddings, newEmbeddings)
        fedEmbed.currentLocalEmbeddings = newEmbeddings;

        if (fedEmbed.htmlElements.shareEmbeddingsCheck.checked) {
            await shareEmbeddingsViaWebRTC(fedEmbed.currentLocalEmbeddings); // Share them
            // The observer for shared embeddings will update fedEmbed.allSharedEmbeddings and re-plot.
            // So, we might not need to explicitly plot 'allSharedEmbeddings' here again,
            // as shareEmbeddingsViaWebRTC or the observer should handle it.
            // For safety, if observer is async, plotting local first is fine.
             if (fedEmbed.allSharedEmbeddings.length > 0) { // If shared data already exists, prefer that view
                 embeddingsToPlot = fedEmbed.allSharedEmbeddings;
             }
        }
        
        populateColorBySelector(embeddingsToPlot.length > 0 ? embeddingsToPlot : fedEmbed.currentLocalEmbeddings); // Use whatever is available
        display3DPlot(embeddingsToPlot.length > 0 ? embeddingsToPlot : fedEmbed.currentLocalEmbeddings, fedEmbed.htmlElements.colorBySelect.value);


        fedEmbed.htmlElements.trainingControls.style.display = 'block';
        fedEmbed.htmlElements.trainBtn.disabled = false;

    } catch (error) {
        console.error("Error during embedding generation:", error);
        showViewer('placeholder');
        fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = `Error: ${error.message}`;
        updateStatus(`Error: ${error.message}`, false);
        hideProgress(fedEmbed.htmlElements.patchingProgressBar);
        // hideProgress(fedEmbed.htmlElements.embeddingProgressBar.parentElement);
    }
});

fedEmbed.htmlElements.colorBySelect.addEventListener('change', (event) => {
    const embeddingsToDisplay = (fedEmbed.htmlElements.shareEmbeddingsCheck.checked && fedEmbed.allSharedEmbeddings.length > 0) ?
                                 fedEmbed.allSharedEmbeddings : fedEmbed.currentLocalEmbeddings;
    if (embeddingsToDisplay.length > 0) {
        display3DPlot(embeddingsToDisplay, event.target.value);
    }
});

fedEmbed.htmlElements.trainBtn.addEventListener('click', async () => {
    if (!fedEmbed.currentLocalEmbeddings || fedEmbed.currentLocalEmbeddings.length === 0) {
        alert("Please generate embeddings first.");
        return;
    }
    // Use local embeddings for training, regardless of sharing.
    // Sharing is for visualization or if peers were to *contribute* raw embeddings for a global model (more complex).
    updateTrainingStatus("Initializing training environment...", true);
    fedEmbed.htmlElements.resultsOutput.textContent = ""; // Clear previous log

    try {
        await trainClassifierModel(fedEmbed.currentLocalEmbeddings);
    } catch (error) {
        console.error("Error initiating training:", error);
        updateTrainingStatus(`Training Error: ${error.message}`, false);
        appendToResultsOutput(`Critical Training Error: ${error.message}`);
        hideProgress(fedEmbed.htmlElements.trainingProgressBar);
    }
});

async function runUMAP(vectors) {
    if (vectors.length === 0) return [];
    // Re-initialize UMAP for each new dataset if parameters might change or to ensure fresh fit
    // This depends on whether you want to fit UMAP on all shared embeddings or just local ones.
    // For simplicity, fitting on the provided vectors each time:
    fedEmbed.umapInstance = new UMAP({
        nComponents: 3,
        nNeighbors: 15,
        minDist: 0.1,
        seed: 42
    });
    fedEmbed.umapInstance.fit(vectors);
    return fedEmbed.umapInstance.transform(vectors);
}

async function displayDefaultEmbeddings() {
    try {
        const urlSearchParams = new URLSearchParams(location.search);
        let dataToPlotConfig = EXAMPLE_DATA.find(d => d.id === urlSearchParams.get("id")) || EXAMPLE_DATA[0];
        if (!dataToPlotConfig) {
             showViewer('placeholder');
             fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'No example data configured.';
             return;
        }

        updateStatus(`Loading example embeddings: ${dataToPlotConfig.id}...`, true);
        const embeddingsData = await (await fetch(dataToPlotConfig.path)).json();
        const embeddingVectors = embeddingsData.map(p => p.embedding);

        if (embeddingVectors.length === 0) {
            updateStatus("Example data is empty.", false);
            return;
        }
        updateStatus("Projecting example embeddings with UMAP...", true);
        const embeddingVectorsUMAP = await runUMAP(embeddingVectors);

        fedEmbed.currentLocalEmbeddings = embeddingsData.map((p, i) => {
            p.embedding3d = embeddingVectorsUMAP[i];
            p.wsiId = p.wsiId || dataToPlotConfig.id; // Ensure wsiId for example data
            p.sourcePeer = 'example';
            p.displayName = 'Example Data';
            return p;
        });

        populateColorBySelector(fedEmbed.currentLocalEmbeddings);
        display3DPlot(fedEmbed.currentLocalEmbeddings, dataToPlotConfig.colorBy || fedEmbed.htmlElements.colorBySelect.value);
        updateStatus("Example embeddings loaded and displayed.", false);
        fedEmbed.htmlElements.trainingControls.style.display = 'block'; // Allow training on example data

    } catch (error) {
        console.error("Failed to display default/example embeddings:", error);
        updateStatus(`Error loading example: ${error.message}`, false);
        showViewer('placeholder');
        fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'Could not load example embeddings.';
    }
}

async function initializeApp() {
    populateModelSelector();
    fedEmbed.htmlElements.parameterControls.style.display = 'none';
    fedEmbed.htmlElements.processingStatusDiv.style.display = 'none';
    fedEmbed.htmlElements.trainingControls.style.display = 'none';
    fedEmbed.htmlElements.trainingResultsArea.style.display = 'none';
    fedEmbed.htmlElements.plotControls.style.display = 'none';

    displayDefaultEmbeddings(); // Load example data by default

    updateTrainingStatus("Not Started", false);
    hideProgress(fedEmbed.htmlElements.patchingProgressBar);
    // hideProgress(fedEmbed.htmlElements.embeddingProgressBar.parentElement); // Ensure this element exists or remove
    hideProgress(fedEmbed.htmlElements.trainingProgressBar);

     // Event listener for the share embeddings checkbox
    fedEmbed.htmlElements.shareEmbeddingsCheck.addEventListener('change', (event) => {
        if (event.target.checked) {
            appendToResultsOutput("Embedding sharing enabled. Will share new embeddings and listen for others.");
            if (fedEmbed.decentifaiInstance) { // If Decentifai is already running (e.g., training started)
                setupSharedEmbeddingObserver(fedEmbed.decentifaiInstance);
                if (fedEmbed.currentLocalEmbeddings.length > 0) { // Share current local if any
                    shareEmbeddingsViaWebRTC(fedEmbed.currentLocalEmbeddings);
                }
            } else {
                 appendToResultsOutput("Note: Start a training session to activate P2P network for sharing.");
            }
        } else {
            appendToResultsOutput("Embedding sharing disabled. Plot will only show local embeddings.");
            // Optionally, clear allSharedEmbeddings and re-plot only local ones
            fedEmbed.allSharedEmbeddings = [];
            if (fedEmbed.currentLocalEmbeddings.length > 0) {
                display3DPlot(fedEmbed.currentLocalEmbeddings, fedEmbed.htmlElements.colorBySelect.value);
                populateColorBySelector(fedEmbed.currentLocalEmbeddings);
            } else {
                showViewer('placeholder');
                 fedEmbed.htmlElements.visualizationPlaceholder.querySelector('p').textContent = 'Generate embeddings to visualize.';
            }
        }
    });
}

// Ensure the DOM is fully loaded before initializing the app
document.addEventListener('DOMContentLoaded', initializeApp);