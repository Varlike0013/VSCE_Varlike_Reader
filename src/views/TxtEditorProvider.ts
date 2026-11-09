import * as vscode from 'vscode';
import { parseChapters } from '../utils/parser';
import { getReaderHtml } from './ReaderTemplate';
import { DataManager } from '../utils/DataManager';

export class TxtReaderProvider implements vscode.CustomTextEditorProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}
    
    public async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
        panel.webview.options = { enableScripts: true };
        panel.webview.html = getReaderHtml();

        const dataManager = DataManager.getInstance(this.context);

        panel.webview.onDidReceiveMessage(async message => {
            if (message.type === 'ready') {
                const rawText = document.getText();
                const chapters = parseChapters(rawText);
                
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
                await dataManager.update(message.key, message.value);
            }
        });
    }
}