const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('download-zip');
const labelsInput = document.getElementById('labelsInput');
const payloadsInput = document.getElementById('payloadsInput');
const labelPrefixInput = document.getElementById('labelPrefix');
const syncStatus = document.getElementById('syncStatus');
const previewGrid = document.getElementById('previewGrid');
const countDisplay = document.getElementById('countDisplay');
const generationStatus = document.getElementById('generationStatus');
const svgExportBtn = document.getElementById('btn-export-svg');
const averyExportBtn = document.getElementById('btn-export-avery');
const proModal = document.getElementById('pro-modal');
const licenseForm = document.getElementById('license-form');
const licenseKeyInput = document.getElementById('license-key');
const licenseError = document.getElementById('license-error');
const restoreLicenseBtn = document.getElementById('btn-restore-license');
const licenseValidationMessage = document.getElementById('license-validation-msg');
const proBadge = document.querySelector('.pro-badge');

const qrSizeInput = document.getElementById('qrSize');
const qrLevelInput = document.getElementById('qrLevel');

const fgColorInput = document.getElementById('fgColor');
const fgColorTextInput = document.getElementById('fgColorText');

let generatedQRs = []; // Stores objects: { label, value, canvas, filename }
const LICENSE_STORAGE_KEY = 'stax_qr_pro_unlocked';
const LICENSE_SALT = 'STAX_OFFLINE_SECRET_SALT_V1';

function isProUnlocked() {
    try {
        return localStorage.getItem(LICENSE_STORAGE_KEY) === 'true';
    } catch (err) {
        console.error('Unable to read the local license state.', err);
        return false;
    }
}

function updateProBadge() {
    const unlocked = isProUnlocked();
    proBadge.textContent = unlocked ? 'ACTIVE' : 'FREE';
    proBadge.classList.toggle('is-active', unlocked);
}

function gateProFeature() {
    if (isProUnlocked()) return true;
    proModal.hidden = false;
    licenseError.hidden = true;
    licenseKeyInput.focus();
    return false;
}

async function validateLicenseKey(key) {
    const match = /^STAX-QR-([A-Z0-9]+)-([A-F0-9]{16})$/i.exec(key.trim());
    if (!match) return false;
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
        throw new Error('Secure Web Crypto is unavailable. Open this page over HTTPS to activate your license.');
    }

    const normalizedPayload = match[1].toUpperCase();
    const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${LICENSE_SALT}:${normalizedPayload}`)
    );
    const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16)
        .toUpperCase();
    return checksum === match[2].toUpperCase();
}

function closeProModal() {
    proModal.hidden = true;
}

proModal.querySelectorAll('[data-pro-dismiss]').forEach(button => {
    button.addEventListener('click', closeProModal);
});

proModal.addEventListener('click', event => {
    if (event.target === proModal) closeProModal();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !proModal.hidden) closeProModal();
});

licenseForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = licenseForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    licenseError.hidden = true;
    try {
        if (!await validateLicenseKey(licenseKeyInput.value)) {
            licenseError.textContent = 'That license key is invalid. Check the key and try again.';
            licenseError.hidden = false;
            return;
        }
        try {
            localStorage.setItem(LICENSE_STORAGE_KEY, 'true');
        } catch (err) {
            console.error('Unable to persist the local license state.', err);
            throw new Error('Pro could not be activated because this browser cannot save local storage.');
        }
        updateProBadge();
        closeProModal();
        licenseForm.reset();
    } catch (err) {
        console.error('License validation failed.', err);
        licenseError.textContent = err.message || 'Unable to validate this license key.';
        licenseError.hidden = false;
    } finally {
        submitButton.disabled = false;
    }
});

updateProBadge();

restoreLicenseBtn.addEventListener('click', () => {
    licenseValidationMessage.textContent = isProUnlocked()
        ? 'Pro is already active in this browser.'
        : 'No saved Pro license was found in this browser. Enter your key to activate.';
});

function extractQRMatrix(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) {
        throw new Error('The QR canvas is unavailable.');
    }
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = image;
    const colorCounts = new Map();
    for (let index = 0; index < data.length; index += 4) {
        const key = `${data[index] >> 4},${data[index + 1] >> 4},${data[index + 2] >> 4}`;
        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
    const colors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (colors.length < 2) throw new Error('The QR canvas does not contain two distinct colors.');
    const colorFromKey = key => key.split(',').map(value => Number(value) * 16 + 8);
    const cornerColor = [data[0], data[1], data[2]];
    const foregroundKey = colors.reduce((nearest, entry) => {
        const color = colorFromKey(entry[0]);
        const distance = color.reduce((total, value, channel) =>
            total + (value - cornerColor[channel]) ** 2, 0);
        return distance < nearest.distance ? { key: entry[0], distance } : nearest;
    }, { key: colors[0][0], distance: Infinity }).key;
    const backgroundEntry = colors.find(entry => entry[0] !== foregroundKey);
    const background = colorFromKey(backgroundEntry[0]);
    const foreground = colorFromKey(foregroundKey);
    const colorDistance = (pixelIndex, color) => {
        const red = data[pixelIndex] - color[0];
        const green = data[pixelIndex + 1] - color[1];
        const blue = data[pixelIndex + 2] - color[2];
        return red * red + green * green + blue * blue;
    };
    const pixelIsDark = (x, y) => {
        const pixelIndex = (Math.min(canvas.height - 1, Math.max(0, y)) * canvas.width
            + Math.min(canvas.width - 1, Math.max(0, x))) * 4;
        return colorDistance(pixelIndex, foreground) < colorDistance(pixelIndex, background);
    };
    const finderModule = (row, column) => (
        row === 0 || row === 6 || column === 0 || column === 6
        || (row >= 2 && row <= 4 && column >= 2 && column <= 4)
    );

    let bestSize = 0;
    let bestScore = -1;
    for (let size = 21; size <= 177; size += 4) {
        let score = 0;
        for (const [originRow, originColumn] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
            for (let row = 0; row < 7; row++) {
                for (let column = 0; column < 7; column++) {
                    const x = Math.floor((originColumn + column + 0.5) * canvas.width / size);
                    const y = Math.floor((originRow + row + 0.5) * canvas.height / size);
                    if (pixelIsDark(x, y) === finderModule(row, column)) score++;
                }
            }
        }
        if (score > bestScore) {
            bestSize = size;
            bestScore = score;
        }
    }
    if (bestScore < 132) throw new Error('Could not determine the QR module grid from the canvas.');

    return Array.from({ length: bestSize }, (_, row) =>
        Array.from({ length: bestSize }, (_, column) => {
            const x = Math.floor((column + 0.5) * canvas.width / bestSize);
            const y = Math.floor((row + 0.5) * canvas.height / bestSize);
            return pixelIsDark(x, y);
        })
    );
}

function buildSvgFromMatrix(matrix, fgColor, bgColor) {
    if (!Array.isArray(matrix) || matrix.length === 0
        || matrix.some(row => !Array.isArray(row) || row.length !== matrix.length)) {
        throw new Error('A square QR module matrix is required to build an SVG.');
    }
    const safeColor = (color, fallback) => /^#[0-9A-F]{6}$/i.test(color) ? color : fallback;
    const foreground = safeColor(fgColor, '#000000');
    const background = safeColor(bgColor, '#FFFFFF');
    let path = '';
    matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrix.length} ${matrix.length}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${background}"/><path d="${path}" fill="${foreground}"/></svg>`;
}

function buildAverySheetPdf(qrItems) {
    if (!Array.isArray(qrItems) || qrItems.length === 0) {
        throw new Error('Generate at least one QR code before exporting a label sheet.');
    }

    const pageCount = Math.ceil(qrItems.length / 30);
    const pageContents = [];
    const toRgb = color => {
        const match = /^#([0-9A-F]{6})$/i.exec(color || '');
        const hex = match ? match[1] : '000000';
        return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    };
    const pdfText = value => String(value == null ? '' : value)
        .replace(/[^\x20-\x7E]/g, '?')
        .replace(/[\\()]/g, '\\$&');
    const wrapText = (value, maxCharacters) => {
        const words = String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, '?').split(/\s+/);
        const lines = [];
        let line = '';
        words.forEach(word => {
            while (word.length > maxCharacters) {
                if (line) {
                    lines.push(line);
                    line = '';
                }
                lines.push(word.slice(0, maxCharacters));
                word = word.slice(maxCharacters);
            }
            if (!word) return;
            const candidate = line ? `${line} ${word}` : word;
            if (candidate.length > maxCharacters && line) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        });
        if (line) lines.push(line);
        return lines;
    };

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const commands = ['q'];
        const pageItems = qrItems.slice(pageIndex * 30, (pageIndex + 1) * 30);
        pageItems.forEach((item, index) => {
            const column = index % 3;
            const row = Math.floor(index / 3);
            const labelX = 13.5 + column * 198;
            const labelBottom = 792 - 36 - (row + 1) * 72;
            const [bgR, bgG, bgB] = toRgb(item.bgColor || '#FFFFFF');
            const [fgR, fgG, fgB] = toRgb(item.fgColor || '#000000');
            const matrix = item.matrix || extractQRMatrix(item.canvas);
            const qrSize = 50.4;
            const qrX = labelX + 7.2;
            const qrY = labelBottom + (72 - qrSize) / 2;
            const moduleSize = qrSize / matrix.length;

            commands.push(`${bgR.toFixed(4)} ${bgG.toFixed(4)} ${bgB.toFixed(4)} rg ${labelX.toFixed(2)} ${labelBottom.toFixed(2)} 189 72 re f`);
            commands.push(`${fgR.toFixed(4)} ${fgG.toFixed(4)} ${fgB.toFixed(4)} rg`);
            matrix.forEach((matrixRow, matrixY) => matrixRow.forEach((dark, matrixX) => {
                if (dark) {
                    const x = qrX + matrixX * moduleSize;
                    const y = qrY + (matrix.length - matrixY - 1) * moduleSize;
                    commands.push(`${x.toFixed(3)} ${y.toFixed(3)} ${moduleSize.toFixed(3)} ${moduleSize.toFixed(3)} re f`);
                }
            }));

            const textX = labelX + 64.8;
            const textY = labelBottom + 59;
            const textWidth = labelX + 183 - textX;
            const textLines = [
                ...wrapText(item.label || item.filename || 'QR Code', 30),
                ...wrapText(item.value || '', 30)
            ].slice(0, 7);
            commands.push(`0 0 0 rg q ${textX.toFixed(2)} ${(labelBottom + 5).toFixed(2)} ${textWidth.toFixed(2)} 62 re W n BT /F1 6 Tf ${textX.toFixed(2)} ${textY.toFixed(2)} Td 8 TL`);
            textLines.forEach((line, lineIndex) => {
                if (lineIndex > 0) commands.push('T*');
                commands.push(`(${pdfText(line)}) Tj`);
            });
            commands.push('ET Q');
        });
        commands.push('Q');
        pageContents.push(commands.join('\n'));
    }

    const objects = [];
    const pageObjectIds = pageContents.map((_, index) => 4 + index * 2);
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    pageContents.forEach((content, index) => {
        const pageId = pageObjectIds[index];
        const contentId = pageId + 1;
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
        objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

function sanitizeFilename(name) {
    // Remove illegal filename characters
    return name.replace(/[\\\/:\*\?"<>\|]/g, "_").trim();
}

function setGenerationStatus(message, isError = false) {
    generationStatus.textContent = message;
    generationStatus.classList.toggle('is-error', isError);
}

function setExportButtonsDisabled(disabled) {
    [downloadBtn, svgExportBtn, averyExportBtn].forEach(button => {
        button.disabled = disabled;
        if (disabled) button.setAttribute('disabled', '');
        else button.removeAttribute('disabled');
    });
}

function getNonEmptyLineCount(text) {
    return text.split(/\r?\n/).filter(line => line.trim().length > 0).length;
}

function updateSyncStatus() {
    const urlCount = getNonEmptyLineCount(payloadsInput.value);
    const labelCount = getNonEmptyLineCount(labelsInput.value);
    let alignment = 'Ready';

    if (urlCount > 0 && labelCount === urlCount) alignment = 'Matched';
    else if (urlCount > labelCount) {
        alignment = labelCount === 0 ? 'Labels optional' : `${urlCount - labelCount} fallback label${urlCount - labelCount === 1 ? '' : 's'}`;
    } else if (labelCount > urlCount) alignment = 'Extra labels ignored';

    syncStatus.textContent = `${urlCount} URL${urlCount === 1 ? '' : 's'} | ${labelCount} Label${labelCount === 1 ? '' : 's'} (${alignment})`;
}

function splitSmartPaste(event) {
    const pastedText = event.clipboardData.getData('text');
    const separator = pastedText.includes('\t') ? '\t' : pastedText.includes('|') ? '|' : null;
    if (!separator) return;

    const rows = pastedText.split(/\r?\n/).filter(row => row.trim().length > 0);
    if (rows.length === 0 || rows.some(row => !row.includes(separator))) return;

    event.preventDefault();
    const labels = [];
    const payloads = [];
    rows.forEach(row => {
        const separatorIndex = row.indexOf(separator);
        labels.push(row.slice(0, separatorIndex).trim());
        payloads.push(row.slice(separatorIndex + 1).trim());
    });
    labelsInput.value = labels.join('\n');
    payloadsInput.value = payloads.join('\n');
    updateSyncStatus();
    payloadsInput.focus();
}

[labelsInput, payloadsInput].forEach(input => {
    input.addEventListener('input', updateSyncStatus);
    input.addEventListener('paste', splitSmartPaste);
});

updateSyncStatus();

generateBtn.addEventListener('click', () => {
    const payloadLines = payloadsInput.value.split(/\r?\n/);
    const labelLines = labelsInput.value.split(/\r?\n/);
    const records = payloadLines
        .map((line, index) => ({ value: line.trim(), label: (labelLines[index] || '').trim() }))
        .filter(record => record.value.length > 0);
    
    previewGrid.innerHTML = '';
    generatedQRs = [];
    setExportButtonsDisabled(true);
    setGenerationStatus('');
    
    if (records.length === 0) {
        previewGrid.innerHTML = `
            <div class="empty-state">
                <p>No target URLs or data found.</p>
            </div>
        `;
        countDisplay.textContent = '0';
        setGenerationStatus('Enter at least one URL or data value, then generate QR codes.', true);
        return;
    }
    
    // Enforce 100 limit
    let activeRecords = records;
    if (records.length > 100) {
        alert("Maximum limit of 100 QR codes exceeded. Only the first 100 rows will be processed.");
        activeRecords = records.slice(0, 100);
    }
    
    countDisplay.textContent = '0';
    
    const size = Math.min(1000, Math.max(100, Number.parseInt(qrSizeInput.value, 10) || 300));
    const level = (qrLevelInput.value || 'M').trim().charAt(0).toUpperCase();
    const sanitizedLevel = ['L', 'M', 'Q', 'H'].includes(level) ? level : 'M';
    const fgColor = fgColorInput.value || '#000000';
    const labelPrefix = labelPrefixInput.value || 'qr-';
    
    const filenameCounts = {};

    try {
        activeRecords.forEach((record, index) => {
            const urlPayload = record.value;
            const label = record.label || `${labelPrefix}${index + 1}`;

            const baseFilename = sanitizeFilename(label) || 'qrcode';
            let filename = baseFilename;
            if (filenameCounts[filename]) {
                filenameCounts[filename]++;
                filename = `${baseFilename}-${filenameCounts[filename]}`;
            } else {
                filenameCounts[filename] = 1;
            }

            const card = document.createElement('article');
            card.className = 'qr-card';
            const labelEl = document.createElement('span');
            labelEl.className = 'qr-label';
            labelEl.textContent = label;
            labelEl.title = label;
            card.appendChild(labelEl);

            const imageContainer = document.createElement('div');
            imageContainer.className = 'qr-image-container';
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const qr = qrcode(0, sanitizedLevel);
            qr.addData(urlPayload);
            qr.make();
            const moduleCount = qr.getModuleCount();
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, size, size);
            context.fillStyle = fgColorInput.value || '#000000';
            for (let row = 0; row < moduleCount; row++) {
                const top = Math.floor(row * size / moduleCount);
                const bottom = Math.ceil((row + 1) * size / moduleCount);
                for (let column = 0; column < moduleCount; column++) {
                    if (!qr.isDark(row, column)) continue;
                    const left = Math.floor(column * size / moduleCount);
                    const right = Math.ceil((column + 1) * size / moduleCount);
                    context.fillRect(left, top, right - left, bottom - top);
                }
            }

            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let hasWhite = false;
            let hasNonWhite = false;
            for (let pixel = 0; pixel < pixels.length; pixel += 4) {
                const isWhite = pixels[pixel] === 255 && pixels[pixel + 1] === 255 && pixels[pixel + 2] === 255;
                if (isWhite) hasWhite = true;
                else hasNonWhite = true;
                if (hasWhite && hasNonWhite) break;
            }
            if (!hasWhite || !hasNonWhite) {
                throw new Error('The QR canvas did not render visible modules on a white background. Choose a contrasting foreground color.');
            }
            imageContainer.appendChild(canvas);
            card.appendChild(imageContainer);

            const info = document.createElement('div');
            info.className = 'qr-info';
            const valEl = document.createElement('span');
            valEl.className = 'qr-val';
            valEl.textContent = urlPayload;
            valEl.title = urlPayload;
            info.appendChild(valEl);
            card.appendChild(info);

            const item = {
                label: label,
                value: urlPayload,
                canvas: canvas,
                filename: filename,
                fgColor: fgColor,
                bgColor: '#ffffff'
            };
            const downloadButton = document.createElement('button');
            downloadButton.className = 'qr-download';
            downloadButton.type = 'button';
            downloadButton.textContent = 'Save PNG';
            downloadButton.setAttribute('aria-label', `Save ${label} as PNG`);
            downloadButton.addEventListener('click', () => {
                const downloadLink = document.createElement('a');
                downloadLink.href = canvas.toDataURL('image/png');
                downloadLink.download = `${filename}.png`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                downloadLink.remove();
            });
            card.appendChild(downloadButton);

            generatedQRs.push(item);
            previewGrid.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to generate QR codes.', err);
        generatedQRs = [];
        previewGrid.innerHTML = `
            <div class="empty-state">
                <p>QR code generation failed.</p>
                <span>Check the input and QR settings, then try again.</span>
            </div>
        `;
        countDisplay.textContent = '0';
        setGenerationStatus(`Could not generate the batch: ${err.message || 'Unknown error.'}`, true);
        return;
    }

    countDisplay.textContent = generatedQRs.length.toString();
    if (generatedQRs.length > 0) {
        setExportButtonsDisabled(false);
        setGenerationStatus(`Generated ${generatedQRs.length} QR code${generatedQRs.length === 1 ? '' : 's'}.`);
    } else {
        previewGrid.innerHTML = `
            <div class="empty-state">
                <p>No valid QR values found.</p>
                <span>Add at least one non-empty URL or data line.</span>
            </div>
        `;
        setGenerationStatus('No QR codes were generated. Add a value to each input row and try again.', true);
    }
});

downloadBtn.addEventListener('click', () => {
    if (generatedQRs.length === 0) return;
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
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download Free PNG Zip';
        })
        .catch((err) => {
            console.error("Failed to generate zip file", err);
            setGenerationStatus(`Could not create the PNG ZIP: ${err.message || 'Unknown error.'}`, true);
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download Free PNG Zip';
        });
});

svgExportBtn.addEventListener('click', async () => {
    if (!gateProFeature()) return;
    if (generatedQRs.length === 0) return;
    svgExportBtn.disabled = true;
    svgExportBtn.querySelector('.pro-label').textContent = 'Exporting...';
    try {
        const zip = new JSZip();
        generatedQRs.forEach(item => {
            item.matrix = extractQRMatrix(item.canvas);
            zip.file(`${item.filename}.svg`, buildSvgFromMatrix(item.matrix, item.fgColor, item.bgColor));
        });
        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, 'qrcodes-svg.zip');
    } catch (err) {
        console.error('Failed to export SVG files.', err);
        setGenerationStatus(`Could not export SVG files: ${err.message || 'Unknown error.'}`, true);
    } finally {
        svgExportBtn.disabled = false;
        svgExportBtn.querySelector('.pro-label').textContent = 'Export Vector SVG Zip';
    }
});

averyExportBtn.addEventListener('click', () => {
    if (!gateProFeature()) return;
    if (generatedQRs.length === 0) return;
    try {
        const pdf = buildAverySheetPdf(generatedQRs);
        downloadBlob(pdf, 'qrcodes-avery-5160.pdf');
    } catch (err) {
        console.error('Failed to export Avery PDF.', err);
        setGenerationStatus(`Could not export the Avery sheet: ${err.message || 'Unknown error.'}`, true);
    }
});
