import * as fs from 'fs';
import * as path from 'path';

interface Database {
    [key: string]: any;
}

class NitroDB {
    private readonly filePath: string;
    private data: Database;

    constructor(filePath: string) {
        this.filePath = filePath;
        this.data = this.loadData();
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

    public set(key: string, value: any): void {
        const keys = key.split('.');
        let currentObj = this.data;

        // Traverse the keys to find the correct nested object
        for (let i = 0; i < keys.length - 1; i++) {
            const currentKey = keys[i];
            if (!currentObj[currentKey]) {
                // If the nested object doesn't exist, create it
                currentObj[currentKey] = {};
            }
            currentObj = currentObj[currentKey];
        }

        // Set the value in the final nested object
        const finalKey = keys[keys.length - 1];
        currentObj[finalKey] = value;

        // Save the updated data to the file
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

    private saveData(): void {
        const dataToWrite = JSON.stringify(this.data, null, 2);
        fs.writeFileSync(this.filePath, dataToWrite, 'utf8');
    }
}
/**
// Example usage:
const dbFilePath = path.resolve(__dirname, 'users.database');
const db = new NitroDB(dbFilePath);

// Set initial user data
db.set('12345678910', { xp: 0, coins: 0, loves: [] });
db.set('9876543210', { xp: 10, coins: 100, loves: ['bird'] });

// Query for users with more than 50 coins
const richUsers = db.query(data => data.coins > 50);
console.log('Rich users:', richUsers);

// Transaction example: Increment XP for all users
db.transaction(() => {
    const users = db.query(() => true);
    users.forEach(user => {
        db.set(user.key + '.xp', user.value.xp + 1);
    });
});
**/
