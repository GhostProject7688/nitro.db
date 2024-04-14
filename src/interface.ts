// interface.ts

export interface Database {
    [key: string]: any; // storing Database key or something
}

export interface Schema {
    [key: string]: any; // schema 
}

export interface TimeSeriesData { // support timeSeriesData feature
    timestamp: number;
    value: any;
}
