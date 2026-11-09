import * as vscode from 'vscode';
import { DatabasePanel } from './DatabasePanel';
import { JsonDBEngine } from '../database/JsonDBEngine';

export class VarlikeViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true };
        
        webviewView.webview.html = `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <style>
                    body { padding: 15px; color: var(--vscode-foreground); font-family: sans-serif; font-size: 13px; text-align: center; }
                    .btn { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 10px; cursor: pointer; border-radius: 4px; width: 100%; margin-bottom: 8px; }
                    .btn:hover { background-color: var(--vscode-button-hoverBackground); }
                    .btn-sec { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                    .divider { height: 1px; background: var(--vscode-panel-border); margin: 15px 0; }
                    p { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
                </style>
            </head>
            <body>
                <h3 style="margin-top:0;">VarlikeReader</h3>
                <p>文件特殊打开器</p>
                <button class="btn" id="openNovelBtn">TXT文件打开为Novel</button>
                
                <div class="divider"></div>
                <p>JSON 数据库</p>
                <button class="btn btn-sec" id="createDbBtn">创建 JSON 数据库</button>
                <button class="btn btn-sec" id="openDbBtn">打开 JSON 数据库</button>
                <button class="btn" id="openConsoleBtn" style="background:#007acc; margin-top:10px;">打开数据库控制台</button>
                <button class="btn btn-sec" id="openJsonBtn">可视化查看 JSON 文件</button>

                <script>
                    const vscode = acquireVsCodeApi();
                    document.getElementById('openNovelBtn').onclick = () => vscode.postMessage({ command: 'openNovel' });
                    document.getElementById('createDbBtn').onclick = () => vscode.postMessage({ command: 'createDb' });
                    document.getElementById('openDbBtn').onclick = () => vscode.postMessage({ command: 'openDb' });
                    document.getElementById('openConsoleBtn').onclick = () => vscode.postMessage({ command: 'openConsole' });
                    document.getElementById('openJsonBtn').addEventListener('click', () => {vscode.postMessage({ command: 'openJson' });});
                </script>
            </body>
            </html>
        `;

        webviewView.webview.onDidReceiveMessage(async message => {
            if (message.command === 'openNovel') {
                vscode.commands.executeCommand('varlikereader.openPanel');
            } else if (message.command === 'createDb') {
                vscode.commands.executeCommand('varlikereader.createDatabase');
            } else if (message.command === 'openDb') {
                vscode.commands.executeCommand('varlikereader.openDatabase');
            } else if (message.command === 'openJson') {
                vscode.commands.executeCommand('varlikereader.openJsonReader');
            }else if (message.command === 'openConsole') {
                if (!JsonDBEngine.getInstance().isLoaded) {
                    vscode.window.showWarningMessage('请先创建或打开数据库！');
                    return;
                }
                DatabasePanel.createOrShow(this._extensionUri);
            }
        });
    }
}