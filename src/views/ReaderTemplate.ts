export function getReaderHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
    :root {
        --font-size: 18px;
        --line-height: 1.8;
        --theme-bg: var(--vscode-editor-background);
        --theme-fg: var(--vscode-editor-foreground);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        background: var(--theme-bg);
        color: var(--theme-fg);
        font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
        font-size: var(--font-size);
        line-height: var(--line-height);
        display: flex;
        height: 100vh;
        overflow: hidden;
    }
    #toc {
        width: 250px; height: 100%;
        background: var(--vscode-sideBar-background, rgba(0,0,0,0.05));
        border-right: 1px solid var(--vscode-panel-border, #ccc);
        overflow-y: auto; transition: transform 0.3s ease; flex-shrink: 0;
    }
    #toc.hidden { transform: translateX(-100%); margin-right: -250px; }
    .toc-item {
        padding: 12px 15px; cursor: pointer; font-size: 14px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        border-bottom: 1px solid rgba(128,128,128,0.1);
    }
    .toc-item:hover { background: var(--vscode-list-hoverBackground); }
    .toc-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    #main { flex: 1; height: 100%; display: flex; flex-direction: column; position: relative; }
    #content {
        flex: 1; padding: 40px 8% 100px 8%; overflow-y: auto;
        word-wrap: break-word; overflow-wrap: break-word;
        max-width: 900px; margin: 0 auto; width: 100%;
    }
    #content p { text-indent: 2em; margin-bottom: 12px; }
    .chapter-title { font-size: 1.5em; font-weight: bold; margin-bottom: 1.5em; text-align: center; text-indent: 0; }
    #toolbar {
        position: absolute; top: 20px; right: 20px; display: flex; gap: 10px;
        background: var(--vscode-editorWidget-background, #252526);
        padding: 8px 12px; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        opacity: 0.2; transition: opacity 0.3s;
    }
    #toolbar:hover { opacity: 1; }
    .btn-icon { background: none; border: none; color: var(--theme-fg); cursor: pointer; font-size: 16px; }
    #settings-panel {
        position: absolute; top: 60px; right: 20px;
        background: var(--vscode-editorWidget-background, #252526);
        padding: 15px; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: none; flex-direction: column; gap: 15px; width: 220px;
        border: 1px solid var(--vscode-panel-border);
    }
    #settings-panel.show { display: flex; }
    .setting-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    input[type="range"] { width: 120px; }
</style>
</head>
<body>
    <div id="toc"></div>
    <div id="main">
        <div id="toolbar">
            <button class="btn-icon" id="toggle-toc" title="目录">📚</button>
            <button class="btn-icon" id="toggle-settings" title="设置">⚙️</button>
        </div>
        <div id="settings-panel">
            <div class="setting-row">
                <span>字体大小</span>
                <input type="range" id="font-size" min="12" max="32" value="18">
            </div>
            <div class="setting-row">
                <span>行间距</span>
                <input type="range" id="line-height" min="1.2" max="3.0" step="0.1" value="1.8">
            </div>
            <div class="setting-row">
                <span>主题</span>
                <button id="theme-toggle" style="padding: 4px 8px; cursor: pointer;">切换</button>
            </div>
        </div>
        <div id="content">正在加载...</div>
    </div>

<script>
    const vscode = acquireVsCodeApi();
    let chapters = [];
    let currentChapterIndex = 0;

    const tocEl = document.getElementById('toc');
    const contentEl = document.getElementById('content');
    const settingsPanel = document.getElementById('settings-panel');

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.type === 'initData') {
            chapters = msg.chapters;
            buildTOC();
            const state = vscode.getState() || {};
            currentChapterIndex = state.chapterIndex || 0;
            if (state.isTocHidden) tocEl.classList.add('hidden');
            loadSettings();
            renderChapter(currentChapterIndex);
        }
    });

    function buildTOC() {
        tocEl.innerHTML = '';
        chapters.forEach((ch, i) => {
            const div = document.createElement('div');
            div.className = 'toc-item' + (i === currentChapterIndex ? ' active' : '');
            div.textContent = ch.title;
            div.onclick = () => renderChapter(i);
            tocEl.appendChild(div);
        });
    }

    function renderChapter(index) {
        if (index < 0 || index >= chapters.length) return;
        currentChapterIndex = index;
        
        document.querySelectorAll('.toc-item').forEach((el, i) => {
            el.classList.toggle('active', i === index);
        });

        const ch = chapters[index];
        
        // 🔥 注意：保留了这个 \\n 的转义
        const paragraphs = ch.content.split('\\n')
                                      .map(p => p.trim())
                                      .filter(p => p.length > 0);
                                      
        const paragraphsHtml = paragraphs.map(p => '<p>' + escapeHTML(p) + '</p>').join('');
        contentEl.innerHTML = '<div class="chapter-title">' + escapeHTML(ch.title) + '</div>' + paragraphsHtml;
        contentEl.scrollTop = 0;
        saveState();
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    }

    document.getElementById('toggle-toc').onclick = () => { tocEl.classList.toggle('hidden'); saveState(); };
    document.getElementById('toggle-settings').onclick = () => { settingsPanel.classList.toggle('show'); };

    const fontSizeSlider = document.getElementById('font-size');
    const lineHeightSlider = document.getElementById('line-height');

    fontSizeSlider.oninput = (e) => { document.documentElement.style.setProperty('--font-size', e.target.value + 'px'); saveSettings(); };
    lineHeightSlider.oninput = (e) => { document.documentElement.style.setProperty('--line-height', e.target.value); saveSettings(); };

    let isSepia = false;
    document.getElementById('theme-toggle').onclick = () => {
        isSepia = !isSepia;
        if (isSepia) {
            document.documentElement.style.setProperty('--theme-bg', '#f4ecd8');
            document.documentElement.style.setProperty('--theme-fg', '#5b4636');
        } else {
            document.documentElement.style.setProperty('--theme-bg', 'var(--vscode-editor-background)');
            document.documentElement.style.setProperty('--theme-fg', 'var(--vscode-editor-foreground)');
        }
        localStorage.setItem('vr-sepia', isSepia);
    };

    function saveState() { vscode.setState({ chapterIndex: currentChapterIndex, isTocHidden: tocEl.classList.contains('hidden') }); }
    function saveSettings() {
        localStorage.setItem('vr-fontSize', fontSizeSlider.value);
        localStorage.setItem('vr-lineHeight', lineHeightSlider.value);
    }

    function loadSettings() {
        const fs = localStorage.getItem('vr-fontSize');
        const lh = localStorage.getItem('vr-lineHeight');
        const sepia = localStorage.getItem('vr-sepia') === 'true';
        if (fs) { fontSizeSlider.value = fs; document.documentElement.style.setProperty('--font-size', fs + 'px'); }
        if (lh) { lineHeightSlider.value = lh; document.documentElement.style.setProperty('--line-height', lh); }
        if (sepia) { document.getElementById('theme-toggle').click(); }
    }
    
    // ================= 状态与设置（与后端通信） =================
    function saveState() {
        vscode.postMessage({ 
            type: 'saveData', 
            key: 'vr-reader-state', 
            value: { chapterIndex: currentChapterIndex, isTocHidden: tocEl.classList.contains('hidden') } 
        });
    }

    function saveSettings() {
        vscode.postMessage({ 
            type: 'saveData', 
            key: 'vr-reader-settings', 
            value: { 
                fontSize: fontSizeSlider.value, 
                lineHeight: lineHeightSlider.value, 
                isSepia: isSepia 
            } 
        });
    }

    // 当收到后端发来的初始化数据时，恢复设置
    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.type === 'initData') {
            // ... 原本的章节渲染逻辑
            
            // 1. 恢复排版设置
            if (msg.settings) {
                if (msg.settings.fontSize) { 
                    fontSizeSlider.value = msg.settings.fontSize; 
                    document.documentElement.style.setProperty('--font-size', msg.settings.fontSize + 'px'); 
                }
                if (msg.settings.lineHeight) { 
                    lineHeightSlider.value = msg.settings.lineHeight; 
                    document.documentElement.style.setProperty('--line-height', msg.settings.lineHeight); 
                }
                if (msg.settings.isSepia) {
                    isSepia = true;
                    document.documentElement.style.setProperty('--theme-bg', '#f4ecd8');
                    document.documentElement.style.setProperty('--theme-fg', '#5b4636');
                }
            }

            // 2. 恢复阅读进度
            if (msg.state && msg.state.chapterIndex !== undefined) {
                currentChapterIndex = msg.state.chapterIndex;
                if (msg.state.isTocHidden) tocEl.classList.add('hidden');
            }
            
            renderChapter(currentChapterIndex);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' && currentChapterIndex < chapters.length - 1) renderChapter(currentChapterIndex + 1);
        else if (e.key === 'ArrowLeft' && currentChapterIndex > 0) renderChapter(currentChapterIndex - 1);
    });

    vscode.postMessage({ type: 'ready' });

</script>
</body>
</html>`;
}