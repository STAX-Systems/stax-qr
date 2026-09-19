const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const batchInput = document.getElementById('batchInput');
const previewGrid = document.getElementById('previewGrid');
const countDisplay = document.getElementById('countDisplay');

const qrSizeInput = document.getElementById('qrSize');
const qrLevelInput = document.getElementById('qrLevel');

const fgColorInput = document.getElementById('fgColor');
const fgColorTextInput = document.getElementById('fgColorText');
const bgColorInput = document.getElementById('bgColor');
const bgColorTextInput = document.getElementById('bgColorText');

let generatedQRs = []; // Stores objects: { label, value, canvas, filename }

// Sync color inputs
function syncColors(picker, text) {
    picker.addEventListener('input', (e) => {
        text.value = e.target.value.toUpperCase();
    });
    text.addEventListener('change', (e) => {
        let val = e.target.value;
        if (!val.startsWith('#')) val = '#' + val;
        // Validate hex color
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            picker.value = val;
            text.value = val.toUpperCase();
        } else {
            text.value = picker.value.toUpperCase();
        }
    });
}

syncColors(fgColorInput, fgColorTextInput);
syncColors(bgColorInput, bgColorTextInput);

function sanitizeFilename(name) {
    // Remove illegal filename characters
    return name.replace(/[\\\/:\*\?"<>\|]/g, "_").trim();
}

generateBtn.addEventListener('click', () => {
    const rawText = batchInput.value;
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    previewGrid.innerHTML = '';
    generatedQRs = [];
    downloadBtn.disabled = true;
    
    if (lines.length === 0) {
        previewGrid.innerHTML = `
            <div class="empty-state">
                <p>No valid lines found. Paste values and try again.</p>
            </div>
        `;
        countDisplay.textContent = '0';
        return;
    }
    
    // Enforce 100 limit
    let activeLines = lines;
    if (lines.length > 100) {
        alert("Maximum limit of 100 QR codes exceeded. Only the first 100 rows will be processed.");
        activeLines = lines.slice(0, 100);
    }
    
    countDisplay.textContent = activeLines.length.toString();
    
    const size = parseInt(qrSizeInput.value) || 300;
    const level = qrLevelInput.value;
    const fgColor = fgColorInput.value;
    const bgColor = bgColorInput.value;
    
    const filenameCounts = {};
    
    activeLines.forEach((line) => {
        let label = '';
        let value = '';
        
        if (line.includes('|')) {
            const parts = line.split('|');
            label = parts[0].trim();
            value = parts.slice(1).join('|').trim(); // preserve inner pipes if value contains any
        } else {
            label = line;
            value = line;
        }
        
        // Handle empty values/labels
        if (!value) return;
        if (!label) label = value;
        
        // Sanitize and handle duplicate file names
        let baseFilename = sanitizeFilename(label) || "qrcode";
        let filename = baseFilename;
        
        if (filenameCounts[filename]) {
            filenameCounts[filename]++;
            filename = `${baseFilename}-${filenameCounts[filename]}`;
        } else {
            filenameCounts[filename] = 1;
        }
        
        // Create Preview Card HTML
        const card = document.createElement('div');
        card.className = 'qr-card';
        
        const canvas = document.createElement('canvas');
        card.appendChild(canvas);
        
        const info = document.createElement('div');
        info.className = 'qr-info';
        
        const labelEl = document.createElement('span');
        labelEl.className = 'qr-label';
        labelEl.textContent = label;
        labelEl.title = label;
        
        const valEl = document.createElement('span');
        valEl.className = 'qr-val';
        valEl.textContent = value;
        valEl.title = value;
        
        info.appendChild(labelEl);
        info.appendChild(valEl);
        card.appendChild(info);
        previewGrid.appendChild(card);
        
        // Generate QR code using QRious
        try {
            const qr = new QRious({
                element: canvas,
                value: value,
                size: size,
                level: level,
                foreground: fgColor,
                background: bgColor
            });
            
            generatedQRs.push({
                label: label,
                value: value,
                canvas: canvas,
                filename: filename
            });
        } catch (err) {
            console.error("Failed to generate QR for value: " + value, err);
        }
    });
    
    if (generatedQRs.length > 0) {
        downloadBtn.disabled = false;
    }
});

downloadBtn.addEventListener('click', () => {
    if (generatedQRs.length === 0) return;
    AppPayment.gate('Download QR batch ZIP', () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Zipping...';
    
    const zip = new JSZip();
    
    generatedQRs.forEach((item) => {
        const dataURL = item.canvas.toDataURL('image/png');
        const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
        zip.file(item.filename + ".png", base64Data, { base64: true });
    });
    
    zip.generateAsync({ type: 'blob' })
        .then((content) => {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'qrcodes.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download ZIP';
        })
        .catch((err) => {
            console.error("Failed to generate zip file", err);
            alert("Error exporting ZIP file.");
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download ZIP';
        });
    });
});

AppPayment.init({ appId: 'bulk-qr', appName: 'Bulk QR Generator', mode: 'per_action', actionRateSats: 20, dayRateSats: 500 });
