document.addEventListener('DOMContentLoaded', () => {
    const vizContainer = document.getElementById('interactive-graph-visualization');
    const imageNetRow = document.getElementById('imagenet-row');
    const vNodesRow = document.getElementById('vnodes-row');
    const pEdgesRow = document.getElementById('pedges-row');
    const svgConnectors12 = document.getElementById('connectors-1-2');
    const svgConnectors23 = document.getElementById('connectors-2-3');

    // --- Configuration ---
    const IMAGES_DATA = [
        {
            id: 'graph1',
            imageNetSrc: './static/images/graph8_src.png', 
            graphSrc: './static/images/graph8.png', 
            gridCols: 6, // Total columns in the graph image (for X-axis slicing)
            yCuts: [12, 164, 318, 470, 623, 775], 
        },
        {
            id: 'graph2',
            imageNetSrc: './static/images/graph3_src.png',
            graphSrc: './static/images/graph3.png',
            gridCols: 6, // Total columns in the graph image (for X-axis slicing)
            yCuts: [12, 164, 318, 470, 623, 775],
        },
        {
            id: 'graph3',
            imageNetSrc: './static/images/graph4_src.png',
            graphSrc: './static/images/graph4.png',
            gridCols: 6, // Total columns in the graph image (for X-axis slicing)
            yCuts: [12, 164, 318, 470, 623, 775],
        },
        {
            id: 'graph4',
            imageNetSrc: './static/images/graph12_src.png',
            graphSrc: './static/images/graph12.png',
            gridCols: 6, // Total columns in the graph image (for X-axis slicing)
            yCuts: [12, 164, 318, 470, 623, 775],
        },
    ];

    const NUM_VNODES_TO_DISPLAY = 5; // Number of virtual nodes (rows from graph image)
    const NUM_PEDGES_PER_VNODE = 5; // Number of hyperedges per vNode (cols 1-5 from graph image row)

    // --- State ---
    let currentImageNetIndex = -1;
    let currentVNodeElement = null; 
    let currentImageNetElement = null; 

    const fullGraphImageCache = {};
    const graphCellCache = {};


    // --- Helper Functions ---
    function preloadFullGraphImage(graphData, callback) {
        if (fullGraphImageCache[graphData.graphSrc]) {
            callback(fullGraphImageCache[graphData.graphSrc]);
            return;
        }
        const img = new Image();
        img.onload = () => {
            fullGraphImageCache[graphData.graphSrc] = img;
            // Basic validation for yCuts
            if (!graphData.yCuts || graphData.yCuts.length !== NUM_VNODES_TO_DISPLAY + 1) {
                console.error(`Graph ${graphData.id} has misconfigured yCuts. Expected ${NUM_VNODES_TO_DISPLAY + 1} values.`);
                // Potentially prevent further processing for this graph or use defaults
            }
            callback(img);
        };
        img.onerror = () => {
            console.error(`Error loading graph image: ${graphData.graphSrc}`);
            callback(null);
        };
        img.src = graphData.graphSrc;
    }
    
    // CHANGE: Modified to use yCuts from graphData
    function getGraphCellDataURL(fullGraphImg, graphData, cellRowIdx, cellColIdx, callback) {
        if (!fullGraphImg) {
            console.error("Full graph image not loaded for slicing.");
            callback(null);
            return;
        }
        // Validate yCuts presence for the specific graphData
        if (!graphData.yCuts || graphData.yCuts.length !== NUM_VNODES_TO_DISPLAY + 1) {
            console.error(`yCuts not properly configured for graph: ${graphData.graphSrc} for row ${cellRowIdx}. Expected ${NUM_VNODES_TO_DISPLAY + 1} yCut values.`);
            callback(null);
            return;
        }
        if (cellRowIdx < 0 || cellRowIdx >= graphData.yCuts.length -1) {
             console.error(`cellRowIdx ${cellRowIdx} is out of bounds for yCuts of length ${graphData.yCuts.length}.`);
            callback(null);
            return;
        }


        if (graphCellCache[graphData.graphSrc] &&
            graphCellCache[graphData.graphSrc][cellRowIdx] &&
            graphCellCache[graphData.graphSrc][cellRowIdx][cellColIdx]) {
            callback(graphCellCache[graphData.graphSrc][cellRowIdx][cellColIdx]);
            return;
        }

        const naturalImgWidth = fullGraphImg.naturalWidth;
        // const naturalImgHeight = fullGraphImg.naturalHeight; // Not directly used for cell height anymore

        const cellWidth = naturalImgWidth / graphData.gridCols; // X-axis slicing remains uniform

        // Y-axis slicing uses yCuts
        const yStart = graphData.yCuts[cellRowIdx];
        const yEnd = graphData.yCuts[cellRowIdx + 1];
        const cellActualHeightInSource = yEnd - yStart; // Actual height of the cell in the source image

        if (cellActualHeightInSource <= 0) {
            console.error(`Calculated cell height is invalid (${cellActualHeightInSource}) for row ${cellRowIdx} with yCuts: [${graphData.yCuts.join(', ')}]`);
            callback(null);
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = cellWidth;
        canvas.height = cellActualHeightInSource; // Canvas matches source cell dimensions
        const ctx = canvas.getContext('2d');

        const sx = cellColIdx * cellWidth;
        const sy = yStart; // Starting Y position in source image

        ctx.drawImage(fullGraphImg, sx, sy, cellWidth, cellActualHeightInSource, 0, 0, cellWidth, cellActualHeightInSource);
        const dataURL = canvas.toDataURL();

        if (!graphCellCache[graphData.graphSrc]) graphCellCache[graphData.graphSrc] = {};
        if (!graphCellCache[graphData.graphSrc][cellRowIdx]) graphCellCache[graphData.graphSrc][cellRowIdx] = {};
        graphCellCache[graphData.graphSrc][cellRowIdx][cellColIdx] = dataURL;

        callback(dataURL);
    }

    // --- Rendering Functions ---

    function displayImageNetImages() {
        imageNetRow.innerHTML = '';
        IMAGES_DATA.forEach((imgData, index) => {
            const imgEl = document.createElement('img');
            imgEl.src = imgData.imageNetSrc;
            imgEl.alt = `ImageNet ${imgData.id}`;
            imgEl.classList.add('clickable');
            imgEl.dataset.index = index;
            imgEl.addEventListener('click', () => handleImageNetClick(index, imgEl));
            imageNetRow.appendChild(imgEl);
        });
    }

    async function displayVirtualNodes(imageNetIdx, selectedVNodeDisplayIndex = 0) {
        currentImageNetIndex = imageNetIdx;
        const graphData = IMAGES_DATA[imageNetIdx];
        vNodesRow.innerHTML = ''; 
        pEdgesRow.innerHTML = ''; 

        const fullGraphImg = await new Promise(resolve => preloadFullGraphImage(graphData, resolve));
        if (!fullGraphImg) {
            vNodesRow.innerHTML = "<p>Error loading graph data.</p>";
            drawAllConnectors(); 
            return;
        }
        // Validate yCuts are present and correctly sized for the number of vNodes expected
        if (!graphData.yCuts || graphData.yCuts.length !== NUM_VNODES_TO_DISPLAY + 1) {
             vNodesRow.innerHTML = `<p>Error: yCuts configuration problem for ${graphData.id}. Expected ${NUM_VNODES_TO_DISPLAY +1} yCut values.</p>`;
             drawAllConnectors();
             return;
        }


        const fragment = document.createDocumentFragment();
        let firstVNodeEl = null;

        for (let i = 0; i < NUM_VNODES_TO_DISPLAY; i++) { 
            const vNodeEl = document.createElement('img');
            vNodeEl.classList.add('clickable');
            vNodeEl.dataset.vnodeDisplayIndex = i; 
            vNodeEl.dataset.graphRowIndex = i; // Actual row index for yCuts and slicing

            // Pass graphData to getGraphCellDataURL for yCuts access
            getGraphCellDataURL(fullGraphImg, graphData, i, 0, (dataURL) => {
                if (dataURL) vNodeEl.src = dataURL;
                else vNodeEl.alt = `vNode ${i} (Error)`;
            });
            
            vNodeEl.addEventListener('click', () => handleVNodeClick(vNodeEl, imageNetIdx, i));
            fragment.appendChild(vNodeEl);
            if (i === selectedVNodeDisplayIndex) {
                firstVNodeEl = vNodeEl; 
            }
        }
        vNodesRow.appendChild(fragment);

        if (firstVNodeEl) {
            handleVNodeClick(firstVNodeEl, imageNetIdx, parseInt(firstVNodeEl.dataset.graphRowIndex));
        } else if (NUM_VNODES_TO_DISPLAY > 0 && vNodesRow.children.length > 0) {
            // Fallback if selectedVNodeDisplayIndex was out of bounds but vNodes were created
            const actualFirstVNode = vNodesRow.querySelector('img');
            if(actualFirstVNode) {
                handleVNodeClick(actualFirstVNode, imageNetIdx, parseInt(actualFirstVNode.dataset.graphRowIndex));
            } else {
                 drawAllConnectors();
            }
        }
         else {
             drawAllConnectors(); 
        }
    }

    async function displayHyperedges(imageNetIdx, vNodeGraphRowIndex) {
        const graphData = IMAGES_DATA[imageNetIdx];
        pEdgesRow.innerHTML = ''; 

        const fullGraphImg = await new Promise(resolve => preloadFullGraphImage(graphData, resolve));
         if (!fullGraphImg) {
            pEdgesRow.innerHTML = "<p>Error loading hyperedge data.</p>";
            drawAllConnectors();
            return;
        }
        // Validate yCuts are present for hyperedge slicing too
        if (!graphData.yCuts || graphData.yCuts.length !== NUM_VNODES_TO_DISPLAY + 1) {
             pEdgesRow.innerHTML = `<p>Error: yCuts configuration problem for ${graphData.id}.</p>`;
             drawAllConnectors();
             return;
        }

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < NUM_PEDGES_PER_VNODE; i++) { 
            const pEdgeEl = document.createElement('img');
            const graphColIndex = i + 1; 

            // Pass graphData for yCuts access
            getGraphCellDataURL(fullGraphImg, graphData, vNodeGraphRowIndex, graphColIndex, (dataURL) => {
                if (dataURL) pEdgeEl.src = dataURL;
                else pEdgeEl.alt = `pEdge ${i} (Error)`;
            });
            fragment.appendChild(pEdgeEl);
        }
        pEdgesRow.appendChild(fragment);
        drawAllConnectors();
    }

    // --- Event Handlers --- (No changes needed here)

    function handleImageNetClick(index, imgEl) {
        if (currentImageNetElement) {
            currentImageNetElement.classList.remove('selected');
        }
        currentImageNetElement = imgEl;
        currentImageNetElement.classList.add('selected');
        
        if (currentVNodeElement && currentImageNetIndex !== index) {
             if(currentVNodeElement) currentVNodeElement.classList.remove('selected');
             currentVNodeElement = null;
        }
        displayVirtualNodes(index, 0); 
    }

    function handleVNodeClick(vNodeEl, imageNetIdx, vNodeGraphRowIndex) {
        if (currentVNodeElement) {
            currentVNodeElement.classList.remove('selected');
        }
        currentVNodeElement = vNodeEl;
        currentVNodeElement.classList.add('selected');
        
        displayHyperedges(imageNetIdx, vNodeGraphRowIndex);
    }

    // --- Connector Drawing --- (No changes needed here, uses element positions)
    function drawConnectorLine(svg, sourceEl, targetEl) {
        if (!sourceEl || !targetEl || !svg) return;

        const svgRect = svg.getBoundingClientRect();
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const sourceX = sourceRect.left + sourceRect.width / 2 - svgRect.left;
        const sourceY = 0; 
        
        const targetX = targetRect.left + targetRect.width / 2 - svgRect.left;
        const targetY = svgRect.height; 

        const midY = svgRect.height / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${sourceX} ${sourceY} V ${midY} H ${targetX} V ${targetY}`);
        svg.appendChild(path);
    }
    
    function drawAllConnectors() {
        svgConnectors12.innerHTML = ''; 
        svgConnectors23.innerHTML = '';

        if (currentImageNetElement && vNodesRow.children.length > 0) {
            Array.from(vNodesRow.children).forEach(vNodeChild => {
                 if (vNodeChild.tagName === 'IMG') { 
                    drawConnectorLine(svgConnectors12, currentImageNetElement, vNodeChild);
                }
            });
        }

        if (currentVNodeElement && pEdgesRow.children.length > 0) {
            Array.from(pEdgesRow.children).forEach(pEdgeChild => {
                if (pEdgeChild.tagName === 'IMG') { 
                    drawConnectorLine(svgConnectors23, currentVNodeElement, pEdgeChild);
                }
            });
        }
    }

    // --- Initialization --- (No changes needed here)
    function init() {
        vizContainer.classList.add('loaded'); 
        displayImageNetImages();
        if (IMAGES_DATA.length > 0) {
            const firstImageNetEl = imageNetRow.querySelector('img');
            if (firstImageNetEl) {
                 handleImageNetClick(0, firstImageNetEl);
            }
        } else {
            imageNetRow.innerHTML = "<p>No images configured.</p>";
        }
    }

    init();
    window.addEventListener('resize', drawAllConnectors);
});
