export type HubResource = 'purchases'|'reservations'|'transfers'|'counts'|'units'|'warranties'|'checks'|'handovers'|'assets'|'rates'|'margins'|'closures'|'recurring'|'coverage'|'audit';
export type HubEntry = {id:string;title:string;data:Record<string,string>;receipts?:{id:string;quantity:string;amount:string;originalId?:string}[]};
export type HubRow = {id:string;title:string;subtitle?:string;date:string;status?:string;amount?:string;data:Record<string,string>;entries?:HubEntry[]};
export type HubPage = {rows:HubRow[];total:number;page:number;pageSize:number;summary?:{label:string;value:string}[]};
