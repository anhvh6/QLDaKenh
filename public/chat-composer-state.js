// A focused composer is a live editor: background refresh must not replace it,
// including while Vietnamese input is composing or a send request is pending.
export function chatComposerBusy(document){
 return Boolean(document.activeElement?.closest?.('#reply-form')||document.querySelector('#reply-form[data-composing="true"],#reply-form[data-sending="true"]'));
}
