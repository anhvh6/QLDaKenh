const displayCodes={0:'draft',17:'awaiting_confirmation',1:'confirmed',11:'waiting_stock',20:'purchased',12:'waiting_print',13:'printed',8:'packing',9:'pickup_pending',2:'shipping',3:'delivered',16:'collected',4:'returning',15:'partially_returned',5:'returned',6:'cancelled'};
// The requested state is a UI overlay; only the verified server response changes order data.
export function orderStatusFeedback(){
 const pending=new Map();
 return {get:id=>pending.get(id),start(id,status){if(pending.has(id))throw Error('Đơn đang đồng bộ POS.');const request={status:displayCodes[status],target:status};pending.set(id,request);return request;},finish(id,request){if(pending.get(id)===request)pending.delete(id);}};
}
