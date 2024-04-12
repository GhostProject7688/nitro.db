import * as fs from 'fs';
import * as path from 'path';
import winston from 'winston';
import EventEmitter from 'events';
import { Database, Schema } from './interface.js';
import crypto from 'crypto';

interface VersionedData {
    version: number;
    data: Database;
}

class NitroDB extends EventEmitter {
    private readonly filePath: string;
    private version: number;
    private data: Database;
    private readonly schema: Schema;
    private logger: winston.Logger;
    private readonly encryptionKey: string; // Add encryption key

    constructor(filePath: string, schema: Schema = {}, encryptionKey: string) {
        super();
        this.filePath = filePath;
        this.schema = schema;
        this.version = 1; // Initial version
        this.data = this.loadData();
        this.validateSchema();
        this.encryptionKey = encryptionKey;
        
        this.logger = winston.createLogger({
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'error.log', level: 'error' })
            ]
        });
    }

    // Event System
    public on(event: string, listener: (...args: any[]) => void): this {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return this;
    }

    public emit(event: string, ...args: any[]): void {
        if (!this.events[event]) return;
        this.events[event].forEach((listener) => listener(...args));
    }

    // Custom Serialization
    public serialize(data: any): string {
        // Implement custom serialization logic here
        let serializedData = '';
        if (typeof data === 'object') {
            serializedData = JSON.stringify(data);
        } else {
            serializedData = String(data);
        }
        return serializedData;
    }

    public deserialize(data: string): any {
        // Implement custom deserialization logic here
        let deserializedData: any;
        try {
            deserializedData = JSON.parse(data);
        } catch (error) {
            // Handle deserialization errors
            throw new Error(`Error deserializing data: ${error}`);
        }
        return deserializedData;
    }

    private loadData(): Database {
        try {
            const data = fs.readFileSync(this.filePath, 'utf8');
            const decryptedData = this.decryptData(data); // Decrypt the data
            const versionedData: VersionedData = JSON.parse(decryptedData);
            this.version = versionedData.version;
            return versionedData.data;
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.createEmptyFile();
                return {};
            } else {
                this.logger.error(`Error loading data from file: ${error}`);
                throw new Error(`Error loading data from file: ${error}`);
            }
        }
    }

    private createEmptyFile(): void {
        const initialData: VersionedData = {
            version: this.version,
            data: {}
        };
        const serializedData = JSON.stringify(initialData);
        const encryptedData = this.encryptData(serializedData); // Encrypt the initial data
        fs.writeFileSync(this.filePath, encryptedData, 'utf8');
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

    public push(key: string, value: any): void {
        if (!Array.isArray(this.data[key])) {
            this.data[key] = [];
        }
        this.data[key].push(value);
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

    public has(key: string): boolean {
        return this.data.hasOwnProperty(key);
    }

    public toJSON(): string {
        return JSON.stringify(this.data, null, 2);
    }

    public resetval(key: string): void {
        if (this.data.hasOwnProperty(key)) {
            delete this.data[key];
            this.saveData();
        }
    }

 private saveData(): void {
        const versionedData: VersionedData = {
            version: this.version,
            data: this.data
        };
        const serializedData = JSON.stringify(versionedData);
        const encryptedData = this.encryptData(serializedData); // Encrypt the data before saving
        try {
            fs.writeFileSync(this.filePath, encryptedData, 'utf8');
        } catch (error) {
            this.logger.error(`Error saving data to file: ${error}`);
            throw new Error(`Error saving data to file: ${error}`);
        }
    }

    private encryptData(data: string): string {
        const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
        let encryptedData = cipher.update(data, 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        return encryptedData;
    }

    private decryptData(data: string): string {
        const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
        let decryptedData = decipher.update(data, 'hex', 'utf8');
        decryptedData += decipher.final('utf8');
        return decryptedData;
    }
}

    // Versioning feature
    public getVersion(): number {
        return this.version;
    }

    public updateVersion(newVersion: number): void {
        this.version = newVersion;
        this.saveData(); // Save the version along with the data
    }
}

export default NitroDB;
