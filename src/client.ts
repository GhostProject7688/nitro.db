import * as fs from 'fs';
import * as path from 'path';
import EventEmitter from 'events';
import import { Database, Schema, TimeSeriesData } from './interface.js';
import crypto from 'crypto';

interface VersionedData {
    version: number;
    data: Database;
}

interface Index {
    field: string;
    values: Map<any, Set<string>>;
}

class NitroDB extends EventEmitter {
    private readonly filePath: string;
    private version: number;
    private data: Database;
    private readonly schema: Schema;
    private readonly encryptionKey: string; // Add encryption key
    private cache: Map<string, any>; // Cache for frequently accessed data
    private geoIndexes: Map<string, Map<string, string[]>>; // Geo Indexes for geospatial data
    private indexes: Map<string, Index>; // Indexes for frequently accessed fields
    private events: { [key: string]: ((...args: any[]) => void)[] } = {}; // Event listeners
       constructor(filePath: string, schema: Schema = {}, encryptionKey: string) {
        super();
        if (!encryptionKey || typeof encryptionKey !== 'string') {
            throw new Error('Encryption key must be a non-empty string');
        }
        this.filePath = filePath;
        this.schema = schema;
        this.version = 1; // Initial version
        this.data = this.loadData();
        this.validateSchema();
        this.encryptionKey = encryptionKey;
        this.cache = new Map();
           this.geoIndexes = new Map(); // Initialize geoIndexes map
        this.archiveData();
         this.indexes = new Map();
    }

    // Event System
    public on(event: string, listener: (...args: any[]) => void): this {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return this;
    }

    public emit(event: string, ...args: any[]): boolean {
        if (!this.events[event]) return false;
        this.events[event].forEach((listener) => listener(...args));
        return true;
    }
    public createGeoIndex(field: string): void {
        if (!this.geoIndexes.has(field)) {
            this.geoIndexes.set(field, new Map());
            const geoIndex = this.geoIndexes.get(field)!;
            for (const key in this.data) {
                const location = this.data[key][field];
                if (location) {
                    const keyList = geoIndex.get(location) || [];
                    keyList.push(key);
                    geoIndex.set(location, keyList);
                }
            }
        }
    }

    public addTimeSeriesData(key: string, timestamp: number, value: any): void {
        if (!Array.isArray(this.data[key])) {
            this.data[key] = [];
        }
        this.data[key].push({ timestamp, value });
        this.saveData();
    }

    public queryTimeSeriesData(key: string, startTime: number, endTime: number): TimeSeriesData[] {
        const timeSeriesData = this.data[key];
        if (!timeSeriesData) return [];
        return timeSeriesData.filter(data => data.timestamp >= startTime && data.timestamp <= endTime);
    }

    public aggregateTimeSeriesData(key: string, interval: number): { timestamp: number, value: any }[] {
        const timeSeriesData = this.data[key];
        if (!timeSeriesData) return [];
        const aggregatedData: { timestamp: number, value: any }[] = [];
        const intervalMillis = interval * 1000; // Convert seconds to milliseconds
        const startTime = timeSeriesData[0].timestamp;
        const endTime = timeSeriesData[timeSeriesData.length - 1].timestamp;
        for (let t = startTime; t <= endTime; t += intervalMillis) {
            const intervalData = timeSeriesData.filter(data => data.timestamp >= t && data.timestamp < t + intervalMillis);
            if (intervalData.length > 0) {
                const sum = intervalData.reduce((acc, curr) => acc + curr.value, 0);
                const average = sum / intervalData.length;
                aggregatedData.push({ timestamp: t, value: average });
            }
        }
        return aggregatedData;
    }
    
    public queryGeoIndex(field: string, location: string): string[] | undefined {
        if (this.geoIndexes.has(field)) {
            const geoIndex = this.geoIndexes.get(field)!;
            return geoIndex.get(location);
        }
        return undefined;
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

    private createIndex(field: string): void {
        if (!this.indexes.has(field)) {
            this.indexes.set(field, { field, values: new Map() });
            const index = this.indexes.get(field)!;
            for (const key in this.data) {
                const value = this.data[key][field];
                if (value !== undefined) {
                    if (!index.values.has(value)) {
                        index.values.set(value, new Set());
                    }
                    index.values.get(value)!.add(key);
                }
            }
        }
    }
    public queryIndexed(field: string, value: any): string[] | undefined {
        if (this.indexes.has(field)) {
            const index = this.indexes.get(field)!;
            if (index.values.has(value)) {
                return Array.from(index.values.get(value)!);
            }
        }
        return undefined;
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
private archiveData(): void {
        const archiveDir = path.join(path.dirname(this.filePath), 'archive');
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir);
        }
        const timestamp = new Date().toISOString().replace(/:/g, '-'); // Replace colons with dashes
        const archiveFilePath = path.join(archiveDir, `data_${timestamp}.json`);
        fs.copyFileSync(this.filePath, archiveFilePath);
        console.info(`Archived data to: ${archiveFilePath}`);
    }
    private loadData(): Database {
        try {
            const data = fs.readFileSync(this.filePath, 'utf8');
            const decryptedData = this.decryptData(data); // Decrypt the data
            const versionedData: VersionedData = JSON.parse(decryptedData);
            this.version = versionedData.version;
            return versionedData.data;
        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                this.createEmptyFile();
                return {};
            } else {
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
            if (!this.data.hasOwnProperty(key)) {
                if (this.schema[key].hasOwnProperty('default')) {
                    this.data[key] = this.schema[key].default;
                } else if (!this.schema[key].required) {
                    this.data[key] = null; // Or any appropriate default value
                } else {
                    throw new Error(`Required key '${key}' missing in database.`);
                }
            }
        }
    }

    public set(key: string, value: any): void {
        const oldValue = this.data[key];
        this.emit('beforeSet', key, value);
        this.data[key] = value;
        this.emit('afterSet', key, value, oldValue);
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
    // Versioning feature
    public getVersion(): number {
        return this.version;
    }

    public updateVersion(newVersion: number): void {
        this.version = newVersion;
        this.saveData(); // Save the version along with the data
    }

    // Custom Hooks
    public beforeSet(callback: (key: string, value: any) => void): void {
        this.on('beforeSet', callback);
    }

    public afterSet(callback: (key: string, value: any) => void): void {
        this.on('afterSet', callback);
    }

    // Query Optimization
    public optimizeQuery(criteria: (data: any) => boolean): any[] {
        // Implement query optimization logic here
        // For example, using indexes or other data structures to speed up queries
        const results: any[] = [];
        this.traverse(this.data, results, criteria);
        return results;
    }

    // Batch Operations
    public batchSet(data: { [key: string]: any }): void {
        // Implement batch set operation to set multiple key-value pairs at once
        for (const key in data) {
            this.set(key, data[key]);
        }
    }

    public batchPush(data: { [key: string]: any[] }): void {
        // Implement batch push operation to push multiple values to array fields
        for (const key in data) {
            if (!Array.isArray(this.data[key])) {
                this.data[key] = [];
            }
            this.data[key].push(...data[key]);
        }
        this.saveData();
    }

    // Cache Integration
    public getFromCache(key: string): any {
        // Retrieve data from cache if available
        return this.cache.get(key);
    }

    public addToCache(key: string, value: any): void {
        // Add data to cache
        this.cache.set(key, value);
    }

    public clearCache(): void {
        // Clear the cache
        this.cache.clear();
    }

      // Data Compression
    public compressData(data: any): Buffer {
        return Buffer.from(JSON.stringify(data), 'utf8');
    }

    public decompressData(compressedData: Buffer): any {
        return JSON.parse(compressedData.toString('utf8'));
    }
}

export default NitroDB;
