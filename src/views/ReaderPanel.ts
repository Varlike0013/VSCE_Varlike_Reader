import * as vscode from 'vscode';
import { parseChapters } from '../utils/parser';
import { getReaderHtml } from './ReaderTemplate';
import { DataManager } from '../utils/DataManager';

export function createReaderPanel(context: vscode.ExtensionContext, title: string, rawText: string) {
    const panel = vscode.window.createWebviewPanel(
        'varlikereader.readerPanel', title, vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    const chapters = parseChapters(rawText);
    panel.webview.html = getReaderHtml();

    const dataManager = DataManager.getInstance(context);

    panel.webview.onDidReceiveMessage(async message => {
        if (message.type === 'ready') {
            // 取出保存的设置和进度
            const settings = dataManager.get('vr-reader-settings', {});
            const state = dataManager.get('vr-reader-state', {});
            
            panel.webview.postMessage({ 
                type: 'initData', 
                chapters: chapters,
                settings: settings,
                state: state
            });
        } 
        else if (message.type === 'saveData') {
            // 接收前端发来的保存请求
            await dataManager.update(message.key, message.value);
        }
    });
}