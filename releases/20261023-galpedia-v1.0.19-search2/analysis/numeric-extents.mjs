// Avoid spreading a full character/relationship population into function arguments.
export function minValue(values){let value=Infinity;for(const n of values)value=Math.min(value,n);return value;}
export function maxValue(values){let value=-Infinity;for(const n of values)value=Math.max(value,n);return value;}
