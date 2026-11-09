import * as vscode from 'vscode';

export class DataManager {
    private static instance: DataManager;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // 单例模式，确保所有模块共用同一份数据
    public static getInstance(context?: vscode.ExtensionContext): DataManager {
        if (!DataManager.instance && context) {
            DataManager.instance = new DataManager(context);
        }
        return DataManager.instance;
    }

    // 获取数据
    public get<T>(key: string, defaultValue: T): T {
        return this.context.globalState.get<T>(key) || defaultValue;
    }

    // 保存数据
    public async update(key: string, value: any): Promise<void> {
        await this.context.globalState.update(key, value);
    }
}