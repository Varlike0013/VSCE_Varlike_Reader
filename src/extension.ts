import * as vscode from 'vscode';
import * as path from 'path';
import { VarlikeViewProvider } from './views/SidebarProvider';
import { TxtReaderProvider } from './views/TxtEditorProvider';
import { createReaderPanel } from './views/ReaderPanel';
import { DataManager } from './utils/DataManager';
import { JsonDBEngine } from './database/JsonDBEngine';
import { DatabasePanel } from './views/DatabasePanel';
import { JsonReaderPanel } from './views/JsonReaderPanel'; 

export function activate(context: vscode.ExtensionContext) {
    DataManager.getInstance(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('varlikereader.home', new VarlikeViewProvider(context.extensionUri))
    );
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'varlikereader.txtReader',
            new TxtReaderProvider(context),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('varlikereader.openPanel', async () => {
            const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Text Files': ['txt'] } });
            if (uris && uris.length > 0) {
                const text = (await vscode.workspace.fs.readFile(uris[0])).toString();
                createReaderPanel(context, path.basename(uris[0].fsPath), text);
            }
        })
    );

    // 🔥 创建数据库后，自动打开控制台
    context.subscriptions.push(
        vscode.commands.registerCommand('varlikereader.createDatabase', async () => {
            const uri = await vscode.window.showSaveDialog({ filters: { 'JSON': ['json'] }, saveLabel: '创建数据库' });
            if (uri) {
                await JsonDBEngine.getInstance().createDatabase(uri.fsPath);
                vscode.window.showInformationMessage('数据库创建成功！');
                DatabasePanel.createOrShow(context.extensionUri); // 自动打开
            }
        })
    );

    // 🔥 打开数据库后，自动打开控制台
    context.subscriptions.push(
        vscode.commands.registerCommand('varlikereader.openDatabase', async () => {
            const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JSON': ['json'] }, openLabel: '打开数据库' });
            if (uris && uris.length > 0) {
                const success = await JsonDBEngine.getInstance().loadDatabase(uris[0].fsPath);
                if (success) {
                    vscode.window.showInformationMessage('数据库加载成功！');
                    DatabasePanel.createOrShow(context.extensionUri); // 自动打开
                }
            }
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('varlikereader.openJsonReader', async () => {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false, 
                filters: { 'JSON': ['json'] }, 
                openLabel: '可视化打开 JSON'
            });
            if (uris && uris.length > 0) {
                JsonReaderPanel.createOrShow(context.extensionUri, uris[0].fsPath);
            }
        })
    );
}

export function deactivate() {}