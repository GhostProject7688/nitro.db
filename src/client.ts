import * as fs from 'fs';
import * as path from 'path';

interface Database {
    [key: string]: any;
}

interface Schema {
    [key: string]: any;
}

class NitroDB {
    private readonly filePath: string;
    private data: Database;
    private readonly schema: Schema;

    constructor(filePath: string, schema: Schema = {}) {
        this.filePath = filePath;
        this.schema = schema;
        this.data = this.loadData();
        this.validateSchema();
    }

    private loadData(): Database {
        try {
            const data = fs.readFileSync(this.filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // If file does not exist, create a new one
                this.createEmptyFile();
                return {};
            } else {
                throw new Error(`Error loading data from file: ${error}`);
            }
        }
    }

    private createEmptyFile(): void {
        fs.writeFileSync(this.filePath, '{}', 'utf8');
    }

    private validateSchema(): void {
        for (const key in this.schema) {
            if (!this.data[key]) {
                this.data[key] = this.schema[key];
            }
        }
    }

    public set(key: string, value: any): void {
        this.data[key] = value;
        this.saveData();
    }

    public query(criteria: (data: any) => boolean): any[] {
        const results: any[] = [];
        this.traverse(this.data, results, criteria);
        return results;
    }

    private traverse(data: any, results: any[], criteria: (data: any) => boolean, path: string = ''): void {
        for (const key in data) {
            if (typeof data[key] === 'object') {
                this.traverse(data[key], results, criteria, `${path}${key}.`);
            } else {
                if (criteria(data[key])) {
                    results.push({
                        key: `${path}${key}`,
                        value: data[key]
                    });
                }
            }
        }
    }

    public transaction(callback: () => void): void {
        try {
            callback();
            this.saveData();
        } catch (error) {
            console.error(`Transaction failed: ${error}`);
        }
    }

    public backup(backupFilePath: string): void {
        const backupData = JSON.stringify(this.data, null, 2);
        fs.writeFileSync(backupFilePath, backupData, 'utf8');
    }

    public restore(backupFilePath: string): void {
        try {
            const backupData = fs.readFileSync(backupFilePath, 'utf8');
            this.data = JSON.parse(backupData);
            this.saveData();
        } catch (error) {
            throw new Error(`Error restoring backup: ${error}`);
        }
    }

    private saveData(): void {
        const dataToWrite = JSON.stringify(this.data, null, 2);
        fs.writeFileSync(this.filePath, dataToWrite, 'utf8');
    }
}

