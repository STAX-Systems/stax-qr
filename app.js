const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('download-zip');
const batchGrid = document.getElementById('batch-grid');
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
const validationModeInput = document.getElementById('validationMode');
const fgColorInput = document.getElementById('fgColor');
const fgColorTextInput = document.getElementById('fgColorText');
const bgColorInput = document.getElementById('bgColor');
const bgColorTextInput = document.getElementById('bgColorText');
const logoUploadInput = document.getElementById('logo-upload');
const logoPreview = document.getElementById('logoPreview');
const logoThumbnail = document.getElementById('logoThumbnail');
const qrLevelHelper = document.querySelector('label[for="qrLevel"]');
const rawPasteModal = document.getElementById('rawPasteModal');
const rawPasteInput = document.getElementById('rawPasteInput');

let generatedQRs = [];
let logoImage = null;
let logoDataUrl = '';
let previousQrLevel = qrLevelInput.value;
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

function buildSvgFromMatrix(matrix, fgColor, bgColor, logo) {
    if (!Array.isArray(matrix) || matrix.length === 0
        || matrix.some(row => !Array.isArray(row) || row.length !== matrix.length)) {
        throw new Error('A square QR module matrix is required to build an SVG.');
    }
    const safeColor = (color, fallback) => /^#[0-9A-F]{6}$/i.test(color) ? color : fallback;
    const foreground = safeColor(fgColor, '#000000');
    const background = safeColor(bgColor, '#FFFFFF');
    let path = '';
    matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    }));
    const logoMarkup = logo ? (() => {
        const side = matrix.length * 0.2;
        const inset = Math.max(0.5, logo.insetModules || 0.5);
        const origin = (matrix.length + 8 - side) / 2;
        const borderColor = colorLuminance(background) > 0.5 ? '#000000' : '#FFFFFF';
        return `<rect x="${origin}" y="${origin}" width="${side}" height="${side}" fill="${background}"/><rect x="${origin + inset / 2}" y="${origin + inset / 2}" width="${side - inset}" height="${side - inset}" fill="none" stroke="${borderColor}" stroke-width="${Math.max(0.35, inset / 4)}"/><image x="${origin + inset}" y="${origin + inset}" width="${side - inset * 2}" height="${side - inset * 2}" href="${logo.dataUrl}" preserveAspectRatio="xMidYMid meet"/>`;
    })() : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrix.length + 8} ${matrix.length + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${background}"/><path d="${path}" fill="${foreground}"/>${logoMarkup}</svg>`;
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
            const totalModules = matrix.length + 8;
            const moduleSize = qrSize / totalModules;
            const maskModules = matrix.length * 0.2;
            const maskStart = (matrix.length - maskModules) / 2;

            commands.push(`${bgR.toFixed(4)} ${bgG.toFixed(4)} ${bgB.toFixed(4)} rg ${labelX.toFixed(2)} ${labelBottom.toFixed(2)} 189 72 re f`);
            commands.push(`${fgR.toFixed(4)} ${fgG.toFixed(4)} ${fgB.toFixed(4)} rg`);
            matrix.forEach((matrixRow, matrixY) => matrixRow.forEach((dark, matrixX) => {
                const underLogo = item.logo && matrixX >= maskStart && matrixX < maskStart + maskModules
                    && matrixY >= maskStart && matrixY < maskStart + maskModules;
                if (dark && !underLogo) {
                    const x = qrX + (matrixX + 4) * moduleSize;
                    const y = qrY + (matrix.length + 3 - matrixY) * moduleSize;
                    commands.push(`${x.toFixed(3)} ${y.toFixed(3)} ${moduleSize.toFixed(3)} ${moduleSize.toFixed(3)} re f`);
                }
            }));
            if (item.logo) {
                const maskSize = matrix.length * moduleSize * 0.2;
                const maskX = qrX + (qrSize - maskSize) / 2;
                const maskY = qrY + (qrSize - maskSize) / 2;
                commands.push(`q ${maskSize.toFixed(3)} 0 0 ${maskSize.toFixed(3)} ${maskX.toFixed(3)} ${maskY.toFixed(3)} cm BI /W 48 /H 48 /CS /RGB /BPC 8 /F /ASCIIHexDecode ID\n${item.logo.pdfRgbHex}\n> EI Q`);
            }

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

function colorLuminance(hexColor) {
    const match = /^#([0-9A-F]{6})$/i.exec(hexColor || '');
    if (!match) return 1;
    const channels = [0, 2, 4].map(index => parseInt(match[1].slice(index, index + 2), 16) / 255);
    const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function drawContainedImage(context, image, x, y, width, height) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawCenterLogo(context, size, image, background, matrixRatio = 1) {
    if (!image) return;
    const matrixSize = size * matrixRatio;
    const matrixOrigin = (size - matrixSize) / 2;
    const side = matrixSize * 0.2;
    const origin = matrixOrigin + (matrixSize - side) / 2;
    const borderColor = colorLuminance(background) > 0.5 ? '#000000' : '#FFFFFF';
    context.fillStyle = background;
    context.fillRect(origin, origin, side, side);
    context.strokeStyle = borderColor;
    context.lineWidth = Math.max(1, size / 300);
    context.strokeRect(origin + context.lineWidth / 2, origin + context.lineWidth / 2, side - context.lineWidth, side - context.lineWidth);
    const inset = Math.max(4, size * 0.0133);
    drawContainedImage(context, image, origin + inset, origin + inset, side - inset * 2, side - inset * 2);
}

function buildLogoPdfRgbHex(image, background) {
    const artwork = document.createElement('canvas');
    artwork.width = 48;
    artwork.height = 48;
    const context = artwork.getContext('2d', { willReadFrequently: true });
    context.fillStyle = background;
    context.fillRect(0, 0, 48, 48);
    context.strokeStyle = colorLuminance(background) > 0.5 ? '#000000' : '#FFFFFF';
    context.lineWidth = 2;
    context.strokeRect(2, 2, 44, 44);
    drawContainedImage(context, image, 8, 8, 32, 32);
    const pixels = context.getImageData(0, 0, 48, 48).data;
    let hex = '';
    for (let index = 0; index < pixels.length; index += 4) {
        hex += [pixels[index], pixels[index + 1], pixels[index + 2]]
            .map(channel => channel.toString(16).padStart(2, '0')).join('');
    }
    return hex.toUpperCase();
}

function syncColors(picker, text) {
    picker.addEventListener('input', (e) => {
        text.value = e.target.value.toUpperCase();
        invalidateGeneratedOutput();
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
        invalidateGeneratedOutput();
    });
}

syncColors(fgColorInput, fgColorTextInput);
syncColors(bgColorInput, bgColorTextInput);
qrSizeInput.addEventListener('change', invalidateGeneratedOutput);
qrLevelInput.addEventListener('change', invalidateGeneratedOutput);

qrLevelInput.addEventListener('change', () => {
    if (!logoImage) previousQrLevel = qrLevelInput.value;
});

logoUploadInput.addEventListener('change', () => {
    const file = logoUploadInput.files && logoUploadInput.files[0];
    if (!file) return;
    const extensionAllowed = /\.(png|svg|webp)$/i.test(file.name);
    if (!extensionAllowed || file.size > 10 * 1024 * 1024) {
        setGenerationStatus('Choose a PNG, SVG, or WEBP logo smaller than 10 MB.', true);
        logoUploadInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
        setGenerationStatus('The selected logo could not be read.', true);
        logoUploadInput.value = '';
    };
    reader.onload = () => {
        const image = new Image();
        image.onerror = () => {
            setGenerationStatus('The selected file is not a supported image.', true);
            logoUploadInput.value = '';
        };
        image.onload = () => {
            const normalized = document.createElement('canvas');
            const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
            normalized.width = Math.max(1, Math.round(image.naturalWidth * scale));
            normalized.height = Math.max(1, Math.round(image.naturalHeight * scale));
            try {
                normalized.getContext('2d').drawImage(image, 0, 0, normalized.width, normalized.height);
                logoImage = image;
                logoDataUrl = normalized.toDataURL('image/png');
                logoThumbnail.src = logoDataUrl;
                logoPreview.hidden = false;
                invalidateGeneratedOutput();
                previousQrLevel = qrLevelInput.value;
                qrLevelInput.value = 'H';
                qrLevelInput.disabled = true;
                qrLevelHelper.textContent = 'Error correction (locked to H for logo)';
                setGenerationStatus('Center logo loaded. Error correction is locked to H.');
            } catch (err) {
                console.error('The selected logo could not be prepared for export.', err);
                setGenerationStatus('The selected logo cannot be embedded. Choose a local PNG, SVG, or WEBP image.', true);
                logoUploadInput.value = '';
            }
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('removeLogoBtn').addEventListener('click', () => {
    invalidateGeneratedOutput();
    logoImage = null;
    logoDataUrl = '';
    logoUploadInput.value = '';
    logoThumbnail.removeAttribute('src');
    logoPreview.hidden = true;
    qrLevelInput.disabled = false;
    qrLevelInput.value = previousQrLevel;
    qrLevelHelper.textContent = 'Error correction';
    setGenerationStatus('Center logo removed.');
});

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

function getBatchRows() {
    return Array.from(batchGrid.querySelectorAll('tr'));
}

function getRowInputs(row) {
    return {
        label: row.querySelector('.row-label'),
        payload: row.querySelector('.row-payload')
    };
}

function validatePayload(value, mode) {
    const payload = value.trim();
    if (!payload) return { valid: false, empty: true, message: 'Empty' };
    if (mode === 'raw') return { valid: true, message: 'Valid' };

    if (mode === 'permissive') {
        if (/^mailto:[^\s@]+@[^\s@]+(?:\?[^\s]*)?$/i.test(payload)) return { valid: true, message: 'Valid' };
        if (/^tel:\+?[0-9(). -]{3,}$/i.test(payload)) return { valid: true, message: 'Valid' };
        if (/^WIFI:/i.test(payload)) {
            const fields = payload.slice(5).split(';').filter(Boolean);
            const ssid = fields.find(field => /^S:/i.test(field));
            const security = fields.find(field => /^T:/i.test(field));
            const password = fields.find(field => /^P:/i.test(field));
            if (ssid && /^S:.+/i.test(ssid) && security
                && /^T:(?:nopass|WEP|WPA|WPA2|WPA3)$/i.test(security)
                && (/^T:nopass$/i.test(security) || (password && /^P:.+/i.test(password)))) {
                return { valid: true, message: 'Valid' };
            }
            return { valid: false, message: 'Invalid WIFI payload' };
        }
    }

    try {
        const url = new URL(payload);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return { valid: true, message: 'Valid' };
        }
        if (mode === 'permissive' && ['mailto:', 'tel:'].includes(url.protocol)) {
            return { valid: true, message: 'Valid' };
        }
        return { valid: false, message: mode === 'strict' ? 'HTTP(S) only' : 'Unsupported URL scheme' };
    } catch {
        return {
            valid: false,
            message: /^[a-z][a-z\d+.-]*:/i.test(payload) ? 'Invalid URL' : 'Missing protocol'
        };
    }
}

function updateRowValidation(row) {
    const payloadInput = row.querySelector('.row-payload');
    const status = row.querySelector('.row-status');
    const result = validatePayload(payloadInput.value, validationModeInput.value);
    row.classList.toggle('is-invalid', !result.empty && !result.valid);
    status.classList.toggle('is-valid', result.valid);
    status.classList.toggle('is-invalid', !result.empty && !result.valid);
    status.textContent = result.valid ? '✓ Valid' : result.message;
    status.title = result.message;
    return result;
}

function updateBatchState() {
    const rows = getBatchRows();
    let readyCount = 0;
    let invalidCount = 0;
    rows.forEach((row, index) => {
        row.querySelector('.row-index').textContent = String(index + 1);
        const result = updateRowValidation(row);
        if (row.querySelector('.row-payload').value.trim()) {
            if (result.valid) readyCount++;
            else invalidCount++;
        }
    });
    syncStatus.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} · ${readyCount} ready${invalidCount ? ` · ${invalidCount} invalid` : ''}`;
    generateBtn.disabled = validationModeInput.value === 'strict' && invalidCount > 0;
    if (validationModeInput.value === 'strict' && invalidCount > 0) {
        setGenerationStatus(`Fix ${invalidCount} invalid payload${invalidCount === 1 ? '' : 's'} before generating.`, true);
    } else if (generationStatus.classList.contains('is-error') && /invalid payload/i.test(generationStatus.textContent)) {
        setGenerationStatus('');
    }
}

function invalidateGeneratedOutput() {
    if (generatedQRs.length === 0) return;
    generatedQRs = [];
    countDisplay.textContent = '0';
    setExportButtonsDisabled(true);
    previewGrid.innerHTML = '<div class="empty-state"><p>Batch updated</p><span>Generate again to refresh the QR codes.</span></div>';
}

function addBatchRow(label = '', payload = '', focusField = '') {
    const row = document.createElement('tr');
    const indexCell = document.createElement('td');
    indexCell.className = 'row-index';
    const labelCell = document.createElement('td');
    const labelInput = document.createElement('input');
    labelInput.className = 'row-label';
    labelInput.type = 'text';
    labelInput.autocomplete = 'off';
    labelInput.setAttribute('aria-label', 'Row label');
    labelInput.placeholder = 'Optional label';
    labelInput.value = label;
    labelCell.appendChild(labelInput);
    const payloadCell = document.createElement('td');
    const payloadInput = document.createElement('input');
    payloadInput.className = 'row-payload';
    payloadInput.type = 'text';
    payloadInput.autocomplete = 'off';
    payloadInput.spellcheck = false;
    payloadInput.setAttribute('aria-label', 'URL or payload');
    payloadInput.placeholder = 'https://example.com';
    payloadInput.value = payload;
    payloadCell.appendChild(payloadInput);
    const statusCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = 'row-status';
    statusCell.appendChild(status);
    const removeCell = document.createElement('td');
    const removeButton = document.createElement('button');
    removeButton.className = 'row-del';
    removeButton.type = 'button';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', 'Remove row');
    removeCell.appendChild(removeButton);
    row.append(indexCell, labelCell, payloadCell, statusCell, removeCell);
    batchGrid.appendChild(row);

    [labelInput, payloadInput].forEach(input => {
        input.addEventListener('input', () => {
            invalidateGeneratedOutput();
            updateBatchState();
        });
        input.addEventListener('keydown', event => {
            const fieldClass = input.classList.contains('row-label') ? '.row-label' : '.row-payload';
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                const rows = getBatchRows();
                const rowIndex = rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1);
                const next = rows[rowIndex];
                if (next) {
                    event.preventDefault();
                    next.querySelector(fieldClass).focus();
                }
            } else if (input === payloadInput && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
                event.preventDefault();
                const next = addBatchRow('', '', 'label');
                next.querySelector('.row-label').focus();
            }
        });
        input.addEventListener('paste', event => {
            const text = event.clipboardData.getData('text');
            if (!/[\r\n\t|,]/.test(text)) return;
            event.preventDefault();
            const startIndex = getBatchRows().indexOf(row);
            writePastedRows(parsePastedRows(text, input === payloadInput ? 'payload' : 'label'), startIndex);
        });
    });
    removeButton.addEventListener('click', () => {
        invalidateGeneratedOutput();
        row.remove();
        if (getBatchRows().length === 0) addBatchRow();
        updateBatchState();
    });
    updateBatchState();
    if (focusField === 'label') labelInput.focus();
    else if (focusField === 'payload') payloadInput.focus();
    return row;
}

function detectPasteDelimiter(text, activeField) {
    if (text.includes('\t')) return '\t';
    if (text.includes('|')) return '|';
    if (text.includes(',')) {
        const rows = text.split(/\r?\n/).filter(row => row.trim());
        const looksLikeOneColumnUrls = activeField === 'payload' && rows.every(row => {
            const comma = row.indexOf(',');
            const protocol = row.indexOf('://');
            return comma >= 0 && protocol >= 0 && protocol < comma;
        });
        if (!looksLikeOneColumnUrls) return ',';
    }
    return '';
}

function parsePastedRows(text, activeField) {
    const delimiter = detectPasteDelimiter(text, activeField);
    const records = [];
    let cells = [];
    let value = '';
    let quoted = false;
    const pushCell = () => {
        cells.push(value.trim());
        value = '';
    };
    const pushRow = () => {
        pushCell();
        if (cells.some(cell => cell.length)) {
            if (cells.length > 1) records.push({ label: cells[0], payload: cells.slice(1).join(delimiter || '') });
            else records.push({ label: activeField === 'label' ? cells[0] : '', payload: activeField === 'payload' ? cells[0] : '' });
        }
        cells = [];
    };
    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '"') {
            if (quoted && text[index + 1] === '"') {
                value += '"';
                index++;
            } else {
                quoted = !quoted;
            }
        } else if (!quoted && delimiter && character === delimiter) {
            pushCell();
        } else if (!quoted && (character === '\n' || character === '\r')) {
            if (character === '\r' && text[index + 1] === '\n') index++;
            pushRow();
        } else {
            value += character;
        }
    }
    if (value.length || cells.length) pushRow();
    return records;
}

function writePastedRows(records, startIndex) {
    if (!records.length) return;
    invalidateGeneratedOutput();
    let rows = getBatchRows();
    while (rows.length < startIndex + records.length) {
        addBatchRow();
        rows = getBatchRows();
    }
    records.forEach((record, index) => {
        const inputs = getRowInputs(rows[startIndex + index]);
        inputs.label.value = record.label;
        inputs.payload.value = record.payload;
    });
    updateBatchState();
}

function applyAutoLabels() {
    const prefix = document.getElementById('autoLabelPrefix').value;
    const start = Math.max(0, Number.parseInt(document.getElementById('autoLabelStart').value, 10) || 0);
    const padding = Math.min(12, Math.max(0, Number.parseInt(document.getElementById('autoLabelPadding').value, 10) || 0));
    invalidateGeneratedOutput();
    getBatchRows().forEach((row, index) => {
        row.querySelector('.row-label').value = `${prefix}${String(start + index).padStart(padding, '0')}`;
    });
    updateBatchState();
}

document.getElementById('applyLabelsBtn').addEventListener('click', applyAutoLabels);
document.getElementById('clearEmptyRowsBtn').addEventListener('click', () => {
    invalidateGeneratedOutput();
    getBatchRows().forEach(row => {
        const inputs = getRowInputs(row);
        if (!inputs.label.value.trim() && !inputs.payload.value.trim()) row.remove();
    });
    if (getBatchRows().length === 0) addBatchRow();
    updateBatchState();
});
document.getElementById('addRowBtn').addEventListener('click', () => addBatchRow('', '', 'label'));
validationModeInput.addEventListener('change', updateBatchState);

function openRawPaste() {
    rawPasteModal.hidden = false;
    rawPasteModal.classList.add('active');
    rawPasteInput.focus();
}

function closeRawPaste() {
    rawPasteModal.hidden = true;
    rawPasteModal.classList.remove('active');
}

document.getElementById('rawPasteBtn').addEventListener('click', openRawPaste);
document.getElementById('closeRawPasteBtn').addEventListener('click', closeRawPaste);
document.getElementById('cancelRawPasteBtn').addEventListener('click', closeRawPaste);
document.getElementById('parseRawPasteBtn').addEventListener('click', () => {
    const records = parsePastedRows(rawPasteInput.value, 'payload');
    if (records.length === 0) {
        setGenerationStatus('Paste one or more values before adding them to the grid.', true);
        return;
    }
    writePastedRows(records, getBatchRows().length);
    rawPasteInput.value = '';
    closeRawPaste();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !rawPasteModal.hidden) closeRawPaste();
});

addBatchRow();

generateBtn.addEventListener('click', () => {
    updateBatchState();
    const rows = getBatchRows();
    const records = rows.map(row => {
        const inputs = getRowInputs(row);
        return { value: inputs.payload.value.trim(), label: inputs.label.value.trim() };
    }).filter(record => record.value.length > 0);
    const invalidRecords = records.filter(record => !validatePayload(record.value, validationModeInput.value).valid);
    
    previewGrid.innerHTML = '';
    generatedQRs = [];
    setExportButtonsDisabled(true);
    setGenerationStatus('');

    if (validationModeInput.value === 'strict' && invalidRecords.length > 0) {
        setGenerationStatus(`Fix ${invalidRecords.length} invalid payload${invalidRecords.length === 1 ? '' : 's'} before generating.`, true);
        return;
    }
    
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
    const level = logoImage ? 'H' : (qrLevelInput.value || 'M').trim().charAt(0).toUpperCase();
    const sanitizedLevel = ['L', 'M', 'Q', 'H'].includes(level) ? level : 'M';
    const fgColor = fgColorInput.value || '#000000';
    const bgColor = bgColorInput.value || '#FFFFFF';
    
    const filenameCounts = {};

    try {
        activeRecords.forEach((record, index) => {
            const urlPayload = record.value;
            const label = record.label || `qr-${index + 1}`;

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
            const totalModules = moduleCount + 8;
            const modulePixels = size / totalModules;
            context.fillStyle = bgColor;
            context.fillRect(0, 0, size, size);
            context.fillStyle = fgColor;
            const matrix = [];
            for (let row = 0; row < moduleCount; row++) {
                const top = Math.floor((row + 4) * modulePixels);
                const bottom = Math.ceil((row + 5) * modulePixels);
                const matrixRow = [];
                for (let column = 0; column < moduleCount; column++) {
                    const dark = qr.isDark(row, column);
                    matrixRow.push(dark);
                    if (!dark) continue;
                    const left = Math.floor((column + 4) * modulePixels);
                    const right = Math.ceil((column + 5) * modulePixels);
                    context.fillRect(left, top, right - left, bottom - top);
                }
                matrix.push(matrixRow);
            }
            if (logoImage) drawCenterLogo(context, size, logoImage, bgColor, moduleCount / totalModules);

            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const backgroundRgb = [1, 3, 5].map(index => parseInt(bgColor.slice(index, index + 2), 16));
            let hasBackground = false;
            let hasForeground = false;
            for (let pixel = 0; pixel < pixels.length; pixel += 4) {
                const matchesBackground = pixels[pixel] === backgroundRgb[0]
                    && pixels[pixel + 1] === backgroundRgb[1] && pixels[pixel + 2] === backgroundRgb[2];
                if (matchesBackground) hasBackground = true;
                else hasForeground = true;
                if (hasBackground && hasForeground) break;
            }
            if (!hasBackground || !hasForeground) {
                throw new Error('The QR canvas did not render visible modules. Choose contrasting foreground and background colors.');
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

            const logo = logoImage ? {
                dataUrl: logoDataUrl,
                insetModules: 4 * totalModules / size,
                pdfRgbHex: buildLogoPdfRgbHex(logoImage, bgColor)
            } : null;
            const item = {
                label: label,
                value: urlPayload,
                canvas: canvas,
                filename: filename,
                fgColor: fgColor,
                bgColor: bgColor,
                matrix: matrix,
                logo: logo
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
            zip.file(`${item.filename}.svg`, buildSvgFromMatrix(item.matrix, item.fgColor, item.bgColor, item.logo));
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
