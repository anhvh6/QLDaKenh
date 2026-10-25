const indexes=new WeakMap();
// One scan per publication array, instead of a full history scan per card/filter.
export function contentPublications(rows,id){let index=indexes.get(rows);if(!index||index.length!==rows.length){const byContent=new Map();for(const row of rows){const items=byContent.get(row.contentId)||[];items.push(row);byContent.set(row.contentId,items);}index={length:rows.length,byContent};indexes.set(rows,index);}return index.byContent.get(id)||[];}
