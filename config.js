const EXAMPLE_DATA = [
    { id: "gleason_patches", path: "data/wsiGleasonPatchEmbeddings.json", colorBy: "gleason_score" },
    { id: "wsi_slides", path: "https://prafulb.github.io/fese/data/tcgaSlideEmbeddingsTSNE4Classes.json", colorBy: "Primary Site" },
    { id: "tcga_reports", path: "https://prafulb.github.io/fese/data/tcga_reports_tsne.json.zip", colorBy: "cancer_type" },
    { id: "gleason_slides", path: "data/tcgaGleasonSlideEmbeddingsTSNE.json", colorBy: "gleason_score" },
    // { id: "tcga_reports_verbose", path: "/ese/data/tcga_reports_verbose.json.zip", colorBy: "cancer_type" },
    { id: "tcga_reports_verbose", path: "/ese/data/tcga_reports_verbose_tsne.json.zip", colorBy: "cancer_type" },
    { id: "soc_codes", path: "/ese/data/soc_code_jobs_tsne.json.zip" }
]

const SUPPORTED_MODELS = [
    {
        "modelId": 0,
        "modelName": "CTransPath",
        "modelURL": "https://huggingface.co/kaczmarj/CTransPath/resolve/main/model.onnx",
        "multimodal": false,
        "defaultNumPatches": 50,
        "enabled": true
    },
    {
        "modelId": 1,
        "modelName": "Phikon",
        "modelURL": "https://huggingface.co/prafulb/phikon-onnx/resolve/main/model.onnx",
        "multimodal": false,
        "defaultNumPatches": 50,
        "enabled": true
    },
    {
        "modelId": 2,
        "modelName": "PLIP",
        "modelURL": "https://huggingface.co/prafulb/plip-onnx/resolve/main/model.onnx",
        "multimodal": true,
        "defaultNumPatches": 1, // Note: Default is 1, might need adjustment
        "enabled": true
    },
    {
        "modelId": 3,
        "modelName": "CONCH",
        "modelURL": "https://huggingface.co/MahmoodLab/CONCH",
        "multimodal": true,
        "enabled": false // This model won't appear in the dropdown
    }
];

// Add any other global configurations here
const DEFAULT_PATCH_RESOLUTION = 224;

const DEFAULT_TILE_SOURCE_OPTIONS = {
    "profile": ["http://iiif.io/api/image/2/level2.json"],
    "protocol": "http://iiif.io/api/image",
    "tiles": [{
        "scaleFactors": [1, 4, 16, 64, 256, 1024],
        "width": 256,
    }]
}
const DEFAULT_OSD_VIEWER_OPTIONS = {
    id: "osd-viewer",
    visibilityRatio: 1,
    minZoomImageRatio: 1,
    prefixUrl: "https://episphere.github.io/svs/openseadragon/images/",
    imageLoaderLimit: 5,
    timeout: 1000 * 1000,
    crossOriginPolicy: "Anonymous",
    zoomPerScroll: 2
}