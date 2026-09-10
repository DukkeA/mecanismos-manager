export function isDateKey(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function matches(text:string,query:string){
  const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return normalize(query).trim().split(/\s+/).every(word=>normalize(text).includes(word));
}
export function dateKey(value:string){
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return isDateKey(value)?value:"";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
export function inDates(value:string|undefined|null,from:string,to:string){
  if(!from&&!to)return true;
  if(!value)return false;
  const date=dateKey(value);
  return !!date&&(!from||date>=from)&&(!to||date<=to);
}
export function pageNumber(raw:string|null,pages:number){const value=Number(raw);return Math.min(pages,Math.max(1,Number.isSafeInteger(value)?value:1));}
