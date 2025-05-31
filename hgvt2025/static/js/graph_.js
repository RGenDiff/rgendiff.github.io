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
            imageNetSrc: './static/images/graph8.png', // REPLACE with your ImageNet image path
            graphSrc: './static/images/graph8.png',    // REPLACE with your graph image path (the 6x6 grid)
            gridCols: 6, // Total columns in the graph image
            gridRows: 6, // Total rows in the graph image
            yCuts: [0, 98, 196, 294, 392, 490], // REPLACE WITH YOUR ACTUAL PIXEL VALUES
        },
        // Add more image objects here if needed (up to 5)
        // Example for a second image:
        // {
        //     id: 'graph2',
        //     imageNetSrc: './imagenet_2.png', 
        //     graphSrc: './another_graph_example.png', 
        //     gridCols: 6,
        //     gridRows: 6,
        // },
    ];

    const NUM_VNODES_TO_DISPLAY = 5; // Number of virtual nodes (rows from graph image, ignoring the last one)
    const NUM_PEDGES_PER_VNODE = 5; // Number of hyperedges per vNode (cols 1-5 from graph image row)

    // --- State ---
    let currentImageNetIndex = -1;
    let currentVNodeElement = null; // DOM element of the selected vNode
    let currentImageNetElement = null; // DOM element of the selected ImageNet image

    // Cache for loaded full graph images (Image objects)
    const fullGraphImageCache = {};
    // Cache for sliced cell dataURLs: graphCellCache[graphSrc][rowIndex][colIndex] = dataURL
    const graphCellCache = {};


    // --- Helper Functions ---

    // Preload full graph image to get its dimensions and use for slicing
    function preloadFullGraphImage(graphData, callback) {
        if (fullGraphImageCache[graphData.graphSrc]) {
            callback(fullGraphImageCache[graphData.graphSrc]);
            return;
        }
        const img = new Image();
        img.onload = () => {
            fullGraphImageCache[graphData.graphSrc] = img;
            callback(img);
        };
        img.onerror = () => {
            console.error(`Error loading graph image: ${graphData.graphSrc}`);
            callback(null); // Indicate error
        };
        img.src = graphData.graphSrc;
    }
    
    // Slices a cell from the preloaded full graph image
    function getGraphCellDataURL(fullGraphImg, graphSrc, cellRowIdx, cellColIdx, totalGridRows, totalGridCols, callback) {
        if (!fullGraphImg) {
            console.error("Full graph image not loaded for slicing.");
            callback(null); // Or a placeholder error image dataURL
            return;
        }

        if (graphCellCache[graphSrc] &&
            graphCellCache[graphSrc][cellRowIdx] &&
            graphCellCache[graphSrc][cellRowIdx][cellColIdx]) {
            callback(graphCellCache[graphSrc][cellRowIdx][cellColIdx]);
            return;
        }

        const naturalImgWidth = fullGraphImg.naturalWidth;
        const naturalImgHeight = fullGraphImg.naturalHeight;

        const cellWidth = naturalImgWidth / totalGridCols;
        const cellHeight = naturalImgHeight / totalGridRows;

        const canvas = document.createElement('canvas');
        canvas.width = cellWidth;
        canvas.height = cellHeight;
        const ctx = canvas.getContext('2d');

        const sx = cellColIdx * cellWidth;
        const sy = cellRowIdx * cellHeight;

        ctx.drawImage(fullGraphImg, sx, sy, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
        const dataURL = canvas.toDataURL();

        // Cache the result
        if (!graphCellCache[graphSrc]) graphCellCache[graphSrc] = {};
        if (!graphCellCache[graphSrc][cellRowIdx]) graphCellCache[graphSrc][cellRowIdx] = {};
        graphCellCache[graphSrc][cellRowIdx][cellColIdx] = dataURL;

        callback(dataURL);
    }

    // --- Rendering Functions ---

    function displayImageNetImages() {
        imageNetRow.innerHTML = ''; // Clear previous
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
        vNodesRow.innerHTML = ''; // Clear previous
        pEdgesRow.innerHTML = ''; // Clear hyperedges too, as vNode context changes

        // Ensure the full graph image is loaded
        const fullGraphImg = await new Promise(resolve => preloadFullGraphImage(graphData, resolve));
        if (!fullGraphImg) {
            vNodesRow.innerHTML = "<p>Error loading graph data.</p>";
            drawAllConnectors(); // Clear connectors
            return;
        }

        // Create a document fragment to batch DOM updates
        const fragment = document.createDocumentFragment();
        let firstVNodeEl = null;

        for (let i = 0; i < NUM_VNODES_TO_DISPLAY; i++) { // Iterate for the first 5 rows (vNodes)
            const vNodeEl = document.createElement('img');
            vNodeEl.classList.add('clickable');
            vNodeEl.dataset.vnodeDisplayIndex = i; // 0 to 4 for display purposes
            vNodeEl.dataset.graphRowIndex = i; // Actual row index in the graph image for slicing

            getGraphCellDataURL(fullGraphImg, graphData.graphSrc, i, 0, graphData.gridRows, graphData.gridCols, (dataURL) => {
                if (dataURL) vNodeEl.src = dataURL;
                else vNodeEl.alt = `vNode ${i} (Error)`;
            });
            
            vNodeEl.addEventListener('click', () => handleVNodeClick(vNodeEl, imageNetIdx, i));
            fragment.appendChild(vNodeEl);
            if (i === selectedVNodeDisplayIndex) {
                firstVNodeEl = vNodeEl; // Store the vNode to be selected
            }
        }
        vNodesRow.appendChild(fragment);

        // Select the default or specified vNode and display its hyperedges
        if (firstVNodeEl) {
            handleVNodeClick(firstVNodeEl, imageNetIdx, parseInt(firstVNodeEl.dataset.graphRowIndex));
        } else {
             drawAllConnectors(); // If no vNodes, still update (clear) connectors
        }
    }

    async function displayHyperedges(imageNetIdx, vNodeGraphRowIndex) {
        const graphData = IMAGES_DATA[imageNetIdx];
        pEdgesRow.innerHTML = ''; // Clear previous

        const fullGraphImg = await new Promise(resolve => preloadFullGraphImage(graphData, resolve));
         if (!fullGraphImg) {
            pEdgesRow.innerHTML = "<p>Error loading hyperedge data.</p>";
            drawAllConnectors();
            return;
        }

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < NUM_PEDGES_PER_VNODE; i++) { // Iterate for 5 pEdges
            const pEdgeEl = document.createElement('img');
            // pEdges are in columns 1 through 5 for the selected vNode's row
            const graphColIndex = i + 1; 

            getGraphCellDataURL(fullGraphImg, graphData.graphSrc, vNodeGraphRowIndex, graphColIndex, graphData.gridRows, graphData.gridCols, (dataURL) => {
                if (dataURL) pEdgeEl.src = dataURL;
                else pEdgeEl.alt = `pEdge ${i} (Error)`;
            });
            fragment.appendChild(pEdgeEl);
        }
        pEdgesRow.appendChild(fragment);
        drawAllConnectors();
    }

    // --- Event Handlers ---

    function handleImageNetClick(index, imgEl) {
        if (currentImageNetElement) {
            currentImageNetElement.classList.remove('selected');
        }
        currentImageNetElement = imgEl;
        currentImageNetElement.classList.add('selected');
        
        // If a vNode was selected for a different ImageNet image, clear its selection
        if (currentVNodeElement && currentImageNetIndex !== index) {
             if(currentVNodeElement) currentVNodeElement.classList.remove('selected');
             currentVNodeElement = null;
        }

        displayVirtualNodes(index, 0); // Select the first vNode by default
    }

    function handleVNodeClick(vNodeEl, imageNetIdx, vNodeGraphRowIndex) {
        if (currentVNodeElement) {
            currentVNodeElement.classList.remove('selected');
        }
        currentVNodeElement = vNodeEl;
        currentVNodeElement.classList.add('selected');
        
        displayHyperedges(imageNetIdx, vNodeGraphRowIndex);
    }

    // --- Connector Drawing ---
    function drawConnectorLine(svg, sourceEl, targetEl) {
        if (!sourceEl || !targetEl || !svg) return;

        const svgRect = svg.getBoundingClientRect();
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const sourceX = sourceRect.left + sourceRect.width / 2 - svgRect.left;
        const sourceY = 0; // Line starts from top of SVG (aligned with bottom of sourceEl row item)
        
        const targetX = targetRect.left + targetRect.width / 2 - svgRect.left;
        const targetY = svgRect.height; // Line ends at bottom of SVG (aligned with top of targetEl row item)

        const midY = svgRect.height / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${sourceX} ${sourceY} V ${midY} H ${targetX} V ${targetY}`);
        svg.appendChild(path);
    }
    
    function drawAllConnectors() {
        svgConnectors12.innerHTML = ''; // Clear previous
        svgConnectors23.innerHTML = '';

        // Connect selected ImageNet image to all its vNodes
        if (currentImageNetElement && vNodesRow.children.length > 0) {
            Array.from(vNodesRow.children).forEach(vNodeChild => {
                 if (vNodeChild.tagName === 'IMG') { // Ensure it's an image element
                    drawConnectorLine(svgConnectors12, currentImageNetElement, vNodeChild);
                }
            });
        }

        // Connect selected vNode to all its pEdges
        if (currentVNodeElement && pEdgesRow.children.length > 0) {
            Array.from(pEdgesRow.children).forEach(pEdgeChild => {
                if (pEdgeChild.tagName === 'IMG') { // Ensure it's an image element
                    drawConnectorLine(svgConnectors23, currentVNodeElement, pEdgeChild);
                }
            });
        }
    }

    // --- Initialization ---
    function init() {
        vizContainer.classList.add('loaded'); // Hide "Loading..." message via CSS
        displayImageNetImages();
        if (IMAGES_DATA.length > 0) {
            // Automatically select the first ImageNet image and its first vNode
            const firstImageNetEl = imageNetRow.querySelector('img');
            if (firstImageNetEl) {
                 handleImageNetClick(0, firstImageNetEl);
            }
        } else {
            imageNetRow.innerHTML = "<p>No images configured.</p>";
        }
    }

    init();
    // Redraw connectors on window resize, as element positions might change
    window.addEventListener('resize', drawAllConnectors);
});
