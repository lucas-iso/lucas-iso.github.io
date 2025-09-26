function removeIgnoredFields(obj) {
    if (Array.isArray(obj)) {
        return obj.map(removeIgnoredFields);
    } else if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            if (key === 'report_id' || key === 'purchase_order_id') continue;
            newObj[key] = removeIgnoredFields(obj[key]);
        }
        return newObj;
    }
    return obj;
}

function removeNullFields(obj) {
    if (Array.isArray(obj)) {
        return obj.map(removeNullFields);
    } else if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            if (obj[key] === null) continue;
            newObj[key] = removeNullFields(obj[key]);
        }
        return newObj;
    }
    return obj;
}

function processJsonInput(input, removeNull = false) {
    // Remove .000Z or .000Z?
    let text = input.replace(/\.000Z?/g, '');
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error('Invalid JSON!');
    }
    json = removeIgnoredFields(json);
    if (removeNull) {
        json = removeNullFields(json);
    }
    return JSON.stringify(json, null, 4);
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        return navigator.clipboard.writeText(text);
    } else {
        // fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return Promise.resolve();
    }
}

// Monaco loader
window.require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

let monacoETL, monacoMulesoft, monacoDiff;

function isEmpty(value) {
    return value == null || value.trim() == ""
}

function updateEditors() {
    const etlText = document.getElementById('etl').value;
    let etlIsEmpty = isEmpty(etlText)
    const mulesoftText = document.getElementById('mulesoft').value;
    let mulesoftIsEmpty = isEmpty(mulesoftText)

    if (etlIsEmpty && mulesoftIsEmpty) return

    let etlJson = '', mulesoftJson = '';
    let etlLines = [], mulesoftLines = [];
    if (!etlIsEmpty) {
        try {
            etlJson = processJsonInput(etlText, true);
            etlLines = etlJson.split('\n');
            if (monacoETL) monacoETL.setValue(etlLines.join("\n"));
        } catch (e) {
            etlJson = '// Invalid ETL JSON';
            etlLines = [etlJson];
        }
    }
    if (!mulesoftIsEmpty) {
        try {
            mulesoftJson = processJsonInput(mulesoftText, true);
            mulesoftLines = mulesoftJson.split('\n');
            if (monacoMulesoft) monacoMulesoft.setValue(mulesoftLines.join("\n"));
        } catch (e) {
            mulesoftJson = '// Invalid Mulesoft JSON';
            mulesoftLines = [mulesoftJson];
        }
    }
    if (etlIsEmpty || mulesoftIsEmpty) {
        document.getElementById('equal-label').style.display = 'none';
        return;
    }
    // Destacar diferenças
    const maxLen = Math.max(etlLines.length, mulesoftLines.length);
    let etlOut = '', mulesoftOut = '';
    let allEqual = true;
    for (let i = 0; i < maxLen; i++) {
        const l = etlLines[i] || '';
        const r = mulesoftLines[i] || '';
        if (l.trim() === r.trim()) {
            etlOut += l + '\n';
            mulesoftOut += r + '\n';
        } else {
            etlOut += '/*diff*/' + l + '\n';
            mulesoftOut += '/*diff*/' + r + '\n';
            allEqual = false;
        }
    }
    // Exibe ou esconde o label de igualdade
    const label = document.getElementById('equal-label');
    if (allEqual && etlLines.length > 0 && mulesoftLines.length > 0) {
    label.textContent = 'The compared JSONs are identical!';
        label.style.display = 'block';
    } else {
        label.style.display = 'none';
    }
    if (etlJson && mulesoftJson && etlJson[0] !== '/' && mulesoftJson[0] !== '/') {
        showDiff(etlJson, mulesoftJson);
    } else if (monacoDiff) {
        monacoDiff.setValue('// Fix the JSONs to see the differences');
    }
    // Adiciona decoração para linhas diferentes
    setTimeout(() => {
        highlightDiffLines(monacoETL, etlOut);
        highlightDiffLines(monacoMulesoft, mulesoftOut);
    }, 100);
}
function highlightDiffLines(editor, text) {
    if (!editor) return;
    const lines = text.split('\n');
    const decorations = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('/*diff*/')) {
            decorations.push({
                range: new monaco.Range(i + 1, 1, i + 1, lines[i].length + 1),
                options: {
                    inlineClassName: 'diff-strong'
                }
            });
        }
    }
    editor.deltaDecorations([], decorations);
}

function showDiff(left, right) {
    // Gera um diff simples linha a linha, destacando valores diferentes
    const leftLines = left.split('\n');
    const rightLines = right.split('\n');
    let diff = '';
    const maxLen = Math.max(leftLines.length, rightLines.length);
    for (let i = 0; i < maxLen; i++) {
        const l = leftLines[i] || '';
        const r = rightLines[i] || '';
        if (l === r) {
            diff += l + '\n';
        } else {
            diff += `%c${l}\n%c${r}\n`;
        }
    }
    // Para o Monaco, vamos usar uma sintaxe visual: linhas diferentes em vermelho forte
    let result = '';
    for (let i = 0; i < maxLen; i++) {
        const l = leftLines[i] || '';
        const r = rightLines[i] || '';
        if (l === r) {
            result += l + '\n';
        } else {
            result += `// ETL: ${l}\n// Mulesoft: ` + '%DIFF%' + r + '\n';
        }
    }
    // Substitui marcador por span para destacar
    result = result.replace(/%DIFF%(.+)/g, '<span class="diff-strong">$1</span>');
    if (monacoDiff) monacoDiff.setValue(result);
}


function setFontSizeAll(fontSize) {
    // Inputs
    document.getElementById('etl').style.fontSize = fontSize + 'px';
    document.getElementById('mulesoft').style.fontSize = fontSize + 'px';
    // Monaco
    if (monacoETL) monacoETL.updateOptions({ fontSize });
    if (monacoMulesoft) monacoMulesoft.updateOptions({ fontSize });
    if (monacoDiff) monacoDiff.updateOptions({ fontSize });
}

function formatTextareaJson(textarea) {
    try {
        const val = textarea.value;
        if (!val.trim()) return;
        const obj = JSON.parse(val);
        textarea.value = JSON.stringify(obj, null, 4);
    } catch (e) {
        // do nothing if invalid
    }
}

window.require(['vs/editor/editor.main'], function () {
    // Font size from localStorage or default
    let fontSize = parseFloat(localStorage.getItem('monacoFontSize')) || 12.1;
    const monacoOptions = {
        value: '',
        language: 'json',
        readOnly: true,
        theme: 'vs-dark',
        fontSize: fontSize,
        minimap: { enabled: false }
    };
    monacoETL = monaco.editor.create(document.getElementById('monaco-etl'), monacoOptions);
    monacoMulesoft = monaco.editor.create(document.getElementById('monaco-mulesoft'), monacoOptions);
    // monacoDiff = monaco.editor.create(document.getElementById('monaco-diff'), monacoOptions);
    document.getElementById('etl').addEventListener('input', updateEditors);
    document.getElementById('mulesoft').addEventListener('input', updateEditors);
    // Format JSON on blur for both textareas
    document.getElementById('etl').addEventListener('blur', function() {
        formatTextareaJson(this);
    });
    document.getElementById('mulesoft').addEventListener('blur', function() {
        formatTextareaJson(this);
    });
    // Slider setup
    const slider = document.getElementById('font-size-slider');
    const valueSpan = document.getElementById('font-size-value');
    slider.value = fontSize;
    valueSpan.textContent = fontSize + 'px';
    setFontSizeAll(fontSize);
    slider.addEventListener('input', function() {
        const val = parseFloat(this.value);
        valueSpan.textContent = val + 'px';
        setFontSizeAll(val);
        localStorage.setItem('monacoFontSize', val);
    });
});

// Adiciona destaque visual para diferenças (CSS dinâmico)
const style = document.createElement('style');
style.innerHTML = `.diff-strong { color: #ff1744; font-weight: bold; background: #fff3f3; }`;
document.head.appendChild(style);
