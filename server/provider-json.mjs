// Preserve 64-bit platform IDs before JavaScript rounds them.
export const parseProviderJSON=raw=>JSON.parse(raw,(key,value,context)=>typeof value==='number'&&!Number.isSafeInteger(value)&&/^(id|.*_id)$/.test(key)?context.source:value);
