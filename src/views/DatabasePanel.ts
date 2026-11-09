import * as vscode from 'vscode';
import { JsonDBEngine } from '../database/JsonDBEngine';

export class DatabasePanel {
    public static currentPanel: DatabasePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        if (DatabasePanel.currentPanel) {
            DatabasePanel.currentPanel._panel.reveal(column);
            DatabasePanel.currentPanel._pushData();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'varlikereader.dbPanel', 'JSON 数据库控制台', column || vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        DatabasePanel.currentPanel = new DatabasePanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.onDidReceiveMessage(async message => {
            const db = JsonDBEngine.getInstance();
            
            if (message.command === 'requestDbData') {
                this._pushData();
            }
            else if (message.command === 'dbAction') {
                const { action, schema, table, rowIndex, colName, value } = message;
                
                if (action === 'addSchema') {
                    const name = await vscode.window.showInputBox({ prompt: '输入新 Schema 名称' });
                    if (name) db.addSchema(name);
                } 
                else if (action === 'addTable') {
                    const name = await vscode.window.showInputBox({ prompt: '输入新表名' });
                    if (name) db.addTable(schema, name);
                } 
                else if (action === 'dropTable') {
                    db.dropTable(schema, table);
                } 
                else if (action === 'addColumn') {
                    const name = await vscode.window.showInputBox({ prompt: '输入新列名' });
                    if (!name) return;

                    const typePick = await vscode.window.showQuickPick([
                        'string', 'boolean', 'int8', 'int16', 'int32', 'long', 'float', 'double', 'enum', 'global_index'
                    ], { placeHolder: '选择数据类型' });
                    if (!typePick) return;

                    let enumName: string | undefined;
                    let globalIndexName: string | undefined;

                    if (typePick === 'enum') {
                        const existingEnums = Object.keys(db.getData()?.enums || {});
                        const enumPick = await vscode.window.showQuickPick(
                            [...existingEnums, '<新建全局枚举>'], 
                            { placeHolder: '选择已有或新建全局枚举' }
                        );
                        if (!enumPick) return;
                        
                        if (enumPick === '<新建全局枚举>') {
                            enumName = await vscode.window.showInputBox({ prompt: '输入新枚举名称 (如 status)' });
                            if (!enumName) return;
                            const enumStr = await vscode.window.showInputBox({ prompt: '输入枚举值 (逗号分隔)' });
                            if (!enumStr) return;
                            const vals = enumStr.split(',').map(s => s.trim()).filter(s => s);
                            db.addEnum(enumName, vals);
                        } else {
                            enumName = enumPick;
                        }
                    } else if (typePick === 'global_index') {
                        globalIndexName = await vscode.window.showInputBox({ prompt: '输入全局索引名称 (如 user_id)' });
                        if (!globalIndexName) return;
                    }

                    db.addColumn(schema, table, { name, type: typePick as any, enumName, globalIndexName });
                } 
                else if (action === 'dropColumn') {
                    db.dropColumn(schema, table, colName);
                }
                else if (action === 'addRow') {
                    db.insertRow(schema, table);
                } 
                else if (action === 'updateCell') {
                    db.updateCell(schema, table, rowIndex, colName, value);
                }
                else if (action === 'deleteRow') {
                    db.deleteRow(schema, table, rowIndex);
                }

                this._pushData();
            }
        }, null, this._disposables);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._update();
        setTimeout(() => this._pushData(), 100);
    }

    private _pushData() {
        const db = JsonDBEngine.getInstance();
        this._panel.webview.postMessage({ type: 'dbData', data: db.isLoaded ? db.getData() : null });
    }

    public dispose() {
        DatabasePanel.currentPanel = undefined;
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
    <style>
        body { padding: 20px; color: var(--vscode-foreground); font-family: sans-serif; font-size: 14px; height: 100vh; margin: 0; display: flex; flex-direction: column; box-sizing: border-box; }
        .toolbar { display: flex; gap: 10px; margin-bottom: 15px; align-items: center; flex-wrap: wrap; }
        .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; font-size: 13px; }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn-sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .btn-danger { background: #f44336; color: white; }
        select { padding: 6px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; font-size: 13px; min-width: 120px; }
        
        .table-container { flex: 1; overflow: auto; border: 1px solid var(--vscode-panel-border); }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid var(--vscode-panel-border); padding: 6px 10px; text-align: left; white-space: nowrap; }
        th { background: var(--vscode-editorGroupHeader-tabsBackground); position: sticky; top: 0; }
        
        td.editable { cursor: pointer; }
        td.editable:hover { background-color: rgba(128,128,128,0.1); }
        td input.cell-input, td select.cell-input { 
            width: 100%; box-sizing: border-box; 
            background: var(--vscode-input-background); color: var(--vscode-input-foreground); 
            border: 1px solid var(--vscode-focusBorder); outline: none; padding: 2px 4px; 
        }

        .del-btn { color: #f44336; cursor: pointer; font-weight: bold; margin-left: 10px; font-size: 12px; }
        .del-col { font-size: 12px; color: #ff9800; cursor: pointer; margin-left: 10px; }
        .empty-tip { text-align: center; color: var(--vscode-descriptionForeground); padding: 20px; font-style: italic; }
    </style>
</head>
<body>
    <div class="toolbar">
        <select id="schemaSelect"></select>
        <select id="tableSelect"></select>
        <button class="btn btn-sec" id="addSchemaBtn">+SCHEMA</button>
        <button class="btn btn-sec" id="addTableBtn">+TABLE</button>
        <button class="btn btn-sec" id="addColBtn">+COL</button>
        <button class="btn btn-danger" id="dropTableBtn">DEL TABLE</button>
        <button class="btn" id="addRowBtn" style="margin-left:auto;">+ 插入新数据</button>
    </div>
    
    <div class="table-container" id="tableContainer">
        <table id="dataTable">
            <thead><tr id="tableHead"></tr></thead>
            <tbody id="tableBody"></tbody>
        </table>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let dbData = null;

        const els = {
            schemaSelect: document.getElementById('schemaSelect'),
            tableSelect: document.getElementById('tableSelect'),
            tableHead: document.getElementById('tableHead'),
            tableBody: document.getElementById('tableBody'),
            tableContainer: document.getElementById('tableContainer')
        };

        document.getElementById('addSchemaBtn').onclick = () => vscode.postMessage({ command: 'dbAction', action: 'addSchema' });
        document.getElementById('addTableBtn').onclick = () => els.schemaSelect.value && vscode.postMessage({ command: 'dbAction', action: 'addTable', schema: els.schemaSelect.value });
        document.getElementById('addColBtn').onclick = () => els.tableSelect.value && vscode.postMessage({ command: 'dbAction', action: 'addColumn', schema: els.schemaSelect.value, table: els.tableSelect.value });
        document.getElementById('dropTableBtn').onclick = () => {
            if (els.tableSelect.value && confirm('确定要删除这张表吗？')) {
                vscode.postMessage({ command: 'dbAction', action: 'dropTable', schema: els.schemaSelect.value, table: els.tableSelect.value });
            }
        };
        document.getElementById('addRowBtn').onclick = () => {
            if (els.tableSelect.value) {
                vscode.postMessage({ command: 'dbAction', action: 'addRow', schema: els.schemaSelect.value, table: els.tableSelect.value });
            }
        };

        els.schemaSelect.onchange = () => updateTables();
        els.tableSelect.onchange = () => renderTableData();

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'dbData') {
                if (!msg.data) return showEmptyState('数据库未加载');
                dbData = msg.data;
                renderSchemas();
            }
        });

        vscode.postMessage({ command: 'requestDbData' });

        function showEmptyState(text) {
            els.schemaSelect.innerHTML = '<option value="">无 Schema</option>';
            els.tableSelect.innerHTML = '<option value="">无 Table</option>';
            els.tableHead.innerHTML = '';
            els.tableBody.innerHTML = '';
            els.tableContainer.innerHTML = '<div class="empty-tip">' + text + '</div>';
        }

        function renderSchemas() {
            if (!dbData || !dbData.schemas) return showEmptyState('无数据结构');
            const prevSchema = els.schemaSelect.value;
            const schemas = Object.keys(dbData.schemas);
            
            els.schemaSelect.innerHTML = '';
            if (schemas.length === 0) {
                els.schemaSelect.innerHTML = '<option value="">暂无 Schema</option>';
            } else {
                schemas.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s; opt.textContent = s;
                    els.schemaSelect.appendChild(opt);
                });
                if (prevSchema && dbData.schemas[prevSchema]) els.schemaSelect.value = prevSchema;
            }
            updateTables();
        }

        function updateTables() {
            if (!dbData || !dbData.schemas) return;
            const schemaName = els.schemaSelect.value;
            const schemaObj = dbData.schemas[schemaName];
            
            const prevTable = els.tableSelect.value;
            els.tableSelect.innerHTML = '';
            
            if (!schemaObj || Object.keys(schemaObj.tables).length === 0) {
                els.tableSelect.innerHTML = '<option value="">暂无 Table</option>';
                return renderTableData();
            }

            Object.keys(schemaObj.tables).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t; opt.textContent = t;
                els.tableSelect.appendChild(opt);
            });
            if (prevTable && schemaObj.tables[prevTable]) els.tableSelect.value = prevTable;
            renderTableData();
        }

        function renderTableData() {
            if (!dbData) return;
            const schemaName = els.schemaSelect.value;
            const tableName = els.tableSelect.value;
            const table = dbData.schemas[schemaName]?.tables[tableName];
            
            els.tableHead.innerHTML = '';
            els.tableBody.innerHTML = '';
            
            if (!table || !table.columns) {
                els.tableContainer.innerHTML = '<div class="empty-tip">请选择或创建一张表</div>';
                return;
            } 
            
            if (els.tableContainer.querySelector('.empty-tip')) {
                els.tableContainer.innerHTML = '<table id="dataTable"><thead><tr id="tableHead"></tr></thead><tbody id="tableBody"></tbody></table>';
                els.tableHead = document.getElementById('tableHead');
                els.tableBody = document.getElementById('tableBody');
            }

            // 1. 渲染表头
            table.columns.forEach(col => {
                const th = document.createElement('th');
                if (col.name === 'index') {
                    th.textContent = col.name;
                } else {
                    let label = col.name + ' (' + col.type;
                    if (col.type === 'enum') label += ':' + col.enumName;
                    if (col.type === 'global_index') label += ':' + col.globalIndexName;
                    label += ') ';
                    
                    th.textContent = label;
                    
                    if (col.type === 'enum' || col.type === 'global_index') {
                        th.title = col.type === 'enum' ? '全局枚举: ' + col.enumName : '全局自增索引: ' + col.globalIndexName;
                    }

                    const span = document.createElement('span');
                    span.className = 'del-col';
                    span.textContent = 'X';
                    span.onclick = () => {
                        if (confirm('确定删除列 ' + col.name + ' 吗？')) {
                            vscode.postMessage({ command: 'dbAction', action: 'dropColumn', schema: schemaName, table: tableName, colName: col.name });
                        }
                    };
                    th.appendChild(span);
                }
                els.tableHead.appendChild(th);
            });

            // 2. 渲染数据行
            if (table.rows.length === 0) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = table.columns.length;
                td.style.textAlign = 'center'; td.style.color = 'gray';
                td.textContent = '暂无数据，点击右上角插入';
                tr.appendChild(td);
                els.tableBody.appendChild(tr);
            } else {
                table.rows.forEach((row, rowIndex) => {
                    const tr = document.createElement('tr');
                    table.columns.forEach(col => {
                        const td = document.createElement('td');
                        
                        if (col.name === 'index') {
                            td.innerHTML = '<span>' + (row[col.name] ?? '') + '</span>';
                            const delBtn = document.createElement('span');
                            delBtn.className = 'del-btn';
                            delBtn.textContent = 'X';
                            delBtn.onclick = () => {
                                vscode.postMessage({ command: 'dbAction', action: 'deleteRow', schema: schemaName, table: tableName, rowIndex: rowIndex });
                            };
                            td.appendChild(delBtn);
                        } else {
                            td.textContent = row[col.name] ?? '';
                            
                            // 🔥 全局索引 和 表内 index 不可双击编辑
                            if (col.type !== 'global_index' && col.name !== 'index') {
                                td.className = 'editable';
                                td.ondblclick = () => startEditCell(td, schemaName, tableName, rowIndex, col, row[col.name]);
                            }
                        }
                        tr.appendChild(td);
                    });
                    els.tableBody.appendChild(tr);
                });
            }
        }

        function startEditCell(td, schema, table, rowIndex, colDef, currentValue) {
            if (td.querySelector('input') || td.querySelector('select')) return; 
            
            const originalText = td.textContent;
            td.textContent = '';
            
            let editor;
            if (colDef.type === 'enum') {
                editor = document.createElement('select');
                editor.className = 'cell-input';
                const enumVals = dbData.enums[colDef.enumName] || []; // 🔥 从全局获取枚举
                enumVals.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    if (val === currentValue) opt.selected = true;
                    editor.appendChild(opt);
                });
            } else {
                editor = document.createElement('input');
                editor.className = 'cell-input';
                
                if (['int8', 'int16', 'int32', 'long'].includes(colDef.type)) {
                    editor.type = 'number';
                    editor.step = '1';
                    if (colDef.type === 'int8') { editor.min = '-128'; editor.max = '127'; }
                    if (colDef.type === 'int16') { editor.min = '-32768'; editor.max = '32767'; }
                } else if (['float', 'double'].includes(colDef.type)) {
                    editor.type = 'number';
                    editor.step = '0.01';
                } else if (colDef.type === 'boolean') {
                    editor = document.createElement('select');
                    editor.className = 'cell-input';
                    ['true', 'false'].forEach(val => {
                        const opt = document.createElement('option');
                        opt.value = val;
                        opt.textContent = val;
                        if (String(currentValue) === val) opt.selected = true;
                        editor.appendChild(opt);
                    });
                } else {
                    editor.type = 'text';
                }
                
                if (editor.tagName === 'INPUT') {
                    editor.value = currentValue ?? '';
                }
            }
            
            const saveEdit = () => {
                const newValue = editor.value;
                td.textContent = newValue;
                td.ondblclick = () => startEditCell(td, schema, table, rowIndex, colDef, newValue);
                vscode.postMessage({ 
                    command: 'dbAction', action: 'updateCell', 
                    schema, table, rowIndex, colName: colDef.name, value: newValue 
                });
            };

            if (editor.tagName === 'INPUT') {
                editor.onkeydown = (e) => {
                    if (e.key === 'Enter') editor.blur();
                    else if (e.key === 'Escape') {
                        td.textContent = originalText;
                        td.ondblclick = () => startEditCell(td, schema, table, rowIndex, colDef, currentValue);
                    }
                };
                editor.onblur = saveEdit;
            } else {
                editor.onchange = saveEdit;
                editor.onblur = () => {
                    if (!editor.value) {
                        td.textContent = originalText;
                        td.ondblclick = () => startEditCell(td, schema, table, rowIndex, colDef, currentValue);
                    }
                };
            }

            td.appendChild(editor);
            editor.focus();
            if (editor.tagName === 'INPUT') editor.select();
        }
    </script>
</body>
</html>`;
    }
}