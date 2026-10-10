// Adding a renewal receivable must not erase access bought by the original payment.
// Refunding below that confirmed amount still revokes access.
export function studyPlanStatus(plan,order){if(String(plan.customer?.status||'').toUpperCase()==='DELETED'||plan.customer?.is_deleted===true)return 'DELETED';return order&&(order.status==='cancelled'||!plan.createdWithoutPayment&&order.paid<(plan.accessPaymentFloor??order.total))?'REVOKED':plan.customer?.status;}
