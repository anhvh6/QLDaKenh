// Keep the submitted snapshot separate from the next draft while the network is pending.
export function beginChatDraftSend(draft,empty){
 const submitted=structuredClone(draft),cleared=structuredClone(empty),fingerprint=JSON.stringify(cleared);
 return {submitted,cleared,restore(current){return JSON.stringify(current)===fingerprint?structuredClone(submitted):current;}};
}
