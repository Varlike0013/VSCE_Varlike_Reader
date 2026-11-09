import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class JsonReaderPanel {
    public static currentPanel: JsonReaderPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _jsonData: any = null;
    private _fileName: string = '';

    public static createOrShow(extensionUri: vscode.Uri, filePath: string) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (JsonReaderPanel.currentPanel) {
            JsonReaderPanel.currentPanel._panel.reveal(column);
            JsonReaderPanel.currentPanel.loadFile(filePath);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'varlikereader.jsonReader',
            `JSON 阅读器: ${path.basename(filePath)}`,
            column || vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        JsonReaderPanel.currentPanel = new JsonReaderPanel(panel, extensionUri, filePath);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, filePath: string) {
        this._panel = panel;
        this.loadFile(filePath);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'requestData') {
                this._pushData();
            }
        }, null, this._disposables);

        this._update();
        setTimeout(() => this._pushData(), 100);
    }

    private loadFile(filePath: string) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            this._jsonData = JSON.parse(raw);
            this._fileName = path.basename(filePath);
            this._panel.title = `JSON 阅读器: ${this._fileName}`;
            this._pushData();
        } catch (e) {
            vscode.window.showErrorMessage(`JSON 解析失败: ${e}`);
        }
    }

    private _pushData() {
        if (this._jsonData) {
            this._panel.webview.postMessage({ type: 'initJson', data: this._jsonData, fileName: this._fileName });
        }
    }

    public dispose() {
        JsonReaderPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

        private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <style>
        :root {
            --bg-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-panel-border);
            --hover-color: var(--vscode-list-hoverBackground);
            --key-color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
            --string-color: var(--vscode-symbolIcon-stringForeground, #ce9178);
            --number-color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
            --boolean-color: var(--vscode-symbolIcon-booleanForeground, #569cd6);
            --null-color: var(--vscode-symbolIcon-nullForeground, #c586c0);
            --match-color: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33));
        }
        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: "Consolas", "Courier New", monospace;
            font-size: 14px;
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            padding: 10px 15px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            gap: 10px;
            align-items: center;
            background-color: var(--vscode-sideBar-background);
            flex-shrink: 0;
        }
        .search-input {
            flex: 1;
            padding: 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            outline: none;
        }
        .search-input:focus { border-color: var(--vscode-focusBorder); }
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 4px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        
        .json-container {
            flex: 1;
            overflow: auto;
            padding: 15px;
        }
        /* 节点容器 */
        .json-node {
            padding-left: 16px;
            position: relative;
        }
        /* 根节点无需左侧虚线 */
        .json-container > .json-node {
            padding-left: 0;
        }
        
        /* 单行紧凑布局 */
        .json-row {
            display: flex;
            align-items: center;
            padding: 2px 4px;
            border-radius: 3px;
            cursor: pointer;
            min-height: 24px;
            white-space: nowrap;
        }
        .json-row:hover { background-color: var(--hover-color); }
        
        .toggle-icon {
            width: 14px;
            height: 14px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-right: 4px;
            color: #888;
            user-select: none;
            flex-shrink: 0;
        }
        .toggle-icon.collapsed::before { content: '▶'; font-size: 10px; }
        .toggle-icon.expanded::before { content: '▼'; font-size: 10px; }
        .toggle-icon.leaf { visibility: hidden; }
        
        .key { color: var(--key-color); margin-right: 2px; }
        .punctuation { color: var(--text-color); margin-right: 6px; opacity: 0.7; }
        
        .string { color: var(--string-color); }
        .number { color: var(--number-color); }
        .boolean { color: var(--boolean-color); }
        .null { color: var(--null-color); }
        
        /* 折叠时的省略号提示 */
        .collapse-hint { color: #888; font-style: italic; margin-left: 6px; font-size: 12px; }
        
        /* 子节点容器及虚线 */
        .children {
            display: block;
            border-left: 1px dashed var(--border-color);
            margin-left: 7px; /* 对齐箭头中心 */
            padding-left: 5px;
        }
        .children.hidden { display: none; }
        
        .highlight { background-color: var(--match-color); color: inherit; }
    </style>
</head>
<body>
    <div class="toolbar">
        <input type="text" id="searchInput" class="search-input" placeholder="搜索 Key 或 Value..." />
        <button class="btn" id="expandAllBtn">全部展开</button>
        <button class="btn" id="collapseAllBtn">全部折叠</button>
    </div>
    <div class="json-container" id="jsonContainer">
        <div style="color:gray; font-style:italic;">等待数据加载...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let jsonData = null;
        let searchKeyword = '';

        const container = document.getElementById('jsonContainer');
        const searchInput = document.getElementById('searchInput');

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'initJson') {
                jsonData = msg.data;
                renderTree();
            }
        });

        searchInput.addEventListener('input', (e) => {
            searchKeyword = e.target.value.toLowerCase();
            renderTree();
        });

        document.getElementById('expandAllBtn').onclick = () => toggleAll(true);
        document.getElementById('collapseAllBtn').onclick = () => toggleAll(false);

        function renderTree() {
            container.innerHTML = '';
            if (!jsonData) return;
            const rootNode = createNode('root', jsonData, true);
            container.appendChild(rootNode);
        }

        function createNode(key, value, isRoot = false) {
            const type = getType(value);
            const isObject = type === 'object' || type === 'array';
            
            const wrapper = document.createElement('div');
            wrapper.className = 'json-node';

            // 核心：这一行包含 [箭头] [Key] [:] [Value/折叠提示]
            const row = document.createElement('div');
            row.className = 'json-row';

            // 判断当前节点是否匹配搜索
            const keyStr = String(key).toLowerCase();
            const valStr = String(value).toLowerCase();
            const isMatch = searchKeyword && (keyStr.includes(searchKeyword) || (!isObject && valStr.includes(searchKeyword)));

            // 1. 折叠箭头 (容器类型才有)
            const toggleIcon = document.createElement('span');
            const childrenKeys = isObject ? Object.keys(value) : [];
            const hasChildren = isObject && childrenKeys.length > 0;
            
            toggleIcon.className = 'toggle-icon ' + (hasChildren ? 'expanded' : 'leaf');
            row.appendChild(toggleIcon);

            // 2. 渲染 Key
            if (!isRoot) {
                const keySpan = document.createElement('span');
                keySpan.className = 'key';
                // 如果是数组，显示 [0], [1] 这种；如果是对象，显示 "key"
                if (!isNaN(key)) {
                    keySpan.textContent = '[' + key + ']';
                } else {
                    keySpan.textContent = '"' + key + '"';
                }
                if (isMatch) keySpan.classList.add('highlight');
                row.appendChild(keySpan);

                const colon = document.createElement('span');
                colon.className = 'punctuation';
                colon.textContent = ':';
                row.appendChild(colon);
            }

            let childrenContainer = null;

            // 3. 渲染值 或 容器状态
            if (isObject) {
                // 容器类型
                if (hasChildren) {
                    // 如果有子节点，加一个 "... " 提示（仅在折叠时显示）
                    const collapseHint = document.createElement('span');
                    collapseHint.className = 'collapse-hint';
                    collapseHint.textContent = '...';
                    row.appendChild(collapseHint);

                    // 构建子节点容器
                    childrenContainer = document.createElement('div');
                    childrenContainer.className = 'children';
                    childrenKeys.forEach(childKey => {
                        childrenContainer.appendChild(createNode(childKey, value[childKey], false));
                    });

                    // 默认是否折叠（搜索时，如果不匹配则自动折叠）
                    const shouldCollapse = searchKeyword && !isMatch ? true : false;
                    if (shouldCollapse) {
                        toggleIcon.classList.remove('expanded');
                        toggleIcon.classList.add('collapsed');
                        childrenContainer.classList.add('hidden');
                        collapseHint.style.display = 'inline';
                    } else {
                        collapseHint.style.display = 'none';
                    }
                    
                    // 点击行切换展开/折叠
                    row.onclick = (e) => {
                        e.stopPropagation();
                        if (childrenContainer.classList.contains('hidden')) {
                            childrenContainer.classList.remove('hidden');
                            toggleIcon.classList.remove('collapsed');
                            toggleIcon.classList.add('expanded');
                            collapseHint.style.display = 'none';
                        } else {
                            childrenContainer.classList.add('hidden');
                            toggleIcon.classList.remove('expanded');
                            toggleIcon.classList.add('collapsed');
                            collapseHint.style.display = 'inline';
                        }
                    };
                } else {
                    // 空对象/空数组
                    const emptyHint = document.createElement('span');
                    emptyHint.className = 'punctuation';
                    emptyHint.textContent = '(empty)';
                    row.appendChild(emptyHint);
                }

                wrapper.appendChild(row);
                if (childrenContainer) {
                    wrapper.appendChild(childrenContainer);
                }

            } else {
                // 基本类型值
                const valSpan = document.createElement('span');
                valSpan.className = type;
                if (type === 'string') valSpan.textContent = '"' + value + '"';
                else valSpan.textContent = String(value);
                
                if (isMatch) valSpan.classList.add('highlight');
                
                row.appendChild(valSpan);
                wrapper.appendChild(row);
            }

            return wrapper;
        }

        function getType(val) {
            if (val === null) return 'null';
            if (Array.isArray(val)) return 'array';
            return typeof val;
        }

        function toggleAll(expand) {
            const icons = document.querySelectorAll('.toggle-icon:not(.leaf)');
            const children = document.querySelectorAll('.children');
            const hints = document.querySelectorAll('.collapse-hint');
            
            icons.forEach(icon => {
                icon.className = 'toggle-icon ' + (expand ? 'expanded' : 'collapsed');
            });
            children.forEach(child => {
                if (expand) child.classList.remove('hidden');
                else child.classList.add('hidden');
            });
            hints.forEach(hint => {
                hint.style.display = expand ? 'none' : 'inline';
            });
        }

        vscode.postMessage({ command: 'requestData' });
    </script>
</body>
</html>`;
    }
}