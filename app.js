// dependencies
let Imagebox3 = {}
let UMAP = {}
let Decentifai = {}
let peerName = crypto.randomUUID()

const inputTypeFile = document.getElementById('inputTypeFile');
const inputTypeUrl = document.getElementById('inputTypeUrl');
const fileInputContainer = document.getElementById('fileInputContainer');
const urlInputContainer = document.getElementById('urlInputContainer');
const fileInput = document.getElementById('wsiFile');
const urlInput = document.getElementById('wsiUrl');
const loadAndViewBtn = document.getElementById('loadAndViewBtn');

const parameterControls = document.getElementById('parameterControls');
const numPatchesInput = document.getElementById('numPatches');
const modelSelect = document.getElementById('modelSelect');
const patchWidthInput = document.getElementById('patchWidth');
const patchHeightInput = document.getElementById('patchHeight');
const shareEmbeddingsCheck = document.getElementById('shareEmbeddingsCheck');
const generateBtn = document.getElementById('generateBtn'); // Renamed from processBtn

const processingStatusDiv = document.getElementById('processing-status');
const statusText = document.getElementById('status-text');
const patchingProgressBar = document.getElementById('patching-progress');
const embeddingProgressBar = document.getElementById('embedding-progress');
const patchingProgressContainer = patchingProgressBar.parentElement;
const embeddingProgressContainer = embeddingProgressBar.parentElement;

const trainingControls = document.getElementById('trainingControls');
const trainBtn = document.getElementById('trainBtn');
const trainingStatusText = document.getElementById('training-status-text');
const trainingProgressBar = document.getElementById('training-progress');
const trainingProgressContainer = trainingProgressBar.parentElement;
const resultsOutput = document.getElementById('results-output');

const visualizationArea = document.getElementById('visualization-area');
const osdViewerDiv = document.getElementById('osd-viewer');
const plotContainer = document.getElementById('plot-container');
const visualizationPlaceholder = document.getElementById('visualization-placeholder');
const plotControls = document.getElementById('plot-controls');
const colorBySelect = document.getElementById('colorBySelect');

let imagebox3Instance = undefined
let umapInstance = undefined

let currentInputType = 'file';
let currentWsiIdentifier = null;
let osdViewer = null;
let selectionPlugin = null;
let currentROI = null;
let currentEmbeddings = null;
let trainedModel = null;
let availableColorByProps = [];
let embeddingModel = undefined

function populateModelSelector() {
    modelSelect.innerHTML = '';
    SUPPORTED_MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.modelId;
        option.textContent = model.modelName;
        option.dataset.defaultPatches = model.defaultNumPatches;
        modelSelect.appendChild(option);
        if (!model.enabled) {
            option.disabled = "true"
        }
    });
    // Set initial patch number based on the default of the first selected model
    updateNumPatchesDefault();
}

function updateNumPatchesDefault() {
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    if (selectedOption && selectedOption.dataset.defaultPatches) {
        numPatchesInput.value = selectedOption.dataset.defaultPatches;
    }
}


function showViewer(type) { // 'osd', 'plot', or 'placeholder'
    if (type === 'osd') {
        osdViewerDiv.style.display = 'block';
    } else {
        osdViewerDiv.style.display = 'none';
    }
    if (type === 'plot') {
        plotContainer.style.display = 'block';
    } else {
        plotContainer.style.display = 'none';
    }
    if (type === 'placeholder') {
        visualizationPlaceholder.classList.add('d-flex');
        visualizationPlaceholder.style.display = 'flex';
    } else {
        visualizationPlaceholder.classList.remove('d-flex');
        visualizationPlaceholder.style.display = 'none';
    }
}

function updateStatus(message, isProcessing = false) {
    processingStatusDiv.style.display = 'block';
    statusText.textContent = message;
    generateBtn.disabled = isProcessing;
    loadAndViewBtn.disabled = isProcessing; // Disable loading while processing
    if (isProcessing) {
        trainingControls.style.display = 'none'; // Hide training while processing
    }
}

function updateTrainingStatus(message, isTraining = false) {
    trainingStatusText.textContent = message;
    trainBtn.disabled = isTraining;
    generateBtn.disabled = isTraining; // Disable generation during training
}

function showProgress(barElement, containerElement, percentage) {
    containerElement.style.display = 'block';
    barElement.style.width = `${percentage}%`;
    barElement.setAttribute('aria-valuenow', percentage);
    barElement.textContent = percentage > 5 ? `${percentage}%` : ''; // Show text only if > 5%
}

function hideProgress(containerElement) {
    containerElement.style.display = 'none';
    const bar = containerElement.querySelector('.progress-bar');
    bar.style.width = '0%';
    bar.setAttribute('aria-valuenow', 0);
    bar.textContent = '';
}

function displayResults(text) {
    resultsOutput.textContent = text;
}

function populateColorBySelector(embeddingObjects) {
    colorBySelect.innerHTML = ''; // Clear previous options
    parameterControls.firstElementChild.querySelectorAll(".colorByParameter").forEach(e => e.parentElement.removeChild(e))
    availableColorByProps = [];

    if (!embeddingObjects || embeddingObjects.length === 0 || !embeddingObjects[0].properties) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'N/A';
        colorBySelect.appendChild(option);
        colorBySelect.disabled = true;
        return;
    }

    availableColorByProps = Object.keys(embeddingObjects[0].properties);
    availableColorByProps.forEach(propKey => {
        const option = document.createElement('option');
        option.value = propKey;
        option.textContent = propKey; // Display the property key name
        colorBySelect.appendChild(option);

        const colorByParameter = `
        <div class="col-sm-6 colorByParameter">
            <label for="${propKey}" class="form-label">${propKey}</label>
            <input type="text" class="form-control" id="${propKey}" value="">
        </div>`
        parameterControls.firstElementChild.insertAdjacentHTML('beforeend', colorByParameter)
    });

    colorBySelect.disabled = false;
}


function display3DPlot(embeddingObjects, colorByKey = "_none_") {
    if (!embeddingObjects || embeddingObjects.length === 0) {
        console.warn("No embeddings to plot.");
        showViewer('placeholder');
        visualizationPlaceholder.querySelector('p').textContent = 'No embeddings generated or available.';
        return;
    }

    // const firstEmbeddingWith3D = embeddingObjects.find(e => e.embedding3d && e.embedding3d.length >= 3);
    // if (!firstEmbeddingWith3D) {
    //     console.error("Embeddings do not contain valid 'embedding3d' data for plotting.");
    //     showViewer('placeholder');
    //     visualizationPlaceholder.querySelector('p').textContent = 'Error: Embeddings lack 3D data.';
    //     return;
    // }

    Plotly.purge(plotContainer);
    showViewer('plot');

    let plotData = [];
    const layout = {
        title: '3D Projection of Patch Embeddings' + (colorByKey !== "_none_" ? ` (Colored by ${colorByKey})` : ''),
        margin: { l: 0, r: 0, b: 0, t: 40 },
        scene: {
            xaxis: { title: 'Dim 1' },
            yaxis: { title: 'Dim 2' },
            zaxis: { title: 'Dim 3' }
        },
        legend: {
            itemsizing: 'constant',
            orientation: 'h',
            yanchor: 'bottom',
            y: 0.01,
            xanchor: 'center',
            x: 0.5
        }
    };

    if (colorByKey === "_none_" || !availableColorByProps.includes(colorByKey)) {
        // Plot all points with a single default color
        const trace = {
            x: embeddingObjects.map(e => e.embedding3d[0]),
            y: embeddingObjects.map(e => e.embedding3d[1]),
            z: embeddingObjects.map(e => e.embedding3d[2]),
            mode: 'markers',
            type: 'scatter3d',
            marker: { size: 3, color: 'blue', opacity: 0.7 },
            text: embeddingObjects.map(e => `Tile: ${e.tileParams.tileX},${e.tileParams.tileY}`),
            hoverinfo: 'text'
        };
        plotData.push(trace);
        layout.showlegend = false;
    } else {
        // Group embeddings by the selected property value
        const groups = {};
        embeddingObjects.forEach(e => {
            const value = e.properties[colorByKey] || 'N/A'; // Handle missing properties
            if (!groups[value]) {
                groups[value] = { x: [], y: [], z: [], text: [] };
            }
            if (e.embedding3d && e.embedding3d.length >= 3) {
                groups[value].x.push(e.embedding3d[0]);
                groups[value].y.push(e.embedding3d[1]);
                groups[value].z.push(e.embedding3d[2]);
                let hover = `<b>${colorByKey}: ${value}</b><br>Tile: ${e.tileParams.tileX},${e.tileParams.tileY}`;
                Object.entries(e.properties).forEach(([key, val]) => {
                    if (key !== colorByKey) hover += `<br>${key}: ${val}`;
                });
                groups[value].text.push(hover);

            }
        });

        // Create a trace for each group
        Object.keys(groups).forEach(groupValue => {
            const trace = {
                x: groups[groupValue].x,
                y: groups[groupValue].y,
                z: groups[groupValue].z,
                name: groupValue, // This name appears in the legend
                mode: 'markers',
                type: 'scatter3d',
                marker: { size: 3.5, opacity: 0.8 },
                text: groups[groupValue].text,
                hoverinfo: 'text'
            };
            plotData.push(trace);
        });
        layout.showlegend = true;
    }

    Plotly.newPlot(plotContainer, plotData, layout);
    plotControls.style.display = 'block'
}

function destroyOSDViewer() {
    if (osdViewer) {
        if (selectionPlugin) {
            // selectionPlugin.destroy();
            selectionPlugin = null;
        }
        osdViewer.destroy();
        osdViewer = null;
    }
    osdViewerDiv.innerHTML = '';
    currentROI = null;
}

function initializeOSDViewer(tileSource) {
    destroyOSDViewer();
    showViewer('osd');

    try {
        osdViewer = OpenSeadragon({
            ...DEFAULT_OSD_VIEWER_OPTIONS,
        });

        // Initialize Selection Plugin
        // selectionPlugin = osdViewer.selection({
        //     restrictToImage: true,
        //     onSelection: (rect) => { // OSD Selection provides rect in viewport coordinates
        //         console.log("ROI Selected (Viewport Coords):", rect);
        //         // Store the ROI. You might need to convert these viewport coordinates
        //         // to image coordinates depending on how your patching function expects them.
        //         // Viewport coords: (0,0) top-left, (1,1) represents current viewport width/height.
        //         currentROI = rect;
        //         // Optionally, visually confirm selection or provide clear button
        //     },
        //     onSelectionCleared: () => {
        //         console.log("ROI Cleared");
        //         currentROI = null;
        //     }
        //     // Add styling options if desired
        //      // selectionBorderColor: 'red',
        //      // selectionBackgroundColor: 'rgba(255, 0, 0, 0.2)',
        // });


        osdViewer.addHandler('open', () => {
            console.log("OSD Viewer opened.");
            parameterControls.style.display = 'block';
            processingStatusDiv.style.display = 'none';
            // Make sure selection tool is enabled after open
            // selectionPlugin.enable();
        });

        osdViewer.addHandler('open-failed', (event) => {
            console.error("OSD Error:", event);
            showViewer('placeholder');
            visualizationPlaceholder.querySelector('p').textContent = `Error loading WSI: ${event.message}`;
            parameterControls.style.display = 'none';
        });

        osdViewer.open(tileSource)

    } catch (error) {
        console.error("Failed to initialize OpenSeadragon:", error);
        showViewer('placeholder');
        visualizationPlaceholder.querySelector('p').textContent = 'Failed to initialize viewer.';
        parameterControls.style.display = 'none';
    }
}

async function createTileSource(identifier) {
    if (!imagebox3Instance) {
        const numWorkers = Math.floor(navigator.hardwareConcurrency / 2)
        imagebox3Instance = new Imagebox3(identifier, numWorkers)
        await imagebox3Instance.init()
    }
    else {
        await imagebox3Instance.changeImageSource(identifier)
    }

    let tileSources = {}
    try {
        tileSources = await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(identifier, { logLatency: false, cache: true, slideOnly: true, pool: imagebox3Instance.workerPool })
    }
    catch (e) {
        console.error(e)
        alert("An error occurred while loading the image. Please check the web browser's Console for more information.")
        return undefined
    }
    return tileSources
}

const findTissueRegionsInImage = (gridDim = 8, thumbnailWidth = 1024) => new Promise(async (resolve, reject) => {

    const imageInfo = await imagebox3Instance.getInfo();
    const thumbnailHeight = thumbnailWidth * imageInfo.height / imageInfo.width
    imagebox3Instance.getThumbnail(thumbnailWidth, thumbnailHeight).then(blob => {

        const thumbnailURL = URL.createObjectURL(blob);
        const thumbnailImg = new Image()
        thumbnailImg.crossOrigin = "Anonymous"
        thumbnailImg.src = thumbnailURL
        const offscreenCanvas = new OffscreenCanvas(thumbnailWidth / gridDim, thumbnailHeight / gridDim)
        const offscreenCtx = offscreenCanvas.getContext('2d')
        const thumbnailRegions = Array(8).fill(undefined).map((row, rowIdx) => Array(gridDim).fill(undefined).map((col, colIdx) => [thumbnailWidth * rowIdx / gridDim, thumbnailHeight * colIdx / gridDim])).flat()
        thumbnailImg.onload = () => {
            const tissueRegions = thumbnailRegions.map(([x, y]) => {
                offscreenCtx.drawImage(thumbnailImg, x, y, offscreenCanvas.width, offscreenCanvas.height, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
                const emptyPercentage = isTileEmpty(offscreenCanvas, offscreenCtx, 0.9, true)
                const topX = Math.floor(x * imageInfo.width / thumbnailWidth)
                const topY = Math.floor(y * imageInfo.height / thumbnailHeight)
                const bottomX = topX + Math.floor(imageInfo.width / gridDim)
                const bottomY = topY + Math.floor(imageInfo.height / gridDim)
                return {
                    topX,
                    topY,
                    bottomX,
                    bottomY,
                    emptyPercentage
                }
            }).sort((a, b) => a.emptyPercentage - b.emptyPercentage).slice(0, 8)
            resolve(tissueRegions)
        }

    }).catch(e => resolve([]))
})

const getRandomTileParams = async (imagebox3Instance, tissueRegions) => {
    const imageInfo = await imagebox3Instance.getInfo();
    let randomRegion = {
        'topX': 0,
        'topY': 0,
        'bottomX': imageInfo.width,
        'bottomY': imageInfo.height
    }
    if (Array.isArray(tissueRegions) && tissueRegions.length > 0) {
        randomRegion = tissueRegions[Math.floor(Math.random() * tissueRegions.length)]
    }
    return {
        'tileX': Math.floor(randomRegion.topX + Math.random() * (randomRegion.bottomX - randomRegion.topX - 224)),
        'tileY': Math.floor(randomRegion.topY + Math.random() * (randomRegion.bottomY - randomRegion.topY - 224)),
        'tileWidth': imageInfo?.pixelsPerMeter ? imageInfo.pixelsPerMeter * 128 : 256,
        'tileHeight': imageInfo?.pixelsPerMeter ? imageInfo.pixelsPerMeter * 128 : 256,
        'tileSize': 224
    }
}

const isTileEmpty = (canvas, ctx, threshold = 0.9, returnEmptyProportion = false) => {

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imageData.data
    const numPixels = pixels.length / 4

    let whitePixelCount = 0

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]

        if (r > 200 && g > 200 && b > 200) {
            whitePixelCount++
        }
    }

    const whitePercentage = whitePixelCount / numPixels
    let isEmpty = false
    if (whitePercentage >= threshold) {
        isEmpty = true
    }
    if (returnEmptyProportion) {
        return whitePercentage
    }
    return isEmpty

}

function imageTransforms(
    imageTensor,
    mean = [0.485, 0.456, 0.406],
    std = [0.229, 0.224, 0.225]
) {
    const maxPixelValue = imageTensor.reduce((max, curr) =>
        max <= curr ? curr : max
    );
    const minPixelValue = imageTensor.reduce((min, curr) =>
        min >= curr ? curr : min
    );
    const minMaxNormalizedTensor = imageTensor.map(
        (v) => (v - minPixelValue) / (maxPixelValue - minPixelValue)
    );

    const normalizeImage = (image, mean, std) => {
        const normalizedImage = image.map(
            (value, index) => (value - mean[index % 3]) / std[index % 3]
        );
        return normalizedImage;
    };

    const normalizedImage = normalizeImage(minMaxNormalizedTensor, mean, std);
    return normalizedImage;
}

async function generatePatchesAndEmbeddings(wsiId, params) {
    showViewer('osd');
    const onnxRuntime = await import("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/esm/ort.min.js")
    if (!embeddingModel || embeddingModel.modelId !== params.modelInfo.modelId) {
        updateStatus(`Loading Model...`, true);
        onnxRuntime.env.wasm.wasmPaths =
            "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
        embeddingModel = await onnxRuntime.InferenceSession.create(params.modelInfo.modelURL);
        embeddingModel.modelId = params.modelInfo.modelId
    }
    if (imagebox3Instance.imageSource !== wsiId) {
        const imagebox3 = await import("https://episphere.github.io/imagebox3/imagebox3.mjs")
        const imagebox3Instance = new imagebox3.Imagebox3(wsiId)
        await imagebox3Instance.init()
        updateStatus(`Loading Whole Slide Image...`, true);
    }

    updateStatus(`Embedding ${params.numPatches} patches...`, true);

    const tissueRegions = await findTissueRegionsInImage(imagebox3Instance)
    let currentPatchNum = 0
    const patchEmbeddings = []
    while (currentPatchNum < params.numPatches) {
        showProgress(patchingProgressBar, patchingProgressContainer, 100 * currentPatchNum / params.numPatches);
        const tileParams = await getRandomTileParams(imagebox3Instance, tissueRegions)

        if (!isNaN(tileParams.tileX)) {
            let tileURL = undefined
            try {
                tileURL = URL.createObjectURL(await imagebox3Instance.getTile(...Object.values(tileParams)))
            } catch (e) {
                console.log(wsiId, e)
                continue
            }
            const canvas = new OffscreenCanvas(tileParams.tileSize, tileParams.tileSize)
            const ctx = canvas.getContext("2d");

            const imageTensor = await new Promise((resolve) => {
                const tempImg = new Image();
                tempImg.src = tileURL;
                tempImg.crossOrigin = "anonymous";
                tempImg.onload = () => {
                    ctx.drawImage(tempImg, 0, 0);
                    if (isTileEmpty(canvas, ctx)) {
                        resolve(undefined)
                    }
                    const pixelArray = Array.from(
                        ctx
                            .getImageData(0, 0, tileParams.tileSize, tileParams.tileSize)
                            .data.filter((v, i) => i % 4 !== 3)
                    );

                    resolve(new onnxRuntime.Tensor("float32", imageTransforms(pixelArray), [1, 3, 224, 224]));
                };
            })
            if (!imageTensor) {
                continue
            }
            if (osdViewer.currentOverlays.length > 0) {
                osdViewer.removeOverlay(osdViewer.currentOverlays[0].element);
            }
            const elt = document.createElement("div");
            elt.id = "runtime-overlay";
            elt.className = "highlight";
            osdViewer.addOverlay({
                element: elt,
                location: osdViewer.viewport.imageToViewportRectangle(tileParams.tileX, tileParams.tileY, tileParams.tileWidth, tileParams.tileHeight)
            });
            const { embedding: { cpuData } } = await embeddingModel.run({ image: imageTensor });
            const embedding = Object.values(cpuData)
            patchEmbeddings.push({
                wsiId,
                tileParams,
                embedding
            })
            currentPatchNum += 1
        }
    }

    hideProgress(patchingProgressContainer);
    hideProgress(embeddingProgressContainer);
    updateStatus(`Generated ${patchEmbeddings.length} embeddings. Ready to visualize and train.`);
    const embeddingVectors = patchEmbeddings.map(p => p.embedding)
    const embeddingVectorsUMAP = await runUMAP(embeddingVectors)
    const patchEmbeddingsDimReduced = patchEmbeddings.map((p, i) => {
        p['embedding3d'] = embeddingVectorsUMAP[i]
        p['properties'] = availableColorByProps.reduce((o, propKey) => {
            o[propKey] = params[propKey]
            return o
        }, {})
        return p
    })
    return patchEmbeddingsDimReduced
}

async function trainClassifierModel(embeddingObjects, trainTestRatio = 0.8) {
    const tf = await import('https://esm.sh/@tensorflow/tfjs');
    const unlabeledData = currentEmbeddings.map(p => p.embedding)
    let labels = currentEmbeddings.map(p => p.properties[Object.keys(p.properties)[0]])
    labels = labels.map(l => {
        if (l == 6) {
            l = [0, 0, 0, 1]
        }
        else if (l == 7) {
            l = [0, 0, 1, 0]
        }
        else if (l == 8) {
            l = [0, 1, 0, 0]
        }
        else if (l == 9) {
            l = [1, 0, 0, 0]
        }
        return l
    })
    const [testData, trainingData] = [unlabeledData.slice(0, unlabeledData.length * trainTestRatio), unlabeledData.slice(unlabeledData.length * trainTestRatio)]
    const [testLabels, trainingLabels] = [labels.slice(0, unlabeledData.length * trainTestRatio), labels.slice(unlabeledData.length * trainTestRatio)]
    const [trainX, trainY, testX, testY] = [tf.tensor(trainingData), tf.tensor(trainingLabels), tf.tensor(testData), tf.tensor(testLabels)]
    const data = {
        'training': {
            'x': trainX,
            'y': trainY
        },
        'test': {
            'x': testX,
            'y': testY
        }
    }
    const originalModel = await buildModel(data)
    originalModel.compile({
        loss: 'categoricalCrossentropy',
        optimizer: 'sgd',
        metrics: ["accuracy", "precision"]
    });

    // Extend the model before passing ahead
    const model = extendTFModel(originalModel);

    Decentifai = await import("https://prafulb.github.io/decentifai/index.js")
    const federation = new Decentifai.Decentifai({
        model,
        backend: "tfjs",
        signaling: ["wss://signalyjs-df59a68bd6e6.herokuapp.com"],
        roomId: "testForEmbeddings",
        trainingData: data.training, // Can also be a function: () => getDataForCurrentRound()
        testData: data.test,
        trainingOptions: {
            epochs: 5,
            batchSize: 32
        },
        testOptions: {
            batchSize: 32
        },
        autoTrain: true,
        federationOptions: {
            minPeers: 2,
            waitTime: 2000,
            maxRounds: 100
        },
        metadata: {
            name: peerName
        },
        debug: true,
        forceTURNForICE: true
    });
    updateTrainingStatus("Federation joined, waiting for peers...", false)
    federation?.on("peersAdded", (e) => {
        console.log("New Peer, current list of peers:", federation.getPeers());
    });

    federation?.on("roundProposed", () => {
        updateTrainingStatus(`Round ${federation.trainingRound} Proposed`, false);
    });

    federation?.on("roundChanged", (e) => {
        updateTrainingStatus(`New round ${e.detail.round} starting.\n`, true);
    });

    federation?.on("roundStarted", () => {
        updateTrainingStatus(`Starting training for round ${federation.trainingRound}`, true);
    });

    federation?.on("roundQuorumReached", async () => {
        updateTrainingStatus(`Quorum reached for round ${federation.trainingRound}. Starting training..`, true);
        federation.startTrainingRound();
    });

    federation?.on("localTrainingCompleted", () => {
        updateTrainingStatus(`Local Training completed for round ${federation.trainingRound}`, true);
    });

    federation?.on("roundFinalized", async (event) => {
        updateTrainingStatus(`Aggregation for Round ${event.detail.round
            } completed with ${event.detail.participants} participants. Loss: ${model.getLoss()[0]
            }, Accuracy: ${model.getAccuracy()[0]}`, false);
        // plotMetrics();
        metrics = federation.getConvergenceVisualization();
        console.log(metrics);
    });

    federation?.on("modelConverged", (event) => {
        updateTrainingStatus(`Model converged at round: ${event.detail.round}<br/>`, true);

        // Get detailed convergence visualization
        const convergenceViz = federation.getConvergenceVisualization();
        console.log(convergenceViz);
    });
}

const buildModel = async (data, arch=[256,128,128,64,4], activation = "relu") => {
    const tf = await import('https://esm.sh/@tensorflow/tfjs');
    const inputShape = data.training.x.shape[1];
    let model = {};

    tf.tidy(() => {
        const layers = arch.map((layer, index) => {
            let layerArch = {
                units: layer,
                activation,
                useBias: false
            };
            if (index === 0) {
                layerArch.inputShape = inputShape;
            } else if (index === arch.length - 1) {
                layerArch.activation = "softmax";
            }
            return tf.layers.dense(layerArch);
        });
        model = tf.sequential({
            layers
        });
        model.summary()
    });
    return model;
}

const extendTFModel = (model) => {
    model.train = async ({ data, options = {} }) => {
        const { x, y } = data;
        console.log(x)
        const defaultOptions = {
            epochs: 10,
            batchSize: 32,
            verbose: 0
        };

        const trainingOptions = { ...defaultOptions, ...options };
        return await model.fit(x, y, trainingOptions);
    };

    model.test = async ({ data, options = {} }) => {
        const { x, y } = data;
        const defaultOptions = {
            batchSize: 32,
        };

        const testOptions = { ...defaultOptions, ...options };
        return await model.predict(x, testOptions);
    };

    // Add functions to extract average loss and accuracy for the round.
    model.getLoss = () => {
        const roundLosses = model?.model?.history?.history?.loss
        if (Array.isArray(roundLosses)) {
            const avgLossForRound = roundLosses.reduce((sum, loss) => {
                return sum += loss
            }, 0) / roundLosses.length
            return [avgLossForRound]
        }
        return [roundLosses]
    }
    model.getAccuracy = () => {
        const roundAccuracies = model?.model?.history?.history?.acc
        if (Array.isArray(roundAccuracies)) {
            const avgAccuracyForRound = roundAccuracies.reduce((sum, accuracy) => {
                return sum += accuracy
            }, 0) / roundAccuracies.length
            return [avgAccuracyForRound]
        }
        return [roundAccuracies]
    }

    return model;
}

async function shareEmbeddings(embeddingsToShare) {

}

const loadWSI = async () => {
    currentWsiIdentifier = null;
    if (currentInputType === 'file') {
        if (fileInput.files.length > 0) {
            currentWsiIdentifier = fileInput.files[0];
        } else {
            alert("Please select a file.");
            return;
        }
    } else { // url
        if (urlInput.value && urlInput.value.trim() !== '') {
            try {
                // Basic URL validation
                new URL(urlInput.value.trim());
                currentWsiIdentifier = urlInput.value.trim();
            } catch (_) {
                alert("Please enter a valid URL.");
                return;
            }
        } else {
            alert("Please enter a URL.");
            return;
        }
    }

    if (currentWsiIdentifier) {
        showViewer('placeholder'); // Show placeholder initially
        visualizationPlaceholder.querySelector('p').textContent = 'Loading WSI viewer...';
        parameterControls.style.display = 'none'; // Hide params until loaded
        processingStatusDiv.style.display = 'none';
        trainingControls.style.display = 'none';
        plotControls.style.display = 'none';
        currentROI = null;

        try {
            if (imagebox3Instance?.getImageSource() !== currentWsiIdentifier) {
                const tileSource = await createTileSource(currentWsiIdentifier);
                initializeOSDViewer(tileSource);
            }
            // Parameter controls are shown by OSD 'open' handler
        } catch (error) {
            console.error("Error creating tile source or initializing viewer:", error);
            showViewer('placeholder');
            visualizationPlaceholder.querySelector('p').textContent = `Error: ${error.message}`;
        }
    }
}


inputTypeFile.addEventListener('change', () => {
    currentInputType = 'file';
    fileInputContainer.style.display = 'block';
    urlInputContainer.style.display = 'none';
});

inputTypeUrl.addEventListener('change', () => {
    currentInputType = 'url';
    fileInputContainer.style.display = 'none';
    urlInputContainer.style.display = 'block';
});

fileInput.addEventListener('change', loadWSI)
loadAndViewBtn.addEventListener('click', loadWSI)



modelSelect.addEventListener('change', updateNumPatchesDefault); // Update num patches on model change


generateBtn.addEventListener('click', async () => {
    if (!currentWsiIdentifier) {
        alert("Please load a WSI first.");
        return;
    }

    const selectedModelOption = modelSelect.options[modelSelect.selectedIndex];
    const selectedModel = SUPPORTED_MODELS.find(m => m.modelId == selectedModelOption.value);

    if (!selectedModel) {
        alert("Invalid model selected.");
        return;
    }

    const params = {
        numPatches: parseInt(numPatchesInput.value, 10) || 50,
        patchWidth: parseInt(patchWidthInput.value, 10) || 256,
        patchHeight: parseInt(patchHeightInput.value, 10) || 256,
        modelInfo: selectedModel,
        roi: currentROI // Pass the currently stored ROI (might be null)
    };

    availableColorByProps.forEach(propKey => {
        params[propKey] = document.getElementById(propKey).value
    })

    if (params.numPatches <= 0 || params.patchWidth <= 0 || params.patchHeight <= 0) {
        alert("Please enter valid positive numbers for patch count and dimensions.");
        return;
    }

    trainingControls.style.display = 'none';
    plotControls.style.display = 'none';

    try {
        const embeddings = await generatePatchesAndEmbeddings(currentWsiIdentifier, params);
        currentEmbeddings = currentEmbeddings.concat(embeddings);

        if (!currentEmbeddings || currentEmbeddings.length === 0) {
            throw new Error("No embeddings were generated.");
        }

        // Optional: Share via WebRTC if checked
        if (shareEmbeddingsCheck.checked) {
            shareEmbeddingsViaWebRTC(currentEmbeddings);
        }

        showViewer('placeholder');
        visualizationPlaceholder.querySelector('p').textContent = 'Generating embeddings...';

        populateColorBySelector(currentEmbeddings);
        display3DPlot(currentEmbeddings, colorBySelect.value);

        trainingControls.style.display = 'block';
        trainBtn.disabled = false;

    } catch (error) {
        console.error("Error during embedding generation:", error);
        showViewer('placeholder');
        visualizationPlaceholder.querySelector('p').textContent = `Error: ${error.message}`;
        updateStatus(`Error: ${error.message}`);
        hideProgress(patchingProgressContainer);
        hideProgress(embeddingProgressContainer);
        currentEmbeddings = null;
        trainingControls.style.display = 'none';
        plotControls.style.display = 'none';
    }
});


colorBySelect.addEventListener('change', (event) => {
    if (currentEmbeddings) {
        display3DPlot(currentEmbeddings, event.target.value);
    }
});


trainBtn.addEventListener('click', async () => {
    if (!currentEmbeddings) return;

    // Hide plot while training? Optional.
    // showViewer('placeholder');
    // visualizationPlaceholder.querySelector('p').textContent = 'Training model...';

    updateTrainingStatus("Starting training...", true);
    showProgress(trainingProgressBar, trainingProgressContainer, 0);

    try {
        await trainClassifierModel(currentEmbeddings);
        // showViewer('plot');
    } catch (error) {
        console.error("Error during training:", error);
        updateTrainingStatus(`Error: ${error.message}`, false);
        hideProgress(trainingProgressContainer);
        displayResults(`Training failed: ${error.message}`);
        // showViewer('plot');
    }
});

async function getDependencies() {
    Imagebox3 = (await import("https://episphere.github.io/imagebox3/imagebox3.mjs")).Imagebox3
    UMAP = (await import("https://esm.sh/umap-js")).UMAP
}

async function runUMAP(vectors) {
    if (!umapInstance) {
        umapInstance = new UMAP({
            nComponents: 3,
            nNeighbors: 15,
            minDist: 0.1,
            seed: 42
        })
        umapInstance.fit(vectors)
    }
    return umapInstance.transform(vectors)
}

async function displayDefaultEmbeddings() {
    const urlSearchParams = new URLSearchParams(location.search)
    let dataToPlot = urlSearchParams.has('id') ? EXAMPLE_DATA.find(d => d.id == urlSearchParams.get("id")) : EXAMPLE_DATA[0]
    const embeddingsData = await (await fetch(dataToPlot.path)).json()
    const embeddingVectors = embeddingsData.map(p => p.embedding)
    const embeddingVectorsUMAP = await runUMAP(embeddingVectors)

    currentEmbeddings = embeddingsData.map((p, i) => {
        p.embedding3d = embeddingVectorsUMAP[i]
        return p
    })
    populateColorBySelector(currentEmbeddings)
    display3DPlot(currentEmbeddings, dataToPlot.colorBy)
}


async function initializeApp() {
    await getDependencies()
    populateModelSelector();
    parameterControls.style.display = 'none';
    processingStatusDiv.style.display = 'none';
    trainingControls.style.display = 'none';
    plotControls.style.display = 'none';
    displayDefaultEmbeddings()
    updateTrainingStatus("Not Started");
    hideProgress(patchingProgressContainer);
    hideProgress(embeddingProgressContainer);
    hideProgress(trainingProgressContainer);
}

initializeApp();