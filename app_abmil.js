import { Decentifai } from "https://prafulb.github.io/decentifai/src/decentifai.js";
// Assuming Decentifai is available there or we adjust import based on environment

const DEFAULTS = {
    turnCredsAPI: "https://noisy-math-e490.prtsh32.workers.dev/"
}

const appState = {
    data: [], // Array of patch embedding objects
    groupedData: [], // Array of {wsiId, embeddings, label}
    processedTensors: null, // {x: Tensor, y: Tensor}
    model: null,
    decentifaiInstance: null,
    peerName: `Peer-${crypto.randomUUID().slice(0, 8)}`,
    isTraining: false
};

const ui = {
    jsonInput: document.getElementById('jsonFiles'),
    loadBtn: document.getElementById('loadDataBtn'),
    dataStatus: document.getElementById('dataStatus'),
    startTrainBtn: document.getElementById('trainBtn'),
    labelInput: document.getElementById('labelProperty'),
    maxPatchesInput: document.getElementById('maxPatches'),
    resultsOutput: document.getElementById('results-output'),
    trainingStatusText: document.getElementById('training-status-text'),
    trainingProgressBar: document.getElementById('training-progress'),
    convergencePlot: document.getElementById('convergencePlotContainer'),
    convergenceStatus: document.getElementById('convergenceStatusText')
};

// --- Utility: Update UI ---
function updateStatus(message, isError = false) {
    ui.dataStatus.textContent = message;
    // Tailwind classes: text-red-600 vs text-green-600
    ui.dataStatus.className = isError ? 'mt-2 text-xs text-red-600 font-medium' : 'mt-2 text-xs text-green-600 font-medium';
}

function appendLog(message) {
    console.log(message);
    // Check if it's the specific "Waiting..." span and remove it/append after
    const logContainer = ui.resultsOutput;

    // Create new log line
    const line = document.createElement('div');
    line.textContent = `> ${message}`;
    line.className = 'mb-1';

    logContainer.appendChild(line);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function updateTrainingStatus(message, isTraining) {
    ui.trainingStatusText.textContent = message;
    if (isTraining) {
        ui.trainingStatusText.className = 'font-semibold text-blue-600 animate-pulse';
        ui.startTrainBtn.textContent = 'Training in Progress...';
    } else {
        ui.trainingStatusText.className = 'font-normal text-gray-600';
        ui.startTrainBtn.textContent = 'Start Training';
    }
    ui.startTrainBtn.disabled = isTraining;
}

function showProgress(percentage) {
    const bar = ui.trainingProgressBar;
    const container = document.getElementById('progress-container');
    const text = document.getElementById('progress-text');

    if (container) container.classList.remove('hidden');

    if (bar) {
        bar.style.width = `${percentage}%`;
        if (text) text.textContent = `${percentage}%`;
    }
}


// --- 1. Data Loading & Preprocessing ---

ui.loadBtn.addEventListener('click', async () => {
    const files = ui.jsonInput.files;
    if (files.length === 0) {
        updateStatus("Please select at least one JSON file.", true);
        return;
    }

    appState.data = [];
    updateStatus("Loading files...", false);
    ui.loadBtn.disabled = true;

    try {
        for (const file of files) {
            const text = await file.text();
            const json = JSON.parse(text);
            if (Array.isArray(json)) {
                appState.data.push(...json);
            } else {
                console.warn(`File ${file.name} is not an array of objects.`);
            }
        }

        if (appState.data.length === 0) {
            throw new Error("No data loaded.");
        }

        const labelKey = ui.labelInput.value.trim();
        processData(labelKey);
        updateStatus(`Loaded ${appState.data.length} patches. Grouped into ${appState.groupedData.length} bags/slides. Ready to train.`);
        ui.startTrainBtn.disabled = false;

    } catch (e) {
        console.error(e);
        updateStatus(`Error loading data: ${e.message}`, true);
    } finally {
        ui.loadBtn.disabled = false;
    }
});

function processData(labelKey) {
    // 1. Group by wsiId
    const groups = {};
    appState.data.forEach(item => {
        const id = item.wsiId || "unknown";
        if (!groups[id]) {
            groups[id] = {
                wsiId: id,
                embeddings: [],
                labelValue: item.properties?.[labelKey]
            };
        }
        if (item.embedding) {
            groups[id].embeddings.push(item.embedding);
        }
    });

    // 2. Filter invalid groups (no label or no embeddings)
    appState.groupedData = Object.values(groups).filter(g =>
        g.embeddings.length > 0 && g.labelValue !== undefined && g.labelValue !== null
    );

    appendLog(`Grouped ${appState.data.length} patches into ${appState.groupedData.length} WSIs based on ID.`);

    // Check label distribution
    const labels = appState.groupedData.map(g => g.labelValue);
    const uniqueLabels = [...new Set(labels)];
    appendLog(`Found labels: ${uniqueLabels.join(', ')}`);
}

async function prepareTensors() {
    const maxPatches = parseInt(ui.maxPatchesInput.value) || 1000;
    const embeddingDim = appState.groupedData[0].embeddings[0].length;
    const uniqueLabels = [...new Set(appState.groupedData.map(g => g.labelValue))].sort();
    const labelMap = {};
    uniqueLabels.forEach((l, i) => labelMap[l] = i);
    const numClasses = uniqueLabels.length;

    appendLog(`Preparing tensors. Max Patches: ${maxPatches}, Embedding Dim: ${embeddingDim}, Classes: ${numClasses}`);

    const xs = [];
    const ys = [];

    appState.groupedData.forEach(bag => {
        // Pad or truncate
        let bagEmbeddings = bag.embeddings;
        if (bagEmbeddings.length > maxPatches) {
            // Random sampling or truncated? Let's truncate for now, or shuffle then truncate
            // Shuffling first is better to get random patches
            bagEmbeddings = bagEmbeddings.sort(() => 0.5 - Math.random()).slice(0, maxPatches);
        }

        // Create a flat array for this bag, padded with zeros
        const paddedBag = new Float32Array(maxPatches * embeddingDim); // Initialized to 0

        for (let i = 0; i < bagEmbeddings.length; i++) {
            paddedBag.set(bagEmbeddings[i], i * embeddingDim);
        }

        xs.push(paddedBag);
        ys.push(labelMap[bag.labelValue]);
    });

    // Convert to Tensor
    // Shape: [batch_size, max_patches, embedding_dim]
    const xTensor = tf.tensor3d(xs.flatMap(x => Array.from(x)), [xs.length, maxPatches, embeddingDim]);
    const yTensor = tf.oneHot(tf.tensor1d(ys, 'int32'), numClasses);

    return { x: xTensor, y: yTensor, numClasses, inputShape: [maxPatches, embeddingDim] };
}


// --- 2. AbMIL Model Definition ---

async function buildAbMILModel(inputShape, numClasses) { // inputShape is [maxPatches, features]
    // Custom Attention Layer logic via Functional API or custom layer is needed because TFJS doesn't have a built-in MIL Attention layer.
    // We will use the functional API to define the graph.

    const maxPatches = inputShape[0]; // Extract maxPatches for explicit reshape
    const input = tf.input({ shape: inputShape });
    // input: [Batch, Patches, Features]

    // 1. Attention Mechanism
    // V = Tanh(W_v * H_k^T)
    // U = Sigmoid(W_u * H_k^T)
    // Attention Weights A = Softmax(W * (V . U)) - Gated Attention
    // Or Simple: A = Softmax(W * Tanh(V * H))

    // Let's implement Gated Attention for better performance typically
    // Features are last dim. We want to apply dense layers to each patch.
    // TFJS Dense applies to the last dimension, so it works on [Batch, Patches, Features].

    const hiddenDim = 128; // L

    // Equation: A = softmax( w^T * (tanh(V*h) . sigmoid(U*h)) )

    // V = tanh(W_v * h)
    const vDense = tf.layers.dense({ units: hiddenDim, activation: 'tanh', name: 'attention_v' });
    const v = vDense.apply(input);

    // U = sigmoid(W_u * h)
    const uDense = tf.layers.dense({ units: hiddenDim, activation: 'sigmoid', name: 'attention_u' });
    const u = uDense.apply(input);

    // Gated = V * U (element-wise)
    const gated = tf.layers.multiply().apply([v, u]);

    // w^T * Gated -> Score
    const scoreDense = tf.layers.dense({ units: 1, useBias: false, name: 'attention_w' });
    const scores = scoreDense.apply(gated); // [Batch, Patches, 1]

    // Fix for TF.js limitation: softmax must be applied on the last dimension
    // Reshape [Batch, Patches, 1] -> [Batch, Patches] for softmax
    const scoresFlat = tf.layers.reshape({ targetShape: [maxPatches] }).apply(scores); // [Batch, Patches]

    // Apply softmax on the last dimension (Patches)
    const alphaFlat = tf.layers.softmax().apply(scoresFlat); // [Batch, Patches]

    // Reshape back to [Batch, Patches, 1] for compatibility
    const alpha = tf.layers.reshape({ targetShape: [maxPatches, 1] }).apply(alphaFlat); // [Batch, Patches, 1]

    // 2. Aggregation: Weighted Sum
    // H_bag = Sum(alpha * H)
    // Permute alpha to [Batch, 1, Patches]
    const alphaT = tf.layers.permute({ dims: [2, 1] }).apply(alpha); // [Batch, 1, Patches]

    // MatMul: [Batch, 1, Patches] x [Batch, Patches, Features] -> [Batch, 1, Features]
    const bagEmbedding = tf.layers.dot({ axes: [2, 1] }).apply([alphaT, input]); // [Batch, 1, Features]


    const bagEmbeddingFlat = tf.layers.flatten().apply(bagEmbedding); // [Batch, Features]


    // 3. Classifier
    const clf1 = tf.layers.dense({ units: 64, activation: 'relu', name: 'clf_1' }).apply(bagEmbeddingFlat);
    const drop = tf.layers.dropout({ rate: 0.3 }).apply(clf1);
    const output = tf.layers.dense({ units: numClasses, activation: 'softmax', name: 'output' }).apply(drop);

    const model = tf.model({ inputs: input, outputs: output });

    model.compile({
        optimizer: tf.train.adam(0.0005),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });

    model.summary();
    return model;
}


// --- 3. Extend Model with Required Methods ---

// Extend the TFJS model to add train, test, getLoss, and getAccuracy methods required by Decentifai
const extendAbMILModel = (model, trainingData, testData) => {
    model.currentTrainingData = trainingData; // Store for access if needed
    model.currentTestData = testData;         // Store for consistent evaluation

    model.train = async ({ data, options = {} }) => {
        const { epochs = 10, batchSize = 32, verbose = 0 } = options;
        // Decentifai passes data as {x, y} if trainingData was {x, y}
        return await model.fit(data.x, data.y, { epochs, batchSize, verbose });
    };

    // test method is not directly used by Decentifai's default flow but good for manual testing
    model.test = async ({ data, options = {} }) => {
        const { x } = data; // data typically is {x, y}
        return model.predict(x, { batchSize: options.batchSize || 32 });
    };

    model.getLoss = async () => {
        if (model.currentTestData && model.currentTestData.x && model.currentTestData.y) {
            const evaluation = model.evaluate(model.currentTestData.x, model.currentTestData.y, { batchSize: 4 });
            // evaluation is an array of Tensors [loss, acc]
            const lossTensor = Array.isArray(evaluation) ? evaluation[0] : evaluation;
            const loss = await lossTensor.data();
            return loss[0]; // Return the scalar value
        }
        // Fallback to training history if no test data or error
        const lastEpochLoss = model.history?.history?.loss?.slice(-1)[0];
        return typeof lastEpochLoss === 'number' ? lastEpochLoss : 0.0;
    };

    model.getAccuracy = async () => {
        if (model.currentTestData && model.currentTestData.x && model.currentTestData.y) {
            const evaluation = model.evaluate(model.currentTestData.x, model.currentTestData.y, { batchSize: 4 });
            const accTensor = Array.isArray(evaluation) ? evaluation[1] : null;
            if (accTensor) {
                const acc = await accTensor.data();
                return acc[0]; // Return the scalar value
            }
        }
        const lastEpochAcc = model.history?.history?.acc?.slice(-1)[0];
        return typeof lastEpochAcc === 'number' ? lastEpochAcc : 0.0;
    };

    return model;
};


// --- 4. Federated Training Logic --- 

async function startFederatedTraining() {
    if (appState.isTraining) return;
    appState.isTraining = true;
    updateTrainingStatus("Initializing components...", true);

    try {
        // Set TensorFlow.js backend to WebGPU for better performance
        appendLog("Setting up WebGPU backend...");
        try {
            await tf.setBackend('webgpu');
            await tf.ready();
            appendLog(`✓ Using backend: ${tf.getBackend()}`);
        } catch (e) {
            appendLog(`WebGPU not available, falling back to ${tf.getBackend()}: ${e.message}`);
        }

        const { x, y, numClasses, inputShape } = await prepareTensors();
        appState.processedTensors = { x, y };

        // Split Data (Simple 80/20)
        const numSamples = x.shape[0];
        const numTrain = Math.floor(numSamples * 0.7);
        // ... (Slice tensors) ... 
        // Note: TFJS slice is needed. 
        const [trainX, testX] = tf.split(x, [numTrain, numSamples - numTrain]);
        const [trainY, testY] = tf.split(y, [numTrain, numSamples - numTrain]);

        const trainingData = { x: trainX, y: trainY };
        const testData = { x: testX, y: testY };

        appendLog(`Training data: ${trainX.shape}, Test data: ${testX.shape}`);

        // Build and extend the model with required methods
        const baseModel = await buildAbMILModel(inputShape, numClasses);
        appState.model = extendAbMILModel(baseModel, trainingData, testData);

        // Setup Decentifai
        const iceServers = await (await fetch(DEFAULTS.turnCredsAPI)).json().then(d => d.iceServers).catch(() => []);

        if (appState.decentifaiInstance) {
            appState.decentifaiInstance.disconnect();
        }

        appState.decentifaiInstance = await Decentifai.create({
            iceServers: iceServers,
            model: appState.model,
            backend: "tfjs",
            roomId: `fedembed-abmil-${numClasses}class`,
            trainingData: trainingData,
            trainingOptions: {
                epochs: 5,
                batchSize: 32 // Small batch size for bag-level data (memory intensive)
            },
            autoTrain: true,
            federationOptions: {
                minPeers: 2, // Allow expected "1" for testing if alone, or 2 for real P2P
                waitTime: 3000,
                maxRounds: 50,
                convergenceThresholds: { stabilityWindow: 5, lossDelta: 0.001 }
            },
            metadata: { name: appState.peerName },
            debug: true
        });

        setupDecentifaiListeners();
        updateTrainingStatus("Waiting for peers/federation...", true);

    } catch (e) {
        console.error(e);
        updateTrainingStatus(`Error: ${e.message}`, false);
        appState.isTraining = false;
    }
}

function setupDecentifaiListeners() {
    const fed = appState.decentifaiInstance;

    fed.on("roundStarted", (e) => {
        appendLog(`\n--- Round ${e.detail.round} Started ---`);
        updateTrainingStatus(`Training Round ${e.detail.round}...`, true);
        showProgress(10);
    });

    fed.on("localTrainingCompleted", (e) => {
        appendLog(`Local training done.`);
        showProgress(50);
    });

    fed.on("roundFinalized", async (e) => {
        showProgress(100);
        appendLog(`Round ${e.detail.round} Finalized.`);

        const metrics = fed.getConvergenceVisualization();
        displayConvergencePlot(metrics);

        // Evaluate on local test set for better accuracy report
        if (appState.processedTensors) {
            // Re-evaluation using current model weights
            // Note: Decentifai updates the model in-place
            // Using a separate eval logic if needed, but 'metrics' from Decentifai should contain aggregated loss?
            // Actually Decentifai's aggregated loss is often based on reported losses from peers.
            // Let's print local test eval too.
        }
    });
}

function displayConvergencePlot(convergenceData) {
    const container = ui.convergencePlot;
    if (!convergenceData || !convergenceData.rounds) return;

    Plotly.purge(container);
    const rounds = Array.from({ length: convergenceData.rounds }, (_, i) => i + 1);

    const traces = [];
    if (convergenceData.modelLoss?.data?.length) {
        traces.push({ x: rounds, y: convergenceData.modelLoss.data, name: 'Loss', mode: 'lines+markers' });
    }
    if (convergenceData.trainingAccuracy?.data?.length) {
        traces.push({ x: rounds, y: convergenceData.trainingAccuracy.data, name: 'Accuracy', mode: 'lines+markers', yaxis: 'y2' });
    }

    const layout = {
        title: 'Convergence Metrics',
        xaxis: { title: 'Round' },
        yaxis: { title: 'Loss', showgrid: false },
        yaxis2: { title: 'Accuracy', overlaying: 'y', side: 'right', showgrid: false },
        legend: { orientation: 'h', y: 1.1 }
    };

    ui.convergencePlot.firstElementChild.classList.add('hidden')
    Plotly.newPlot(container, traces, layout);
    ui.convergenceStatus.textContent = `Rounds: ${convergenceData.rounds}. Loss Trend: ${convergenceData.modelLoss.trend}`;
}


// --- Init ---
ui.startTrainBtn.addEventListener('click', startFederatedTraining);

