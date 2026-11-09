import * as fs from 'fs';
import * as vscode from 'vscode';

// 🔥 1. 扩展数据类型
export type DataType = 
    | 'string' 
    | 'boolean' 
    | 'int8' 
    | 'int16' 
    | 'int32' 
    | 'long' 
    | 'float' 
    | 'double' 
    | 'enum' 
    | 'global_index';

export interface ColumnDef { 
    name: string; 
    type: DataType; 
    enumName?: string;       // 仅当 type 为 'enum' 时生效，指向全局枚举
    globalIndexName?: string;// 仅当 type 为 'global_index' 时生效，指向全局索引
}

export interface TableSchema { columns: ColumnDef[]; rows: Record<string, any>[]; }
export interface Schema { tables: Record<string, TableSchema>; }

export interface JsonDBData {
    meta: { name: string; version: string; lastUpdated: number };
    enums: Record<string, string[]>;       // 🔥 新增：全局枚举池
    globalIndexes: Record<string, number>; // 🔥 新增：全局索引当前值池
    schemas: Record<string, Schema>;
}

export class JsonDBEngine {
    private static instance: JsonDBEngine;
    private dbPath: string | null = null;
    private data: JsonDBData | null = null;
    private saveTimeout: NodeJS.Timeout | null = null;

    private constructor() {}

    public static getInstance(): JsonDBEngine {
        if (!JsonDBEngine.instance) {
            JsonDBEngine.instance = new JsonDBEngine();
        }
        return JsonDBEngine.instance;
    }

    public get isLoaded(): boolean { return this.dbPath !== null; }
    public getData(): JsonDBData | null { return this.data; }

    public async createDatabase(filePath: string) {
        this.dbPath = filePath;
        this.data = {
            meta: { name: filePath.split('\\').pop() || 'NewDB', version: '1.0', lastUpdated: Date.now() },
            enums: {},          // 初始化全局枚举
            globalIndexes: {},  // 初始化全局索引
            schemas: { public: { tables: {} } } 
        };
        await this.saveImmediate();
    }

    public async loadDatabase(filePath: string): Promise<boolean> {
        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf8');
                this.data = JSON.parse(raw);
                // 兼容旧数据库结构
                if (!this.data!.enums) this.data!.enums = {};
                if (!this.data!.globalIndexes) this.data!.globalIndexes = {};
                this.dbPath = filePath;
                return true;
            }
        } catch (e) {
            vscode.window.showErrorMessage(`数据库解析失败: ${e}`);
        }
        return false;
    }

    // ================= 核心 API =================

    public addSchema(schemaName: string) {
        if (this.data && !this.data.schemas[schemaName]) {
            this.data.schemas[schemaName] = { tables: {} };
            this.scheduleSave();
        }
    }

    public addTable(schemaName: string, tableName: string) {
        if (this.data?.schemas[schemaName] && !this.data.schemas[schemaName].tables[tableName]) {
            this.data.schemas[schemaName].tables[tableName] = { 
                columns: [{ name: 'index', type: 'int32' }], // 局部索引
                rows: [] 
            };
            this.scheduleSave();
        }
    }

    public dropTable(schemaName: string, tableName: string) {
        if (this.data?.schemas[schemaName]?.tables[tableName]) {
            delete this.data.schemas[schemaName].tables[tableName];
            this.scheduleSave();
        }
    }

    // 🔥 新增：创建全局 ENUM
    public addEnum(enumName: string, values: string[]) {
        if (this.data && !this.data.enums[enumName]) {
            this.data.enums[enumName] = values;
            this.scheduleSave();
        }
    }

    public addColumn(schemaName: string, tableName: string, column: ColumnDef) {
        const table = this.data?.schemas[schemaName]?.tables[tableName];
        if (table && !table.columns.find(c => c.name === column.name)) {
            table.columns.push(column);
            
            // 如果添加的是全局索引，初始化计数
            if (column.type === 'global_index' && column.globalIndexName) {
                if (this.data!.globalIndexes[column.globalIndexName] === undefined) {
                    this.data!.globalIndexes[column.globalIndexName] = 0;
                }
            }

            // 为现有行补充默认值
            table.rows.forEach(row => {
                row[column.name] = this.getDefaultValue(column);
            });
            this.scheduleSave();
        }
    }

    public dropColumn(schemaName: string, tableName: string, columnName: string) {
        const table = this.data?.schemas[schemaName]?.tables[tableName];
        if (table) {
            table.columns = table.columns.filter(c => c.name !== columnName);
            table.rows.forEach(row => delete row[columnName]);
            this.scheduleSave();
        }
    }

    public insertRow(schemaName: string, tableName: string) {
        const table = this.data?.schemas[schemaName]?.tables[tableName];
        if (table) {
            const newRow: Record<string, any> = { 'index': table.rows.length };
            
            table.columns.forEach(col => {
                if (col.name === 'index') return; // 已处理
                
                if (col.type === 'global_index' && col.globalIndexName) {
                    // 🔥 全局索引自增
                    if (this.data!.globalIndexes[col.globalIndexName] === undefined) {
                        this.data!.globalIndexes[col.globalIndexName] = 0;
                    }
                    newRow[col.name] = this.data!.globalIndexes[col.globalIndexName];
                    this.data!.globalIndexes[col.globalIndexName]++;
                } else {
                    newRow[col.name] = this.getDefaultValue(col);
                }
            });
            table.rows.push(newRow);
            this.scheduleSave();
        }
    }

    public updateCell(schemaName: string, tableName: string, rowIndex: number, colName: string, rawValue: string) {
        const table = this.data?.schemas[schemaName]?.tables[tableName];
        if (!table || rowIndex < 0 || rowIndex >= table.rows.length) return;

        const row = table.rows[rowIndex];
        const colDef = table.columns.find(c => c.name === colName);
        if (!colDef) return;

        // 🔥 禁止修改 index 和 global_index
        if (colDef.name === 'index' || colDef.type === 'global_index') return;

        let finalValue: any = rawValue;

        switch (colDef.type) {
            case 'int8':
                finalValue = parseInt(rawValue, 10) || 0;
                finalValue = Math.max(-128, Math.min(127, finalValue));
                break;
            case 'int16':
                finalValue = parseInt(rawValue, 10) || 0;
                finalValue = Math.max(-32768, Math.min(32767, finalValue));
                break;
            case 'int32':
            case 'long':
                finalValue = parseInt(rawValue, 10) || 0;
                break;
            case 'float':
            case 'double':
                finalValue = parseFloat(rawValue) || 0.0;
                break;
            case 'boolean':
                finalValue = rawValue.toLowerCase() === 'true';
                break;
            case 'enum':
                const eName = colDef.enumName || '';
                const validVals = this.data!.enums[eName] || [];
                if (validVals.length > 0 && !validVals.includes(rawValue)) {
                    finalValue = validVals[0]; 
                }
                break;
            case 'string':
            default:
                finalValue = rawValue;
        }

        row[colName] = finalValue;
        this.scheduleSave();
    }

    public deleteRow(schemaName: string, tableName: string, rowIndex: number) {
        const table = this.data?.schemas[schemaName]?.tables[tableName];
        if (table && rowIndex >= 0 && rowIndex < table.rows.length) {
            table.rows.splice(rowIndex, 1);
            // 重新排序局部 index
            table.rows.forEach((r, i) => r['index'] = i);
            this.scheduleSave();
        }
    }

    // 辅助函数：获取类型的默认值
    private getDefaultValue(col: ColumnDef): any {
        switch (col.type) {
            case 'boolean': return false;
            case 'int8':
            case 'int16':
            case 'int32':
            case 'long':
            case 'float':
            case 'double':
                return 0;
            case 'enum':
                const eName = col.enumName || '';
                const vals = this.data?.enums[eName] || [];
                return vals.length > 0 ? vals[0] : "";
            default:
                return "";
        }
    }

    // ================= 底层写入 =================
    private scheduleSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveImmediate(), 1000);
    }

    private async saveImmediate() {
        if (!this.dbPath || !this.data) return;
        try {
            this.data.meta.lastUpdated = Date.now();
            const tmpPath = this.dbPath + '.tmp';
            await fs.promises.writeFile(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
            await fs.promises.rename(tmpPath, this.dbPath);
        } catch (e) {
            vscode.window.showErrorMessage(`写入数据库失败: ${e}`);
        }
    }
}